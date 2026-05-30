// src/app/api/recipes/import/chat/route.ts
// POST — conversational recipe assistant
// Handles both questions (returns text answer) and instructions (returns updated recipe)

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const SYSTEM_PROMPT = `You are a recipe assistant for Soupdog, a structured food execution platform.

The user may ask questions about the recipe OR give instructions to modify it.
You must detect the intent and respond accordingly.

QUESTIONS (answer only, do not modify the recipe):
- "What can I use instead of X?"
- "Why do we do X?"
- "What wine pairs with this?"
- "How do I know when X is done?"
- "What does X mean?"
- Any question asking for information, explanation, or suggestions

INSTRUCTIONS (modify the recipe):
- "Make it vegetarian"
- "Scale to 6 servings"
- "Add timing to each step"
- "Replace guanciale with pancetta"
- Any imperative sentence asking for a change

Respond with a JSON object. The structure depends on intent:

FOR QUESTIONS — return:
{
  "type": "answer",
  "answer": "Your conversational response here. Be helpful and specific to this recipe."
}

FOR INSTRUCTIONS — return:
{
  "type": "modification",
  "requiresConfirmation": true/false,
  "changeSummary": "Short description of what changed",
  "recipe": { ...complete updated recipe JSON... }
}

requiresConfirmation should be true for large/destructive changes (substituting main ingredients,
changing cooking method, restructuring the recipe, affecting more than ~4 steps).
It should be false for small precise changes (scaling, adding timing, single ingredient tweak).

SOUPDOG RECIPE RULES (for modifications only):
- Each step is ONE ATOMIC ACTION (one verb, one action)
- stepTools REQUIRED for almost every step — consistent names across steps
- taskFamily: cut | move | heat_dry | heat_wet | heat_machine | mix | passive | prepare | finish
- All quantities metric, duration in minutes, temperature in Celsius
- Always update top-level ingredients array to match steps

Recipe JSON structure for modifications:
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
}

Respond with ONLY valid JSON — no markdown, no backticks, no text outside the JSON.`;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { recipe, message, history } = await req.json();
  if (!recipe || !message?.trim()) {
    return NextResponse.json({ error: 'recipe and message required' }, { status: 400 });
  }

  const messages: { role: 'user' | 'assistant'; content: string }[] = [];

  for (const turn of (history ?? [])) {
    messages.push({ role: 'user', content: turn.user });
    if (turn.type === 'answer') {
      messages.push({ role: 'assistant', content: JSON.stringify({ type: 'answer', answer: turn.assistantSummary }) });
    } else {
      messages.push({ role: 'assistant', content: JSON.stringify({ type: 'modification', changeSummary: turn.assistantSummary, recipe: turn.recipe }) });
    }
  }

  const userContent = history?.length > 0
    ? `${message.trim()}\n\nCurrent recipe JSON:\n${JSON.stringify(recipe)}`
    : `Here is the current recipe:\n\n${JSON.stringify(recipe)}\n\nUser message: ${message.trim()}`;

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
      console.error('[import/chat] error:', err);
      return NextResponse.json({ error: 'Request failed' }, { status: 502 });
    }

    const data = await res.json();
    const raw  = data.content?.[0]?.text ?? '';
    const clean = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();

    let parsed: any;
    try {
      parsed = JSON.parse(clean);
    } catch {
      console.error('[import/chat] JSON parse failed:', clean.slice(0, 200));
      return NextResponse.json({ error: 'Could not parse response' }, { status: 500 });
    }

    if (parsed.type === 'answer') {
      return NextResponse.json({ type: 'answer', answer: parsed.answer });
    }

    // modification
    const updated = parsed.recipe ?? parsed;
    if (!updated.title || !Array.isArray(updated.ingredients) || !Array.isArray(updated.groups)) {
      return NextResponse.json({ error: 'Incomplete recipe structure' }, { status: 500 });
    }

    return NextResponse.json({
      type:                 'modification',
      recipe:               updated,
      requiresConfirmation: parsed.requiresConfirmation ?? false,
      changeSummary:        parsed.changeSummary ?? 'Recipe updated',
    });

  } catch (err: any) {
    console.error('[import/chat]', err);
    return NextResponse.json({ error: err.message ?? 'Request failed' }, { status: 500 });
  }
}
