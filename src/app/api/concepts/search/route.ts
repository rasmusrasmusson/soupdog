// src/app/api/concepts/search/route.ts
// GET ?q=…  → up to 10 global concepts whose name matches (for the bind picker).
// Public read (global concepts are world-readable).

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  const supabase = (await createClient()) as any;
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim();
  if (q.length < 2) return NextResponse.json({ concepts: [] });
  const { data, error } = await supabase
    .from('concept')
    .select('id, name, note')
    .ilike('name', `%${q}%`)
    .order('name', { ascending: true })
    .limit(10);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ concepts: data ?? [] });
}
