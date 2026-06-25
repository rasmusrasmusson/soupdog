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
      id, slug, author_id,
      recipe_versions!current_version_id ( title, base_servings, nutrition_per_serving )
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

  // --- per-participant portion nutrition + "% of daily target" (v1 §3.3) ---
  // Each person's recommended portion = their plating share of the scaled dish:
  //   portion[field] = share × recommendedServings × perServing[field]
  // Their "% of daily" = that portion ÷ their resolved DAILY target for the
  // field. Macros only (the 5 the demand model resolves); the full 71-nutrient
  // per-person breakdown is a later slice that scales recipe-level nutrition.
  // %-of-daily is honestly per-OCCASION against a DAILY figure, so one dinner
  // reads ~25–40% — we do NOT imply a meal should reach 100% (§10a).
  const reqById: Record<string, (typeof reqs)[number]> = {};
  for (const r of reqs) reqById[r.personId] = r;

  // map perServing (calories/protein/carbohydrates/fat/fiber) → portion + %daily
  const NUTRIENT_KEYS = ['calories', 'protein', 'carbohydrates', 'fat', 'fiber'] as const;
  // bridge each perServing key to the resolver's daily field
  const DAILY_FIELD: Record<(typeof NUTRIENT_KEYS)[number], 'energy_kcal' | 'protein_g' | 'carbs_g' | 'fat_g' | 'fiber_g'> = {
    calories: 'energy_kcal', protein: 'protein_g', carbohydrates: 'carbs_g', fat: 'fat_g', fiber: 'fiber_g',
  };
  const recServings = score.recommendedServings || 0;

  const perParticipant = platingNamed.map((p) => {
    const portion: Record<string, number> = {};
    const percentOfDaily: Record<string, number | null> = {};
    const factor = p.share * recServings; // servings-worth of the dish for this person
    for (const k of NUTRIENT_KEYS) {
      const perSv = candidate.perServing[k];
      if (perSv == null) { continue; } // dish lacks this nutrient → omit (honest)
      const amount = perSv * factor;
      portion[k] = amount;
      const dailyField = reqById[p.personId]?.[DAILY_FIELD[k]];
      const dailyVal = dailyField?.value ?? null;
      percentOfDaily[k] = (dailyVal && dailyVal > 0) ? (amount / dailyVal) * 100 : null;
    }
    return {
      personId: p.personId,
      name: p.name,
      confidence: reqById[p.personId]?.overallConfidence ?? 0,
      share: p.share,
      portion,
      percentOfDaily,
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
    meal: { id: meal.id, title: candidate.title, baseServings: candidate.baseServings },
    table: { ...table, participants: participantsNamed },
    score,
    plating: platingNamed,
    perParticipant,
    // honesty surface for the UI: did this meal have nutrition data to assess?
    hasNutrition: Object.keys(candidate.perServing).length > 0,
  });
}
