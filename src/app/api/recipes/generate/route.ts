// src/app/api/recipes/generate/route.ts
//
// Create-a-recipe butler — Slice A (the route).
//
// The user is on the Add recipe page and describes a recipe they want to MAKE
// (not search): "Give me a recipe for a Negroni", "a quick weeknight dhal",
// "something with the leftover chicken". This route does ONE butler turn and
// returns exactly one of three shapes:
//
//   1) CLARIFY  — the request is too vague to make a good recipe. Return a single
//      short question (with a couple of tappable options). Ask at most one.
//
//   2) EXISTING — the user already has a recipe matching this. Don't regenerate;
//      point them at it. Returns { existing: [{ id, slug, title, isPublished }] }.
//      May list more than one when several plausibly match. (Authoring context,
//      so we link to the user's own catalogue, not public search.)
//
//   3) GENERATE — nothing matches and the request is clear enough. The model
//      writes a complete recipe as PLAIN TEXT in the same title/ingredients/
//      method format a user would paste. The client feeds that straight into the
//      existing import → decompose pipeline (no new parse/save logic), so the
//      generated recipe lands in the normal DAG preview + edit flow.
//
// Why plain text for the generate branch (not a DAG or the parser's JSON): the
// parse → decompose path is already proven and consistent. Generating prose and
// running it through that path reuses all of it; generation only has to be a good
// recipe writer, not also a structurer.
//
// Body:    { prompt: string }
// Returns:
//   { clarifyingQuestion: { question: string, suggestions: string[] } }
//   | { existing: { id: string, slug: string, title: string, isPublished: boolean }[] }
//   | { recipeText: string, title: string }

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { aiMessage } from '@/lib/ai/anthropic';

// Allow time for the (possibly slow) Anthropic call — without this the
// serverless function can be killed mid-request and return a 502 intermittently.
export const maxDuration = 60;

interface CatalogueItem {
  id: string;
  slug: string | null;
  title: string;
  isPublished: boolean;
}

// Robust JSON extraction — same three-candidate approach used by the importer and
// the meal butler, so a code-fence or stray preamble doesn't sink the call.
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

// Normalise a title for loose matching ("Negroni" ~ "negroni cocktail").
function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = supabase as any;

  const body = await req.json().catch(() => ({}));
  const prompt: string = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (!prompt) {
    return NextResponse.json({ error: 'Tell me what you would like to make.' }, { status: 400 });
  }

  // ── The user's OWN catalogue (dishes + meals they authored), for the EXISTING
  //    branch. Author-scoped: we only point at their own recipes here. ──
  const { data: recipeRows } = await db
    .from('recipe_canonicals')
    .select(`
      id, slug, is_published,
      recipe_versions!current_version_id ( title )
    `)
    .eq('author_id', user.id)
    .is('archived_at', null)   // ← archived recipes must NOT count as "you already have this"
    .limit(400);

  const catalogue: CatalogueItem[] = (recipeRows ?? []).map((r: any) => {
    const v = Array.isArray(r.recipe_versions) ? r.recipe_versions[0] : r.recipe_versions;
    return {
      id: r.id,
      slug: r.slug ?? null,
      title: v?.title ?? '',
      isPublished: !!r.is_published,
    };
  }).filter((c: CatalogueItem) => c.title);

  // ── The model decides the branch. It is given the catalogue TITLES (not full
  //    recipes — cheap, and enough to spot an existing match). It returns a small
  //    JSON envelope naming the branch; for GENERATE it also returns the recipe
  //    as plain text in the importer's expected format. ──
  const system = `You are the recipe butler for Soupdog. The user is AUTHORING — they want to MAKE a recipe, not search. Decide ONE of four responses and reply with ONLY valid JSON (no markdown, no backticks).

You are given the user's existing recipe catalogue (titles only). Branch as follows:

1) CLARIFY — only if the request is genuinely too vague to write a good single recipe (e.g. "something nice", "dinner"). A named dish ("a Negroni", "chicken tikka masala") is NOT vague — make it. A request naming several dishes is NOT vague — it is a MEAL (see 4). Ask at MOST one short question and offer 2–4 quick options.
   {"action":"clarify","question":"<one short question>","options":["<opt>","<opt>"]}

2) EXISTING — if the catalogue already clearly contains what they're asking for (a SINGLE dish, allowing minor wording differences). Do NOT regenerate it. List the matching catalogue title(s) verbatim. If several plausibly match, list them all (max 4).
   {"action":"existing","matches":["<exact catalogue title>","..."]}

3) GENERATE — a SINGLE clear dish, nothing in the catalogue matches. Write a COMPLETE, authentic recipe as PLAIN TEXT, formatted exactly like a recipe someone would paste:
   - First line: the recipe title.
   - A line like "Serves 2 | 5 minutes".
   - An "Ingredients:" section, one ingredient per line with quantities (metric; use ml/g; cocktails in ml).
   - A "Method:" section, numbered steps, each a clear instruction.
   Be accurate and classic unless the user asked for a variation. Do not editorialise.
   {"action":"generate","title":"<title>","recipeText":"<the full recipe as one plain-text string with \\n line breaks>"}

4) MEAL — the request describes MORE THAN ONE dish to be eaten together (e.g. "a dinner with carbonara, a green salad and iced tea"; "fish and chips with mushy peas"). Identify each distinct dish. Do NOT write the recipes here — just name the dishes (and an optional short description of each, only if the user gave detail). List them in serving order if obvious.
   {"action":"meal","dishes":[{"name":"<dish name>","description":"<optional, only if the user specified detail>"}]}

Rules:
- A single named dish → GENERATE (or EXISTING if owned). Several dishes together → MEAL.
- Prefer GENERATE for any clearly-named single dish that isn't already in the catalogue.
- Only CLARIFY when making something reasonable would be a guess you'd likely get wrong.
- For EXISTING, the titles you return MUST be copied exactly from the provided catalogue.
- For MEAL, name each dish plainly (e.g. "Spaghetti carbonara", "Green salad", "Iced tea"). The system will check each against the catalogue itself — you do NOT decide reuse.`;

  const userContent = JSON.stringify({
    request: prompt,
    catalogue: catalogue.map(c => c.title),
  });

  const result = await aiMessage({
    model: 'claude-sonnet-4-6',
    feature: 'recipe_generate',
    accountId: user.id,
    personId: null,
    max_tokens: 2000,
    system,
    messages: [{ role: 'user', content: userContent }],
  });

  if (!result.ok) {
    return NextResponse.json({ error: 'Generation failed', detail: result.errorText }, { status: 502 });
  }

  const raw = result.data.content?.[0]?.text ?? '';
  const parsed = extractJson(raw);
  if (!parsed || typeof parsed.action !== 'string') {
    console.error('[recipe-generate] unparseable response:', raw.slice(0, 400));
    return NextResponse.json({ error: 'Could not understand that — try rephrasing.', sample: raw.slice(0, 200) }, { status: 500 });
  }

  // ── CLARIFY ──
  if (parsed.action === 'clarify' && typeof parsed.question === 'string') {
    return NextResponse.json({
      clarifyingQuestion: {
        question: parsed.question,
        suggestions: Array.isArray(parsed.options)
          ? parsed.options.filter((s: any) => typeof s === 'string').slice(0, 4)
          : [],
      },
    });
  }

  // ── EXISTING ── validate the model's claimed matches against the real catalogue
  //    (selection-not-invention: we only ever return real, owned recipes). Match
  //    loosely on normalised title so minor wording differences still resolve.
  if (parsed.action === 'existing' && Array.isArray(parsed.matches)) {
    const wanted: string[] = parsed.matches.map((m: any) => norm(String(m))).filter(Boolean);
    const existing = catalogue
      .filter(c => wanted.some(w => norm(c.title) === w || norm(c.title).includes(w) || w.includes(norm(c.title))))
      .slice(0, 4)
      .map(c => ({ id: c.id, slug: c.slug, title: c.title, isPublished: c.isPublished }));
    if (existing.length > 0) {
      return NextResponse.json({ existing });
    }
    // Model claimed a match but none resolved → fall through to generate-less safety.
    return NextResponse.json({
      error: 'I thought you already had that, but I cannot find it. Try rephrasing.',
    }, { status: 404 });
  }

  // ── MEAL ── the request names several dishes. Resolve EACH against the catalogue:
  //    a catalogue hit → LINK it (a resolvedDishes entry the decompose engine honours);
  //    no hit → MAKE it (the client generates/parses + decomposes it inline). The system
  //    decides reuse by search, not the model. Slice 1: on multiple matches we pick the
  //    best (published first, else first) — the interactive picker is a later slice.
  if (parsed.action === 'meal' && Array.isArray(parsed.dishes)) {
    const dishes = parsed.dishes
      .map((d: any) => ({
        name: typeof d?.name === 'string' ? d.name.trim() : '',
        description: typeof d?.description === 'string' ? d.description.trim() : '',
      }))
      .filter((d: { name: string }) => d.name);

    if (dishes.length === 0) {
      return NextResponse.json({ error: 'Could not identify the dishes — try rephrasing.' }, { status: 500 });
    }

    const resolved = dishes.map((d: { name: string; description: string }) => {
      const w = norm(d.name);
      // candidate catalogue matches (loose, same rule as EXISTING)
      const matches = catalogue.filter(c => {
        const ct = norm(c.title);
        return ct === w || ct.includes(w) || w.includes(ct);
      });
      if (matches.length === 0) {
        return { name: d.name, description: d.description, status: 'make' as const };
      }
      // Slice 1: pick best — exact-title match first, then published, then first.
      const exact = matches.find(c => norm(c.title) === w);
      const pick = exact ?? matches.find(c => c.isPublished) ?? matches[0];
      return {
        name: d.name,
        status: 'linked' as const,
        canonicalId: pick.id,
        canonicalSlug: pick.slug,
        title: pick.title,
        // surface that more than one matched, so a later slice can offer a picker
        otherMatchCount: matches.length - 1,
      };
    });

    return NextResponse.json({ meal: { dishes: resolved } });
  }

  // ── GENERATE ── return the plain recipe text for the client to feed into import.
  if (parsed.action === 'generate' && typeof parsed.recipeText === 'string' && parsed.recipeText.trim()) {
    return NextResponse.json({
      recipeText: parsed.recipeText,
      title: typeof parsed.title === 'string' ? parsed.title : '',
    });
  }

  return NextResponse.json({ error: 'Could not generate a recipe — try rephrasing.' }, { status: 500 });
}
