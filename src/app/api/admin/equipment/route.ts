// src/app/api/admin/equipment/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const ADMIN_IDS = (process.env.SOUPDOG_ADMIN_ACCOUNT_IDS ??
  'bb02ae50-436c-4402-8c8c-447344e10151,1a0f72dd-f0a7-487c-9ecd-7ef898f8dabf')
  .split(',').map(s => s.trim()).filter(Boolean);

const CATEGORIES = [
  'oven','knife','pan','scale','mixer','appliance','thermometer','other',
  'category','cookware','prep','measuring','bakeware','appliance_small',
];

function slugify(s: string): string {
  return s.toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// POST /api/admin/equipment  — create a new tool (name + slug minimum).
export async function POST(req: NextRequest) {
  const supabase = (await createClient()) as any;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !ADMIN_IDS.includes(user.id)) {
    return NextResponse.json({ error: 'Not authorised.' }, { status: 403 });
  }

  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 }); }

  const name = (body.name ?? '').trim();
  if (!name) {
    return NextResponse.json({ error: 'Name is required.' }, { status: 400 });
  }

  const slug = slugify(body.slug?.trim() || name);
  if (!slug) {
    return NextResponse.json({ error: 'Could not derive a valid slug.' }, { status: 400 });
  }

  const category = CATEGORIES.includes(body.category) ? body.category : 'other';

  // Reject duplicate slug up front (clearer than a raw unique-violation).
  const { data: existing } = await supabase
    .from('equipment')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();
  if (existing) {
    return NextResponse.json(
      { error: `A tool with the slug "${slug}" already exists. Choose a different name or slug.` },
      { status: 409 }
    );
  }

  const insert: Record<string, any> = {
    name, slug, category,
    summary: (body.summary ?? '').trim() || null,
    content_reviewed: false,
    source: 'manual',
  };

  const { data, error } = await supabase
    .from('equipment')
    .insert(insert)
    .select()
    .maybeSingle();

  if (error) {
    // 23505 = unique violation (slug raced in); anything else surfaces as-is.
    const msg = error.code === '23505'
      ? `A tool with the slug "${slug}" already exists.`
      : error.message;
    const status = error.code === '23505' ? 409
      : (error.code === '42501' ? 403 : 500);
    return NextResponse.json({ error: msg }, { status });
  }
  if (!data) {
    return NextResponse.json(
      { error: 'Create blocked by permissions (no row inserted).' },
      { status: 403 }
    );
  }

  return NextResponse.json({ tool: data });
}
