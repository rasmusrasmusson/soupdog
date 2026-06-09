'use client';
// src/components/admin/ImageUpload.tsx
import { useRef, useState } from 'react';

const MONO = 'var(--font-mono)';
const MUT = 'var(--muted)';
const B = '1px solid var(--border)';

interface Props {
  /** Storage path prefix: 'techniques' | 'tools' | 'ingredients' | 'recipes' | 'meals' */
  kind: string;
  /** Slug of the entity (used in the stored filename). */
  slug: string;
  /** Current image URL (shown as preview). */
  value: string | null | undefined;
  /** Called with the new public URL after a successful upload, or '' when cleared. */
  onChange: (url: string) => void;
}

export function ImageUpload({ kind, slug, value, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleFile(file: File) {
    setBusy(true); setErr(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('kind', kind);
      fd.append('slug', slug || 'image');
      const res = await fetch('/api/admin/upload-image', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      onChange(data.url);
    } catch (e: any) {
      setErr(e.message || 'Upload failed');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
        {/* Preview */}
        <div style={{
          width: 96, height: 96, flexShrink: 0, border: B, background: 'var(--surface)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
        }}>
          {value
            ? <img src={value} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <span style={{ fontFamily: MONO, fontSize: 9, color: MUT, textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.08em' }}>No image</span>}
        </div>

        <div style={{ flex: 1 }}>
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
            style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              style={{
                fontFamily: MONO, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase',
                padding: '7px 14px', cursor: busy ? 'default' : 'pointer',
                border: '1px solid var(--accent)', background: 'transparent', color: 'var(--accent)',
                opacity: busy ? 0.6 : 1,
              }}>
              {busy ? 'Uploading…' : value ? 'Replace image' : 'Upload image'}
            </button>
            {value && !busy && (
              <button
                type="button"
                onClick={() => onChange('')}
                style={{
                  fontFamily: MONO, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase',
                  padding: '7px 14px', cursor: 'pointer', border: B, background: 'transparent', color: MUT,
                }}>
                Remove
              </button>
            )}
          </div>
          <p style={{ fontSize: 11, color: MUT, marginTop: 8, lineHeight: 1.5 }}>
            PNG, JPEG or WebP. Resized and optimised automatically on upload.
          </p>
          {err && <p style={{ fontSize: 12, color: '#a33', marginTop: 4 }}>{err}</p>}
        </div>
      </div>
    </div>
  );
}
