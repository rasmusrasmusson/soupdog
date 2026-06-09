// src/app/api/admin/tasks/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const ADMIN_IDS = (process.env.SOUPDOG_ADMIN_ACCOUNT_IDS
  ?? 'bb02ae50-436c-4402-8c8c-447344e10151,1a0f72dd-f0a7-487c-9ecd-7ef898f8dabf')
  .split(',').map(s => s.trim()).filter(Boolean);

function slugify(s: string): string {
  return s.toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// POST /api/admin/tasks — create a new technique (name + slug + family minimum).
// Other NOT-NULL columns have DB defaults (task_type=human, status=global,
// task_family=other, source=human_authored, is_verified=false, etc.).
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!ADMIN_IDS.includes(user.id)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Body required' }, { status: 400 });
  }

  const name = (body.name ?? '').trim();
  if (!name) return NextResponse.json({ error: 'Name is required.' }, { status: 400 });

  const slug = slugify(body.slug?.trim() || name);
  if (!slug) return NextResponse.json({ error: 'Could not derive a valid slug.' }, { status: 400 });

  // family is NOT NULL with no default — required.
  const family = (body.family ?? '').trim();
  if (!family) return NextResponse.json({ error: 'Family is required.' }, { status: 400 });

  // Reject duplicate slug up front (clearer than a raw unique-violation).
  const { data: existing } = await (supabase as any)
    .from('tasks').select('id').eq('slug', slug).maybeSingle();
  if (existing) {
    return NextResponse.json(
      { error: `A technique with the slug "${slug}" already exists. Choose a different name or slug.` },
      { status: 409 }
    );
  }

  const insert: Record<string, any> = {
    name, slug, family,
    // The techniques list groups/filters by `category`; if we leave it null the
    // new technique is invisible there. Default it to the family (refine later in
    // the edit form). Accepts an explicit category override from the body.
    category: (body.category ?? '').trim() || family,
    description: (body.description ?? '').trim() || null,
    // is_verified defaults to false; new technique starts unverified (a draft).
    source: 'human_authored',
  };

  const { data, error } = await (supabase as any)
    .from('tasks').insert(insert).select().maybeSingle();

  if (error) {
    const msg = error.code === '23505'
      ? `A technique with the slug "${slug}" already exists.`
      : error.message;
    const status = error.code === '23505' ? 409
      : (error.code === '42501' ? 403 : 502);
    console.error('[admin/tasks POST]', error);
    return NextResponse.json({ error: msg }, { status });
  }
  if (!data) {
    return NextResponse.json(
      { error: 'Create blocked by permissions (no row inserted).' },
      { status: 403 }
    );
  }

  return NextResponse.json({ ok: true, task: data });
}
