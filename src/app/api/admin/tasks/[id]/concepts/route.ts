// src/app/api/admin/tasks/[id]/concepts/route.ts
// Concept layer (Phase 1). Admin-only.
//   GET  → list the concepts (specialised tasks) whose parent_task_id = this task
//   POST → create a new concept under this task (parent_task_id = this id)
// A concept is just a task row, so it reuses the tasks table + its RLS/grants.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const ADMIN_IDS = (process.env.SOUPDOG_ADMIN_ACCOUNT_IDS
  ?? 'bb02ae50-436c-4402-8c8c-447344e10151,1a0f72dd-f0a7-487c-9ecd-7ef898f8dabf')
  .split(',').map(s => s.trim()).filter(Boolean);

function slugify(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// GET — public list of a parent's concepts (used by detail page / nested display)
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const db = supabase as any;
  const { data, error } = await db.from('tasks')
    .select('id, name, slug, description, bound_ingredient_id, bound_tool_slug, bound_quantity, bound_quantity_unit, is_verified, archived_at')
    .eq('parent_task_id', id)
    .order('name');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ concepts: data ?? [] });
}

// POST — create a concept under this parent task
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: parentId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!ADMIN_IDS.includes(user.id)) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const name: string = (body.name ?? '').trim();
  if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 });

  const db = supabase as any;

  // confirm the parent exists (and grab its category as a sensible default)
  const { data: parent, error: pErr } = await db.from('tasks')
    .select('id, category').eq('id', parentId).maybeSingle();
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
  if (!parent) return NextResponse.json({ error: 'Parent task not found' }, { status: 404 });

  // unique slug (append a short suffix if taken)
  let slug = slugify(name);
  if (!slug) slug = `concept-${Date.now()}`;
  const { data: clash } = await db.from('tasks').select('id').eq('slug', slug).maybeSingle();
  if (clash) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;

  const insert: Record<string, any> = {
    name,
    slug,
    parent_task_id: parentId,
    category: parent.category ?? null,
    source: 'human_authored',
    is_verified: false,
    created_by: user.id,
    // bound dimensions (all optional)
    bound_ingredient_id: body.bound_ingredient_id ?? null,
    bound_tool_slug: (body.bound_tool_slug ?? '').trim() || null,
    bound_quantity: body.bound_quantity ?? null,
    bound_quantity_unit: (body.bound_quantity_unit ?? '').trim() || null,
    bound_dimensions: body.bound_dimensions ?? null,
  };

  const { data: created, error } = await db.from('tasks').insert(insert).select('id, slug, name').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ concept: created });
}
