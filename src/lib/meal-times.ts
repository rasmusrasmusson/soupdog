// src/lib/meal-times.ts
// Resolves the scheduled time for a meal slot on a given date, from a person's
// habitual slot_times. Shape is override-capable (rest-day variation) but the
// rest-day UI is NOT built yet — only `default` is populated today. The resolver
// already honours overrides so the feature can be added later with no rewrite.
//
// slot_times shape (all parts optional; sensible fallbacks):
//   {
//     default:  { breakfast:"07:30", lunch:"12:30", dinner:"19:00" },
//     rest_days:["sat","sun"],        // USER-DEFINED. Never hard-coded.
//     overrides:{ breakfast:"09:00", ... }   // applied on rest days
//   }
// Also accepts the legacy FLAT shape { breakfast, lunch, dinner } as `default`.

export type SlotTimes = {
  default?: Record<string, string>;
  rest_days?: string[];
  overrides?: Record<string, string>;
  // legacy flat keys tolerated:
  breakfast?: string; lunch?: string; dinner?: string;
};

const DEFAULTS: Record<string, string> = { breakfast: '07:30', lunch: '12:30', dinner: '19:00' };
// snack / generic 'meal' have no habitual time → caller places them after the
// last meal of the day (handled in generation, not here).

const DOW = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

// Normalize either the new nested shape or the legacy flat shape into parts.
function normalize(st: SlotTimes | null | undefined): { def: Record<string, string>; restDays: string[]; overrides: Record<string, string> } {
  const s = st ?? {};
  const hasNested = s.default || s.overrides || s.rest_days;
  const def = hasNested
    ? { ...DEFAULTS, ...(s.default ?? {}) }
    : { ...DEFAULTS, ...(s.breakfast ? { breakfast: s.breakfast } : {}), ...(s.lunch ? { lunch: s.lunch } : {}), ...(s.dinner ? { dinner: s.dinner } : {}) };
  return { def, restDays: s.rest_days ?? [], overrides: s.overrides ?? {} };
}

// Returns "HH:MM" for a named slot on a given ISO date, honouring rest-day
// overrides. Returns null for slots with no habitual time (snack/meal).
export function timeForSlot(slot: string, isoDate: string, slotTimes: SlotTimes | null | undefined): string | null {
  if (slot !== 'breakfast' && slot !== 'lunch' && slot !== 'dinner') return null;
  const { def, restDays, overrides } = normalize(slotTimes);
  const dow = DOW[new Date(isoDate + 'T00:00:00').getDay()];
  if (restDays.includes(dow) && overrides[slot]) return overrides[slot];
  return def[slot] ?? DEFAULTS[slot] ?? null;
}

export { DEFAULTS as DEFAULT_SLOT_TIMES };
