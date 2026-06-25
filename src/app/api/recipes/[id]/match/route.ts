// src/app/api/recipes/[id]/match/route.ts
// Recipe "what-if" match — the per-person panel for an UNSCHEDULED recipe.
// Unlike the meal match (which reads meal_participant), this takes an explicit
// ad-hoc list of person ids (the panel's current people) and a recipe VERSION
// id, and runs the same pipeline:
//   resolve each requirement → aggregate the table → plate.
// Returns the SAME shape the meal match returns for the panel (plating +
// per-person daily targets + versionId + recommendedServings), so MealFitPanel
// renders identically whether it's a scheduled meal or a recipe what-if.
//
// No instance is created and nothing is persisted — this is a pure view.
// Nutrition itself is fetched by the panel from /api/recipes/[versionId]/nutrition
// (single source of truth), exactly as for meals.
//
// POST body: { personIds: string[], slot?: string }
//   [id] = recipe VERSION id (the panel already has it client-side).

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveRequirement } from '@/lib/demand/resolve-requirement';
import {
  aggregateTable,
  scoreMeal,
  platingSplit,
  type CandidateMeal,
} from '@/lib/demand/aggregate-and-match';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: versionId } = await params;

  let body: { personIds?: string[]; slot?: string } = {};
  try { body = await req.json(); } catch { /* empty body ok */ }
  const slot = body.slot || 'dinner';

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = supabase as any;

  // --- the candidate dish: this version's nutrition rollup (for scoring) ---
  const { data: version, error: vErr } = await db
    .from('recipe_versions')
    .select('id, title, base_servings, nutrition_per_serving')
    .eq('id', versionId)
    .maybeSingle();
  if (vErr) return NextResponse.json({ error: vErr.message }, { status: 500 });
  if (!version) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // --- participants: the panel's ad-hoc list; fall back to the caller's self ---
  let personIds = (body.personIds ?? []).filter(Boolean);
  if (personIds.length === 0) {
    const { data: selfGrant } = await db
      .from('person_access')
      .select('person_id')
      .eq('account_id', user.id)
      .eq('role', 'self')
      .is('revoked_at', null)
      .maybeSingle();
    if (selfGrant?.person_id) personIds = [selfGrant.person_id];
  }
  if (personIds.length === 0) {
    return NextResponse.json({ error: 'No participants and no self-person' }, { status: 400 });
  }

  // access: a caller may only what-if against persons they can access.
  const { data: grants } = await db
    .from('person_access')
    .select('person_id')
    .eq('account_id', user.id)
    .is('revoked_at', null)
    .in('person_id', personIds);
  const allowed = new Set((grants ?? []).map((g: any) => g.person_id));
  personIds = personIds.filter((pid: string) => allowed.has(pid));
  if (personIds.length === 0) {
    return NextResponse.json({ error: 'No accessible participants' }, { status: 403 });
  }

  // --- resolve each participant's requirement, then aggregate + plate ---
  const reqs = await Promise.all(
    personIds.map((pid: string) => resolveRequirement(db, pid)),
  );
  const table = aggregateTable(reqs, slot);

  const candidate: CandidateMeal = {
    id: version.id,
    title: version.title ?? '(untitled)',
    baseServings: version.base_servings ?? personIds.length,
    perServing: (version.nutrition_per_serving ?? {}) as Record<string, number | undefined>,
    variantConfidence: null,
  };
  const score = scoreMeal(candidate, table);
  const plating = platingSplit(table, 'energy_kcal');

  // names for the UI
  const nameById: Record<string, string> = {};
  {
    const { data: persons } = await db
      .from('person')
      .select('id, display_name, full_name')
      .in('id', Array.from(new Set(personIds)));
    for (const p of persons ?? []) nameById[p.id] = p.display_name || p.full_name || 'Someone';
  }
  const platingNamed = plating.map((p) => ({ ...p, name: nameById[p.personId] ?? 'Someone' }));

  const reqById: Record<string, (typeof reqs)[number]> = {};
  for (const r of reqs) reqById[r.personId] = r;

  const perParticipant = platingNamed.map((p) => {
    const r = reqById[p.personId];
    return {
      personId: p.personId,
      name: p.name,
      confidence: r?.overallConfidence ?? 0,
      share: p.share,
      dailyTargets: {
        calories: r?.energy_kcal?.value ?? null,
        protein: r?.protein_g?.value ?? null,
        carbohydrates: r?.carbs_g?.value ?? null,
        fat: r?.fat_g?.value ?? null,
        fiber: r?.fiber_g?.value ?? null,
      },
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
    meal: { id: version.id, title: candidate.title, baseServings: candidate.baseServings, versionId: version.id },
    table: { ...table, participants: participantsNamed },
    score,
    plating: platingNamed,
    perParticipant,
    recommendedServings: score.recommendedServings ?? 0,
  });
}
