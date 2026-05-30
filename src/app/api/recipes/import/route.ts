// src/app/api/recipes/import/route.ts
// POST — parse pasted recipe text into RecipeFormData using Claude
// Returns structured JSON ready to pre-fill the recipe editor

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const SYSTEM_PROMPT = `You are a recipe parsing system for Soupdog, a structured food execution platform.

Parse the provided recipe text into structured JSON. Be precise with quantities and units.
All quantities should be in metric (grams, ml, celsius) where possible.
Duration should always be in minutes.
Temperature always in celsius.

Respond with ONLY a valid JSON object, no markdown, no backticks, no explanation.

The JSON structure:
{
  "title": "Recipe title",
  "description": "1-2 sentence description",
  "cuisine": "e.g. Italian, Japanese, Indian, or null",
  "difficulty": "easy" | "medium" | "hard",
  "servings": number,
  "totalTimeMinutes": number,
  "activeTimeMinutes": number | null,
  "tags": ["tag1", "tag2"],
  "ingredients": [
    {
      "name": "ingredient name",
      "quantityValue": number,
      "quantityUnit": "g" | "ml" | "tsp" | "tbsp" | "cup" | "piece" | "clove" | "slice" | "pinch" | "bunch" | "to taste",
      "prepNote": "chopped, diced, etc. or null",
      "optional": false
    }
  ],
  "groups": [
    {
      "outputName": "e.g. Sauce, Dough, or empty string for single-group recipes",
      "steps": [
        {
          "instruction": "Clear step instruction",
          "durationMinutes": number or 0 if not specified,
          "taskFamily": "cut" | "move" | "heat_dry" | "heat_wet" | "heat_machine" | "mix" | "passive" | "prepare" | "finish",
          "stepIngredients": ["ingredient name 1", "ingredient name 2"]
        }
      ]
    }
  ]
}

Task family guide:
- cut: chopping, slicing, dicing, peeling, mincing
- move: pouring, transferring, straining, draining, plating
- heat_dry: roasting, searing, frying, grilling, toasting, baking
- heat_wet: boiling, simmering, steaming, poaching, blanching
- heat_machine: oven, microwave, air fryer, sous vide
- mix: stirring, whisking, folding, kneading, blending, mixing
- passive: resting, marinating, fermenting, proofing, chilling, soaking
- prepare: measuring, weighing, seasoning, washing, preheating
- finish: plating, garnishing, serving, dressing

For stepIngredients, only list ingredient names that are actively used in that specific step.
Groups should reflect natural recipe sections (e.g. "Sauce", "Pasta", "Assembly").
Single-section recipes should have one group with an empty outputName.`;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { text } = await req.json();
  if (!text?.trim()) return NextResponse.json({ error: 'text required' }, { status: 400 });
  if (text.length > 20000) return NextResponse.json({ error: 'text too long (max 20000 chars)' }, { status: 400 });

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
        max_tokens: 4000,
        system:     SYSTEM_PROMPT,
        messages: [{ role: 'user', content: `Parse this recipe:\n\n${text.trim()}` }],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('[import] Anthropic error:', err);
      return NextResponse.json({ error: 'AI parsing failed' }, { status: 502 });
    }

    const data = await res.json();
    const raw  = data.content?.[0]?.text ?? '';

    // Strip any accidental markdown fences
    const clean = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();

    let parsed: any;
    try {
      parsed = JSON.parse(clean);
    } catch {
      console.error('[import] JSON parse failed:', clean.slice(0, 200));
      return NextResponse.json({ error: 'Could not parse AI response as JSON' }, { status: 500 });
    }

    // Basic validation
    if (!parsed.title || !Array.isArray(parsed.ingredients) || !Array.isArray(parsed.groups)) {
      return NextResponse.json({ error: 'Incomplete recipe structure returned' }, { status: 500 });
    }

    return NextResponse.json({ recipe: parsed });

  } catch (err: any) {
    console.error('[import]', err);
    return NextResponse.json({ error: err.message ?? 'Import failed' }, { status: 500 });
  }
}
