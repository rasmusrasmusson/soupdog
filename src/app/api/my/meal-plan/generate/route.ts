// src/app/api/my/meal-plan/generate/route.ts
// POST — generate / extend the rolling meal plan for the logged-in person's
// household (self + owned persons). v1: owner-placed path only. Selects &
// arranges from EXISTING recipes (no dish invention). Logged as 'meal_plan'.
//
// Body (all optional):
//   { personId?: string }  — whose plan to generate (defaults to the caller's
//                            self-person). Must be a person the caller owns.
//
// Behaviour: fills any un-planned slots within the person's horizon window
// (today .. today + horizon_days) for the person's active_slots, choosing varied
// recipes that respect the household's combined allergies. Existing planned days
// are left untouched (idempotent-ish: only fills gaps).

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { aiMessage } from '@/lib/ai/anthropic';

type RecipeLite = {
  id: string;
  title: string;
  cuisine: string | null;
  tags: string[];
  difficulty: string | null;
  // crude allergen hint from ingredient names (best-effort; no allergen model yet)
  ingredientNames: string[];
};

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const body = await req.json().catch(() => ({}));
  let personId: string | undefined = body.personId;

  // Resolve the caller's self-person if none given. self person = the one whose
  // person_access row for this account has role 'self'.
  if (!personId) {
    const { data: selfAccess } = await db
      .from('person_access')
      .select('person_id')
      .eq('account_id', user.id)
      .eq('role', 'self')
      .is('revoked_at', null)
      .limit(1)
      .single();
    personId = selfAccess?.person_id;
  }
  if (!personId) {
    return NextResponse.json({ error: 'No person to plan for' }, { status: 400 });
  }

  // Ownership check: caller must own this person (owned_person_ids).
  const { data: ownedRows } = await db.rpc('owned_person_ids', { acc: user.id });
  const ownedIds: string[] = Array.isArray(ownedRows)
    ? ownedRows.map((r: any) => (typeof r === 'string' ? r : r.owned_person_ids ?? r.person_id ?? r))
    : [];
  if (!ownedIds.includes(personId)) {
    return NextResponse.json({ error: 'You can only plan for people you manage' }, { status: 403 });
  }

  // ── Prefs (activation + slots + horizon) ──
  let { data: prefs } = await db
    .from('person_meal_prefs')
    .select('plan_active, active_slots, horizon_days')
    .eq('person_id', personId)
    .single();

  // If no prefs row yet, treat as not-yet-activated. Generation requires activation.
  if (!prefs) {
    return NextResponse.json({ error: 'Plan not activated', code: 'not_activated' }, { status: 409 });
  }
  if (!prefs.plan_active) {
    return NextResponse.json({ error: 'Plan not activated', code: 'not_activated' }, { status: 409 });
  }
  const activeSlots: string[] = prefs.active_slots ?? ['dinner'];
  const horizonDays: number = prefs.horizon_days ?? 5;

  // ── Household constraints: combined allergies of the people likely at meals.
  // v1 simplification: gather allergies for the planning person + everyone the
  // caller owns (the household), so plans avoid anyone's allergens. Best-effort:
  // health_profile.allergies is text[]. Missing = no constraint.
  const householdIds = ownedIds.length ? ownedIds : [personId];
  const { data: healthRows } = await db
    .from('health_profile')
    .select('person_id, allergies')
    .in('person_id', householdIds);
  const allergies = new Set<string>();
  for (const h of (healthRows ?? [])) {
    for (const a of (h.allergies ?? [])) allergies.add(String(a).toLowerCase());
  }

  // ── Available recipes (existing only). Pull canonical + current version meta.
  const { data: recipeRows } = await db
    .from('recipe_canonicals')
    .select(`
      id,
      recipe_versions!current_version_id (
        title, cuisine, tags, difficulty,
        version_ingredients ( ingredients!ingredient_id ( name ) )
      )
    `)
    .limit(200);

  const recipes: RecipeLite[] = (recipeRows ?? []).map((r: any) => {
    const v = Array.isArray(r.recipe_versions) ? r.recipe_versions[0] : r.recipe_versions;
    const ingNames: string[] = (v?.version_ingredients ?? [])
      .map((vi: any) => {
        const ing = Array.isArray(vi.ingredients) ? vi.ingredients[0] : vi.ingredients;
        return ing?.name ?? '';
      })
      .filter(Boolean);
    return {
      id: r.id,
      title: v?.title ?? '(untitled)',
      cuisine: v?.cuisine ?? null,
      tags: v?.tags ?? [],
      difficulty: v?.difficulty ?? null,
      ingredientNames: ingNames,
    };
  }).filter((r: RecipeLite) => r.title && r.title !== '(untitled)');

  if (recipes.length === 0) {
    return NextResponse.json({ error: 'No recipes available to plan from', code: 'no_recipes' }, { status: 409 });
  }

  // ── Figure out which (date, slot) cells are empty in the horizon window. ──
  const today = new Date();
  const windowDates: string[] = [];
  for (let i = 0; i < horizonDays; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    windowDates.push(ymd(d));
  }

  const { data: existingMeals } = await db
    .from('meal')
    .select('meal_date, slot')
    .eq('owner_person_id', personId)
    .gte('meal_date', windowDates[0])
    .lte('meal_date', windowDates[windowDates.length - 1]);

  const filled = new Set<string>();
  for (const m of (existingMeals ?? [])) filled.add(`${m.meal_date}|${m.slot}`);

  const emptyCells: { date: string; slot: string }[] = [];
  for (const date of windowDates) {
    for (const slot of activeSlots) {
      if (!filled.has(`${date}|${slot}`)) emptyCells.push({ date, slot });
    }
  }

  if (emptyCells.length === 0) {
    return NextResponse.json({ message: 'Plan already complete for the horizon', created: 0 });
  }

  // ── Ask the model to SELECT & ARRANGE (not invent). Give it the recipe list
  // (id, title, cuisine, tags, difficulty), the empty cells, and the allergens to
  // avoid. It returns an assignment of recipe_id to each cell, varied (no repeats
  // close together, cuisine variety). It must ONLY use provided recipe ids.
  const recipeCatalogue = recipes.map(r => ({
    id: r.id,
    title: r.title,
    cuisine: r.cuisine,
    tags: r.tags,
    difficulty: r.difficulty,
    ingredients: r.ingredientNames.slice(0, 6),
  }));

  const system = `You are the meal planner for Soupdog. You SELECT and ARRANGE meals from an existing recipe catalogue — you NEVER invent dishes or use any recipe id not in the catalogue.

Rules:
- Assign exactly one catalogue recipe to each requested (date, slot) cell.
- Respect the slot: breakfast cells get breakfast-appropriate dishes, lunch/dinner likewise. Infer appropriateness from the recipe's title, tags, and ingredients.
- VARIETY: avoid repeating the same recipe within the window; vary cuisines across days; don't put the same cuisine on consecutive days if avoidable.
- AVOID ALLERGENS: never assign a recipe whose ingredients include any listed allergen (match loosely — e.g. allergen "milk"/"dairy" rules out cheese, cream, butter, yogurt; "gluten"/"wheat" rules out bread, pasta, flour, couscous, noodles, tortillas).
- If no suitable recipe exists for a cell (e.g. no allergen-safe breakfast), omit that cell rather than forcing a bad choice.
- Use ONLY recipe ids from the catalogue.

Respond with ONLY valid JSON, no markdown:
{"assignments":[{"date":"YYYY-MM-DD","slot":"dinner","recipeId":"<catalogue id>"}]}`;

  const userContent = JSON.stringify({
    avoidAllergens: Array.from(allergies),
    cells: emptyCells,
    catalogue: recipeCatalogue,
  });

  const result = await aiMessage({
    model: 'claude-sonnet-4-6',
    feature: 'meal_plan',
    accountId: user.id,
    personId,
    max_tokens: 4000,
    system,
    messages: [{ role: 'user', content: userContent }],
  });

  if (!result.ok) {
    return NextResponse.json({ error: 'Planning failed', detail: result.errorText }, { status: 502 });
  }

  const raw = result.data.content?.[0]?.text ?? '';

  // Robust parse: try the whole thing, then strip code fences, then extract the
  // first {...} block. One formatting hiccup shouldn't sink the call.
  function extractJson(text: string): any | null {
    const candidates: string[] = [];
    candidates.push(text.trim());
    candidates.push(text.replace(/^```(?:json)?\n?/, '').replace(/\n?```\s*$/, '').trim());
    const first = text.indexOf('{');
    const last = text.lastIndexOf('}');
    if (first !== -1 && last !== -1 && last > first) candidates.push(text.slice(first, last + 1));
    for (const c of candidates) {
      try { return JSON.parse(c); } catch { /* next */ }
    }
    return null;
  }

  const parsed = extractJson(raw);
  if (!parsed) {
    console.error('[meal-plan] unparseable planner response:', raw.slice(0, 400));
    return NextResponse.json(
      { error: 'Could not parse planner response', sample: raw.slice(0, 200) },
      { status: 500 },
    );
  }

  const assignments: any[] = Array.isArray(parsed.assignments) ? parsed.assignments : [];
  const validRecipeIds = new Set(recipes.map(r => r.id));
  const recipeTitleById = new Map(recipes.map(r => [r.id, r.title]));

  // ── Write meals + a participant row for the plan's person (owner-placed → accepted). ──
  let created = 0;
  for (const a of assignments) {
    if (!a?.date || !a?.slot || !a?.recipeId) continue;
    if (!validRecipeIds.has(a.recipeId)) continue;                 // model must stay in-catalogue
    if (!windowDates.includes(a.date)) continue;                   // in-window only
    if (!activeSlots.includes(a.slot)) continue;                   // active slot only
    if (filled.has(`${a.date}|${a.slot}`)) continue;               // don't double-fill

    const { data: meal, error: mealErr } = await db
      .from('meal')
      .insert({
        created_by: user.id,
        owner_person_id: personId,
        meal_date: a.date,
        slot: a.slot,
        source: 'recipe',
        recipe_id: a.recipeId,
        dish_name: recipeTitleById.get(a.recipeId) ?? null,
      })
      .select('id')
      .single();
    if (mealErr || !meal) continue;

    await db.from('meal_participant').insert({
      meal_id: meal.id,
      person_id: personId,
      status: 'accepted',          // owner-placed
      placed_by: user.id,
    });

    filled.add(`${a.date}|${a.slot}`);
    created++;
  }

  return NextResponse.json({ created, horizonDays, personId });
}
