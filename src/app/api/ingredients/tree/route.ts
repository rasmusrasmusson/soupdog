import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET() {
  const supabase = await createClient();

  const { data, error } = await (supabase as any)
    .from('ingredients')
    .select('id, name, parent_id')
    .order('name');

  if (error) return NextResponse.json([], { status: 500 });

  return NextResponse.json(data ?? []);
}
