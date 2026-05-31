// src/app/api/admin/backfill-nutrition/route.ts
// One-time backfill — call this once to add nutrition to all ingredients missing it
// Protected: only callable by authenticated users

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

async function estimateNutrition(name: string): Promise<any | null> {
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
        max_tokens: 300,
        messages: [{
          role: 'user',
          content: `Estimate USDA nutrition per 100g for "${name}" (raw/uncooked unless it's a processed food). Respond with ONLY a JSON object, no markdown:\n{"calories":number,"protein":number,"fat":number,"saturated_fat":number,"carbohydrates":number,"sugar":number,"fiber":number,"sodium":number}`,
        }],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text = data.content?.[0]?.text ?? '';
    const clean = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
    return JSON.parse(clean);
  } catch { return null; }
}

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = supabase as any;

  // Get all ingredients with no nutrition data
  const { data: ingredients } = await db
    .from('ingredients')
    .select('id, name')
    .is('nutrition_per_100g', null)
    .eq('is_product', false)
    .limit(100); // Process 100 at a time

  if (!ingredients?.length) {
    return NextResponse.json({ message: 'No ingredients need backfilling', count: 0 });
  }

  let updated = 0;
  let failed = 0;

  for (const ing of ingredients) {
    const nutrition = await estimateNutrition(ing.name);
    if (nutrition) {
      await db.from('ingredients')
        .update({ nutrition_per_100g: nutrition })
        .eq('id', ing.id);
      updated++;
    } else {
      failed++;
    }
    // Small delay to avoid rate limits
    await new Promise(r => setTimeout(r, 100));
  }

  return NextResponse.json({
    message: `Backfill complete`,
    updated,
    failed,
    remaining: ingredients.length === 100 ? 'more than 100 remaining — call again' : 'none',
  });
}
