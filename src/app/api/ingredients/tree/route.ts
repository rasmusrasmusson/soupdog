// src/app/api/ingredients/tree/route.ts
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET() {
  const supabase = await createClient();

  const { data, error } = await (supabase as any)
    .from('ingredients')
    .select('id, slug, name, parent_id')
    .eq('is_category', false)   // exclude taxonomy category nodes
    .order('name');

  if (error) return NextResponse.json([], { status: 500 });

  return NextResponse.json(data ?? []);
}
