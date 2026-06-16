// src/app/api/admin/reimport-recipe/route.ts
//
// Re-decompose an EXISTING recipe through the current decompose pipeline and write
// the result as a NEW VERSION under the SAME canonical (in-place, reversible).
//
// Why: most recipes predate the atomic-decomposition + guide-layer work, so their
// steps lack good completion criteria, tool inference, and grate-as-task structure.
// Re-decomposing improves the CONTENT users see (cooking screen, recipe view), which
// read version_steps/ingredients/notes — all of which decompose improves.
//
// Strategy (confirmed): keep the canonical (slug, saved-recipe links, meal-component
// refs all stable); add a fresh recipe_versions row; flip current_version_id; update
// the `recipes` mirror's recipe_version_id. The OLD version stays as history, so this
// is reversible (flip current_version_id back).
//
// POST { canonicalId, commit?: boolean }
//   commit=false (default) → DRY RUN: serialize + decompose, return a preview of the
//                            DAG (node/edge counts, sample steps). Writes NOTHING.
//   commit=true            → write the new version in-place.
//
// Admin-gated (account id, not person id — auth.uid() is the account).

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const maxDuration = 60;


const ADMIN_ACCOUNT_IDS = (process.env.SOUPDOG_ADMIN_ACCOUNT_IDS ?? '')
  .split(',').map(s => s.trim()).filter(Boolean);
const DEFAULT_ADMINS = [
  'bb02ae50-436c-4402-8c8c-447344e10151', // rr@varm.io
  '1a0f72dd-f0a7-487c-9ecd-7ef898f8dabf', // rr@le.works
];
function isAdmin(accountId: string): boolean {
  const allow = ADMIN_ACCOUNT_IDS.length ? ADMIN_ACCOUNT_IDS : DEFAULT_ADMINS;
  return allow.includes(accountId);
}

// ── helpers copied verbatim from decompose-save (module-private there) ──
function slugify(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}
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
  if (newIng?.id) { createdOut.push({ id: newIng.id, name: trimmed }); return newIng.id; }
  return null;
}
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
  const slug = slugify(raw) + '-' + Date.now().toString(36).slice(-4);
  const { data: newTask, error: te } = await db
    .from('tasks')
    .insert({
      slug, name: raw, family: 'other', task_family: 'other', task_type: 'human',
      source: 'ai_generated', is_verified: false, content_reviewed: false,
    })
    .select('id').single();
  if (te) { console.error('[reimport] task insert failed for "%s": %s', raw, te.message); return null; }
  if (newTask?.id) { cache.set(key, newTask.id); createdOut.push(raw); return newTask.id; }
  return null;
}
function durationToSeconds(completion: string | null | undefined): number | null {
  if (!completion) return null;
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(completion.trim());
  if (!m) return null;
  const [, h, min, s] = m;
  const secs = (parseInt(h || '0') * 3600) + (parseInt(min || '0') * 60) + parseInt(s || '0');
  return secs > 0 ? secs : null;
}
function naturalDurationToSeconds(text: string | null | undefined): number | null {
  if (!text) return null;
  const t = text.toLowerCase();
  let total = 0; let found = false;
  const h = /(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/.exec(t);
  if (h) { total += parseFloat(h[1]) * 3600; found = true; }
  const minRange = /(\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(\d+(?:\.\d+)?)\s*(?:minutes?|mins?|min|m)\b/.exec(t);
  const minSingle = /(\d+(?:\.\d+)?)\s*(?:minutes?|mins?|min|m)\b/.exec(t);
  if (minRange) { total += ((parseFloat(minRange[1]) + parseFloat(minRange[2])) / 2) * 60; found = true; }
  else if (minSingle) { total += parseFloat(minSingle[1]) * 60; found = true; }
  const secRange = /(\d+)\s*(?:-|–|to)\s*(\d+)\s*(?:seconds?|secs?|s)\b/.exec(t);
  const secSingle = /(\d+)\s*(?:seconds?|secs?|s)\b/.exec(t);
  if (secRange) { total += (parseInt(secRange[1]) + parseInt(secRange[2])) / 2; found = true; }
  else if (secSingle && !minSingle) { total += parseInt(secSingle[1]); found = true; }
  const secs = Math.round(total);
  return found && secs > 0 ? secs : null;
}
function capitalize(s: string) { return s ? s[0].toUpperCase() + s.slice(1) : s; }
function buildInstruction(n: any): string {
  const verb = (n.task || '').trim();
  const ing  = (n.ingredients ?? [])[0];
  if (ing?.name) {
    const qty = ing.qty != null ? `${ing.qty}${ing.unit ? ' ' + ing.unit : ''} ` : '';
    return `${capitalize(verb)} ${qty}${ing.name}`.trim();
  }
  return capitalize(verb);
}
function producerLabel(dag: any, nodeId: string): string | null {
  const producer = dag.nodes.find((x: any) => x.id === nodeId);
  return producer?.produces?.trim() || null;
}

// ── Serialize an existing version into the import "extraction" shape decompose wants ──
// extraction = { title, servings, ingredients[], groups[].steps[] }
function serializeToExtraction(version: any): any {
  const steps = (version.version_steps ?? [])
    .slice()
    .sort((a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0));
  const vIngs = (version.version_ingredients ?? []);

  // ingredient name by id, and the per-step ingredient names (via step_id link)
  const ingNameById: Record<string, string> = {};
  for (const vi of vIngs) {
    const ing = Array.isArray(vi.ingredients) ? vi.ingredients[0] : vi.ingredients;
    if (ing?.id) ingNameById[ing.id] = ing.name;
  }
  const stepIngNames: Record<string, string[]> = {};
  const topIngredients: any[] = [];
  for (const vi of vIngs) {
    const ing = Array.isArray(vi.ingredients) ? vi.ingredients[0] : vi.ingredients;
    const name = ing?.name;
    if (!name) continue;
    topIngredients.push({
      name,
      quantityValue: vi.quantity_value ?? 0,
      quantityUnit: vi.quantity_unit ?? 'g',
      prepNote: vi.prep_note ?? null,
      optional: vi.optional ?? false,
    });
    if (vi.step_id) (stepIngNames[vi.step_id] ??= []).push(name);
  }

  // group steps by group_label (first-seen order), mirror import's groups[].steps[]
  const order: string[] = [];
  const byGroup: Record<string, any[]> = {};
  for (const s of steps) {
    const key = s.group_label ?? '';
    if (!order.includes(key)) order.push(key);
    (byGroup[key] ??= []).push({
      instruction: s.instruction ?? '',
      durationMinutes: s.duration_seconds ? Math.round(s.duration_seconds / 60) : null,
      temperatureCelsius: s.temperature_celsius ?? null,
      stepIngredients: stepIngNames[s.id] ?? [],
      stepTools: (s.appliance_settings?.stepTools ?? []).map((t: any) => t.name).filter(Boolean),
    });
  }

  return {
    title: version.title ?? 'Recipe',
    description: version.description ?? null,
    cuisine: version.cuisine ?? null,
    difficulty: version.difficulty ?? 'medium',
    servings: version.base_servings ?? 4,
    totalTimeMinutes: version.total_time_seconds ? Math.round(version.total_time_seconds / 60) : null,
    tags: version.tags ?? [],
    ingredients: topIngredients,
    groups: order.map(key => ({ outputName: key, steps: byGroup[key] })),
  };
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(user.id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const canonicalId: string = typeof body.canonicalId === 'string' ? body.canonicalId : '';
  const commit: boolean = body.commit === true;
  if (!canonicalId) return NextResponse.json({ error: 'canonicalId required' }, { status: 400 });

  const db = supabase as any;

  // 1) Load the canonical + its CURRENT version (steps + ingredients).
  const { data: canonical, error: ce } = await db
    .from('recipe_canonicals')
    .select(`
      id, slug, current_version_id,
      recipe_versions!current_version_id (
        id, title, description, cuisine, tags, base_servings, difficulty,
        total_time_seconds,
        version_steps ( id, order_index, step_type, group_label, instruction, notes, duration_seconds, temperature_celsius, appliance_settings ),
        version_ingredients ( id, order_index, quantity_value, quantity_unit, prep_note, optional, step_id, ingredients!ingredient_id ( id, name ) )
      )
    `)
    .eq('id', canonicalId)
    .single();
  if (ce || !canonical) return NextResponse.json({ error: 'Recipe not found' }, { status: 404 });

  const curVersion = Array.isArray(canonical.recipe_versions) ? canonical.recipe_versions[0] : canonical.recipe_versions;
  if (!curVersion) return NextResponse.json({ error: 'No current version to re-decompose' }, { status: 400 });

  // 2) Serialize → extraction.
  const extraction = serializeToExtraction(curVersion);
  if (!extraction.groups?.length) {
    return NextResponse.json({ error: 'Recipe has no steps to decompose' }, { status: 400 });
  }

  // 3) Decompose (server-to-server, carrying the session cookie for auth).
  const origin = new URL(req.url).origin;
  const cookie = req.headers.get('cookie') ?? '';
  let dag: any;
  try {
    const dres = await fetch(`${origin}/api/recipes/decompose`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({ extraction }),
    });
    const dj = await dres.json().catch(() => ({}));
    if (!dres.ok || !dj.dag?.nodes?.length) {
      return NextResponse.json({ error: dj.error ?? 'Decompose failed', detail: dj }, { status: 502 });
    }
    dag = dj.dag;
  } catch (e: any) {
    return NextResponse.json({ error: 'Decompose call failed', detail: e.message }, { status: 502 });
  }

  // ── DRY RUN: return a preview, write nothing. ──
  const nodeCount = dag.nodes.length;
  const edgeCount = dag.nodes.reduce((acc: number, n: any) => acc + (n.consumes?.length ?? 0), 0);
  const sampleSteps = dag.nodes.slice(0, 8).map((n: any, i: number) => ({
    n: i + 1, instruction: buildInstruction(n),
    task: n.task ?? null, tool: n.tool ?? null,
    completion: n.completion ?? null, group: n.group ?? null,
  }));

  if (!commit) {
    return NextResponse.json({
      dryRun: true, canonicalId, slug: canonical.slug, title: dag.title ?? extraction.title,
      before: { steps: (curVersion.version_steps ?? []).length, ingredients: (curVersion.version_ingredients ?? []).length },
      after:  { nodes: nodeCount, edges: edgeCount },
      sampleSteps,
    });
  }

  // ── COMMIT: write the DAG as a NEW VERSION under the same canonical. ──
  const createdIngredients: { id: string; name: string }[] = [];
  const createdTasks: string[] = [];
  const taskCache = new Map<string, string>();

  // Recompute total time from the NEW DAG's per-step durations — the legacy
  // total_time_seconds is often 0/stale, which surfaced as "TOTAL 0s" on the page.
  // (Sum is an upper bound; a true critical-path total is a later refinement.)
  let computedTotalSeconds = 0;
  for (const n of dag.nodes) {
    computedTotalSeconds +=
      (durationToSeconds(n.completion) ?? naturalDurationToSeconds(n.completion) ?? naturalDurationToSeconds(n.notes) ?? 0);
  }
  const totalSeconds = computedTotalSeconds > 0 ? computedTotalSeconds : (curVersion.total_time_seconds ?? 0);

  try {
    // next version_number
    const { data: existing } = await db.from('recipe_versions')
      .select('version_number').eq('canonical_id', canonicalId)
      .order('version_number', { ascending: false }).limit(1);
    const nextVersion = ((existing?.[0]?.version_number) ?? 0) + 1;

    const { data: version, error: ve } = await db
      .from('recipe_versions')
      .insert({
        canonical_id:        canonicalId,
        version_number:      nextVersion,
        title:               dag.title ?? curVersion.title,
        description:         curVersion.description ?? null,
        cuisine:             curVersion.cuisine ?? null,
        tags:                curVersion.tags ?? [],
        base_servings:       dag.servings ?? curVersion.base_servings ?? 4,
        difficulty:          curVersion.difficulty ?? 'medium',
        total_time_seconds:  totalSeconds,
        is_canonical_version: true,
        source_extraction:   extraction,
      })
      .select().single();
    if (ve) throw ve;

    // steps
    const stepIdByNode = new Map<string, string>();
    let ingOrderIndex = 0;
    for (let i = 0; i < dag.nodes.length; i++) {
      const n = dag.nodes[i];
      const taskId = await findOrCreateTask(db, n.task, taskCache, createdTasks);
      const durationSeconds =
        durationToSeconds(n.completion) ?? naturalDurationToSeconds(n.completion) ?? naturalDurationToSeconds(n.notes);
      const completionNote = (n.completion && durationToSeconds(n.completion) == null) ? n.completion : null;
      const noteParts = [completionNote, n.notes].filter(Boolean);

      const { data: step, error: se } = await db
        .from('version_steps')
        .insert({
          version_id:   version.id,
          order_index:  i + 1,
          step_type:    n.passive ? 'passive' : 'human',
          instruction:  buildInstruction(n),
          task_id:      taskId,
          task_parameters: n.params && Object.keys(n.params).length ? n.params : null,
          duration_seconds: durationSeconds,
          group_label:  n.group?.trim() || null,
          notes:        noteParts.length ? noteParts.join(' — ') : null,
          appliance_settings: n.tool ? { stepTools: [{ name: n.tool }] } : null,
        })
        .select('id').single();
      if (se || !step) throw (se ?? new Error('step insert returned no row'));
      stepIdByNode.set(n.id, step.id);

      const ing = (n.ingredients ?? [])[0];
      if (ing?.name?.trim()) {
        const ingredientId = await findOrCreateIngredient(db, ing.name, createdIngredients);
        if (ingredientId) {
          await db.from('version_ingredients').insert({
            version_id: version.id, step_id: step.id, ingredient_id: ingredientId,
            quantity_value: ing.qty ?? 0, quantity_unit: ing.unit ?? 'g',
            prep_note: ing.prep?.trim() || null, optional: false, order_index: ++ingOrderIndex,
          });
        }
      }
    }

    // dependency edges
    for (const n of dag.nodes) {
      const stepId = stepIdByNode.get(n.id);
      if (!stepId) continue;
      for (const c of n.consumes ?? []) {
        const dependsOn = stepIdByNode.get(c);
        if (!dependsOn) continue;
        await db.from('version_step_dependencies').insert({
          step_id: stepId, depends_on_step_id: dependsOn,
          consumes_intermediate_label: producerLabel(dag, c),
        });
      }
    }

    // canonical execution variant for the new version
    await db.from('execution_variants').insert({
      version_id: version.id, servings: dag.servings ?? curVersion.base_servings ?? 4,
      unit_system: 'si', is_canonical_variant: true, author_id: user.id, source: 'ai_generated',
    });

    // flip current_version_id → the new version (reversible: flip back to revert)
    await db.from('recipe_canonicals').update({ current_version_id: version.id }).eq('id', canonicalId);

    // update the `recipes` mirror to point at the new version (mirror links by recipe_version_id)
    await db.from('recipes').update({
      recipe_version_id: version.id,
      title: dag.title ?? curVersion.title,
      total_time_seconds: totalSeconds,
    }).eq('slug', canonical.slug);

    return NextResponse.json({
      committed: true, canonicalId, slug: canonical.slug,
      newVersionId: version.id, versionNumber: nextVersion,
      wrote: { nodes: nodeCount, edges: edgeCount },
      createdTasks, createdIngredients: createdIngredients.map(c => c.name),
    });
  } catch (e: any) {
    return NextResponse.json({ error: 'Write failed', detail: e.message }, { status: 500 });
  }
}
