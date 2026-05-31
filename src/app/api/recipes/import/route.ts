// src/app/api/recipes/import/route.ts
// POST — parse recipe from text, image, or PDF using Claude
// Accepts: { text } OR { file: base64string, mediaType: string }

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const SYSTEM_PROMPT = `You are a recipe parsing system for Soupdog, a structured food execution platform.

Soupdog treats recipes as process graphs where EACH STEP IS ONE ATOMIC ACTION.
This is the most important rule: one action = one step.

BAD (too coarse):
  instruction: "Bring a large pot of salted water to a boil"
  (this is 3 actions: fill pot, add salt, boil)

GOOD (atomic):
  step 1: instruction: "Fill pot with water", ingredient: water 1000ml, tool: large pot
  step 2: instruction: "Add salt to water", ingredient: salt to taste, tool: large pot  
  step 3: instruction: "Bring to a boil", tool: large pot, taskFamily: heat_wet, duration: 8

Each instruction should be SHORT and SPECIFIC:
- Start with a verb: Add, Fill, Heat, Stir, Whisk, Drain, Rest, etc.
- Reference the ingredient and/or tool
- Never combine two actions in one instruction

IMPORTANT:
- Include ALL ingredients even implied ones (water, oil for pan, salt for pasta water)
- Every step must have an instruction
- Extract all tools used
- duration 0 means duration unknown — estimate if obvious
- If reading from an image or PDF, extract ALL recipe content visible

All quantities in metric. Duration in minutes. Temperature in celsius.
Respond with ONLY valid JSON, no markdown, no backticks.

{
  "title": "Recipe title",
  "description": "1-2 sentence description",
  "cuisine": "Italian" or null,
  "difficulty": "easy" | "medium" | "hard",
  "servings": number,
  "totalTimeMinutes": number,
  "activeTimeMinutes": number | null,
  "tags": ["tag1", "tag2"],
  "ingredients": [
    {
      "name": "ingredient name",
      "quantityValue": number,
      "quantityUnit": "g" | "kg" | "ml" | "l" | "tsp" | "tbsp" | "cup" | "piece" | "clove" | "slice" | "pinch" | "bunch" | "to taste" | "as needed",
      "prepNote": "chopped" or null,
      "optional": false
    }
  ],
  "equipment": ["large pot", "frying pan", "mixing bowl", "whisk"],
  "groups": [
    {
      "outputName": "Pasta" or "" for single-group recipes,
      "steps": [
        {
          "instruction": "Short atomic action",
          "durationMinutes": number,
          "temperatureCelsius": number or null,
          "taskFamily": "cut" | "move" | "heat_dry" | "heat_wet" | "heat_machine" | "mix" | "passive" | "prepare" | "finish",
          "stepIngredients": ["ingredient name"],
          "stepTools": ["large pot"]
        }
      ]
    }
  ]
}

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

TOOL NAMING: stepTools is REQUIRED for almost every step. Use the EXACT SAME string every time a step uses the same physical tool.`;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { text, file, mediaType } = body;

  if (!text?.trim() && !file) {
    return NextResponse.json({ error: 'text or file required' }, { status: 400 });
  }

  // Build the message content — text or file
  let userContent: any;

  if (file && mediaType) {
    const isPdf   = mediaType === 'application/pdf';
    const isImage = mediaType.startsWith('image/');

    if (!isPdf && !isImage) {
      return NextResponse.json({ error: 'Unsupported file type. Use PDF or image.' }, { status: 400 });
    }

    if (isPdf) {
      userContent = [
        {
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: file },
        },
        { type: 'text', text: 'Parse the recipe from this document.' },
      ];
    } else {
      userContent = [
        {
          type:   'image',
          source: { type: 'base64', media_type: mediaType, data: file },
        },
        { type: 'text', text: 'Parse the recipe from this image.' },
      ];
    }
  } else {
    if (text.length > 20000) {
      return NextResponse.json({ error: 'text too long (max 20000 chars)' }, { status: 400 });
    }
    userContent = `Parse this recipe:\n\n${text.trim()}`;
  }

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
        messages:   [{ role: 'user', content: userContent }],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('[import] Anthropic error:', err);
      return NextResponse.json({ error: 'AI parsing failed' }, { status: 502 });
    }

    const data  = await res.json();
    const raw   = data.content?.[0]?.text ?? '';
    const clean = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();

    let parsed: any;
    try {
      parsed = JSON.parse(clean);
    } catch {
      console.error('[import] JSON parse failed:', clean.slice(0, 200));
      return NextResponse.json({ error: 'Could not parse AI response as JSON' }, { status: 500 });
    }

    if (!parsed.title || !Array.isArray(parsed.ingredients) || !Array.isArray(parsed.groups)) {
      return NextResponse.json({ error: 'Incomplete recipe structure returned' }, { status: 500 });
    }

    return NextResponse.json({ recipe: parsed });

  } catch (err: any) {
    console.error('[import]', err);
    return NextResponse.json({ error: err.message ?? 'Import failed' }, { status: 500 });
  }
}
