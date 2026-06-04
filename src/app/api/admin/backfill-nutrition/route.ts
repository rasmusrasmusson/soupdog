// src/app/api/admin/backfill-nutrition/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { logAiUsage } from '@/lib/ai/anthropic';

export const maxDuration = 300;

// Sentinel written when the model declines to estimate an item (genuine
// non-foods like goraka/pasta water) OR when we can't recover a usable estimate
// for it from a malformed response. It is truthy JSON, so the row drops out of
// the `nutrition_per_100g IS NULL` queue and is never re-processed. Marking
// rather than leaving NULL is what guarantees the queue always drains — a
// permanently-unparseable item can never loop forever.
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

// Strip markdown fences and surrounding prose, leaving the JSON object.
function stripToJson(text: string): string {
  let s = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
  // If there's leading/trailing chatter, keep from the first { to the last }.
  const first = s.indexOf('{');
  const last = s.lastIndexOf('}');
  if (first !== -1 && last !== -1 && last > first) s = s.slice(first, last + 1);
  return s;
}

// Per-item salvage: when the whole-object JSON.parse fails (one bad entry, a
// stray token, an unterminated value), recover each `"N": <value>` entry
// independently so good items still land. Returns a map of index→parsed-value.
// Unrecoverable entries are simply absent from the map (caller marks them).
function salvageEntries(jsonish: string, count: number): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (let i = 1; i <= count; i++) {
    // Find `"i":` and then take a balanced {...} object or the literal null.
    const keyRe = new RegExp(`"${i}"\\s*:\\s*`, 'g');
    const m = keyRe.exec(jsonish);
    if (!m) continue;
    const start = m.index + m[0].length;
    const rest = jsonish.slice(start);

    // null literal
    if (/^null\b/.test(rest)) { out[String(i)] = null; continue; }

    // balanced object starting at the first {
    if (rest[0] === '{') {
      let depth = 0, end = -1, inStr = false, esc = false;
      for (let j = 0; j < rest.length; j++) {
        const c = rest[j];
        if (inStr) {
          if (esc) esc = false;
          else if (c === '\\') esc = true;
          else if (c === '"') inStr = false;
        } else {
          if (c === '"') inStr = true;
          else if (c === '{') depth++;
          else if (c === '}') { depth--; if (depth === 0) { end = j; break; } }
        }
      }
      if (end !== -1) {
        const objStr = rest.slice(0, end + 1);
        try { out[String(i)] = JSON.parse(objStr); }
        catch { /* leave absent → caller marks unestimable */ }
      }
    }
  }
  return out;
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

  if (!res.ok) {
    void logAiUsage({ accountId: null, db, model: 'claude-haiku-4-5-20251001', feature: 'nutrition_backfill', inputTokens: 0, outputTokens: 0, success: false, error: `status ${res.status}` });
    throw new Error(`Anthropic API returned ${res.status}`);
  }

  const data = await res.json();
  const u = data.usage ?? {};
  void logAiUsage({ accountId: null, db, model: 'claude-haiku-4-5-20251001', feature: 'nutrition_backfill', inputTokens: u.input_tokens ?? 0, outputTokens: u.output_tokens ?? 0, success: true });
  const text = data.content?.[0]?.text ?? '';
  const clean = stripToJson(text);

  // RESILIENT PARSE. Two tiers:
  //   1. strict whole-object parse (the happy path);
  //   2. if that throws, per-item salvage so ONE bad entry can't sink the
  //      whole batch. Any item we still can't recover is marked unestimable
  //      below, so it leaves the queue and the batch always makes progress.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let nutritionMap: Record<string, any> = {};
  let parseMode: 'strict' | 'salvaged' = 'strict';
  try {
    nutritionMap = JSON.parse(clean);
  } catch {
    parseMode = 'salvaged';
    nutritionMap = salvageEntries(clean, unique.length);
    const recovered = Object.keys(nutritionMap).length;
    console.warn(`[backfill] whole-object parse failed; salvaged ${recovered}/${unique.length} items. Raw head:`, text.slice(0, 200));
  }

  let filled = 0;
  let marked = 0;

  for (let i = 0; i < unique.length; i++) {
    const ing = unique[i];
    // `nutritionMap` may legitimately lack an index (salvage couldn't recover
    // it) — normalizeNutrition(undefined) returns null → we mark unestimable.
    const nutrition = normalizeNutrition(nutritionMap[String(i + 1)]);

    if (nutrition) {
      const { error } = await db.from('ingredients')
        .update({ nutrition_per_100g: nutrition })
        .eq('id', ing.id);
      if (error) console.error('[backfill] update failed for', ing.name, error.message);
      else filled++;
    } else {
      // Model declined, OR we couldn't recover this item from a malformed
      // response. Either way mark unestimable so it leaves the queue
      // permanently — this is what makes a bad item non-fatal AND non-looping.
      const { error } = await db.from('ingredients')
        .update({ nutrition_per_100g: UNESTIMABLE })
        .eq('id', ing.id);
      if (error) console.error('[backfill] mark failed for', ing.name, error.message);
      else { marked++; console.warn('[backfill] marked unestimable:', ing.name, parseMode === 'salvaged' ? '(unrecovered in salvage)' : ''); }
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

  // Debug mode: GET ...?debug=1 returns diagnostics directly in the response
  // (key fingerprint + what the service client actually sees) instead of
  // running the backfill. Lets us diagnose without digging through logs.
  if (req.nextUrl.searchParams.get('debug') === '1') {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = serviceClient() as any;
      const { data, error, count } = await db
        .from('ingredients')
        .select('id, name', { count: 'exact' })
        .is('nutrition_per_100g', null)
        .eq('is_product', false)
        .limit(5);
      return NextResponse.json({
        debug: true,
        keyPrefix: key.slice(0, 10),
        keyLength: key.length,
        selectError: error?.message ?? null,
        nullCountVisible: count ?? 0,
        sampleNames: (data ?? []).map((r: { name: string }) => r.name),
      });
    } catch (e) {
      return NextResponse.json({ debug: true, keyPrefix: key.slice(0, 10), keyLength: key.length, threw: String(e) });
    }
  }

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
