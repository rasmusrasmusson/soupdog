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
  const [dragOver, setDragOver] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleFile(file: File) {
    if (!file.type.startsWith('image/')) { setErr('Please choose an image file.'); return; }
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

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (busy) return;
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
        style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
      />

      {/* Dropzone — click to pick, or drag a file in (like the recipe import) */}
      <div
        onClick={() => { if (!busy) inputRef.current?.click(); }}
        onDrop={onDrop}
        onDragOver={e => { e.preventDefault(); if (!busy) setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        role="button"
        tabIndex={0}
        onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && !busy) { e.preventDefault(); inputRef.current?.click(); } }}
        style={{
          display: 'flex', alignItems: 'center', gap: 16, padding: 14,
          border: `1px dashed ${dragOver ? 'var(--accent)' : value ? 'var(--accent)' : 'var(--border)'}`,
          background: dragOver ? 'var(--accent-subtle)' : 'var(--surface)',
          cursor: busy ? 'default' : 'pointer', transition: 'border-color 0.15s, background 0.15s',
        }}
      >
        {/* Preview */}
        <div style={{
          width: 88, height: 88, flexShrink: 0, border: B, background: 'var(--bg)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
        }}>
          {value
            ? <img src={value} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <span style={{ fontFamily: MONO, fontSize: 9, color: MUT, textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.08em' }}>No image</span>}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, color: 'var(--fg)' }}>
            {busy
              ? 'Uploading…'
              : dragOver
                ? 'Drop to upload'
                : value ? 'Drag a new image here, or click to replace' : 'Drag an image here, or click to choose'}
          </div>
          <p style={{ fontSize: 11, color: MUT, marginTop: 6, lineHeight: 1.5 }}>
            PNG, JPEG or WebP. Resized and optimised automatically on upload.
          </p>
          {err && <p style={{ fontSize: 12, color: '#a33', marginTop: 4 }}>{err}</p>}
        </div>

        {value && !busy && (
          <button
            type="button"
            onClick={e => { e.stopPropagation(); onChange(''); }}
            style={{
              fontFamily: MONO, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase',
              padding: '7px 12px', cursor: 'pointer', border: B, background: 'transparent',
              color: MUT, flexShrink: 0,
            }}>
            Remove
          </button>
        )}
      </div>
    </div>
  );
}
