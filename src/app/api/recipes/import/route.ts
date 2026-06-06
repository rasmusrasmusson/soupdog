// src/app/api/recipes/import/route.ts
// POST — parse recipe from text, image, PDF, Word (.docx) or Excel (.xlsx)
// Accepts: { text } OR { file: base64string, mediaType: string }
// .docx/.xlsx are extracted to text server-side, then run through the text path.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { aiMessage } from '@/lib/ai/anthropic';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const XLS_MIME  = 'application/vnd.ms-excel';

// Pull readable text out of a Word doc (base64) so the existing text path can
// parse it. mammoth returns plain text; structure is recovered by the AI step.
async function extractDocx(base64: string): Promise<string> {
  const buffer = Buffer.from(base64, 'base64');
  const { value } = await mammoth.extractRawText({ buffer });
  return value;
}

// Pull text from a spreadsheet (base64): every sheet → CSV, concatenated.
// Recipes pasted into Excel are usually a column of ingredients + a column of
// steps; CSV preserves enough for the AI step to structure it.
function extractXlsx(base64: string): string {
  const buffer = Buffer.from(base64, 'base64');
  const wb = XLSX.read(buffer, { type: 'buffer' });
  return wb.SheetNames
    .map((name) => {
      const csv = XLSX.utils.sheet_to_csv(wb.Sheets[name]);
      return wb.SheetNames.length > 1 ? `# Sheet: ${name}\n${csv}` : csv;
    })
    .join('\n\n')
    .trim();
}

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

  let userContent: any;

  if (file && mediaType) {
    const isPdf   = mediaType === 'application/pdf';
    const isImage = mediaType.startsWith('image/');
    const isDocx  = mediaType === DOCX_MIME;
    const isXlsx  = mediaType === XLSX_MIME || mediaType === XLS_MIME;
    if (!isPdf && !isImage && !isDocx && !isXlsx) {
      return NextResponse.json({ error: 'Unsupported file type. Use PDF, image, Word, or Excel.' }, { status: 400 });
    }
    if (isPdf) {
      userContent = [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: file } },
        { type: 'text', text: 'Parse the recipe from this document.' },
      ];
    } else if (isImage) {
      userContent = [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: file } },
        { type: 'text', text: 'Parse the recipe from this image.' },
      ];
    } else {
      // Word / Excel: extract to text, then use the same text path as below.
      let extracted = '';
      try {
        extracted = isDocx ? await extractDocx(file) : extractXlsx(file);
      } catch (e: any) {
        console.error('[import] extract failed:', e?.message);
        return NextResponse.json({ error: 'Could not read that file. It may be corrupt or password-protected.' }, { status: 400 });
      }
      if (!extracted.trim()) {
        return NextResponse.json({ error: 'No readable text found in that file.' }, { status: 400 });
      }
      if (extracted.length > 20000) extracted = extracted.slice(0, 20000);
      userContent = `Parse this recipe:\n\n${extracted.trim()}`;
    }
  } else {
    if (text.length > 20000) {
      return NextResponse.json({ error: 'text too long (max 20000 chars)' }, { status: 400 });
    }
    userContent = `Parse this recipe:\n\n${text.trim()}`;
  }

  try {
    const result = await aiMessage({
      model:      'claude-sonnet-4-6',
      feature:    'import_parse',
      accountId:  user.id,
      max_tokens: 8000,
      system:     SYSTEM_PROMPT,
      messages:   [{ role: 'user', content: userContent }],
    });

    if (!result.ok) {
      console.error('[import] Anthropic error:', result.errorText);
      return NextResponse.json({ error: 'AI parsing failed' }, { status: 502 });
    }

    const data  = result.data;
    const raw   = data.content?.[0]?.text ?? '';
    // Robust extraction: strip code fences, then take the outermost { ... } so a
    // stray preamble/sentence from the model can't break JSON.parse.
    let clean = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
    const firstBrace = clean.indexOf('{');
    const lastBrace  = clean.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      clean = clean.slice(firstBrace, lastBrace + 1);
    }

    let parsed: any;
    try {
      parsed = JSON.parse(clean);
    } catch {
      // Log enough to diagnose truncation vs. malformed vs. wrapped.
      console.error('[import] JSON parse failed. rawLen=%d, tail=%j', raw.length, raw.slice(-200));
      return NextResponse.json({
        error: 'We had trouble reading that recipe. Please try again.',
        retryable: true,
      }, { status: 502 });
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
