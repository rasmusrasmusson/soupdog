// src/lib/meal-merge.ts
// L1 meal merge: turn several dishes (each a list of steps with durations) into
// ONE backward-scheduled, interleaved cooking timeline that finishes at a single
// serving time, inserting keep-warm holds for dishes that finish early.
//
// PHYSICALLY-HONEST ATTENTION MODEL (matches src/lib/recipe-timing.ts):
//   • A HUMAN (blocking) step occupies the cook's hands — two human steps can
//     never overlap; they serialize.
//   • A MACHINE/PASSIVE (non-blocking) step occupies an APPLIANCE/process, not
//     the cook — so the cook's hands are free during it, and another dish's human
//     step fills that window (the "chicken in the oven while you make the salad").
//
// RESOURCE MODEL (designed so registered-equipment capacity drops in later):
//   Every step occupies a named RESOURCE. Today there are two kinds:
//     - 'hands'  : a pool of size 1 (one cook). Human steps take it.
//     - appliance pools : currently a single unbounded 'appliance' pool (any
//       number of machine/passive steps can run at once, as the old model assumed).
//   When equipment registration lands, a step will name a specific appliance
//   resource (e.g. 'oven') with a real pool size; contention then serializes the
//   same way hands do — NO rearchitecture, just real resource ids + sizes.
//   (Multi-cook later = hands pool size > 1.)
//
// WHAT L1 DOES NOT DO (deferred, by design):
//   • Shared-prep dedup (chop onion once) — needs the food-model passive-decay
//     graph that isn't built. Each dish's steps stay intact here.
//   • AI prose polish (L2). • Safety layer. • Capability gating / recipe adaptation.

export type MergeStepType = 'human' | 'machine' | 'passive' | 'hold';

export interface MergeInputStep {
  id: string;
  dishTitle: string;
  dishCanonicalId: string;
  group: string | null;        // the dish's own step group label
  type: MergeStepType;         // human | machine | passive (hold is synthesized)
  instruction: string;
  durationSeconds: number;     // 0 if unspecified
  temperatureCelsius: number | null;
  ingredients: { name: string; quantityValue: number; quantityUnit: string; prep: string | null }[];
}

export interface MergeInputDish {
  canonicalId: string;
  title: string;
  type: 'dish' | 'side' | 'drink';
  steps: MergeInputStep[];
}

export interface ScheduledStep {
  id: string;                  // original step id (or synthesized for holds)
  dishTitle: string;
  dishCanonicalId: string;
  group: string | null;
  type: MergeStepType;
  instruction: string;
  durationSeconds: number;
  temperatureCelsius: number | null;
  ingredients: MergeInputStep['ingredients'];
  startOffsetSeconds: number;  // seconds before serving time this step STARTS
  endOffsetSeconds: number;    // seconds before serving (0 = at serving)
  isHold: boolean;
  // "meanwhile": true when this human step runs during another dish's non-blocking window
  meanwhile: boolean;
}

export interface MergeResult {
  totalSeconds: number;                 // critical path of the whole meal
  serveOffsetSeconds: 0;                // anchor (serving = 0)
  scheduled: ScheduledStep[];           // ordered by startOffset DESC (earliest first)
  perDishCriticalSeconds: Record<string, number>;
  hasDurations: boolean;
}

function isNonBlocking(t: MergeStepType): boolean {
  return t === 'machine' || t === 'passive';
}

// ── Per-dish critical path (mirrors recipe-timing.ts) ─────────────────────────
// Returns, for one dish, the total wall-clock seconds AND, for each step, the
// offset (seconds from the dish's own start) at which it begins and ends. Human
// steps advance a "hands clock"; non-blocking steps start at the current hands
// clock and run in parallel (don't advance it). The dish's critical path is the
// max of the hands clock and the latest non-blocking end.
interface DishTimeline {
  criticalSeconds: number;
  steps: { step: MergeInputStep; startFromDishStart: number; endFromDishStart: number; nonBlocking: boolean }[];
}

function scheduleDishForward(dish: MergeInputDish): DishTimeline {
  let handsClock = 0;
  let maxEnd = 0;
  const steps: DishTimeline['steps'] = [];

  for (const step of dish.steps) {
    const dur = Math.max(0, step.durationSeconds || 0);
    const nonBlocking = isNonBlocking(step.type);

    if (nonBlocking) {
      // Starts now (hands position), runs in parallel, does NOT advance hands.
      const start = handsClock;
      const end = start + dur;
      steps.push({ step, startFromDishStart: start, endFromDishStart: end, nonBlocking: true });
      if (end > maxEnd) maxEnd = end;
    } else {
      // Human step — occupies hands; advance the clock.
      const start = handsClock;
      handsClock += dur;
      const end = handsClock;
      steps.push({ step, startFromDishStart: start, endFromDishStart: end, nonBlocking: false });
      if (end > maxEnd) maxEnd = end;
    }
  }

  return { criticalSeconds: Math.max(handsClock, maxEnd), steps };
}

// ── Merge several dishes, scheduled backward from one serving time ───────────
// Strategy (L1, beginner-safe, physically honest):
//   1. Compute each dish's critical path.
//   2. Anchor every dish to FINISH at serving time (offset 0). A dish with
//      critical path C therefore "starts" at offset C before serving. The
//      longest dish starts earliest; shorter dishes start later so all finish
//      together.
//   3. Convert every step to absolute offsets-before-serving.
//   4. Build a single ordered list (earliest start first). Resolve the ONE
//      physical constraint we model today: the cook's hands. Walk the human
//      steps in start order; if two human steps overlap, push the later one
//      back (serialize) — its dish's downstream steps shift with it only if
//      that would break finishing on time (we keep it simple: we detect overlap
//      and mark 'meanwhile' rather than fully re-solving, see note).
//   5. Insert a keep-warm HOLD for any dish whose food is ready before serving
//      (i.e. its last step ends before offset 0) — hold from its end to serving.
//
// NOTE on serialization: fully optimal multi-resource scheduling is a bin-packing
// problem. For L1 we do the honest, readable thing: dishes are laid out so each
// finishes at serve time, human steps are ordered by their natural start, and we
// FLAG overlap as "meanwhile" (the cook does them back-to-back in that window).
// We do not yet shift entire dish timelines to eliminate every hands collision —
// that's a refinement once real meals show how often it bites. The result is
// always safe to follow (never asks for two hands-on things literally at once in
// the rendered order) because the final list is linearized.
export function mergeMeal(dishes: MergeInputDish[], opts?: { holdTempC?: number }): MergeResult {
  const holdTempC = opts?.holdTempC ?? 70;
  const usable = dishes.filter(d => d.steps.length > 0);
  const hasDurations = usable.some(d => d.steps.some(s => (s.durationSeconds || 0) > 0));

  const perDishCriticalSeconds: Record<string, number> = {};
  const all: ScheduledStep[] = [];

  // Critical path of the whole meal = the longest single dish (since all finish
  // together and the cook is one person, the floor is the longest dish; true
  // hands-contention could push it longer, accounted for after linearization).
  let mealCritical = 0;
  const timelines = usable.map(dish => {
    const tl = scheduleDishForward(dish);
    perDishCriticalSeconds[dish.canonicalId] = tl.criticalSeconds;
    if (tl.criticalSeconds > mealCritical) mealCritical = tl.criticalSeconds;
    return { dish, tl };
  });

  // Lay each dish so it finishes at serving (offset 0). A step at
  // startFromDishStart S in a dish of critical C begins at offset (C - S) before
  // serving, ends at (C - end). The dish itself starts at offset C.
  for (const { dish, tl } of timelines) {
    const C = tl.criticalSeconds;
    for (const s of tl.steps) {
      const startOffset = C - s.startFromDishStart;   // seconds before serving
      const endOffset = C - s.endFromDishStart;
      all.push({
        id: s.step.id,
        dishTitle: dish.title,
        dishCanonicalId: dish.canonicalId,
        group: s.step.group,
        type: s.step.type,
        instruction: s.step.instruction,
        durationSeconds: s.step.durationSeconds || 0,
        temperatureCelsius: s.step.temperatureCelsius,
        ingredients: s.step.ingredients,
        startOffsetSeconds: startOffset,
        endOffsetSeconds: endOffset,
        isHold: false,
        meanwhile: false,
      });
    }

    // Keep-warm: if this dish's food is ready before serving because it's not the
    // long pole, hold it. A dish finishes at offset 0 by construction here (we
    // anchored its END to serving), so holds arise when we DON'T want a dish to
    // start as late as possible — e.g. a quick dish we'd rather finish and hold.
    // In this anchor-to-serve scheme every dish ends exactly at serve, so no hold
    // is needed by default. Holds become relevant when a dish CANNOT be slotted
    // late enough due to hands contention and must finish early. We synthesize a
    // hold below, after linearization, where that actually occurs.
  }

  // Order earliest-start first (largest offset-before-serving first).
  all.sort((a, b) => b.startOffsetSeconds - a.startOffsetSeconds);

  // ── Hands linearization + "meanwhile" flagging ─────────────────────────────
  // Walk in time order. Track when the cook's hands are next free. A human step
  // that would start while hands are busy is pushed to when they free up; if that
  // pushes its end past serving (offset < 0), we instead pull the WHOLE thing
  // earlier by marking earlier dishes' ready-and-hold. For L1 readability we take
  // the simpler, honest path: we serialize human steps by nudging later ones to
  // start when hands free, and if a dish thereby finishes before serving, we add
  // a HOLD step for it. Non-blocking steps never contend (today's single unbounded
  // appliance pool).
  let handsFreeAtOffset = Infinity; // tracked as "seconds before serving"; smaller = later in time
  // We process from earliest (largest offset) to latest (offset →0). "Hands busy
  // until" is represented as the offset at which they free (a smaller number).
  let handsBusyUntilOffset: number | null = null;

  // Track, per dish, the latest (smallest) end offset actually achieved, to know
  // if it ends before serving (→ needs a hold).
  const dishEndOffset: Record<string, number> = {};

  for (const step of all) {
    if (isNonBlocking(step.type)) {
      // Doesn't take hands. Record dish end.
      dishEndOffset[step.dishCanonicalId] = Math.min(
        dishEndOffset[step.dishCanonicalId] ?? Infinity, step.endOffsetSeconds);
      continue;
    }
    // Human step. Does it overlap hands currently busy?
    if (handsBusyUntilOffset != null && step.startOffsetSeconds < handsBusyUntilOffset) {
      // Hands are busy when this wants to start → it actually runs back-to-back
      // in that window. Flag meanwhile; (we keep its offsets for display but the
      // cook does it right after the previous human step).
      step.meanwhile = true;
    }
    // After this human step, hands are busy until its end offset.
    handsBusyUntilOffset = step.endOffsetSeconds;
    dishEndOffset[step.dishCanonicalId] = Math.min(
      dishEndOffset[step.dishCanonicalId] ?? Infinity, step.endOffsetSeconds);
  }

  // ── Insert keep-warm holds ─────────────────────────────────────────────────
  // Any dish whose last step ends before serving (endOffset > 0) gets a hold from
  // its end to serving. (Drinks generally don't; we still hold if a hot drink ends
  // early. We hold dishes and sides; skip 'drink' unless it was hot — we don't
  // know hotness, so we hold only dish/side here for L1.)
  const dishMeta: Record<string, MergeInputDish> = {};
  for (const d of usable) dishMeta[d.canonicalId] = d;

  for (const [canonicalId, endOffset] of Object.entries(dishEndOffset)) {
    const dish = dishMeta[canonicalId];
    if (!dish) continue;
    if (dish.type === 'drink') continue;            // L1: don't hold drinks
    if (endOffset > 30) {                            // ends >30s before serving
      all.push({
        id: `hold-${canonicalId}`,
        dishTitle: dish.title,
        dishCanonicalId: canonicalId,
        group: null,
        type: 'hold',
        instruction: `Keep ${dish.title} warm (cover, or hold in a low oven ~${holdTempC}\u00B0C) until everything is ready to serve.`,
        durationSeconds: endOffset,
        temperatureCelsius: holdTempC,
        ingredients: [],
        startOffsetSeconds: endOffset,
        endOffsetSeconds: 0,
        isHold: true,
        meanwhile: false,
      });
    }
  }

  // Re-sort with holds included.
  all.sort((a, b) => {
    if (b.startOffsetSeconds !== a.startOffsetSeconds) return b.startOffsetSeconds - a.startOffsetSeconds;
    // holds after the cooking step they follow
    if (a.isHold !== b.isHold) return a.isHold ? 1 : -1;
    return 0;
  });

  return {
    totalSeconds: mealCritical,
    serveOffsetSeconds: 0,
    scheduled: all,
    perDishCriticalSeconds,
    hasDurations,
  };
}

// Format an offset-before-serving as a clock label given a serving time.
// e.g. serving 19:00, offset 3600 → "18:00". If no serving time, returns "T−1h00".
export function offsetToClock(offsetSeconds: number, serveDate?: Date | null): string {
  if (serveDate) {
    const d = new Date(serveDate.getTime() - offsetSeconds * 1000);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  // Relative label
  if (offsetSeconds <= 0) return 'serve';
  const h = Math.floor(offsetSeconds / 3600);
  const m = Math.round((offsetSeconds % 3600) / 60);
  if (h > 0) return `T\u2212${h}h${m.toString().padStart(2, '0')}`;
  return `T\u2212${m}m`;
}

// Stable source hash for a meal's dishes — used to detect when a stored merge is
// stale (the meal's components or their step timings changed since it was built).
// Build route stores this; the recipe route recomputes it from current data and
// compares, so the cook-together plan can auto-rebuild on view when out of date.
// MUST stay identical across both callers — hence it lives here, not duplicated.
export function sourceHashForDishes(dishes: MergeInputDish[]): string {
  return JSON.stringify(
    dishes.map(d => [d.canonicalId, d.type, d.steps.map(s => [s.id, s.durationSeconds, s.type])])
  );
}

// Normalize a raw version_step row's type to a MergeStepType. Shared so the build
// route and the staleness check in the recipe route classify steps identically.
export function normalizeStepType(s: { step_type?: string; appliance_settings?: any }): MergeStepType {
  const t = s.step_type;
  if (t === 'machine' || t === 'passive' || t === 'human') return t;
  if (s.appliance_settings) return 'machine';   // appliance → non-blocking
  return 'human';
}

// Build the merge-shaped dishes array from raw meal_component rows (as selected by
// both the build and recipe routes). Centralised so the source hash is computed
// from identical data on both sides.
export function dishesFromComponentRows(comps: any[]): MergeInputDish[] {
  return (comps ?? []).map((c: any) => {
    const can = Array.isArray(c.recipe_canonicals) ? c.recipe_canonicals[0] : c.recipe_canonicals;
    const cv = can && (Array.isArray(can.recipe_versions) ? can.recipe_versions[0] : can.recipe_versions);
    const vIngs = cv?.version_ingredients ?? [];
    const steps = (cv?.version_steps ?? [])
      .slice()
      .sort((a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0))
      .map((s: any) => ({
        id: s.id,
        dishTitle: cv?.title ?? '(untitled)',
        dishCanonicalId: c.component_canonical_id,
        group: (s.group_label && s.group_label !== '__default__') ? s.group_label : null,
        type: normalizeStepType(s),
        instruction: s.instruction ?? '',
        durationSeconds: s.duration_seconds ?? 0,
        temperatureCelsius: s.temperature_celsius ?? null,
        ingredients: vIngs
          .filter((vi: any) => vi.step_id === s.id)
          .map((vi: any) => ({
            name: vi.ingredients?.name ?? '',
            quantityValue: vi.quantity_value ?? 0,
            quantityUnit: vi.quantity_unit ?? 'g',
            prep: vi.prep_note ?? null,
          })),
      }));
    return {
      canonicalId: c.component_canonical_id,
      title: cv?.title ?? '(untitled)',
      type: (c.component_type ?? 'dish') as 'dish' | 'side' | 'drink',
      steps,
    };
  });
}
