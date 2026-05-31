// src/app/api/admin/backfill-nutrition/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

// Allow long-running cron drains (Pro plan supports up to 300s).
export const maxDuration = 300;

// Service-role client: server-only, bypasses RLS. Used for the actual writes,
// because the cron has no user session and RLS blocks anon-key UPDATEs on
// the ingredients table. Never import this anywhere that runs in the browser.
function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set — cannot write past RLS');
  }
  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// ── Auth: allowed if EITHER the Vercel Cron secret is present
//    (Authorization: Bearer <CRON_SECRET>) OR a logged-in user (console path).
async function authorize(req: NextRequest): Promise<NextResponse | null> {
  const secret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization');
  if (secret && authHeader === `Bearer ${secret}`) return null;

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) return null;

  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

// Coerce one parsed nutrition value into a clean object, or null if unusable.
// Tolerant of string numbers and zero-calorie-but-other-macros cases.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeNutrition(raw: any): Record<string, number> | null {
  if (!raw || typeof raw !== 'object') return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  return anyValue ? out : null;
}

async function runBatch(): Promise<{ updated: number; skipped: number; remaining: number }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = serviceClient() as any;

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  } catch {
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
      // Update by primary key (id) via the service-role client — bypasses RLS.
      const { error } = await db.from('ingredients')
        .update({ nutrition_per_100g: nutrition })
        .eq('id', ing.id);
      if (error) {
        console.error('[backfill] update failed for', ing.name, error.message);
        skipped++;
        skippedNames.push(ing.name);
      } else {
        updated++;
      }
    } else {
      skipped++;
      skippedNames.push(ing.name);
    }
  }

  if (skippedNames.length > 0) {
    console.warn('[backfill] skipped (no usable nutrition or write error):', skippedNames);
  }

  const { count } = await db
    .from('ingredients')
    .select('*', { count: 'exact', head: true })
    .is('nutrition_per_100g', null)
    .eq('is_product', false);

  return { updated, skipped, remaining: count ?? 0 };
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
      // Stall guard: a batch that fills nothing means the rest are un-fillable
      // (legit nulls like goraka) — stop rather than loop on them forever.
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
