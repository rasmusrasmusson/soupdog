// src/app/api/equipment/tree/route.ts
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET() {
  const supabase = await createClient();

  const { data, error } = await (supabase as any)
    .from('equipment')
    .select('id, slug, name, parent_id, connected, capability_schema, category')
    .order('name');

  if (error) return NextResponse.json([], { status: 500 });

  return NextResponse.json(data ?? []);
}
