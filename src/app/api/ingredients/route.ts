// src/app/api/ingredients/route.ts
// POST — create a generic ingredient taxonomy node (is_product=false)

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

function slugify(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = supabase as any;
  const { name, parent_id } = await req.json();

  if (!name?.trim()) return NextResponse.json({ error: 'name required' }, { status: 400 });

  const base   = slugify(name.trim());
  const suffix = Math.random().toString(36).slice(2, 6);
  const slug   = `${base}-${suffix}`;

  const { data, error } = await db
    .from('ingredients')
    .insert({
      slug,
      name:       name.trim(),
      is_product: false,
      category:   'other',
      parent_id:  parent_id ?? null,
      source:     'human_authored',
      confidence: 1.0,
      created_by: user.id,
    })
    .select('id, slug, name')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
