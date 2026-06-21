// src/app/api/admin/recipes/[id]/respecialise/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Admin gate — AUTH account ids (auth.uid()), NOT person ids. Keep in sync with
// /api/admin/tasks/[id] + /api/admin/check + the RLS policy.
const ADMIN_IDS = (process.env.SOUPDOG_ADMIN_ACCOUNT_IDS
  ?? 'bb02ae50-436c-4402-8c8c-447344e10151,1a0f72dd-f0a7-487c-9ecd-7ef898f8dabf')
  .split(',').map(s => s.trim()).filter(Boolean);

// ─────────────────────────────────────────────────────────────────────────────
// Re-specialise an EXISTING recipe against the CURRENT concept library.
//
// Concept binding (Phase C) is frozen at decompose-save time: a step gets the most
// specific concept that existed THEN. Concepts added later (e.g. "Slice cucumber")
// don't retroactively bind. This endpoint re-runs the same deterministic scoring on a
// recipe's current steps, using data ALREADY in the DB (each step's ingredient_id and
// tool slug) — NO AI, NO re-decompose.
//
// Walk-up semantics: for each step we resolve its task's GENERIC ROOT (if the current
// task_id has a parent_task_id, that's the generic; else the task is already generic),
// then score all concepts of that generic. This lets a step move generic→concept OR
// concept→better-concept. It can NEVER demote: a concept only binds when it MATCHES a
// dimension the step has, so "no match" leaves the step exactly as-is.
//
// GET  → dry-run: returns the proposed changes, writes nothing.
// POST ?apply=true → applies the proposed changes (updates version_steps.task_id).
// Default (POST without apply, or GET) is always dry-run for safety.
// ─────────────────────────────────────────────────────────────────────────────

type Concept = { id: string; bi: string | null; bt: string | null };

// Resolve a task's generic root: if it has a parent_task_id it's a concept → return the
// parent; else it's already generic → return itself. (One level; concepts are children
// of generics, not of other concepts, in the current model.)
async function genericRootOf(db: any, taskId: string, rootCache: Map<string, string>): Promise<string> {
  const cached = rootCache.get(taskId);
  if (cached) return cached;
  const { data } = await db.from('tasks').select('id, parent_task_id').eq('id', taskId).maybeSingle();
  const root = data?.parent_task_id ?? taskId;
  rootCache.set(taskId, root);
  return root;
}

// Concepts of a generic task (cached per request).
async function conceptsOf(db: any, genericId: string, cache: Map<string, Concept[]>): Promise<Concept[]> {
  const cached = cache.get(genericId);
  if (cached) return cached;
  const { data } = await db
    .from('tasks')
    .select('id, bound_ingredient_id, bound_tool_slug')
    .eq('parent_task_id', genericId);
  const built: Concept[] = (data ?? []).map((c: any) => ({
    id: c.id, bi: c.bound_ingredient_id ?? null, bt: c.bound_tool_slug ?? null,
  }));
  cache.set(genericId, built);
  return built;
}

// Same scoring as specialiseTask in decompose-save: +2 ingredient match, +1 tool match;
// a concept that binds a dimension the step lacks/mismatches is disqualified. Returns the
// best concept id, or the generic id if nothing scores. (Idempotent: re-running yields
// the same result.)
function bestTaskId(genericId: string, concepts: Concept[], ingredientId: string | null, toolSlug: string | null): string {
  if (!ingredientId && !toolSlug) return genericId;
  let best: { id: string; score: number } | null = null;
  for (const c of concepts) {
    let score = 0;
    if (c.bi) { if (c.bi === ingredientId) score += 2; else continue; }
    if (c.bt) { if (c.bt === toolSlug)    score += 1; else continue; }
    if (score === 0) continue;
    if (!best || score > best.score) best = { id: c.id, score };
  }
  return best ? best.id : genericId;
}

async function run(req: NextRequest, id: string, apply: boolean) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!ADMIN_IDS.includes(user.id)) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const db = supabase as any;

  // The page may hand us EITHER a canonical id OR a recipes-mirror id (the mirror trap:
  // the recipe page sometimes holds the mirror row id, not the canonical). Resolve to the
  // true recipe_canonicals.id first, so the button works regardless of which id it has.
  // chain: recipes.id → recipes.recipe_version_id → recipe_versions.canonical_id.
  async function resolveCanonicalId(rawId: string): Promise<string | null> {
    // already a canonical?
    const { data: asCanon } = await db.from('recipe_canonicals').select('id').eq('id', rawId).maybeSingle();
    if (asCanon?.id) return asCanon.id;
    // else try the mirror: recipes.id → recipe_version_id → recipe_versions.canonical_id
    const { data: mirror } = await db.from('recipes').select('recipe_version_id').eq('id', rawId).maybeSingle();
    if (mirror?.recipe_version_id) {
      const { data: ver } = await db.from('recipe_versions').select('canonical_id').eq('id', mirror.recipe_version_id).maybeSingle();
      if (ver?.canonical_id) return ver.canonical_id;
    }
    return null;
  }

  const canonicalId = await resolveCanonicalId(id);
  if (!canonicalId) return NextResponse.json({ error: 'Recipe not found' }, { status: 404 });

  // recipe → current version
  const { data: canonical, error: ce } = await db
    .from('recipe_canonicals')
    .select('id, slug, current_version_id')
    .eq('id', canonicalId)
    .maybeSingle();
  if (ce || !canonical) return NextResponse.json({ error: 'Recipe not found' }, { status: 404 });
  if (!canonical.current_version_id) return NextResponse.json({ error: 'Recipe has no current version' }, { status: 400 });

  // steps of the current version (with their current task + tool). Flat select — no
  // nested tasks embed (embeds are fragile; we resolve task names separately below).
  const { data: steps, error: se } = await db
    .from('version_steps')
    .select('id, order_index, instruction, task_id, appliance_settings')
    .eq('version_id', canonical.current_version_id)
    .order('order_index', { ascending: true });
  if (se) return NextResponse.json({ error: 'Failed to load steps' }, { status: 500 });

  // ingredient per step (flat query, join in code — nested embeds are fragile)
  const stepIds = (steps ?? []).map((s: any) => s.id);
  const ingByStep = new Map<string, string>();
  if (stepIds.length) {
    const { data: vis } = await db
      .from('version_ingredients')
      .select('step_id, ingredient_id, order_index')
      .in('step_id', stepIds)
      .order('order_index', { ascending: true });
    for (const vi of (vis ?? [])) {
      if (vi.step_id && vi.ingredient_id && !ingByStep.has(vi.step_id)) {
        ingByStep.set(vi.step_id, vi.ingredient_id); // first (atomicity: one ingredient/step)
      }
    }
  }

  // names for the diff (resolve concept ids → names in one lookup at the end)
  const rootCache = new Map<string, string>();
  const conceptCache = new Map<string, Concept[]>();
  const proposals: { stepId: string; order: number; instruction: string; fromTaskId: string | null; toTaskId: string }[] = [];

  for (const s of (steps ?? [])) {
    if (!s.task_id) continue; // nothing to specialise from
    const toolSlug = (() => {
      const st = (s.appliance_settings as any)?.stepTools;
      const n = Array.isArray(st) ? st[0]?.name : undefined;
      return typeof n === 'string' ? n.trim() || null : null;
    })();
    const ingredientId = ingByStep.get(s.id) ?? null;

    const genericId = await genericRootOf(db, s.task_id, rootCache);
    const concepts = await conceptsOf(db, genericId, conceptCache);
    const target = bestTaskId(genericId, concepts, ingredientId, toolSlug);

    if (target !== s.task_id) {
      proposals.push({
        stepId: s.id, order: s.order_index, instruction: s.instruction,
        fromTaskId: s.task_id, toTaskId: target,
      });
    }
  }

  // resolve task ids → names for a readable diff
  const idsToName = Array.from(new Set(proposals.flatMap(p => [p.fromTaskId, p.toTaskId]).filter(Boolean))) as string[];
  const nameById = new Map<string, string>();
  if (idsToName.length) {
    const { data: tn } = await db.from('tasks').select('id, name').in('id', idsToName);
    for (const t of (tn ?? [])) nameById.set(t.id, t.name);
  }

  const changes = proposals.map(p => ({
    stepOrder: p.order,
    instruction: p.instruction,
    from: p.fromTaskId ? (nameById.get(p.fromTaskId) ?? p.fromTaskId) : null,
    to: nameById.get(p.toTaskId) ?? p.toTaskId,
  }));

  if (!apply) {
    return NextResponse.json({
      recipe: canonical.slug, applied: false,
      changeCount: changes.length, changes,
    });
  }

  // apply: update each step's task_id
  let updated = 0;
  for (const p of proposals) {
    const { error } = await db.from('version_steps').update({ task_id: p.toTaskId }).eq('id', p.stepId);
    if (!error) updated++;
  }
  return NextResponse.json({
    recipe: canonical.slug, applied: true,
    changeCount: changes.length, updated, changes,
  });
}

// GET = dry-run (never writes)
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return run(req, id, false);
}

// POST = apply only when ?apply=true; otherwise still a dry-run
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const apply = req.nextUrl.searchParams.get('apply') === 'true';
  return run(req, id, apply);
}
