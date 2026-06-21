// src/app/api/my/recipes/affected/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

// Which of the caller's authored recipes would re-specialise to a GIVEN task-update?
// Focused, single-task version of /respecialise-all's scan — backs the "23 recipes" link
// in the bulk modal (opens /my/recipes/affected?task=<toTaskId> in a new tab).
//
// GET ?task=<toTaskId>  → { task: {id,name,from?}, recipes: [{slug,title,cuisine,stepCount}] }
// Author-scoped: only the caller's own recipes are ever read.

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${key}`, apikey: key } },
  });
}

type Concept = { id: string; bi: string | null; bt: string | null };

async function genericRootOf(db: any, taskId: string, cache: Map<string, string>): Promise<string> {
  const hit = cache.get(taskId);
  if (hit) return hit;
  const { data } = await db.from('tasks').select('id, parent_task_id').eq('id', taskId).maybeSingle();
  const root = data?.parent_task_id ?? taskId;
  cache.set(taskId, root);
  return root;
}
async function conceptsOf(db: any, genericId: string, cache: Map<string, Concept[]>): Promise<Concept[]> {
  const hit = cache.get(genericId);
  if (hit) return hit;
  const { data } = await db.from('tasks').select('id, bound_ingredient_id, bound_tool_slug').eq('parent_task_id', genericId);
  const built: Concept[] = (data ?? []).map((c: any) => ({ id: c.id, bi: c.bound_ingredient_id ?? null, bt: c.bound_tool_slug ?? null }));
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

export async function GET(req: NextRequest) {
  const targetTaskId = req.nextUrl.searchParams.get('task');
  if (!targetTaskId) return NextResponse.json({ error: 'task query param required' }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = serviceClient() as any;

  // name of the target task (for the page header)
  const { data: tRow } = await db.from('tasks').select('id, name').eq('id', targetTaskId).maybeSingle();

  const { data: canons } = await db
    .from('recipe_canonicals')
    .select('id, slug, current_version_id, recipe_versions!current_version_id ( title, cuisine )')
    .eq('author_id', user.id)
    .is('archived_at', null);

  const rootCache = new Map<string, string>();
  const conceptCache = new Map<string, Concept[]>();
  const recipes: { slug: string; title: string; cuisine: string | null; stepCount: number }[] = [];

  for (const rc of (canons ?? [])) {
    if (!rc.current_version_id) continue;
    const rv = rc.recipe_versions;
    const meta = Array.isArray(rv) ? rv[0] : rv;
    const title = meta?.title ?? rc.slug;
    const cuisine = meta?.cuisine ?? null;

    const { data: steps } = await db
      .from('version_steps')
      .select('id, task_id, appliance_settings')
      .eq('version_id', rc.current_version_id);

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

    let stepCount = 0;
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
      if (target !== s.task_id && target === targetTaskId) stepCount++;
    }
    if (stepCount > 0) recipes.push({ slug: rc.slug, title, cuisine, stepCount });
  }

  recipes.sort((a, b) => a.title.localeCompare(b.title));
  return NextResponse.json({
    task: { id: targetTaskId, name: tRow?.name ?? targetTaskId },
    recipeCount: recipes.length,
    recipes,
  });
}
