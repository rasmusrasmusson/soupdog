// src/app/api/my/meals/[id]/compose/route.ts
//
// AI compose — Slice A (grounded, one-shot).
//
// The "butler": the user describes what they feel like — anywhere on a precision
// spectrum, from an exact order ("carbonara, a rocket salad, a negroni") to a
// few ideas ("doing the carbonara, what goes with it?") to wide open ("dunno,
// something sweet"). This route does ONE turn of that conversation:
//
//   • If the request is too open to answer well, it returns a single
//     clarifyingQuestion (with sensible inferred defaults filled in) instead of
//     guessing — the butler narrows before suggesting.
//   • Otherwise it SELECTS components from the user's existing dish catalogue
//     (never invents — same rule as meal-plan/generate) and returns suggestions
//     with a short reason each, plus an optional note.
//
// Grounding the butler is given (so it doesn't ask what it can already know):
//   • localTime (sent by the client) → the likely slot right now.
//   • the user's planned slots + habitual meal times (person_meal_prefs).
//   • household allergens to avoid (health_profile.allergies, best-effort).
//   • the meal's current components (so "what goes with this" works).
//   • "your usual": recent dishes the user has eaten in this slot — Slice C will
//     enrich this; here we pass recent meal history if cheaply available.
//
// Selection-not-invention is enforced server-side: every returned recipeId is
// validated against the catalogue set before it leaves this route, exactly as
// the meal-plan generator does. The model cannot inject an out-of-catalogue id.
//
// Body: {
//   prompt: string,                 // what the user said
//   localTime?: string,             // client local time "HH:MM" (24h), for slot inference
//   currentComponentIds?: string[], // canonical ids already on the meal
// }
// Returns: {
//   clarifyingQuestion?: { question: string; suggestions: string[] },
//   suggestions: { canonicalId, title, type, cuisine, totalTimeMinutes, reason }[],
//   note?: string,
// }

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { aiMessage } from '@/lib/ai/anthropic';

type CompType = 'dish' | 'drink';

interface CatalogueItem {
  id: string;
  title: string;
  cuisine: string | null;
  tags: string[];
  totalTimeMinutes: number | null;
  ingredientNames: string[];
}

async function selfPersonId(db: any, accountId: string): Promise<string | null> {
  const { data } = await db
    .from('person_access')
    .select('person_id')
    .eq('account_id', accountId)
    .eq('role', 'self')
    .is('revoked_at', null)
    .limit(1)
    .single();
  return data?.person_id ?? null;
}

// Infer the most likely slot from a client-supplied local "HH:MM". Server time
// zone is unreliable, so we only infer when the client tells us the time.
function slotFromLocalTime(hhmm: string | undefined): string | null {
  if (!hhmm || !/^([01]\d|2[0-3]):[0-5]\d$/.test(hhmm)) return null;
  const h = Number(hhmm.slice(0, 2));
  if (h >= 5 && h < 11) return 'breakfast';
  if (h >= 11 && h < 15) return 'lunch';
  if (h >= 17 && h < 22) return 'dinner';
  return 'snack';
}

// Robust JSON extraction — copied from meal-plan/generate so a formatting hiccup
// (code fences, preamble) doesn't sink the call.
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

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = supabase as any;

  const body = await req.json().catch(() => ({}));
  const prompt: string = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  const localTime: string | undefined = typeof body.localTime === 'string' ? body.localTime : undefined;
  const currentComponentIds: string[] = Array.isArray(body.currentComponentIds)
    ? body.currentComponentIds.filter((x: any) => typeof x === 'string')
    : [];

  if (!prompt) {
    return NextResponse.json({ error: 'A prompt is required' }, { status: 400 });
  }

  // ── Verify the meal belongs to the caller (and get its title for context). ──
  const { data: meal, error: mealErr } = await db
    .from('recipe_canonicals')
    .select('id, author_id, composition_level, recipe_versions!current_version_id ( title )')
    .eq('id', id)
    .maybeSingle();
  if (mealErr) return NextResponse.json({ error: mealErr.message }, { status: 500 });
  if (!meal || meal.author_id !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const mealVer = Array.isArray(meal.recipe_versions) ? meal.recipe_versions[0] : meal.recipe_versions;
  const mealTitle: string = mealVer?.title ?? 'this meal';

  // ── Grounding: self person, prefs (planned slots), habitual times. ──
  const personId = await selfPersonId(db, user.id);

  let plannedSlots: string[] = ['dinner'];
  let habitualTimes: Record<string, string> = {};
  if (personId) {
    const { data: prefs } = await db
      .from('person_meal_prefs')
      .select('active_slots, slot_times')
      .eq('person_id', personId)
      .maybeSingle();
    if (Array.isArray(prefs?.active_slots) && prefs.active_slots.length) {
      plannedSlots = prefs.active_slots;
    }
    const rawTimes = (prefs?.slot_times ?? {}) as Record<string, any>;
    habitualTimes = rawTimes.default ?? rawTimes ?? {};
  }
  const inferredSlot = slotFromLocalTime(localTime);

  // ── Grounding: household allergens (best-effort, mirrors generate). ──
  const allergies = new Set<string>();
  {
    const householdIds = personId ? [personId] : [];
    if (householdIds.length) {
      const { data: healthRows } = await db
        .from('health_profile')
        .select('person_id, allergies')
        .in('person_id', householdIds);
      for (const h of (healthRows ?? [])) {
        for (const a of (h.allergies ?? [])) allergies.add(String(a).toLowerCase());
      }
    }
  }

  // ── Grounding: "your usual" — recent dishes eaten, optionally in the inferred
  // slot. Light version for Slice A (Slice C enriches). Best-effort: never fails
  // the request. We map meal rows → their recipe titles. ──
  let recentUsual: string[] = [];
  if (personId) {
    const since = new Date(); since.setDate(since.getDate() - 28);
    let q = db
      .from('meal')
      .select('slot, recipe_canonicals!recipe_id ( recipe_versions!current_version_id ( title ) )')
      .eq('owner_person_id', personId)
      .gte('meal_date', since.toISOString().slice(0, 10))
      .order('meal_date', { ascending: false })
      .limit(40);
    if (inferredSlot) q = q.eq('slot', inferredSlot);
    const { data: recentMeals } = await q;
    const seen = new Set<string>();
    for (const m of (recentMeals ?? [])) {
      const can = Array.isArray(m.recipe_canonicals) ? m.recipe_canonicals[0] : m.recipe_canonicals;
      const v = can && (Array.isArray(can.recipe_versions) ? can.recipe_versions[0] : can.recipe_versions);
      const t = v?.title;
      if (t && !seen.has(t)) { seen.add(t); recentUsual.push(t); }
      if (recentUsual.length >= 8) break;
    }
  }

  // ── The dish catalogue (existing dishes only; never meals-as-components here). ──
  const { data: recipeRows } = await db
    .from('recipe_canonicals')
    .select(`
      id, composition_level,
      recipe_versions!current_version_id (
        title, cuisine, tags, total_time_seconds,
        version_ingredients ( ingredients!ingredient_id ( name ) )
      )
    `)
    .eq('composition_level', 'dish')
    .limit(200);

  const catalogue: CatalogueItem[] = (recipeRows ?? []).map((r: any) => {
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
      totalTimeMinutes: v?.total_time_seconds ? Math.round(v.total_time_seconds / 60) : null,
      ingredientNames: ingNames,
    };
  }).filter((c: CatalogueItem) => c.title && c.title !== '(untitled)');

  if (catalogue.length === 0) {
    return NextResponse.json({
      suggestions: [],
      note: 'You have no dishes yet to compose a meal from. Create a few dishes first, then I can suggest combinations.',
    });
  }

  // Already-on-the-meal titles, for "what goes with this" context.
  const currentSet = new Set(currentComponentIds);
  const currentTitles = catalogue.filter(c => currentSet.has(c.id)).map(c => c.title);

  // ── Build the model call. Catalogue is sent trimmed (no ids the model could
  //    leak verbatim beyond what we validate). ──
  const system = `You are the butler for Soupdog — you help a home cook compose ONE meal for a single occasion by SELECTING dishes and drinks from their existing recipe catalogue. You NEVER invent dishes and NEVER use any id that is not in the provided catalogue.

You handle requests anywhere on a precision spectrum:
- PRECISE ("carbonara, a rocket salad, a negroni"): match each to the closest catalogue item and suggest them.
- PARTIAL ("I'm doing the carbonara, what goes with it?"): keep what they named, suggest complements (a side dish, a drink) that pair well.
- OPEN ("something sweet", "I don't know what I want"): if the request is too vague to choose well, DO NOT guess — return a single clarifying question that narrows it (e.g. meal size, or whether to build a whole meal vs. one element), pre-filled with the sensible default you infer from context. Ask at most ONE question.

Rules:
- Use ONLY ids from the catalogue. Prefer variety and good pairings (a main + a complementary side and/or a drink), sized to the occasion.
- AVOID ALLERGENS: never suggest a dish whose ingredients include any listed allergen (match loosely — "milk"/"dairy" rules out cheese, cream, butter, yogurt; "gluten"/"wheat" rules out bread, pasta, flour, noodles).
- Do NOT re-suggest dishes already on the meal (listed under alreadyChosen).
- Each suggestion needs a SHORT reason (why it fits / pairs).
- Classify each as type "dish" or "drink".
- Keep it tasteful and small — a meal is usually 1–3 dishes plus maybe a drink, not a buffet.

Respond with ONLY valid JSON, no markdown. One of two shapes:

If you need to narrow an open request:
{"clarifyingQuestion":{"question":"<one short question>","suggestions":["<quick option>","<quick option>"]}}

Otherwise:
{"suggestions":[{"recipeId":"<catalogue id>","type":"dish|drink","reason":"<short>"}],"note":"<optional one-line note>"}`;

  const userContent = JSON.stringify({
    request: prompt,
    context: {
      mealTitle,
      localTime: localTime ?? null,
      inferredSlot,
      plannedSlots,
      habitualTimes,
      youUsuallyEat: recentUsual,           // "your usual" for this slot (titles)
      avoidAllergens: Array.from(allergies),
    },
    alreadyChosen: currentTitles,
    catalogue: catalogue.map(c => ({
      id: c.id, title: c.title, cuisine: c.cuisine, tags: c.tags,
      timeMinutes: c.totalTimeMinutes, ingredients: c.ingredientNames.slice(0, 6),
    })),
  });

  const result = await aiMessage({
    model: 'claude-sonnet-4-6',
    feature: 'meal_plan',
    accountId: user.id,
    personId: personId ?? null,
    max_tokens: 1500,
    system,
    messages: [{ role: 'user', content: userContent }],
  });

  if (!result.ok) {
    return NextResponse.json({ error: 'Compose failed', detail: result.errorText }, { status: 502 });
  }

  const raw = result.data.content?.[0]?.text ?? '';
  const parsed = extractJson(raw);
  if (!parsed) {
    console.error('[meal-compose] unparseable response:', raw.slice(0, 400));
    return NextResponse.json({ error: 'Could not parse suggestion', sample: raw.slice(0, 200) }, { status: 500 });
  }

  // Clarifying-question branch: pass through (sanitized).
  if (parsed.clarifyingQuestion && typeof parsed.clarifyingQuestion.question === 'string') {
    const cq = parsed.clarifyingQuestion;
    return NextResponse.json({
      clarifyingQuestion: {
        question: cq.question,
        suggestions: Array.isArray(cq.suggestions)
          ? cq.suggestions.filter((s: any) => typeof s === 'string').slice(0, 4)
          : [],
      },
      suggestions: [],
    });
  }

  // Suggestion branch: validate every id against the catalogue (selection-not-
  // invention enforced here), drop already-chosen, map to addable shape.
  const byId = new Map(catalogue.map(c => [c.id, c]));
  const rawSuggestions: any[] = Array.isArray(parsed.suggestions) ? parsed.suggestions : [];
  const suggestions = rawSuggestions
    .filter(s => s && typeof s.recipeId === 'string' && byId.has(s.recipeId) && !currentSet.has(s.recipeId))
    .map(s => {
      const c = byId.get(s.recipeId)!;
      const type: CompType = s.type === 'drink' ? 'drink' : 'dish';
      return {
        canonicalId: c.id,
        title: c.title,
        type,
        cuisine: c.cuisine,
        totalTimeMinutes: c.totalTimeMinutes,
        reason: typeof s.reason === 'string' ? s.reason : '',
      };
    });

  // De-dupe by canonicalId (model could repeat).
  const seenSug = new Set<string>();
  const deduped = suggestions.filter(s => {
    if (seenSug.has(s.canonicalId)) return false;
    seenSug.add(s.canonicalId);
    return true;
  });

  return NextResponse.json({
    suggestions: deduped,
    note: typeof parsed.note === 'string' ? parsed.note : undefined,
  });
}
