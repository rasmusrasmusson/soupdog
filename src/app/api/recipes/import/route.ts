// src/app/api/recipes/import/route.ts
// POST — parse pasted recipe text into RecipeFormData using Claude
// Returns structured JSON ready to pre-fill the recipe editor

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

BAD (too coarse):
  instruction: "Whisk eggs with cheese and black pepper"
  (this is: add eggs to bowl, add cheese, add pepper, whisk)

GOOD (atomic):
  step 1: instruction: "Crack eggs into bowl", ingredient: eggs 4 piece, tool: mixing bowl
  step 2: instruction: "Add Pecorino Romano to bowl", ingredient: Pecorino Romano 100g, tool: mixing bowl
  step 3: instruction: "Add black pepper", ingredient: black pepper to taste, tool: mixing bowl
  step 4: instruction: "Whisk until combined", tool: whisk, taskFamily: mix, duration: 2

Each instruction should be SHORT and SPECIFIC:
- Start with a verb: Add, Fill, Heat, Stir, Whisk, Drain, Rest, etc.
- Reference the ingredient and/or tool: "Add garlic to pan", "Simmer for 10 minutes"
- Never combine two actions in one instruction

IMPORTANT:
- Include ALL ingredients even implied ones (water, oil for pan, salt for pasta water)
- Every step must have an instruction
- Extract all tools used (pot, pan, knife, bowl, whisk, grater, colander, etc.)
- duration 0 means duration unknown — estimate if obvious

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
          "instruction": "Short atomic action e.g. Add spaghetti to boiling water",
          "durationMinutes": number,
          "temperatureCelsius": number or null,
          "taskFamily": "cut" | "move" | "heat_dry" | "heat_wet" | "heat_machine" | "mix" | "passive" | "prepare" | "finish",
          "stepIngredients": ["ingredient name"],
          "stepTools": ["large pot"]  // REQUIRED — always include at least one tool per step. Use [] only for purely mental steps like tasting.
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

TOOL NAMING RULES — critical for the system to track physical tools:
stepTools is REQUIRED for almost every step. Steps without tools are rare (only mental actions like tasting).
Before writing steps, decide which physical tools are used and assign them consistent names.
Use the EXACT SAME string every time a step uses the same physical tool.

EXAMPLE — correct tool assignment for pasta:
step: "Fill large pot with water"     → stepTools: ["large pot"]
step: "Add salt to water"             → stepTools: ["large pot"]  // same pot!
step: "Bring water to a boil"         → stepTools: ["large pot"]  // same pot!
step: "Add spaghetti to boiling water"→ stepTools: ["large pot"]  // same pot!
step: "Crack eggs into mixing bowl"   → stepTools: ["mixing bowl"]
step: "Whisk eggs and cheese"         → stepTools: ["mixing bowl", "whisk"]
step: "Fry guanciale"                 → stepTools: ["frying pan"]

Examples of consistent naming:
- One pot used throughout: every step says "large pot" (not "pot" sometimes and "large pot" other times)
- Two pots: name them "large pot" and "small pot" and use those exact strings consistently
- Two bowls: "large mixing bowl" and "small bowl"
- One pan: "frying pan" throughout

Common tool names to use: "large pot", "small pot", "frying pan", "large mixing bowl", "small bowl",
"whisk", "chef's knife", "colander", "grater", "wooden spoon", "spatula", "ladle", "baking tray"

Never vary spelling or add/remove words between steps for the same tool.`;

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
        max_tokens: 6000,
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
