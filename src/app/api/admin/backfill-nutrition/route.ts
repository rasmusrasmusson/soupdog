// src/app/api/admin/backfill-nutrition/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Allow long-running cron drains (Pro plan supports up to 300s).
export const maxDuration = 300;

// ── Auth: a request is allowed if EITHER
//    (a) it carries the Vercel Cron secret  (Authorization: Bearer <CRON_SECRET>), OR
//    (b) it comes from a logged-in user     (existing browser-console path).
// Returns null if authorized, or a NextResponse to short-circuit if not.
async function authorize(req: NextRequest): Promise<NextResponse | null> {
  const secret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization');
  if (secret && authHeader === `Bearer ${secret}`) {
    return null; // valid cron call
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) return null; // valid logged-in user

  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

// Process a single batch of up to 30 ingredients. Returns the batch result.
async function runBatch(): Promise<{ updated: number; skipped: number; remaining: number }> {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  // Get ingredients missing nutrition — skip obvious non-foods and duplicates
  const { data: ingredients } = await db
    .from('ingredients')
    .select('id, name')
    .is('nutrition_per_100g', null)
    .eq('is_product', false)
    .limit(30);

  if (!ingredients?.length) {
    return { updated: 0, skipped: 0, remaining: 0 };
  }

  // Deduplicate by name (case-insensitive)
  const seen = new Set<string>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const unique = ingredients.filter((ing: any) => {
    const key = ing.name.toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Single batched API call for all ingredients at once
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nameList = unique.map((ing: any, i: number) => `${i + 1}. ${ing.name}`).join('\n');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let nutritionMap: Record<string, any> = {};
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
  } else {
    // Surface the failure so the caller can stop the loop.
    throw new Error(`Anthropic API returned ${res.status}`);
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

  return { updated, skipped, remaining: count ?? 0 };
}

// POST — single batch. Preserves the original browser-console behaviour:
//   fetch('/api/admin/backfill-nutrition', { method: 'POST' }).then(r => r.json()).then(console.log)
export async function POST(req: NextRequest) {
  const denied = await authorize(req);
  if (denied) return denied;

  try {
    const result = await runBatch();
    if (result.updated === 0 && result.skipped === 0 && result.remaining === 0) {
      return NextResponse.json({ message: 'All done — no ingredients need backfilling', count: 0 });
    }
    return NextResponse.json({ message: 'Backfill batch complete', ...result });
  } catch (e) {
    return NextResponse.json({ error: 'API call failed', detail: String(e) }, { status: 500 });
  }
}

// GET — cron entry point. Drains the queue by running batches until empty,
// with a safety cap so a single invocation can't run forever. Skipped items
// (legit non-foods that resolve to null) are excluded from the cap check via
// a stall guard: if a batch makes no progress, we stop.
export async function GET(req: NextRequest) {
  const denied = await authorize(req);
  if (denied) return denied;

  const MAX_BATCHES = 20; // 20 × 30 = up to 600 ingredients per invocation
  let batches = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;
  let remaining = 0;

  try {
    while (batches < MAX_BATCHES) {
      const result = await runBatch();
      batches++;
      totalUpdated += result.updated;
      totalSkipped += result.skipped;
      remaining = result.remaining;

      // Nothing left, or this batch only produced un-fillable (skipped) rows —
      // stop to avoid looping forever on items that always resolve to null.
      if (remaining === 0) break;
      if (result.updated === 0) break;
    }

    return NextResponse.json({
      message: 'Cron backfill complete',
      batches,
      updated: totalUpdated,
      skipped: totalSkipped,
      remaining,
    });
  } catch (e) {
    // Likely a rate limit or transient API error — report partial progress.
    return NextResponse.json({
      message: 'Cron backfill stopped early',
      batches,
      updated: totalUpdated,
      skipped: totalSkipped,
      remaining,
      detail: String(e),
    }, { status: 200 });
  }
}
