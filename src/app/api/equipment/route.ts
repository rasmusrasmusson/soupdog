// src/app/api/equipment/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createClient();
  const { data } = await supabase
    .from('equipment')
    .select('id, name, category, slug')
    .order('name');

  return NextResponse.json(data ?? []);
}
