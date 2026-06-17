// src/app/api/admin/upload-media/route.ts
// Media upload for the task archive: handles BOTH images and videos.
// - Images  -> sharp -> WebP (same pipeline as upload-image).
// - Videos  -> stored as-is (no transcoding; sharp would corrupt them).
// Admin-gated. Writes to the existing public 'images' bucket under media/<kind>/.
// Does NOT touch upload-image (the proven image path stays untouched).
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import sharp from 'sharp';

const ADMIN_IDS = (process.env.SOUPDOG_ADMIN_ACCOUNT_IDS
  ?? 'bb02ae50-436c-4402-8c8c-447344e10151,1a0f72dd-f0a7-487c-9ecd-7ef898f8dabf')
  .split(',').map(s => s.trim()).filter(Boolean);

const BUCKET = 'images';            // reuse the existing public bucket
const MAX_EDGE = 1200;              // longest-edge cap for images
const WEBP_QUALITY = 82;
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;   // 25MB
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;  // 100MB — short technique clips only

const ALLOWED_KINDS = new Set(['techniques', 'tools', 'ingredients', 'recipes', 'meals']);

// video container -> extension + content type. Kept deliberately small;
// these are the web-friendly formats worth serving directly.
const VIDEO_TYPES: Record<string, { ext: string; ct: string }> = {
  'video/mp4':       { ext: 'mp4',  ct: 'video/mp4' },
  'video/webm':      { ext: 'webm', ct: 'video/webm' },
  'video/quicktime': { ext: 'mov',  ct: 'video/quicktime' },
};

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
  return (s || 'media').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'media';
}

export async function POST(req: NextRequest) {
  // 1. Admin gate (session-based, account id).
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!ADMIN_IDS.includes(user.id)) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  // 2. Read the multipart form.
  let form: FormData;
  try { form = await req.formData(); }
  catch { return NextResponse.json({ error: 'Expected multipart form data' }, { status: 400 }); }

  const file = form.get('file');
  const kind = String(form.get('kind') ?? '');
  const slug = safeSlug(String(form.get('slug') ?? ''));

  if (!(file instanceof File)) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  if (!ALLOWED_KINDS.has(kind)) return NextResponse.json({ error: `Invalid kind: ${kind}` }, { status: 400 });

  const mime = file.type || '';
  const isVideo = mime.startsWith('video/');
  const isImage = mime.startsWith('image/');

  if (!isVideo && !isImage) {
    return NextResponse.json({ error: 'File must be an image or a video' }, { status: 400 });
  }

  const svc = serviceClient();

  // 3a. VIDEO — store as-is (no sharp). Validate type + size.
  if (isVideo) {
    const vt = VIDEO_TYPES[mime];
    if (!vt) {
      return NextResponse.json({ error: `Unsupported video type: ${mime}. Use MP4, WebM, or MOV.` }, { status: 400 });
    }
    if (file.size > MAX_VIDEO_BYTES) {
      return NextResponse.json({ error: 'Video too large (max 100MB — keep technique clips short)' }, { status: 400 });
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    const path = `media/${kind}/${slug}-${Date.now()}.${vt.ext}`;
    const { error: upErr } = await svc.storage.from(BUCKET).upload(path, bytes, {
      contentType: vt.ct,
      upsert: true,
    });
    if (upErr) return NextResponse.json({ error: `Upload failed: ${upErr.message}` }, { status: 500 });
    const { data: pub } = svc.storage.from(BUCKET).getPublicUrl(path);
    return NextResponse.json({ url: pub.publicUrl, path, kind: 'video', bytes: bytes.length });
  }

  // 3b. IMAGE — sharp -> WebP (same as upload-image).
  if (file.size > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: 'Image too large (max 25MB)' }, { status: 400 });
  }
  let webp: Buffer;
  try {
    const input = Buffer.from(await file.arrayBuffer());
    webp = await sharp(input)
      .rotate()
      .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();
  } catch {
    return NextResponse.json({ error: 'Could not process image (unsupported or corrupt file)' }, { status: 400 });
  }
  const path = `media/${kind}/${slug}-${Date.now()}.webp`;
  const { error: upErr } = await svc.storage.from(BUCKET).upload(path, webp, {
    contentType: 'image/webp',
    upsert: true,
  });
  if (upErr) return NextResponse.json({ error: `Upload failed: ${upErr.message}` }, { status: 500 });
  const { data: pub } = svc.storage.from(BUCKET).getPublicUrl(path);
  return NextResponse.json({ url: pub.publicUrl, path, kind: 'image', bytes: webp.length });
}
