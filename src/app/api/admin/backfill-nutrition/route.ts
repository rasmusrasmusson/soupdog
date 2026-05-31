// src/app/api/admin/backfill-nutrition/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Allow long-running cron drains (Pro plan supports up to 300s).
export const maxDuration = 300;

// ── Auth: allowed if EITHER the Vercel Cron secret is present
//    (Authorization: Bearer <CRON_SECRET>) OR a logged-in user (console path).
async function authorize(req: NextRequest): Promise<NextResponse | null> {
  const secret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization');
  if (secret && authHeader === `Bearer ${secret}`) return null;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) return null;

  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

// Coerce one parsed nutrition value into a clean object, or null if it's
// genuinely not usable. Tolerant of:
//   - string numbers ("320")
//   - missing/zero calories but other macros present (e.g. low-cal foods)
//   - the value being wrapped or having stray keys
function normalizeNutrition(raw: any): Record<string, number> | null {
  if (!raw || typeof raw !== 'object') return null;
  const num = (v: any): number | null => {
    if (v === null || v === undefined) return null;
    const n = typeof v === 'string' ? parseFloat(v) : Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const keys = ['calories', 'protein', 'fat', 'saturated_fat', 'carbohydrates', 'sugar', 'fiber', 'sodium'];
  const out: Record<string, number> = {};
  let anyValue = false;
  for (const k of keys) {
    const n = num(raw[k]);
    if (n !== null) { out[k] = n; anyValue = true; }
  }
  // Accept the estimate if ANY macro came back, not only calories.
  // (Old code required truthy calories, which silently dropped valid rows.)
  return anyValue ? out : null;
}

async function runBatch(): Promise<{ updated: number; skipped: number; remaining: number; debug?: any }> {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

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

  const nameList = unique.map((ing: any, i: number) => `${i + 1}. ${ing.name}`).join('\n');

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

  if (!res.ok) {
    throw new Error(`Anthropic API returned ${res.status}`);
  }

  const data = await res.json();
  const text = data.content?.[0]?.text ?? '';
  const clean = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let nutritionMap: Record<string, any> = {};
  try {
    nutritionMap = JSON.parse(clean);
  } catch (e) {
    // Log the raw text so we can see exactly what came back if parsing fails.
    console.error('[backfill] JSON parse failed. Raw text:', text);
    throw new Error('Failed to parse nutrition JSON');
  }

  let updated = 0;
  let skipped = 0;
  const skippedNames: string[] = [];

  for (let i = 0; i < unique.length; i++) {
    const ing = unique[i];
    const raw = nutritionMap[String(i + 1)];
    const nutrition = normalizeNutrition(raw);

    if (nutrition) {
      await db.from('ingredients')
        .update({ nutrition_per_100g: nutrition })
        .ilike('name', ing.name.trim())
        .eq('is_product', false);
      updated++;
    } else {
      skipped++;
      skippedNames.push(ing.name);
    }
  }

  // Log what was skipped and what the model returned for them — this is how we
  // diagnose any item that won't fill (e.g. kithul treacle).
  if (skippedNames.length > 0) {
    console.warn('[backfill] skipped (no usable nutrition):', skippedNames);
    console.warn('[backfill] raw map for skipped:', JSON.stringify(
      skippedNames.map((n) => {
        const idx = unique.findIndex((u: any) => u.name === n);
        return { name: n, index: idx + 1, raw: nutritionMap[String(idx + 1)] };
      })
    ));
  }

  const { count } = await db
    .from('ingredients')
    .select('*', { count: 'exact', head: true })
    .is('nutrition_per_100g', null)
    .eq('is_product', false);

  return { updated, skipped, remaining: count ?? 0, debug: { skippedNames } };
}

// POST — single batch. Preserves the browser-console behaviour.
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

// GET — cron entry point. Drains the queue, with a stall guard and batch cap.
export async function GET(req: NextRequest) {
  const denied = await authorize(req);
  if (denied) return denied;

  const MAX_BATCHES = 20;
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

      if (remaining === 0) break;
      // Stall guard: if a batch fills nothing, the rest are un-fillable
      // (legit nulls) — stop rather than loop forever on them.
      if (result.updated === 0) break;
    }

    return NextResponse.json({
      message: 'Cron backfill complete',
      batches, updated: totalUpdated, skipped: totalSkipped, remaining,
    });
  } catch (e) {
    return NextResponse.json({
      message: 'Cron backfill stopped early',
      batches, updated: totalUpdated, skipped: totalSkipped, remaining,
      detail: String(e),
    }, { status: 200 });
  }
}
