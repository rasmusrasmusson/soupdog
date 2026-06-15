// src/app/api/my/cooking-sessions/route.ts
//
// Active Cooking Sessions — Layer 1.
//   GET  /api/my/cooking-sessions               → list the caller's sessions (active first)
//   POST /api/my/cooking-sessions { mealId, serveTargetTime? }
//                                               → start a session: snapshot the merged
//                                                 timeline, create the session + lead
//                                                 participant + pending step-state rows.
//
// The session is SELF-CONTAINED: it freezes the meal-merge timeline (MergeResult) into
// timeline_snapshot, and records each dish's current recipe_version id into
// source_version_ids (used later to flag "recipe updated since you started cooking").
// A running session never needs the live recipe graph — see
// docs/Soupdog_Cooking_Session_Architecture_v0.1.md.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { dishesFromComponentRows, mergeMeal } from '@/lib/meal-merge';

// Component select used to build the merge — mirrors the meal recipe route exactly so
// the snapshot timeline matches what the cook-together view shows.
const COMPONENT_SELECT = `
  id, component_type, position, servings_target, note, component_canonical_id,
  recipe_canonicals!component_canonical_id (
    id, slug,
    recipe_versions!current_version_id (
      id, title, cuisine, total_time_seconds, active_time_seconds, base_servings,
      version_steps (
        id, order_index, step_type, group_label, instruction,
        duration_seconds, temperature_celsius, appliance_settings
      ),
      version_ingredients (
        id, order_index, quantity_value, quantity_unit, food_state, prep_note, optional, step_id,
        ingredients!ingredient_id ( id, slug, name, nutrition_per_100g )
      )
    )
  )
`;

// GET — list the caller's sessions (active/paused first, then recent).
export async function GET(_req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = supabase as any;

  const { data: sessions, error } = await db
    .from('cooking_session')
    .select(`
      id, meal_canonical_id, status, serve_target_time, started_at, completed_at,
      recipe_canonicals!meal_canonical_id (
        slug, recipe_versions!current_version_id ( title )
      )
    `)
    .eq('started_by', user.id)
    .order('started_at', { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (sessions ?? []).map((s: any) => {
    const can = Array.isArray(s.recipe_canonicals) ? s.recipe_canonicals[0] : s.recipe_canonicals;
    const v = can && (Array.isArray(can.recipe_versions) ? can.recipe_versions[0] : can.recipe_versions);
    return {
      id:              s.id,
      mealCanonicalId: s.meal_canonical_id,
      mealSlug:        can?.slug ?? null,
      title:           v?.title ?? 'Meal',
      status:          s.status,
      serveTargetTime: s.serve_target_time,
      startedAt:       s.started_at,
      completedAt:     s.completed_at,
    };
  });

  // Surface the one in-progress session (if any) so the client can route the user
  // straight back to it — the "active cooking screen is a first-class destination".
  const active = rows.find((r: any) => r.status === 'active' || r.status === 'paused') ?? null;

  return NextResponse.json({ sessions: rows, active });
}

// POST — start a session for a meal.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = supabase as any;

  const body = await req.json().catch(() => ({}));
  const mealId: string = typeof body.mealId === 'string' ? body.mealId : '';
  const serveTargetTime: string | null = typeof body.serveTargetTime === 'string' ? body.serveTargetTime : null;
  if (!mealId) return NextResponse.json({ error: 'mealId required' }, { status: 400 });

  // Ownership + must be a meal. Also resolve the owner person (self-person) if present.
  const { data: meal, error: mErr } = await db
    .from('recipe_canonicals')
    .select('id, composition_level')
    .eq('id', mealId)
    .eq('author_id', user.id)
    .eq('composition_level', 'meal')
    .single();
  if (mErr || !meal) return NextResponse.json({ error: 'Meal not found' }, { status: 404 });

  // Components (with steps + ingredients) → dishes → merged timeline.
  const { data: comps } = await db
    .from('meal_component')
    .select(COMPONENT_SELECT)
    .eq('meal_canonical_id', mealId)
    .order('position', { ascending: true });

  if (!comps || comps.length === 0) {
    return NextResponse.json({ error: 'This meal has no dishes to cook yet.' }, { status: 400 });
  }

  const dishes = dishesFromComponentRows(comps);
  const merge = mergeMeal(dishes);

  if (!merge.scheduled || merge.scheduled.length === 0) {
    return NextResponse.json({ error: 'Could not build a cooking timeline for this meal.' }, { status: 400 });
  }

  // source_version_ids: { dishCanonicalId -> current recipe_version id } at snapshot time.
  const sourceVersionIds: Record<string, string> = {};
  for (const c of comps) {
    const can = Array.isArray(c.recipe_canonicals) ? c.recipe_canonicals[0] : c.recipe_canonicals;
    const cv = can && (Array.isArray(can.recipe_versions) ? can.recipe_versions[0] : can.recipe_versions);
    if (c.component_canonical_id && cv?.id) sourceVersionIds[c.component_canonical_id] = cv.id;
  }

  // Resolve the caller's self-person (best-effort; owner_person_id is optional).
  let ownerPersonId: string | null = null;
  try {
    const { data: ownedRows } = await db.rpc('owned_person_ids', { acc: user.id });
    const owned: string[] = Array.isArray(ownedRows)
      ? ownedRows.map((r: any) => (typeof r === 'string' ? r : r.owned_person_ids ?? r.person_id ?? r))
      : [];
    ownerPersonId = owned[0] ?? null;
  } catch { /* owner_person_id stays null — not required for Layer 1 */ }

  // Create the session.
  const { data: session, error: sErr } = await db
    .from('cooking_session')
    .insert({
      meal_canonical_id:  mealId,
      started_by:         user.id,
      owner_person_id:    ownerPersonId,
      status:             'active',
      serve_target_time:  serveTargetTime,
      timeline_snapshot:  merge,
      source_version_ids: sourceVersionIds,
    })
    .select('id')
    .single();
  if (sErr || !session) {
    return NextResponse.json({ error: sErr?.message ?? 'Could not start the session.' }, { status: 500 });
  }

  // Lead participant (best-effort — a missing person link must not fail the session).
  if (ownerPersonId) {
    const { error: pErr } = await db.from('session_participant').insert({
      session_id: session.id, person_id: ownerPersonId, role: 'lead',
    });
    if (pErr) console.error('[cooking-session] participant insert failed:', pErr.message);
  }

  // Initialise one pending step-state row per scheduled step (checked off as the cook
  // progresses). Keyed to the FROZEN snapshot's step ids — stable for the session's life.
  const stepRows = merge.scheduled.map((st: any) => ({
    session_id:        session.id,
    step_id:           st.id,
    dish_canonical_id: st.dishCanonicalId ?? null,
    status:            'pending',
  }));
  // De-dupe defensively (snapshot ids are unique, but holds are synthesized).
  const seen = new Set<string>();
  const uniqueRows = stepRows.filter((r: any) => {
    if (seen.has(r.step_id)) return false;
    seen.add(r.step_id); return true;
  });
  if (uniqueRows.length) {
    const { error: stErr } = await db.from('session_step_state').insert(uniqueRows);
    if (stErr) {
      // Roll back the session so we never leave a session with no steps.
      await db.from('cooking_session').delete().eq('id', session.id);
      return NextResponse.json({ error: `Could not initialise steps: ${stErr.message}` }, { status: 500 });
    }
  }

  return NextResponse.json({ id: session.id, stepCount: uniqueRows.length }, { status: 201 });
}
