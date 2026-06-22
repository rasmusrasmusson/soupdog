// src/app/api/admin/usda/search/route.ts
// Admin-only. Searches USDA via the shared usdaSearch lib (which sends
// dataType=Foundation,SR Legacy and re-ranks plain/raw whole foods above
// prepared products), so the manual worklist sees the same good candidate
// ordering the auto-matcher does. The chosen fdcId goes to import-nutrition.

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { usdaSearch } from '@/lib/nutrition/usda';

const ADMIN_IDS = (process.env.SOUPDOG_ADMIN_ACCOUNT_IDS
  ?? 'bb02ae50-436c-4402-8c8c-447344e10151,1a0f72dd-f0a7-487c-9ecd-7ef898f8dabf')
  .split(',').map(s => s.trim()).filter(Boolean);

export async function GET(req: NextRequest) {
  const server = await createServerClient();
  const { data: { user } } = await server.auth.getUser();
  if (!user || !ADMIN_IDS.includes(user.id)) {
    return NextResponse.json({ error: 'Not authorised.' }, { status: 403 });
  }

  const q = (req.nextUrl.searchParams.get('q') ?? '').trim();
  if (!q) return NextResponse.json({ error: 'Missing q.' }, { status: 400 });

  try {
    const candidates = await usdaSearch(q);
    return NextResponse.json({ q, count: candidates.length, candidates });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'USDA search failed.' }, { status: 502 });
  }
}
