// src/app/api/my/recipes/respecialise-all/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

// Bulk re-specialise across ALL recipes the caller AUTHORED. Same deterministic scoring as
// the single-recipe endpoint, run over every owned recipe. Author-scoped: only the
// caller's own recipes are ever read or written — a super admin running this affects only
// recipes THEY authored, never anyone else's.
//
// GET  → dry-run: returns proposals grouped by TASK-UPDATE (e.g. "Slice → Slice cucumber:
//        3 recipes"). Writes nothing.
// POST ?apply=true, body { onlyTaskIds?: string[] } → applies. If onlyTaskIds is given,
//        only those task-updates are written (the modal's per-task-update checkboxes);
//        absent → apply everything.

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set — cannot write past RLS');
  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${key}`, apikey: key } },
  });
}

type Concept = { id: string; bi: string | null; bt: string | null };

async function genericRootOf(db: any, taskId: string, rootCache: Map<string, string>): Promise<string> {
  const cached = rootCache.get(taskId);
  if (cached) return cached;
  const { data } = await db.from('tasks').select('id, parent_task_id').eq('id', taskId).maybeSingle();
  const root = data?.parent_task_id ?? taskId;
  rootCache.set(taskId, root);
  return root;
}

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

type Proposal = {
  recipeSlug: string; recipeTitle: string;
  stepId: string; order: number;
  fromTaskId: string; toTaskId: string;
};

async function run(req: NextRequest, apply: boolean) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = serviceClient() as any;

  // optional per-task-update filter (apply only)
  let onlyTaskIds: Set<string> | null = null;
  if (apply) {
    const body = await req.json().catch(() => null);
    if (body && Array.isArray(body.onlyTaskIds)) {
      onlyTaskIds = new Set(body.onlyTaskIds.filter((x: any) => typeof x === 'string'));
    }
  }

  // all recipes this user authored (not archived), with their current version + title
  const { data: canons } = await db
    .from('recipe_canonicals')
    .select('id, slug, current_version_id, recipe_versions!current_version_id ( title )')
    .eq('author_id', user.id)
    .is('archived_at', null);

  const rootCache = new Map<string, string>();
  const conceptCache = new Map<string, Concept[]>();
  const proposals: Proposal[] = [];

  for (const rc of (canons ?? [])) {
    if (!rc.current_version_id) continue;
    const title = (() => {
      const rv = rc.recipe_versions;
      const t = Array.isArray(rv) ? rv[0]?.title : rv?.title;
      return t ?? rc.slug;
    })();

    // steps of this version
    const { data: steps } = await db
      .from('version_steps')
      .select('id, order_index, task_id, appliance_settings')
      .eq('version_id', rc.current_version_id)
      .order('order_index', { ascending: true });

    const stepIds = (steps ?? []).map((s: any) => s.id);
    const ingByStep = new Map<string, string>();
    if (stepIds.length) {
      const { data: vis } = await db
        .from('version_ingredients')
        .select('step_id, ingredient_id, order_index')
        .in('step_id', stepIds)
        .order('order_index', { ascending: true });
      for (const vi of (vis ?? [])) {
        if (vi.step_id && vi.ingredient_id && !ingByStep.has(vi.step_id)) ingByStep.set(vi.step_id, vi.ingredient_id);
      }
    }

    for (const s of (steps ?? [])) {
      if (!s.task_id) continue;
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
          recipeSlug: rc.slug, recipeTitle: title,
          stepId: s.id, order: s.order_index,
          fromTaskId: s.task_id, toTaskId: target,
        });
      }
    }
  }

  // resolve task names
  const taskIds = Array.from(new Set(proposals.flatMap(p => [p.fromTaskId, p.toTaskId]))) as string[];
  const nameById = new Map<string, string>();
  if (taskIds.length) {
    const { data: tn } = await db.from('tasks').select('id, name').in('id', taskIds);
    for (const t of (tn ?? [])) nameById.set(t.id, t.name);
  }

  // group proposals by TASK-UPDATE (fromTaskId→toTaskId)
  const groups = new Map<string, {
    toTaskId: string; fromName: string; toName: string;
    recipes: Set<string>; stepCount: number;
  }>();
  for (const p of proposals) {
    const key = `${p.fromTaskId}->${p.toTaskId}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        toTaskId: p.toTaskId,
        fromName: nameById.get(p.fromTaskId) ?? p.fromTaskId,
        toName: nameById.get(p.toTaskId) ?? p.toTaskId,
        recipes: new Set(), stepCount: 0,
      };
      groups.set(key, g);
    }
    g.recipes.add(p.recipeTitle);
    g.stepCount++;
  }
  const taskUpdates = Array.from(groups.values()).map(g => ({
    toTaskId: g.toTaskId,
    from: g.fromName, to: g.toName,
    recipeCount: g.recipes.size,
    stepCount: g.stepCount,
    recipes: Array.from(g.recipes),
  })).sort((a, b) => b.stepCount - a.stepCount);

  if (!apply) {
    return NextResponse.json({
      applied: false,
      totalSteps: proposals.length,
      taskUpdateCount: taskUpdates.length,
      taskUpdates,
    });
  }

  const toApply = onlyTaskIds ? proposals.filter(p => onlyTaskIds!.has(p.toTaskId)) : proposals;
  let updated = 0;
  const failures: string[] = [];
  for (const p of toApply) {
    const { data, error } = await db
      .from('version_steps')
      .update({ task_id: p.toTaskId })
      .eq('id', p.stepId)
      .select('id');
    if (error) failures.push(error.message);
    else if (data && data.length > 0) updated++;
    else failures.push(`step ${p.stepId}: 0 rows changed`);
  }
  return NextResponse.json({
    applied: true,
    updated, attempted: toApply.length,
    failures: failures.length ? failures : undefined,
  });
}

export async function GET(req: NextRequest) { return run(req, false); }
export async function POST(req: NextRequest) {
  const apply = req.nextUrl.searchParams.get('apply') === 'true';
  return run(req, apply);
}
