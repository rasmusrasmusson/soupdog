// src/app/api/tasks/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q        = searchParams.get('q')?.trim() ?? '';
  const family   = searchParams.get('family') ?? '';
  const category = searchParams.get('category') ?? '';
  const type     = searchParams.get('type') ?? '';

  const supabase = await createClient();
  const db       = supabase as any;
  const { data: { user } } = await supabase.auth.getUser();

  let query = db
    .from('tasks')
    .select(`id, slug, name, family, category, task_type, description,
             typical_duration_min_seconds, typical_duration_max_seconds,
             difficulty, parameter_schema, appliance_capability,
             suggested_tool_slugs, show_temperature, duration_label, yield_factor, status`)
    .order('name');

  // Show global tasks + user's personal tasks
  if (user) {
    query = query.or(`status.eq.global,and(status.eq.personal,created_by.eq.${user.id})`);
  } else {
    query = query.eq('status', 'global');
  }

  if (q.length >= 2) query = query.ilike('name', `%${q}%`);
  if (family)        query = query.eq('family',    family);
  if (category)      query = query.eq('category',  category);
  if (type)          query = query.eq('task_type', type);

  query = query.limit(30);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Tree for family tiles
  const { data: families } = await db
    .from('tasks')
    .select('family, category, task_type')
    .eq('status', 'global')
    .order('family');

  const tree: Record<string, { categories: Set<string>; types: Set<string> }> = {};
  for (const row of (families ?? [])) {
    if (!tree[row.family]) tree[row.family] = { categories: new Set(), types: new Set() };
    if (row.category) tree[row.family].categories.add(row.category);
    tree[row.family].types.add(row.task_type);
  }

  const treeOut = Object.entries(tree).map(([family, v]) => ({
    family,
    categories: [...v.categories],
    types:      [...v.types],
  }));

  return NextResponse.json({ tasks: data ?? [], tree: treeOut });
}

// Save a new personal task
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db   = supabase as any;
  const body = await req.json();

  const { name, family, category, task_type, description } = body;
  if (!name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 });

  // Generate a unique slug
  const baseSlug = `${user.id.slice(0,8)}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}`;

  const { data, error } = await db
    .from('tasks')
    .insert({
      slug:        baseSlug,
      name:        name.trim(),
      family:      family   || 'custom',
      category:    category || 'custom',
      task_type:   task_type || 'human',
      description: description || null,
      status:      'personal',
      created_by:  user.id,
    })
    .select('id, slug, name, family, category, task_type, description, status')
    .single();

  if (error) {
    // Slug collision — add timestamp
    const { data: data2, error: error2 } = await db
      .from('tasks')
      .insert({
        slug:        `${baseSlug}-${Date.now()}`,
        name:        name.trim(),
        family:      family   || 'custom',
        category:    category || 'custom',
        task_type:   task_type || 'human',
        description: description || null,
        status:      'personal',
        created_by:  user.id,
      })
      .select('id, slug, name, family, category, task_type, description, status')
      .single();
    if (error2) return NextResponse.json({ error: error2.message }, { status: 500 });
    return NextResponse.json({ task: data2 });
  }

  return NextResponse.json({ task: data });
}
