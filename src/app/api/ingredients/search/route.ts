// src/app/api/ingredients/search/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  const q           = req.nextUrl.searchParams.get('q') ?? '';
  const excludeProducts = req.nextUrl.searchParams.get('exclude_products') !== 'false';

  if (q.length < 2) return NextResponse.json([]);

  const supabase = await createClient();
  const db = supabase as any;

  let query = db
    .from('ingredients')
    .select('id, slug, name, is_product, parent_id')
    .ilike('name', `%${q}%`)
    .order('name')
    .limit(12);

  if (excludeProducts) {
    query = query.eq('is_product', false);
  }

  const { data } = await query;
  return NextResponse.json(data ?? []);
}
