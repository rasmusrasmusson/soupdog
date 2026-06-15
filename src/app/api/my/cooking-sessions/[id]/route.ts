// src/app/api/my/cooking-sessions/[id]/route.ts
//
// Active Cooking Sessions — Layer 1, per-session.
//   GET   /api/my/cooking-sessions/[id]            → resume: the frozen timeline +
//                                                    per-step progress + "recipe updated
//                                                    since you started" flag.
//   PATCH /api/my/cooking-sessions/[id]
//         { stepId, status }                       → set one step's progress
//         { sessionStatus }                        → pause / resume / complete / abandon
//
// The timeline is read straight from the session's frozen snapshot — no live recipe
// graph needed (self-contained; see the architecture note).

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const STEP_STATUSES = new Set(['pending', 'in_progress', 'done', 'skipped']);
const SESSION_STATUSES = new Set(['active', 'paused', 'completed', 'abandoned']);

export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await context.params;
  const db = supabase as any;

  const { data: session, error } = await db
    .from('cooking_session')
    .select(`
      id, meal_canonical_id, status, serve_target_time, started_at, completed_at,
      timeline_snapshot, source_version_ids,
      recipe_canonicals!meal_canonical_id ( slug, recipe_versions!current_version_id ( title ) )
    `)
    .eq('id', id)
    .eq('started_by', user.id)
    .single();
  if (error || !session) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: steps } = await db
    .from('session_step_state')
    .select('step_id, dish_canonical_id, status, started_at, completed_at')
    .eq('session_id', id);

  const { data: participants } = await db
    .from('session_participant')
    .select('person_id, role, joined_at')
    .eq('session_id', id);

  // "Recipe updated since snapshot": compare each dish's CURRENT current_version_id
  // against the source_version_ids frozen at start. We only need the dishes that the
  // session actually snapshotted.
  const sourceVersions: Record<string, string> = session.source_version_ids ?? {};
  const dishIds = Object.keys(sourceVersions);
  const updatedDishes: string[] = [];
  if (dishIds.length) {
    const { data: currentCanon } = await db
      .from('recipe_canonicals')
      .select('id, current_version_id')
      .in('id', dishIds);
    for (const c of currentCanon ?? []) {
      if (c.current_version_id && sourceVersions[c.id] && c.current_version_id !== sourceVersions[c.id]) {
        updatedDishes.push(c.id);
      }
    }
  }

  const can = Array.isArray(session.recipe_canonicals) ? session.recipe_canonicals[0] : session.recipe_canonicals;
  const v = can && (Array.isArray(can.recipe_versions) ? can.recipe_versions[0] : can.recipe_versions);

  return NextResponse.json({
    id:              session.id,
    mealCanonicalId: session.meal_canonical_id,
    mealSlug:        can?.slug ?? null,
    title:           v?.title ?? 'Meal',
    status:          session.status,
    serveTargetTime: session.serve_target_time,
    startedAt:       session.started_at,
    completedAt:     session.completed_at,
    timeline:        session.timeline_snapshot,         // the frozen MergeResult
    steps:           steps ?? [],                       // per-step progress
    participants:    participants ?? [],
    recipeUpdated:   updatedDishes.length > 0,          // flag for the UI
    updatedDishes,                                      // which dishes changed
  });
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await context.params;
  const db = supabase as any;
  const body = await req.json().catch(() => ({}));

  // Confirm ownership (RLS also enforces, but we want a clean 404).
  const { data: session } = await db
    .from('cooking_session').select('id').eq('id', id).eq('started_by', user.id).single();
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // ── Update one step's progress ──
  if (typeof body.stepId === 'string' && typeof body.status === 'string') {
    if (!STEP_STATUSES.has(body.status)) {
      return NextResponse.json({ error: 'Invalid step status.' }, { status: 400 });
    }
    const now = new Date().toISOString();
    const patch: Record<string, any> = { status: body.status };
    if (body.status === 'in_progress') patch.started_at = now;
    if (body.status === 'done')        patch.completed_at = now;
    if (body.status === 'pending')     { patch.started_at = null; patch.completed_at = null; }

    const { error } = await db
      .from('session_step_state')
      .update(patch)
      .eq('session_id', id)
      .eq('step_id', body.stepId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // ── Update the session status (pause / resume / complete / abandon) ──
  if (typeof body.sessionStatus === 'string') {
    if (!SESSION_STATUSES.has(body.sessionStatus)) {
      return NextResponse.json({ error: 'Invalid session status.' }, { status: 400 });
    }
    const patch: Record<string, any> = { status: body.sessionStatus };
    if (body.sessionStatus === 'completed') patch.completed_at = new Date().toISOString();
    const { error } = await db.from('cooking_session').update(patch).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });
}

export async function DELETE(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await context.params;
  const db = supabase as any;

  const { error } = await db
    .from('cooking_session').delete().eq('id', id).eq('started_by', user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
