// src/app/api/recipes/decompose-save/route.ts
// POST — persist a decomposed recipe DAG to the rich schema.
//
// Input: { meta: {...}, dag: { title, servings, nodes: [...] } }
//   - `dag` is the output of the step-2 decomposition prompt (see
//     prompts/decomposition_step2_prompt.md), already validated by the eval harness.
//   - each node: { id, task, ingredients:[{name,qty,unit,prep}], consumes:[ids],
//                  produces, group, tool, params, passive, completion, notes }
//
// What it writes (v1 — Option A, groups as group_label; version_sub_recipes deferred):
//   recipe_canonicals → recipe_versions → version_steps (with REAL task_id FK) →
//   version_ingredients (linked by step_id) → version_step_dependencies (the DAG edges).
//   Also the canonical execution_variant + legacy `recipes` mirror, matching the
//   existing /api/my/recipes POST conventions.
//
// Find-or-create runs code-side at TWO levels here:
//   - tasks      (match tasks.name case-insensitive → else create unverified/ai_generated)
//   - ingredients (mirrors findOrCreateIngredient from /api/my/recipes)
// Sub-recipe-level find-or-create (groups → child canonicals) is Option B, deferred.

import { NextRequest, NextResponse, after } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logAiUsage } from '@/lib/ai/anthropic';

function slugify(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

// ── Background nutrition estimation (copied from /api/my/recipes conventions) ──
async function estimateNutrition(name: string, accountId: string | null, db: any): Promise<any | null> {
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        messages: [{
          role: 'user',
          content: `Estimate USDA nutrition per 100g for "${name}" (raw/uncooked unless it's a processed food). Respond with ONLY a JSON object, no markdown:\n{"calories":number,"protein":number,"fat":number,"saturated_fat":number,"carbohydrates":number,"sugar":number,"fiber":number,"sodium":number}`,
        }],
      }),
    });
    if (!res.ok) {
      void logAiUsage({ accountId, db, model: 'claude-haiku-4-5-20251001', feature: 'nutrition_estimate', inputTokens: 0, outputTokens: 0, success: false, error: `status ${res.status}` });
      return null;
    }
    const data = await res.json();
    const u = data.usage ?? {};
    void logAiUsage({ accountId, db, model: 'claude-haiku-4-5-20251001', feature: 'nutrition_estimate', inputTokens: u.input_tokens ?? 0, outputTokens: u.output_tokens ?? 0, success: true });
    const text = data.content?.[0]?.text ?? '';
    const clean = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
    return JSON.parse(clean);
  } catch {
    return null;
  }
}
async function backfillNutrition(db: any, accountId: string | null, items: { id: string; name: string }[]) {
  for (const { id, name } of items) {
    try {
      const nutrition = await estimateNutrition(name, accountId, db);
      if (nutrition) await db.from('ingredients').update({ nutrition_per_100g: nutrition }).eq('id', id);
    } catch { /* backfill endpoint is the safety net */ }
  }
}

// ── findOrCreateIngredient — mirrors /api/my/recipes exactly ──
async function findOrCreateIngredient(
  db: any, name: string, createdOut: { id: string; name: string }[],
): Promise<string | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const { data: existing } = await db
    .from('ingredients').select('id')
    .ilike('name', trimmed).eq('is_product', false).limit(1).single();
  if (existing?.id) return existing.id;
  const slug = slugify(trimmed) + '-' + Date.now().toString(36).slice(-4);
  const { data: newIng } = await db
    .from('ingredients')
    .insert({ slug, name: trimmed, category: 'other', is_product: false })
    .select('id').single();
  if (newIng?.id) {
    createdOut.push({ id: newIng.id, name: trimmed });
    return newIng.id;
  }
  return null;
}

// ── findOrCreateTask — NEW. Mirrors the ingredient pattern. Match tasks.name
// case-insensitive; on miss, create UNVERIFIED + ai_generated (v0.3: AI tasks enter
// the library flagged, curation blesses later). Sets the columns the schema requires
// NOT-NULL with no default: slug, name, family (task_family defaults to 'other').
// Cache within a single save so repeated verbs (many "add" nodes) hit the DB once. ──
async function findOrCreateTask(
  db: any, taskName: string, cache: Map<string, string>, createdOut: string[],
): Promise<string | null> {
  const raw = (taskName || '').trim();
  if (!raw) return null;
  const key = raw.toLowerCase();
  if (cache.has(key)) return cache.get(key)!;

  const { data: existing } = await db
    .from('tasks').select('id').ilike('name', raw).limit(1).single();
  if (existing?.id) { cache.set(key, existing.id); return existing.id; }

  // Create unverified. `family` mirrors `task_family` for now (both required-ish);
  // category left null (curation/merge assigns it). is_verified false + source
  // ai_generated so the curation gate can find and bless these.
  const slug = slugify(raw) + '-' + Date.now().toString(36).slice(-4);
  const { data: newTask } = await db
    .from('tasks')
    .insert({
      slug,
      name: raw,
      family: 'other',
      task_family: 'other',
      task_type: 'human',
      source: 'ai_generated',
      is_verified: false,
      content_reviewed: false,
    })
    .select('id').single();
  if (newTask?.id) {
    cache.set(key, newTask.id);
    createdOut.push(raw);
    return newTask.id;
  }
  return null;
}

// ISO-8601-ish "PT12M" → seconds, else null (completion strings that aren't durations
// are kept as the step's completion text in `notes`, not turned into a duration).
function durationToSeconds(completion: string | null | undefined): number | null {
  if (!completion) return null;
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(completion.trim());
  if (!m) return null;
  const [, h, min, s] = m;
  const secs = (parseInt(h || '0') * 3600) + (parseInt(min || '0') * 60) + parseInt(s || '0');
  return secs > 0 ? secs : null;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const dag  = body?.dag;
  const meta = body?.meta ?? {};

  if (!dag || !Array.isArray(dag.nodes) || dag.nodes.length === 0) {
    return NextResponse.json({ error: 'dag with nodes required' }, { status: 400 });
  }

  // ── Validate the DAG before touching the DB (cheap guard against bad input) ──
  const ids = new Set<string>(dag.nodes.map((n: any) => n.id));
  for (const n of dag.nodes) {
    if (!n.id || !n.task) return NextResponse.json({ error: `node missing id/task: ${JSON.stringify(n)}` }, { status: 400 });
    for (const c of n.consumes ?? []) {
      if (!ids.has(c)) return NextResponse.json({ error: `node ${n.id} consumes unknown id ${c}` }, { status: 400 });
      if (c === n.id) return NextResponse.json({ error: `node ${n.id} self-edge` }, { status: 400 });
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const title = (meta.title ?? dag.title ?? 'Untitled recipe').trim();
  const slug  = slugify(title) + '-' + Date.now().toString(36);
  const servings = meta.servings ?? dag.servings ?? 4;

  const createdIngredients: { id: string; name: string }[] = [];
  const createdTasks: string[] = [];
  const taskCache = new Map<string, string>();

  try {
    // ── canonical + version (mirrors /api/my/recipes POST) ──
    const { data: canonical, error: ce } = await db
      .from('recipe_canonicals')
      .insert({ slug, author_id: user.id, is_published: false, source: 'ai_generated' })
      .select().single();
    if (ce) throw ce;

    const { data: version, error: ve } = await db
      .from('recipe_versions')
      .insert({
        canonical_id:        canonical.id,
        version_number:      1,
        title,
        description:         meta.description?.trim() || null,
        cuisine:             meta.cuisine?.trim() || null,
        tags:                Array.isArray(meta.tags) ? meta.tags : [],
        base_servings:       servings,
        difficulty:          meta.difficulty ?? 'medium',
        total_time_seconds:  meta.totalTimeSeconds ?? 0,
        is_canonical_version: true,
      })
      .select().single();
    if (ve) throw ve;

    await db.from('recipe_canonicals').update({ current_version_id: version.id }).eq('id', canonical.id);

    // ── Insert one version_step per DAG node. Keep nodeId → stepId so we can wire
    //    dependency edges after all steps exist. ──
    const stepIdByNode = new Map<string, string>();
    let ingOrderIndex = 0;
    const stepIngredientIds = new Set<string>();

    for (let i = 0; i < dag.nodes.length; i++) {
      const n = dag.nodes[i];

      const taskId = await findOrCreateTask(db, n.task, taskCache, createdTasks);
      const durationSeconds = durationToSeconds(n.completion);
      // Non-duration completion text (e.g. "until golden") is preserved in notes.
      const completionNote = (n.completion && durationSeconds == null) ? n.completion : null;
      const noteParts = [completionNote, n.notes].filter(Boolean);

      const { data: step, error: se } = await db
        .from('version_steps')
        .insert({
          version_id:   version.id,
          order_index:  i + 1,
          step_type:    n.passive ? 'passive' : 'human',
          instruction:  buildInstruction(n),
          task_id:      taskId,                                   // ← REAL FK (the fix)
          task_parameters: n.params && Object.keys(n.params).length ? n.params : null,
          duration_seconds: durationSeconds,
          group_label:  n.group?.trim() || null,
          notes:        noteParts.length ? noteParts.join(' — ') : null,
          // tool inference goes through appliance_settings to round-trip in the editor;
          // anchored to the suggested slug the model emitted.
          appliance_settings: n.tool ? { stepTools: [{ name: n.tool }] } : null,
        })
        .select('id').single();
      if (se || !step) throw (se ?? new Error('step insert returned no row'));
      stepIdByNode.set(n.id, step.id);

      // single ingredient introduced at this node (atomicity: at most one)
      const ing = (n.ingredients ?? [])[0];
      if (ing?.name?.trim()) {
        const ingredientId = await findOrCreateIngredient(db, ing.name, createdIngredients);
        if (ingredientId) {
          stepIngredientIds.add(ingredientId);
          await db.from('version_ingredients').insert({
            version_id:     version.id,
            step_id:        step.id,
            ingredient_id:  ingredientId,
            quantity_value: ing.qty ?? 0,
            quantity_unit:  ing.unit ?? 'g',
            prep_note:      ing.prep?.trim() || null,
            optional:       false,
            order_index:    ++ingOrderIndex,
          });
        }
      }
    }

    // ── Dependency edges: node.consumes → version_step_dependencies rows ──
    for (const n of dag.nodes) {
      const stepId = stepIdByNode.get(n.id);
      if (!stepId) continue;
      for (const c of n.consumes ?? []) {
        const dependsOn = stepIdByNode.get(c);
        if (!dependsOn) continue;
        await db.from('version_step_dependencies').insert({
          step_id:                   stepId,
          depends_on_step_id:        dependsOn,
          // label the edge with the producer's intermediate name if it has one
          consumes_intermediate_label: producerLabel(dag, c),
        });
      }
    }

    // ── canonical execution variant + legacy mirror (match existing POST) ──
    await db.from('execution_variants').insert({
      version_id: version.id, servings, unit_system: 'si',
      is_canonical_variant: true, author_id: user.id, source: 'ai_generated',
    });

    await db.from('recipes').insert({
      slug, title,
      description:       meta.description?.trim() || null,
      cuisine:           meta.cuisine?.trim() || null,
      tags:              Array.isArray(meta.tags) ? meta.tags : [],
      servings,
      difficulty:        meta.difficulty ?? 'medium',
      total_time_seconds: meta.totalTimeSeconds ?? 0,
      is_published:      false,
      author_id:         user.id,
      version:           1,
      recipe_version_id: version.id,
    });

    if (createdIngredients.length > 0) {
      after(() => backfillNutrition(db, user.id, createdIngredients));
    }

    return NextResponse.json({
      id: canonical.id,
      slug,
      stepsWritten: stepIdByNode.size,
      tasksCreated: createdTasks,         // surfaced so you can see what entered the library unverified
      ingredientsCreated: createdIngredients.map((c) => c.name),
    }, { status: 201 });

  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Decompose-save failed' }, { status: 500 });
  }
}

// Build a readable instruction line for the step from the node (display layer will
// re-bundle; this is the per-atom fallback text).
function buildInstruction(n: any): string {
  const verb = (n.task || '').trim();
  const ing  = (n.ingredients ?? [])[0];
  if (ing?.name) {
    const qty = ing.qty != null ? `${ing.qty}${ing.unit ? ' ' + ing.unit : ''} ` : '';
    return `${capitalize(verb)} ${qty}${ing.name}`.trim();
  }
  return capitalize(verb);
}
function capitalize(s: string) { return s ? s[0].toUpperCase() + s.slice(1) : s; }

// The `produces` name of the node that an edge points at (the intermediate flowing
// along the edge), or null.
function producerLabel(dag: any, nodeId: string): string | null {
  const producer = dag.nodes.find((x: any) => x.id === nodeId);
  return producer?.produces?.trim() || null;
}
