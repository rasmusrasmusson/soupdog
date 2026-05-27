// src/app/api/tasks/route.ts
// Task search — used by recipe editor search-as-you-type

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

  let query = db
    .from('tasks')
    .select(`id, slug, name, family, category, task_type, description,
             typical_duration_min_seconds, typical_duration_max_seconds,
             difficulty, parameter_schema, appliance_capability,
             suggested_tool_slugs, show_temperature, duration_label, yield_factor`)
    .order('name');

  if (q.length >= 2) query = query.ilike('name', `%${q}%`);
  if (family)        query = query.eq('family',    family);
  if (category)      query = query.eq('category',  category);
  if (type)          query = query.eq('task_type', type);

  query = query.limit(20);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: families } = await db
    .from('tasks')
    .select('family, category, task_type')
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
