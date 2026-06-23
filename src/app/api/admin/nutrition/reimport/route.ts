// src/app/api/admin/nutrition/reimport/route.ts
// Admin-only. Re-imports USDA nutrition for already-MATCHED ingredients (those
// with a stored fdc_id), in batches. Use this after ADDING new nutrient rows to
// the `nutrient` table (e.g. amino acids): importFdcNutrition re-reads the full
// nutrient list each call, so a re-import populates the new nutrients from the
// SAME USDA food records already matched — no re-matching, no AI cost.
//
// Idempotent: re-importing an ingredient just re-writes its USDA-sourced values
// (same source_kind), so running twice is harmless. Loop "Run until done" style
// client-side using the `cursor` (last processed name) to page through.

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { serviceClient, importFdcNutrition } from '@/lib/nutrition/usda';

const ADMIN_IDS = (process.env.SOUPDOG_ADMIN_ACCOUNT_IDS
  ?? 'bb02ae50-436c-4402-8c8c-447344e10151,1a0f72dd-f0a7-487c-9ecd-7ef898f8dabf')
  .split(',').map((s: string) => s.trim()).filter(Boolean);

export async function POST(req: NextRequest) {
  const server = await createServerClient();
  const { data: { user } } = await server.auth.getUser();
  if (!user || !ADMIN_IDS.includes(user.id)) {
    return NextResponse.json({ error: 'Not authorised.' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const batchSize: number = Math.min(Math.max(Number(body.batchSize) || 6, 1), 12);
  const cursor: string | null = body.cursor ?? null;  // last processed name (paging)

  const db = serviceClient();

  // Matched ingredients have a stored fdc_id. Page by name for stable ordering.
  let q = db
    .from('ingredients')
    .select('id, name, fdc_id')
    .not('fdc_id', 'is', null)
    .eq('is_product', false)
    .eq('is_category', false)
    .order('name', { ascending: true })
    .limit(batchSize);
  if (cursor) q = q.gt('name', cursor);

  const { data: targets, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Total matched (for progress reporting).
  const { count: totalMatched } = await db
    .from('ingredients')
    .select('id', { count: 'exact', head: true })
    .not('fdc_id', 'is', null)
    .eq('is_product', false)
    .eq('is_category', false);

  let imported = 0, failed = 0;
  const results: { name: string; ok: boolean; nutrients?: number; error?: string }[] = [];
  let lastName: string | null = cursor;

  for (const ing of (targets ?? [])) {
    lastName = ing.name;
    const r = await importFdcNutrition(db, ing.id, String(ing.fdc_id));
    if (r.ok) { imported++; results.push({ name: ing.name, ok: true, nutrients: r.nutrientsImported }); }
    else { failed++; results.push({ name: ing.name, ok: false, error: r.error }); }
  }

  const done = (targets?.length ?? 0) < batchSize;  // last page reached

  return NextResponse.json({
    processed: targets?.length ?? 0,
    imported, failed,
    cursor: lastName,    // feed back as `cursor` for the next batch
    done,
    totalMatched: totalMatched ?? null,
    results,
  });
}
