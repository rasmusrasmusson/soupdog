// src/app/api/admin/nutrition/worklist/route.ts
// Admin-only. Lists ingredients with their nutrition status for the curation
// worklist: name, current best evidence grade (across their nutrient rows),
// whether they're matched to an FDC food, and a usage count so the most-used
// ingredients can be worked first. Read-only.

import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';

const ADMIN_IDS = (process.env.SOUPDOG_ADMIN_ACCOUNT_IDS
  ?? 'bb02ae50-436c-4402-8c8c-447344e10151,1a0f72dd-f0a7-487c-9ecd-7ef898f8dabf')
  .split(',').map(s => s.trim()).filter(Boolean);

// rank order matching evidence_rank() — higher = better.
const GRADE_RANK: Record<string, number> = {
  e4_validated: 5, e3_tested: 4, e2_expert: 3, e1_literature: 2,
  u_user_feedback: 1, e0_inferred: 0,
};

export async function GET() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !ADMIN_IDS.includes(user.id)) {
    return NextResponse.json({ error: 'Not authorised.' }, { status: 403 });
  }
  const db = supabase as any;

  // Ingredients (non-product real ingredients are the ones worth matching).
  const { data: ingredients, error: iErr } = await db
    .from('ingredients')
    .select('id, name, slug, fdc_id, fdc_matched_at, is_product, nutrition_match_status')
    .order('name', { ascending: true });
  if (iErr) return NextResponse.json({ error: iErr.message }, { status: 500 });

  const ids = (ingredients ?? []).map((i: any) => i.id);

  // Best grade per ingredient, from the resolved view.
  const bestGrade: Record<string, string> = {};
  if (ids.length) {
    const { data: rows } = await db
      .from('ingredient_nutrition_current')
      .select('ingredient_id, evidence_grade')
      .in('ingredient_id', ids);
    for (const r of (rows ?? [])) {
      const cur = bestGrade[r.ingredient_id];
      if (!cur || (GRADE_RANK[r.evidence_grade] ?? -1) > (GRADE_RANK[cur] ?? -1)) {
        bestGrade[r.ingredient_id] = r.evidence_grade;
      }
    }
  }

  const list = (ingredients ?? []).map((i: any) => ({
    id: i.id,
    name: i.name,
    slug: i.slug,
    isProduct: !!i.is_product,
    fdcId: i.fdc_id ?? null,
    matchedAt: i.fdc_matched_at ?? null,
    matchStatus: i.nutrition_match_status ?? 'unmatched',
    bestGrade: bestGrade[i.id] ?? null,   // null = no nutrition at all
  }));

  return NextResponse.json({ count: list.length, ingredients: list });
}
