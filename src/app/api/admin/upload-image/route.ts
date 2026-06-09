// src/app/api/admin/upload-image/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import sharp from 'sharp';

// AUTH account ids (auth.uid()). Keep in sync with the other admin gates.
const ADMIN_IDS = (process.env.SOUPDOG_ADMIN_ACCOUNT_IDS
  ?? 'bb02ae50-436c-4402-8c8c-447344e10151,1a0f72dd-f0a7-487c-9ecd-7ef898f8dabf')
  .split(',').map(s => s.trim()).filter(Boolean);

const BUCKET = 'images';
const MAX_EDGE = 1200;       // longest-edge cap for hero images
const WEBP_QUALITY = 82;
const ALLOWED_PREFIXES = new Set(['techniques', 'tools', 'ingredients', 'recipes', 'meals']);

// Service-role client — needed to write to Storage past bucket RLS.
function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${key}`, apikey: key } },
  });
}

function safeSlug(s: string): string {
  return (s || 'image').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'image';
}

export async function POST(req: NextRequest) {
  // 1. Admin gate (session-based, account id).
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!ADMIN_IDS.includes(user.id)) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  // 2. Read the multipart form (file + where it belongs).
  let form: FormData;
  try { form = await req.formData(); }
  catch { return NextResponse.json({ error: 'Expected multipart form data' }, { status: 400 }); }

  const file = form.get('file');
  const kind = String(form.get('kind') ?? '');            // e.g. 'techniques'
  const slug = safeSlug(String(form.get('slug') ?? ''));  // e.g. 'combi-steam'

  if (!(file instanceof File)) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  if (!ALLOWED_PREFIXES.has(kind)) return NextResponse.json({ error: `Invalid kind: ${kind}` }, { status: 400 });
  if (file.size > 25 * 1024 * 1024) return NextResponse.json({ error: 'File too large (max 25MB)' }, { status: 400 });

  // 3. Resize + convert to WebP. Handles PNG/JPEG/WebP/etc. via sharp.
  let webp: Buffer;
  try {
    const input = Buffer.from(await file.arrayBuffer());
    webp = await sharp(input)
      .rotate()                                   // honour EXIF orientation
      .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();
  } catch {
    return NextResponse.json({ error: 'Could not process image (unsupported or corrupt file)' }, { status: 400 });
  }

  // 4. Upload to Storage. Path: <kind>/<slug>-<timestamp>.webp (timestamp busts the CDN cache on replace).
  const path = `${kind}/${slug}-${Date.now()}.webp`;
  const svc = serviceClient();
  const { error: upErr } = await svc.storage.from(BUCKET).upload(path, webp, {
    contentType: 'image/webp',
    upsert: true,
  });
  if (upErr) return NextResponse.json({ error: `Upload failed: ${upErr.message}` }, { status: 500 });

  // 5. Return the public URL (bucket is public-read).
  const { data: pub } = svc.storage.from(BUCKET).getPublicUrl(path);
  return NextResponse.json({ url: pub.publicUrl, path, bytes: webp.length });
}
