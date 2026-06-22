// src/app/api/admin/usda/search/route.ts
// Admin-only. Searches USDA FoodData Central for candidate foods so a human can
// pick the right match (catching blends, brands, etc.). Returns each candidate
// with description + dataType + a few MARKER nutrients (calories/fat/protein) so
// "pure olive oil" vs "corn/peanut/olive blend" is distinguishable at a glance.
// The chosen fdcId is then passed to /api/admin/ingredients/[id]/import-nutrition.

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';

const ADMIN_IDS = (process.env.SOUPDOG_ADMIN_ACCOUNT_IDS
  ?? 'bb02ae50-436c-4402-8c8c-447344e10151,1a0f72dd-f0a7-487c-9ecd-7ef898f8dabf')
  .split(',').map(s => s.trim()).filter(Boolean);

// Marker nutrient FDC ids to surface per candidate (id → label).
const MARKERS: Array<[number, string]> = [
  [1008, 'kcal'], [1004, 'fat'], [1003, 'protein'],
];

export async function GET(req: NextRequest) {
  const server = await createServerClient();
  const { data: { user } } = await server.auth.getUser();
  if (!user || !ADMIN_IDS.includes(user.id)) {
    return NextResponse.json({ error: 'Not authorised.' }, { status: 403 });
  }

  const q = (req.nextUrl.searchParams.get('q') ?? '').trim();
  if (!q) return NextResponse.json({ error: 'Missing q.' }, { status: 400 });

  const apiKey = process.env.USDA_FDC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'USDA_FDC_API_KEY is not set.' }, { status: 500 });

  // Send dataType=Foundation,SR Legacy so lab-analysed foods rank first
  // (branded products otherwise dominate). Parens in "Survey (FNDDS)" caused
  // the earlier 400; a plain space is fine.
  const url =
    `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(q)}` +
    `&dataType=${encodeURIComponent('Foundation,SR Legacy')}&pageSize=25&api_key=${apiKey}`;

  let data: any;
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) {
      return NextResponse.json({ error: `USDA search failed (${res.status}).` }, { status: 502 });
    }
    data = await res.json();
  } catch (e: any) {
    return NextResponse.json({ error: `USDA search error: ${e?.message ?? e}` }, { status: 502 });
  }

  const candidates = (data.foods ?? []).map((f: any) => {
    const markers: Record<string, number | null> = {};
    for (const [id, label] of MARKERS) {
      // search results carry foodNutrients with nutrientId + value (flat shape)
      const hit = (f.foodNutrients ?? []).find((n: any) => Number(n.nutrientId) === id);
      markers[label] = hit ? Number(hit.value) : null;
    }
    return {
      fdcId: String(f.fdcId),
      description: f.description ?? '',
      dataType: f.dataType ?? '',
      brand: f.brandOwner ?? null,
      markers,
    };
  });

  return NextResponse.json({ q, count: candidates.length, candidates });
}
