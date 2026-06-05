// src/app/api/my/meals/[id]/match/route.ts
// Demand Model · Phase 1 · run the full pipeline for one meal, end to end:
//   participants → resolve each requirement → aggregate the table (option C)
//   → score THIS meal against the table → plating split per participant.
// Read-only inspection route. Whole-portion plating only (per-component is P4).
//
// Query param:  ?slot=dinner   (breakfast|lunch|dinner|snack|meal; default dinner)

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveRequirement } from '@/lib/demand/resolve-requirement';
import {
  aggregateTable,
  scoreMeal,
  platingSplit,
  type CandidateMeal,
} from '@/lib/demand/aggregate-and-match';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const slot = req.nextUrl.searchParams.get('slot') || 'dinner';

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = supabase as any;

  // --- the meal + its current version nutrition (the candidate dish) ---
  const { data: meal, error: mErr } = await db
    .from('recipe_canonicals')
    .select(`
      id, slug,
      recipe_versions!current_version_id ( title, base_servings, nutrition_per_serving )
    `)
    .eq('id', id)
    .eq('author_id', user.id)
    .maybeSingle();
  if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });
  if (!meal) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const v = Array.isArray(meal.recipe_versions) ? meal.recipe_versions[0] : meal.recipe_versions;

  // --- participants (active only) ---
  const { data: parts, error: pErr } = await db
    .from('meal_participant')
    .select('person_id, status')
    .eq('meal_id', id);
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

  const personIds = (parts ?? [])
    .filter((p: any) => p.status !== 'declined' && p.person_id)
    .map((p: any) => p.person_id);

  // Fallback: if a meal has no participants recorded, treat the caller's
  // self-person as the sole eater so the route still demonstrates the pipeline.
  if (personIds.length === 0) {
    const { data: selfGrant } = await db
      .from('person_access')
      .select('person_id')
      .eq('account_id', user.id)
      .eq('role', 'self')
      .is('revoked_at', null)
      .maybeSingle();
    if (selfGrant?.person_id) personIds.push(selfGrant.person_id);
  }
  if (personIds.length === 0) {
    return NextResponse.json({ error: 'No participants and no self-person' }, { status: 400 });
  }

  // --- resolve each participant's requirement, then aggregate ---
  const reqs = await Promise.all(
    personIds.map((pid: string) => resolveRequirement(db, pid)),
  );
  const table = aggregateTable(reqs, slot);

  // --- score this meal, and plate it ---
  const candidate: CandidateMeal = {
    id: meal.id,
    title: v?.title ?? '(untitled)',
    baseServings: v?.base_servings ?? personIds.length,
    perServing: (v?.nutrition_per_serving ?? {}) as Record<string, number | undefined>,
    variantConfidence: null, // variant-level quality wired in a later slice
  };
  const score = scoreMeal(candidate, table);
  const plating = platingSplit(table, 'energy_kcal');

  // Resolve person_id → display_name so the UI can say "Rasmus: larger helping"
  // rather than showing a bare uuid. Best-effort; falls back to "Someone".
  const nameById: Record<string, string> = {};
  {
    const ids = Array.from(new Set(personIds));
    const { data: persons } = await db
      .from('person')
      .select('id, display_name, full_name')
      .in('id', ids);
    for (const p of persons ?? []) {
      nameById[p.id] = p.display_name || p.full_name || 'Someone';
    }
  }
  const platingNamed = plating.map((p) => ({
    ...p,
    name: nameById[p.personId] ?? 'Someone',
  }));
  const participantsNamed = table.participants.map((p) => ({
    personId: p.personId,
    personaId: p.personaId,
    name: nameById[p.personId] ?? 'Someone',
    confidence: p.confidence,
    satietyNeed: p.satietyNeed,
  }));

  return NextResponse.json({
    slot,
    meal: { id: meal.id, title: candidate.title, baseServings: candidate.baseServings },
    table: { ...table, participants: participantsNamed },
    score,
    plating: platingNamed,
    // honesty surface for the UI: did this meal have nutrition data to assess?
    hasNutrition: Object.keys(candidate.perServing).length > 0,
  });
}
