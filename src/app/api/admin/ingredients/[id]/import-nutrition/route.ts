// src/app/api/admin/ingredients/[id]/import-nutrition/route.ts
// Admin-only manual import: given an ingredient id (path) + a CONFIRMED USDA
// FDC id (body), import that food's nutrition. Uses the shared usda lib so the
// auto-matcher and manual path share one ingest code path. A manual confirm
// marks the ingredient 'confirmed' (human-verified, outranks auto_matched).

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { serviceClient, importFdcNutrition } from '@/lib/nutrition/usda';

const ADMIN_IDS = (process.env.SOUPDOG_ADMIN_ACCOUNT_IDS
  ?? 'bb02ae50-436c-4402-8c8c-447344e10151,1a0f72dd-f0a7-487c-9ecd-7ef898f8dabf')
  .split(',').map(s => s.trim()).filter(Boolean);

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const server = await createServerClient();
  const { data: { user } } = await server.auth.getUser();
  if (!user || !ADMIN_IDS.includes(user.id)) {
    return NextResponse.json({ error: 'Not authorised.' }, { status: 403 });
  }

  const { id: ingredientId } = await context.params;
  const body = await req.json().catch(() => ({}));
  const fdcId = String(body.fdcId ?? '').trim();
  if (!fdcId) return NextResponse.json({ error: 'Body must include fdcId.' }, { status: 400 });

  if (!process.env.USDA_FDC_API_KEY) {
    return NextResponse.json({ error: 'USDA_FDC_API_KEY is not set.' }, { status: 500 });
  }

  const db = serviceClient() as any;
  const imp = await importFdcNutrition(db, ingredientId, fdcId);
  if (!imp.ok) {
    const status = imp.error?.includes('No mappable') ? 422 : 502;
    return NextResponse.json({ error: imp.error, fdcId, dataType: imp.dataType,
      description: imp.description }, { status });
  }

  // A human confirmed this match.
  await db.from('ingredients')
    .update({ nutrition_match_status: 'confirmed' }).eq('id', ingredientId);

  return NextResponse.json({
    ok: true, ingredientId, fdcId,
    dataType: imp.dataType, description: imp.description,
    grade: imp.grade, sourceKind: imp.sourceKind,
    nutrientsImported: imp.nutrientsImported, nutrients: imp.nutrients,
  });
}
