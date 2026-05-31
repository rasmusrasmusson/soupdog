// src/app/api/admin/backfill-nutrition/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = supabase as any;

  // Get ingredients missing nutrition — skip obvious non-foods and duplicates
  const { data: ingredients } = await db
    .from('ingredients')
    .select('id, name')
    .is('nutrition_per_100g', null)
    .eq('is_product', false)
    .limit(30);

  if (!ingredients?.length) {
    return NextResponse.json({ message: 'All done — no ingredients need backfilling', count: 0 });
  }

  // Deduplicate by name (case-insensitive)
  const seen = new Set<string>();
  const unique = ingredients.filter((ing: any) => {
    const key = ing.name.toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Single batched API call for all ingredients at once
  const nameList = unique.map((ing: any, i: number) => `${i + 1}. ${ing.name}`).join('\n');

  let nutritionMap: Record<string, any> = {};
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4000,
        messages: [{
          role: 'user',
          content: `Estimate USDA nutrition per 100g for each ingredient below. For non-food items like "pasta water" use null. Respond ONLY with a JSON object mapping each number to nutrition data or null:\n\n${nameList}\n\nFormat: {"1":{"calories":n,"protein":n,"fat":n,"saturated_fat":n,"carbohydrates":n,"sugar":n,"fiber":n,"sodium":n},"2":null,...}`,
        }],
      }),
    });

    if (res.ok) {
      const data = await res.json();
      const text = data.content?.[0]?.text ?? '';
      const clean = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
      nutritionMap = JSON.parse(clean);
    }
  } catch (e) {
    return NextResponse.json({ error: 'API call failed', detail: String(e) }, { status: 500 });
  }

  // Update each ingredient with its nutrition data
  let updated = 0;
  let skipped = 0;

  for (let i = 0; i < unique.length; i++) {
    const ing = unique[i];
    const nutrition = nutritionMap[String(i + 1)];

    if (nutrition && nutrition.calories) {
      // Update all rows with this name (handles duplicates)
      await db.from('ingredients')
        .update({ nutrition_per_100g: nutrition })
        .ilike('name', ing.name.trim())
        .eq('is_product', false);
      updated++;
    } else {
      skipped++;
    }
  }

  // Check how many still remain
  const { count } = await db
    .from('ingredients')
    .select('*', { count: 'exact', head: true })
    .is('nutrition_per_100g', null)
    .eq('is_product', false);

  return NextResponse.json({
    message: 'Backfill batch complete',
    updated,
    skipped,
    remaining: count ?? 0,
  });
}
