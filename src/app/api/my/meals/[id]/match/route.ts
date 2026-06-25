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

  // --- resolve the id: a meal-plan `meal` row OR a recipe_canonical ---
  // The plan stores `meal` rows (id → recipe_id → canonical); the meal-editor
  // page passes a canonical id directly. Accept BOTH: try `meal` first, fall
  // back to canonical. participantMealId = where to read meal_participant.
  let canonicalId: string | null = null;
  let participantMealId: string | null = null;

  // self person ids the caller may own (for the meal owner check + self fallback)
  const { data: selfGrant0 } = await db
    .from('person_access')
    .select('person_id')
    .eq('account_id', user.id)
    .eq('role', 'self')
    .is('revoked_at', null)
    .maybeSingle();
  const selfPersonId: string | null = selfGrant0?.person_id ?? null;

  // (a) is `id` a meal-plan meal row?
  const { data: mealRow } = await db
    .from('meal')
    .select('id, recipe_id, owner_person_id')
    .eq('id', id)
    .maybeSingle();
  if (mealRow?.recipe_id) {
    // access: you may view a meal whose owner-person you own (or is yourself).
    const { data: ownGrant } = await db
      .from('person_access')
      .select('person_id')
      .eq('account_id', user.id)
      .eq('person_id', mealRow.owner_person_id)
      .is('revoked_at', null)
      .maybeSingle();
    if (!ownGrant) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    canonicalId = mealRow.recipe_id;
    participantMealId = mealRow.id;
  } else {
    // (b) treat `id` as a recipe_canonical (meal-editor path); ownership is
    // enforced by the canonical's author_id below.
    canonicalId = id;
    participantMealId = id;
  }

  // --- the candidate dish: canonical's current-version nutrition ---
  const canonicalQuery = db
    .from('recipe_canonicals')
    .select(`
      id, slug, author_id, current_version_id,
      recipe_versions!current_version_id ( id, title, base_servings, nutrition_per_serving )
    `)
    .eq('id', canonicalId)
    .maybeSingle();
  const { data: meal, error: mErr } = await canonicalQuery;
  if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });
  if (!meal) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  // canonical-path (meal-editor) access: must be the author. meal-path access
  // was already checked via the meal owner above.
  if (participantMealId === canonicalId && meal.author_id !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const v = Array.isArray(meal.recipe_versions) ? meal.recipe_versions[0] : meal.recipe_versions;

  // --- participants (active only) ---
  const { data: parts, error: pErr } = await db
    .from('meal_participant')
    .select('person_id, status')
    .eq('meal_id', participantMealId);
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

  const personIds = (parts ?? [])
    .filter((p: any) => p.status !== 'declined' && p.person_id)
    .map((p: any) => p.person_id);

  // Fallback: if a meal has no participants recorded, treat the caller's
  // self-person as the sole eater so the route still demonstrates the pipeline.
  if (personIds.length === 0 && selfPersonId) {
    personIds.push(selfPersonId);
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

  // --- per-participant DAILY targets (for the panel's "% of daily" math) ---
  // Nutrition itself is fetched by the panel from the canonical recipe-nutrition
  // route (single source of truth — same numbers as the recipe page). Here we
  // only return, per person: their plating share + their resolved DAILY target
  // for each of the 5 macros, with confidence. The panel computes:
  //   portion[field]  = share × recommendedServings × perServing[field]
  //   %ofDaily[field] = portion[field] ÷ dailyTarget[field]
  const reqById: Record<string, (typeof reqs)[number]> = {};
  for (const r of reqs) reqById[r.personId] = r;

  const perParticipant = platingNamed.map((p) => {
    const req = reqById[p.personId];
    const dailyTargets = {
      calories: req?.energy_kcal?.value ?? null,
      protein: req?.protein_g?.value ?? null,
      carbohydrates: req?.carbs_g?.value ?? null,
      fat: req?.fat_g?.value ?? null,
      fiber: req?.fiber_g?.value ?? null,
    };
    return {
      personId: p.personId,
      name: p.name,
      confidence: req?.overallConfidence ?? 0,
      share: p.share,
      dailyTargets,
    };
  });
  const participantsNamed = table.participants.map((p) => ({
    personId: p.personId,
    personaId: p.personaId,
    name: nameById[p.personId] ?? 'Someone',
    confidence: p.confidence,
    satietyNeed: p.satietyNeed,
  }));

  return NextResponse.json({
    slot,
    meal: {
      id: meal.id,
      title: candidate.title,
      baseServings: candidate.baseServings,
      // the panel fetches /api/recipes/[versionId]/nutrition (single source of
      // truth) and scales perServing by share × recommendedServings.
      versionId: meal.current_version_id ?? (Array.isArray(meal.recipe_versions) ? meal.recipe_versions[0]?.id : meal.recipe_versions?.id) ?? null,
    },
    table: { ...table, participants: participantsNamed },
    score,
    plating: platingNamed,
    perParticipant,
    recommendedServings: score.recommendedServings ?? 0,
  });
}
