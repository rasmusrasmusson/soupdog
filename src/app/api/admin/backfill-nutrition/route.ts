// src/app/api/admin/backfill-nutrition/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

export const maxDuration = 300;

// Sentinel written when the model declines to estimate an item (genuine
// non-foods like goraka/pasta water). It is truthy JSON, so the row drops out
// of the `nutrition_per_100g IS NULL` queue and is never re-processed.
const UNESTIMABLE = { estimated: false } as const;

// Service-role client: server-only, bypasses RLS.
// We set BOTH the apikey and Authorization headers explicitly to the secret
// key. RLS bypass is decided by the Authorization header, and in some setups
// the default header isn't applied as expected — forcing it here guarantees
// the request runs as the service_role (BYPASSRLS) role.
function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set — cannot write past RLS');
  // Log a non-secret fingerprint so we can confirm the right key is loaded
  // without exposing it: prefix + length.
  console.log('[backfill] service key prefix:', key.slice(0, 10), 'len:', key.length);
  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${key}`, apikey: key } },
  });
}

async function authorize(req: NextRequest): Promise<NextResponse | null> {
  const secret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization');
  if (secret && authHeader === `Bearer ${secret}`) return null;

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) return null;

  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

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

// Returns counts for this batch. `processed` = rows that left the NULL queue
// this batch (filled OR marked unestimable). When processed === 0 the queue
// genuinely isn't shrinking and the caller should stop.
async function runBatch(): Promise<{ filled: number; marked: number; processed: number; remaining: number }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = serviceClient() as any;

  const { data: ingredients, error: selErr } = await db
    .from('ingredients')
    .select('id, name')
    .is('nutrition_per_100g', null)
    .eq('is_product', false)
    .limit(30);

  console.log('[backfill] null-ingredient SELECT — count:', ingredients?.length ?? 0, 'error:', selErr?.message ?? 'none');

  if (!ingredients?.length) {
    return { filled: 0, marked: 0, processed: 0, remaining: 0 };
  }

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

  if (!res.ok) throw new Error(`Anthropic API returned ${res.status}`);

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

  let filled = 0;
  let marked = 0;

  for (let i = 0; i < unique.length; i++) {
    const ing = unique[i];
    const nutrition = normalizeNutrition(nutritionMap[String(i + 1)]);

    if (nutrition) {
      const { error } = await db.from('ingredients')
        .update({ nutrition_per_100g: nutrition })
        .eq('id', ing.id);
      if (error) console.error('[backfill] update failed for', ing.name, error.message);
      else filled++;
    } else {
      // Model declined — mark unestimable so it leaves the queue permanently.
      const { error } = await db.from('ingredients')
        .update({ nutrition_per_100g: UNESTIMABLE })
        .eq('id', ing.id);
      if (error) console.error('[backfill] mark failed for', ing.name, error.message);
      else { marked++; console.warn('[backfill] marked unestimable:', ing.name); }
    }
  }

  const { count } = await db
    .from('ingredients')
    .select('*', { count: 'exact', head: true })
    .is('nutrition_per_100g', null)
    .eq('is_product', false);

  return { filled, marked, processed: filled + marked, remaining: count ?? 0 };
}

export async function POST(req: NextRequest) {
  const denied = await authorize(req);
  if (denied) return denied;

  try {
    const result = await runBatch();
    if (result.processed === 0 && result.remaining === 0) {
      return NextResponse.json({ message: 'All done — no ingredients need backfilling', count: 0 });
    }
    return NextResponse.json({ message: 'Backfill batch complete', ...result });
  } catch (e) {
    return NextResponse.json({ error: 'API call failed', detail: String(e) }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const denied = await authorize(req);
  if (denied) return denied;

  const MAX_BATCHES = 20;
  let batches = 0;
  let totalFilled = 0;
  let totalMarked = 0;
  let remaining = 0;

  try {
    while (batches < MAX_BATCHES) {
      const result = await runBatch();
      batches++;
      totalFilled += result.filled;
      totalMarked += result.marked;
      remaining = result.remaining;

      if (remaining === 0) break;
      // Stop only if the queue genuinely didn't shrink this batch (nothing was
      // filled AND nothing was marked) — every row now either fills or gets a
      // sentinel, so processed === 0 means no progress is possible.
      if (result.processed === 0) break;
    }

    return NextResponse.json({
      message: 'Cron backfill complete',
      batches, filled: totalFilled, marked: totalMarked, remaining,
    });
  } catch (e) {
    return NextResponse.json({
      message: 'Cron backfill stopped early',
      batches, filled: totalFilled, marked: totalMarked, remaining,
      detail: String(e),
    }, { status: 200 });
  }
}
