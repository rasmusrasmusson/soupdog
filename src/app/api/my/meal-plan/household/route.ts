// src/app/api/my/meal-plan/household/route.ts
// GET — the people the caller can add to meals (people they OWN: self + managed
// household members). Used by the avatar "+" picker.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = supabase as any;

  const { data: ownedRows } = await db.rpc('owned_person_ids', { acc: user.id });
  const ids: string[] = Array.isArray(ownedRows)
    ? ownedRows.map((r: any) => (typeof r === 'string' ? r : r.owned_person_ids ?? r.person_id ?? r))
    : [];
  if (ids.length === 0) return NextResponse.json({ people: [] });

  const { data: people, error } = await db
    .from('person')
    .select('id, full_name, display_name, avatar_color')
    .in('id', ids);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const out = (people ?? []).map((p: any) => ({
    id: p.id,
    name: p.full_name || p.display_name || 'Someone',
    avatarColor: p.avatar_color ?? null,
  }));

  return NextResponse.json({ people: out });
}
