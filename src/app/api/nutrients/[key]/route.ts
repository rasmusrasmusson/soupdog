// src/app/api/nutrients/[key]/route.ts
// GET — data for one nutrient page. Public (reference data).
//
// Returns the nutrient's facts + editorial content (where present) + the live
// "ingredients richest in this nutrient" query over our resolved nutrition data
// (ingredient_nutrition_current). The richest-ingredients list is the unique value:
// generated from Soupdog's own ~205 USDA-matched ingredients, not a generic article.
//
// Honest about coverage: the ranking is over MATCHED ingredients only, and the page
// labels it as such.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(_: NextRequest, context: { params: Promise<{ key: string }> }) {
  const { key } = await context.params;
  const supabase = await createClient();
  const db = supabase as any;

  // 1. The nutrient itself (facts + content columns)
  const { data: nutrient, error } = await db
    .from('nutrient')
    .select('id, key, name, category, unit, display_order, summary, description, how_much, too_little, too_much, food_sources_note, tips, aliases, rda_reference, published, content_reviewed')
    .eq('key', key)
    .single();

  if (error || !nutrient) return NextResponse.json({ error: 'Nutrient not found' }, { status: 404 });

  // 2. Ingredients richest in this nutrient (live, over resolved nutrition).
  //    Pull rows for this nutrient_key, join real (non-product, non-archived)
  //    ingredients, rank by amount desc. Done in two steps because the view is keyed
  //    by ingredient_id and we want ingredient name/slug.
  const { data: valueRows } = await db
    .from('ingredient_nutrition_current')
    .select('ingredient_id, amount_per_100g')
    .eq('nutrient_key', key)
    .order('amount_per_100g', { ascending: false })
    .limit(60); // over-fetch; filter to real foods then take top N

  const ids = Array.from(new Set((valueRows ?? []).map((r: any) => r.ingredient_id)));
  let richest: { slug: string; name: string; amount: number }[] = [];
  if (ids.length) {
    const { data: ings } = await db
      .from('ingredients')
      .select('id, slug, name, is_product, is_category, archived_at')
      .in('id', ids);
    const byId = new Map<string, any>((ings ?? []).map((i: any) => [i.id, i]));
    richest = (valueRows ?? [])
      .map((r: any) => {
        const ing = byId.get(r.ingredient_id);
        if (!ing || ing.is_product || ing.is_category || ing.archived_at) return null;
        return { slug: ing.slug, name: ing.name, amount: Number(r.amount_per_100g) };
      })
      .filter(Boolean)
      .slice(0, 12) as { slug: string; name: string; amount: number }[];
  }

  return NextResponse.json({ nutrient, richest, unit: nutrient.unit });
}
