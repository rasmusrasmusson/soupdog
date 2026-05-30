// src/app/api/recipes/import/chat/route.ts
// POST — conversational recipe modification via Claude
// Takes current recipe JSON + conversation history + user message
// Returns updated recipe JSON

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const SYSTEM_PROMPT = `You are a recipe editing assistant for Soupdog, a structured food execution platform.

You will receive the current recipe as JSON and a user instruction to modify it.
Return the COMPLETE updated recipe JSON — not just the changed parts.

SOUPDOG RECIPE RULES:
- Each step is ONE ATOMIC ACTION (one verb, one action)
- stepTools is REQUIRED for almost every step — use consistent tool names across steps
- taskFamily must be one of: cut | move | heat_dry | heat_wet | heat_machine | mix | passive | prepare | finish
- All quantities in metric (g, kg, ml, l, tsp, tbsp, cup, piece, clove, slice, pinch, bunch, to taste, as needed)
- Duration in minutes, temperature in Celsius

taskFamily guide:
- cut: chop, slice, dice, peel, mince, grate, zest
- move: add to, pour, transfer, drain, strain, plate, remove from heat
- heat_dry: fry, sear, roast, grill, toast, bake, sauté
- heat_wet: boil, simmer, steam, poach, blanch, reduce
- heat_machine: oven, microwave, air fryer, sous vide
- mix: stir, whisk, fold, knead, blend, toss, combine
- passive: rest, marinate, chill, proof, soak, cool
- prepare: preheat, measure, wash, season (before cooking)
- finish: garnish, serve, dress, plate

TOOL NAMING: Use the EXACT SAME string every time a step uses the same physical tool.
Example: every step using the same pot must say "large pot" — not "pot" sometimes and "large pot" other times.

When modifying recipes:
- If making vegetarian/vegan: replace meat/fish with appropriate substitutes, update all affected steps and ingredients
- If scaling: adjust all quantities, and note that spices (~0.7x), salt (~0.85x), leavening (~0.8x) scale non-linearly
- If splitting steps: maintain atomic action principle — one verb per step
- If changing method: update taskFamily and tools accordingly
- Always update the top-level ingredients array to match what's actually used in steps
- Keep description and tags consistent with any changes

Respond with ONLY valid JSON — the complete updated recipe. No markdown, no backticks, no explanation outside the JSON.

The JSON structure must be:
{
  "title": string,
  "description": string,
  "cuisine": string | null,
  "difficulty": "easy" | "medium" | "hard",
  "servings": number,
  "totalTimeMinutes": number,
  "activeTimeMinutes": number | null,
  "tags": string[],
  "ingredients": [{ "name": string, "quantityValue": number, "quantityUnit": string, "prepNote": string | null, "optional": boolean }],
  "equipment": string[],
  "groups": [{
    "outputName": string,
    "steps": [{
      "instruction": string,
      "durationMinutes": number,
      "temperatureCelsius": number | null,
      "taskFamily": string,
      "stepIngredients": string[],
      "stepTools": string[]
    }]
  }]
}`;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { recipe, message, history } = await req.json();

  if (!recipe || !message?.trim()) {
    return NextResponse.json({ error: 'recipe and message required' }, { status: 400 });
  }

  // Build conversation history for Claude — previous turns show context
  const messages: { role: 'user' | 'assistant'; content: string }[] = [];

  // Add prior turns from history
  for (const turn of (history ?? [])) {
    messages.push({ role: 'user', content: turn.user });
    messages.push({ role: 'assistant', content: JSON.stringify(turn.recipe) });
  }

  // Add the current user message with recipe context
  const userContent = history?.length > 0
    // Subsequent turns: just the instruction (Claude has context from history)
    ? `${message.trim()}\n\nCurrent recipe JSON:\n${JSON.stringify(recipe)}`
    // First turn: include the full recipe
    : `Here is the current recipe:\n\n${JSON.stringify(recipe)}\n\nPlease make this change: ${message.trim()}`;

  messages.push({ role: 'user', content: userContent });

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-6',
        max_tokens: 6000,
        system:     SYSTEM_PROMPT,
        messages,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('[import/chat] Anthropic error:', err);
      return NextResponse.json({ error: 'AI request failed' }, { status: 502 });
    }

    const data = await res.json();
    const raw  = data.content?.[0]?.text ?? '';

    // Strip any accidental markdown fences
    const clean = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();

    let updated: any;
    try {
      updated = JSON.parse(clean);
    } catch {
      console.error('[import/chat] JSON parse failed:', clean.slice(0, 200));
      return NextResponse.json({ error: 'Could not parse AI response' }, { status: 500 });
    }

    if (!updated.title || !Array.isArray(updated.ingredients) || !Array.isArray(updated.groups)) {
      return NextResponse.json({ error: 'Incomplete recipe structure returned' }, { status: 500 });
    }

    return NextResponse.json({ recipe: updated });

  } catch (err: any) {
    console.error('[import/chat]', err);
    return NextResponse.json({ error: err.message ?? 'Request failed' }, { status: 500 });
  }
}
