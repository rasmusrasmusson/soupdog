// src/app/api/recipes/[id]/scale/route.ts
// POST { versionId, targetServings } → execution_variant with AI-scaled quantities

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

interface ScaleRequest {
  versionId:      string;
  targetServings: number;
}

interface ScaledIngredient {
  ingredientId:   string;
  name:           string;
  originalValue:  number;
  originalUnit:   string;
  scaledValue:    number;
  scaledUnit:     string;
  scalingNote:    string | null;  // why this wasn't scaled linearly
}

interface ScaleResponse {
  variantId:        string;
  baseServings:     number;
  targetServings:   number;
  scalingFactor:    number;
  divergenceScore:  number;       // 0–1: how different is this from the base recipe
  methodChanges:    boolean;      // true if the method itself needs to change at this scale
  methodNote:       string | null;
  ingredients:      ScaledIngredient[];
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: canonicalId } = await context.params;
  const { versionId, targetServings }: ScaleRequest = await req.json();

  if (!versionId || !targetServings || targetServings < 1) {
    return NextResponse.json({ error: 'versionId and targetServings required' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const db = supabase as any;

  // ── Load base version data ────────────────────────────────────────
  const { data: version, error: vErr } = await db
    .from('recipe_versions')
    .select('id, title, base_servings, cuisine, difficulty')
    .eq('id', versionId)
    .single();

  if (vErr || !version) {
    return NextResponse.json({ error: 'Version not found' }, { status: 404 });
  }

  const baseServings: number = version.base_servings ?? 4;
  const scalingFactor = targetServings / baseServings;

  // Check for existing variant with this serving count (cache)
  const { data: existing } = await db
    .from('execution_variants')
    .select('id, variant_ingredient_scaling, ai_scaling_metadata')
    .eq('version_id', versionId)
    .eq('servings', targetServings)
    .maybeSingle();

  if (existing?.variant_ingredient_scaling) {
    return NextResponse.json({
      variantId:       existing.id,
      baseServings,
      targetServings,
      scalingFactor,
      divergenceScore: existing.ai_scaling_metadata?.divergenceScore ?? 0,
      methodChanges:   existing.ai_scaling_metadata?.methodChanges   ?? false,
      methodNote:      existing.ai_scaling_metadata?.methodNote       ?? null,
      ingredients:     existing.variant_ingredient_scaling,
      cached:          true,
    });
  }

  // ── Load ingredients ──────────────────────────────────────────────
  const { data: vIngredients, error: viErr } = await db
    .from('version_ingredients')
    .select(`
      id, quantity_value, quantity_unit, prep_note,
      ingredients!ingredient_id ( id, name, category )
    `)
    .eq('version_id', versionId)
    .order('order_index');

  if (viErr) {
    return NextResponse.json({ error: viErr.message }, { status: 500 });
  }

  const ingredients = (vIngredients ?? []).map((vi: any) => ({
    ingredientId:  vi.ingredients?.id   ?? '',
    name:          vi.ingredients?.name ?? 'unknown',
    category:      vi.ingredients?.category ?? 'other',
    originalValue: vi.quantity_value ?? 0,
    originalUnit:  vi.quantity_unit  ?? 'g',
  }));

  if (ingredients.length === 0) {
    return NextResponse.json({ error: 'No ingredients found for this version' }, { status: 404 });
  }

  // ── Call Anthropic API ────────────────────────────────────────────
  const prompt = buildScalingPrompt(
    version.title,
    version.cuisine,
    baseServings,
    targetServings,
    scalingFactor,
    ingredients
  );

  let aiResult: any;
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY ?? '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-6',
        max_tokens: 2000,
        system: `You are a professional chef and food scientist specialising in recipe scaling.
You understand that many ingredients do not scale linearly:
- Salt and seasoning: typically 0.75–0.85x the linear amount
- Spices and aromatics: typically 0.65–0.80x
- Leavening agents (baking powder, yeast): typically 0.75–0.85x
- Fats and oils: typically 0.85–0.95x
- Sugar in baking: typically 0.85–0.95x
- Water/liquid in doughs: may need adjusting for hydration ratios
- Liquids in sauces: typically 0.9–0.95x
- Proteins (meat, fish): typically 1.0x (linear)
- Vegetables: typically 1.0x (linear)
- Garnishes and finishing elements: typically 0.5–0.7x

At very large scales (>10x), consider whether:
- The cooking method itself changes (e.g. single pan → multiple pans or commercial equipment)
- Timing changes significantly
- Equipment constraints apply

Respond ONLY with valid JSON. No markdown, no explanation outside the JSON.`,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('[scale] Anthropic API error:', err);
      return NextResponse.json({ error: 'AI scaling service unavailable', detail: err, anthropicStatus: response.status }, { status: 502 });
    }

    const data = await response.json();
    const raw  = data.content?.find((b: any) => b.type === 'text')?.text ?? '';

    // Strip any accidental markdown fences
    const clean = raw.replace(/```json|```/g, '').trim();
    aiResult = JSON.parse(clean);
  } catch (err: any) {
    console.error('[scale] Parse error:', err);
    return NextResponse.json({ error: 'Failed to parse AI scaling response' }, { status: 500 });
  }

  // ── Build scaled ingredient list ──────────────────────────────────
  const scaledIngredients: ScaledIngredient[] = ingredients.map((ing: any) => {
    const aiIng = aiResult.ingredients?.find(
      (a: any) => a.ingredientId === ing.ingredientId || a.name === ing.name
    );

    const scaledValue = aiIng?.scaledValue ?? roundQty(ing.originalValue * scalingFactor);
    const scaledUnit  = aiIng?.scaledUnit  ?? ing.originalUnit;
    const scalingNote = aiIng?.scalingNote ?? null;

    return {
      ingredientId:  ing.ingredientId,
      name:          ing.name,
      originalValue: ing.originalValue,
      originalUnit:  ing.originalUnit,
      scaledValue,
      scaledUnit,
      scalingNote,
    };
  });

  const divergenceScore: number = aiResult.divergenceScore ?? estimateDivergence(scalingFactor);
  const methodChanges:   boolean = aiResult.methodChanges   ?? scalingFactor > 6;
  const methodNote:      string | null = aiResult.methodNote ?? null;

  // ── Persist as execution_variant ─────────────────────────────────
  const aiMeta = { divergenceScore, methodChanges, methodNote, scalingFactor };

  let variantId: string;
  try {
    const { data: variant, error: insertErr } = await db
      .from('execution_variants')
      .insert({
        version_id:                versionId,
        servings:                  targetServings,
        unit_system:               'si',
        is_canonical_variant:      false,
        author_id:                 user?.id ?? null,
        variant_ingredient_scaling: scaledIngredients,
        ai_scaling_metadata:        aiMeta,
      })
      .select('id')
      .single();

    if (insertErr) {
      // Column may not exist yet — fall through without persisting
      console.warn('[scale] Could not persist variant:', insertErr.message);
      variantId = 'ephemeral-' + Date.now();
    } else {
      variantId = variant.id;
    }
  } catch {
    variantId = 'ephemeral-' + Date.now();
  }

  const result: ScaleResponse = {
    variantId,
    baseServings,
    targetServings,
    scalingFactor,
    divergenceScore,
    methodChanges,
    methodNote,
    ingredients: scaledIngredients,
  };

  return NextResponse.json(result);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildScalingPrompt(
  title:         string,
  cuisine:       string | null,
  baseServings:  number,
  targetServings: number,
  scalingFactor: number,
  ingredients:   { ingredientId: string; name: string; category: string; originalValue: number; originalUnit: string }[]
): string {
  const ingList = ingredients.map(i =>
    `  { "ingredientId": "${i.ingredientId}", "name": "${i.name}", "category": "${i.category}", "originalValue": ${i.originalValue}, "originalUnit": "${i.originalUnit}" }`
  ).join(',\n');

  return `Scale this recipe from ${baseServings} to ${targetServings} servings (factor: ${scalingFactor.toFixed(2)}x).

Recipe: "${title}"${cuisine ? ` (${cuisine})` : ''}

Ingredients to scale:
[
${ingList}
]

Return JSON in exactly this shape:
{
  "ingredients": [
    {
      "ingredientId": "<same id as input>",
      "name": "<same name>",
      "scaledValue": <number, rounded sensibly>,
      "scaledUnit": "<unit, may change e.g. g→kg at large scale>",
      "scalingNote": "<one short sentence explaining non-linear adjustment, or null if scaled linearly>"
    }
  ],
  "divergenceScore": <0.0–1.0, where 0=identical method, 1=completely different dish>,
  "methodChanges": <true if the cooking method itself needs to change at this scale>,
  "methodNote": "<one sentence describing the method change, or null>"
}`;
}

function roundQty(v: number): number {
  if (v === 0) return 0;
  if (v < 1)   return Math.round(v * 100) / 100;
  if (v < 10)  return Math.round(v * 10)  / 10;
  if (v < 100) return Math.round(v);
  return Math.round(v / 5) * 5;
}

function estimateDivergence(factor: number): number {
  // Rough heuristic if AI doesn't return one
  if (factor <= 2)  return 0.05;
  if (factor <= 4)  return 0.10;
  if (factor <= 8)  return 0.25;
  if (factor <= 16) return 0.45;
  return 0.70;
}
