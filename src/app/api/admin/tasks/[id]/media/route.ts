// src/app/api/admin/tasks/[id]/media/route.ts
// CRUD for a task's media rows (task_media). The file itself is uploaded via
// /api/admin/upload-media (which returns a url + storage path); this route
// records / lists / removes the row that links that file to the task.
// GET is public (techniques pages read media); POST/DELETE are admin-gated.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const ADMIN_IDS = (process.env.SOUPDOG_ADMIN_ACCOUNT_IDS
  ?? 'bb02ae50-436c-4402-8c8c-447344e10151,1a0f72dd-f0a7-487c-9ecd-7ef898f8dabf')
  .split(',').map(s => s.trim()).filter(Boolean);

const KINDS = new Set(['image', 'video']);
const ROLES = new Set(['hero', 'step_demo', 'diagram', 'detail']);

// GET /api/admin/tasks/{id}/media  -> list a task's media, display order
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient() as any;
  const { data, error } = await supabase
    .from('task_media')
    .select('id, task_id, kind, role, language, url, storage_path, caption, sort_order, created_at')
    .eq('task_id', id)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ media: data ?? [] });
}

// POST /api/admin/tasks/{id}/media  -> add a media row
// body: { kind, role?, language?, url, storage_path?, caption?, sort_order? }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!ADMIN_IDS.includes(user.id)) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Body required' }, { status: 400 });

  const kind = String(body.kind ?? '');
  const url = String(body.url ?? '').trim();
  if (!KINDS.has(kind)) return NextResponse.json({ error: 'kind must be image or video' }, { status: 400 });
  if (!url) return NextResponse.json({ error: 'url required' }, { status: 400 });

  const role = ROLES.has(String(body.role)) ? String(body.role) : 'step_demo';
  const language = body.language ? String(body.language).trim() : null;
  const caption = body.caption ? String(body.caption).trim() : null;
  const storage_path = body.storage_path ? String(body.storage_path) : null;
  const sort_order = Number.isFinite(body.sort_order) ? Math.trunc(body.sort_order) : 0;

  const db = supabase as any;
  const { data, error } = await db
    .from('task_media')
    .insert({ task_id: id, kind, role, language, url, storage_path, caption, sort_order, created_by: user.id })
    .select()
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ media: data });
}

// PATCH /api/admin/tasks/{id}/media?mediaId=...  body: { caption?, sort_order? }
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!ADMIN_IDS.includes(user.id)) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const mediaId = new URL(req.url).searchParams.get('mediaId');
  if (!mediaId) return NextResponse.json({ error: 'mediaId required' }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const patch: Record<string, any> = {};
  if ('caption' in body) patch.caption = body.caption ? String(body.caption).trim() : null;
  if ('sort_order' in body && Number.isFinite(body.sort_order)) patch.sort_order = Math.trunc(body.sort_order);
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });

  const db = supabase as any;
  const { error } = await db.from('task_media').update(patch).eq('id', mediaId).eq('task_id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// DELETE /api/admin/tasks/{id}/media?mediaId=...  -> remove one media row
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!ADMIN_IDS.includes(user.id)) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const mediaId = new URL(req.url).searchParams.get('mediaId');
  if (!mediaId) return NextResponse.json({ error: 'mediaId required' }, { status: 400 });

  const db = supabase as any;
  const { error } = await db.from('task_media').delete().eq('id', mediaId).eq('task_id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
