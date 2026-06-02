// src/app/api/my/usage/route.ts
// GET — this account's AI usage for the current calendar month, converted to
// credits. Read-only. No enforcement. Placeholder credit costs and allowance —
// real values come once plans/Stripe exist.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// ── Placeholder credit costs per feature (tweak in one place) ──
// 1 credit ≈ $0.02 of AI cost, roughly. These are TEST values to make the meter
// real against logged data; replace with figures derived from real usage before
// launch. A feature not listed here counts as 1 credit.
const CREDITS_PER_FEATURE: Record<string, number> = {
  import_parse:       2,
  chat_modify:        3,
  chat_question:      1,
  nutrition_estimate: 1,
  nutrition_backfill: 1,
};

// Placeholder monthly allowance (no plan column yet — hardcoded). Stands in for
// what a "Plus" member would get; lets the meter show a fill level.
const PLACEHOLDER_ALLOWANCE = 400;

// Friendly labels for the per-feature breakdown (user-facing, no jargon).
const FEATURE_LABELS: Record<string, string> = {
  import_parse:       'Recipe imports',
  chat_modify:        'Recipe edits with the assistant',
  chat_question:      'Questions answered',
  nutrition_estimate: 'Nutrition lookups',
  nutrition_backfill: 'Nutrition lookups',
};

function creditsFor(feature: string, count: number): number {
  const per = CREDITS_PER_FEATURE[feature] ?? 1;
  return per * count;
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  // Start of the current calendar month (UTC).
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

  const { data, error } = await db
    .from('ai_usage_log')
    .select('feature, success, created_at')
    .eq('account_id', user.id)
    .gte('created_at', monthStart);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = data ?? [];

  // Count successful calls per feature (failed calls don't cost credits).
  const counts: Record<string, number> = {};
  for (const r of rows) {
    if (r.success === false) continue;
    counts[r.feature] = (counts[r.feature] ?? 0) + 1;
  }

  // Collapse into user-facing buckets by label, summing both counts and credits.
  const buckets: Record<string, { label: string; count: number; credits: number }> = {};
  let totalCredits = 0;
  for (const [feature, count] of Object.entries(counts)) {
    const label = FEATURE_LABELS[feature] ?? feature;
    const credits = creditsFor(feature, count);
    totalCredits += credits;
    if (!buckets[label]) buckets[label] = { label, count: 0, credits: 0 };
    buckets[label].count += count;
    buckets[label].credits += credits;
  }

  const breakdown = Object.values(buckets).sort((a, b) => b.credits - a.credits);

  // Next reset = first day of next month.
  const nextReset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const msPerDay = 1000 * 60 * 60 * 24;
  const daysUntilReset = Math.max(0, Math.ceil((nextReset.getTime() - now.getTime()) / msPerDay));

  const allowance = PLACEHOLDER_ALLOWANCE;
  const used = totalCredits;
  const remaining = Math.max(0, allowance - used);
  const percentUsed = allowance > 0 ? Math.min(100, Math.round((used / allowance) * 100)) : 0;

  return NextResponse.json({
    plan: 'Plus',          // placeholder — no plan storage yet
    allowance,
    used,
    remaining,
    percentUsed,
    daysUntilReset,
    resetDate: nextReset.toISOString(),
    breakdown,             // [{ label, count, credits }]
    isPlaceholder: true,   // signal to UI that numbers are test values
  });
}
