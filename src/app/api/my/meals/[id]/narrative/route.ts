// src/app/api/my/meals/[id]/narrative/route.ts
// L2 — generate (or return cached) a natural-language cooking narrative for a
// meal, built ON TOP of the deterministic L1 timeline in meal_merged_recipe.
//
// CONSTRAINED, NOT GENERATIVE: the AI is given L1's exact ordered steps + timings
// + dish labels and must produce flowing prose that follows that SAME order and
// those SAME times. It rephrases and adds connective tissue ("meanwhile", "by now
// the oven is hot") — it must NOT invent steps, change the schedule, or add
// cooking facts. This keeps it cheap, safe, and faithful to the schedule.
//
// LAZY + CACHED (option b): generated on first view of the cook-together tab.
// If a narrative already exists whose narrative_hash matches the current
// timeline's source_hash, it's returned as-is (free). Otherwise we call Sonnet
// once, store it, and return it. Invalidates automatically when the meal changes
// (the L1 rebuild writes a new source_hash, so the old narrative_hash mismatches).
//
// GRACEFUL: if generation fails, the client still has the L1 timeline to render.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { aiMessage } from '@/lib/ai/anthropic';

const SYSTEM = `You are a calm, expert head chef writing the cooking method for a multi-dish meal.
You are given a PRE-COMPUTED, ORDERED schedule of steps drawn from several dishes, already
interleaved and timed so everything finishes together. Your ONLY job is to rewrite this exact
schedule as one flowing, natural cooking method that a home cook can follow.

STRICT RULES — these are absolute:
- You are given N steps, each with an "order" number. Output EXACTLY N steps, ONE per input
  step, in the SAME order. Never merge two input steps into one, never split one into two,
  and NEVER repeat a step. Your output step count MUST equal the input step count.
- Each output step MUST carry the same "order" number as the input step it rewrites (echo it
  back as "n"). Step n in your output is a rewrite of the input step with order n — nothing else.
- Do not reorder. Do not invent new steps, ingredients, temperatures, or times. Use only what
  is given. You may restate a given time/temp in words.
- Weave in natural connective phrases when a step runs during another's hands-free window
  (e.g. "While the chicken roasts, ..."). The schedule marks handsFree / meanwhile — use it to
  phrase overlaps. But connective phrasing must NOT change the number of steps.
- Keep each step recognisably one instruction. Be concise and warm, not chatty. No preamble,
  no commentary about the meal being clever. British English.
- Keep-warm/holding steps must be stated plainly as their own step.

Respond with ONLY a JSON object, no markdown:
{"intro": "one short sentence orienting the cook (optional, may be empty)",
 "steps": [{"n": 1, "text": "the instruction as flowing prose"}, ...],
 "outro": "one short serving sentence (optional, may be empty)"}
Output exactly as many step objects as you were given, numbered to match each input step's
"order". Do not add, drop, or duplicate any.`;

function buildUserPayload(payload: any): string {
  const steps = (payload?.scheduled ?? []).map((s: any, i: number) => ({
    order: i + 1,
    dish: s.dishTitle,
    type: s.type,                         // human | machine | passive | hold
    handsFree: s.type === 'machine' || s.type === 'passive',
    meanwhile: !!s.meanwhile,
    isHold: !!s.isHold,
    startsBeforeServingMin: Math.round((s.startOffsetSeconds ?? 0) / 60),
    durationMin: s.durationSeconds ? Math.round(s.durationSeconds / 60) : null,
    temperatureC: s.temperatureCelsius ?? null,
    instruction: s.instruction,
    ingredients: (s.ingredients ?? []).map((g: any) => g.name),
  }));
  return `Here is the pre-computed, ordered, interleaved schedule for the meal. Rewrite it as one flowing method following these steps in this exact order:\n\n${JSON.stringify(steps, null, 2)}`;
}

export async function POST(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await context.params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  // Ownership + must be a meal.
  const { data: meal } = await db
    .from('recipe_canonicals')
    .select('id, composition_level')
    .eq('id', id)
    .eq('author_id', user.id)
    .eq('composition_level', 'meal')
    .single();
  if (!meal) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Need a built L1 timeline to narrate.
  const { data: row } = await db
    .from('meal_merged_recipe')
    .select('payload, source_hash, narrative, narrative_hash')
    .eq('meal_canonical_id', id)
    .single();

  if (!row?.payload) {
    return NextResponse.json({ error: 'not_built', message: 'Build the meal first.' }, { status: 409 });
  }

  // Cache hit: narrative exists and matches the current timeline.
  if (row.narrative && row.narrative_hash && row.narrative_hash === row.source_hash) {
    return NextResponse.json({ narrative: row.narrative, cached: true });
  }

  const steps = row.payload?.scheduled ?? [];
  if (steps.length === 0) {
    return NextResponse.json({ error: 'empty', message: 'No steps to narrate.' }, { status: 409 });
  }

  // Generate with Sonnet (quality task; one cached call per meal change).
  const result = await aiMessage({
    model:      'claude-sonnet-4-6',
    feature:    'meal_merge',
    accountId:  user.id,
    max_tokens: 3000,
    system:     SYSTEM,
    messages:   [{ role: 'user', content: buildUserPayload(row.payload) }],
  });

  if (!result.ok) {
    // Graceful: client falls back to the L1 timeline.
    return NextResponse.json({ error: 'ai_failed', message: result.errorText ?? 'generation failed' }, { status: 502 });
  }

  const raw = result.data?.content?.[0]?.text ?? '';
  const clean = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
  let narrative: any;
  try {
    narrative = JSON.parse(clean);
  } catch {
    return NextResponse.json({ error: 'parse_failed', message: 'Could not parse narrative.' }, { status: 500 });
  }
  if (!narrative || !Array.isArray(narrative.steps)) {
    return NextResponse.json({ error: 'bad_shape', message: 'Narrative missing steps.' }, { status: 500 });
  }

  // FAITHFULNESS CHECK: the narrative must have exactly one step per L1 step. The
  // L1 timeline is the source of truth (deterministic, verified correct). If the
  // model duplicated, dropped, or merged steps (count mismatch), the narrative is
  // not trustworthy — reject WITHOUT caching so the client falls back to the
  // correct L1 timeline (it already renders CookTimeline on narrative failure).
  const expected = steps.length;
  const got = narrative.steps.length;
  if (got !== expected) {
    return NextResponse.json({
      error: 'count_mismatch',
      message: `Narrative had ${got} steps but the schedule has ${expected}; not caching.`,
    }, { status: 502 });
  }

  // Normalise numbering to the canonical 1..N order regardless of what the model
  // echoed, so the displayed numbers always match the schedule order.
  narrative.steps = narrative.steps.map((s: any, i: number) => ({
    n: i + 1,
    text: typeof s?.text === 'string' ? s.text : String(s?.text ?? ''),
  }));

  // Cache it against the timeline it was built from.
  await db.from('meal_merged_recipe')
    .update({
      narrative,
      narrative_hash: row.source_hash ?? null,
      narrative_built_at: new Date().toISOString(),
    })
    .eq('meal_canonical_id', id);

  return NextResponse.json({ narrative, cached: false });
}
