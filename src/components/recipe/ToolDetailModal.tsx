// src/components/recipe/ToolDetailModal.tsx
'use client';
import React, { useState, useEffect, useCallback } from 'react';

// "Click a tool for details" modal — the tool-side parallel of TaskDetailModal.
// Give it a tool slug; it fetches /api/tools/[slug] and renders name, summary/
// description, category, uses, and (if present) brand/model. Self-contained and
// usable anywhere a tool is shown (recipe step, cook mode, etc.).

type Tool = {
  id: string; slug: string; name: string; category: string | null;
  description: string | null; summary: string | null; description_long: string | null;
  brand: string | null; model_number: string | null; manufacturer: string | null;
  connected: boolean | null; wattage: number | null; uses: string | null;
  image_url: string | null;
};

const prettify = (s: string) => s.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

export function ToolDetailModal({ slug, onClose }: { slug: string; onClose: () => void }) {
  const [tool, setTool] = useState<Tool | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setNotFound(false);
    fetch(`/api/tools/${encodeURIComponent(slug)}`)
      .then(async r => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then(d => { if (!cancelled) { setTool(d.tool ?? d); setLoading(false); } })
      .catch(() => { if (!cancelled) { setNotFound(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, [slug]);

  const onKey = useCallback((e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }, [onClose]);
  useEffect(() => { document.addEventListener('keydown', onKey); return () => document.removeEventListener('keydown', onKey); }, [onKey]);

  const MONO = 'var(--font-mono)';
  const MUT = 'var(--muted)';
  const B = '1px solid var(--border)';
  const display = tool ? prettify(tool.name) : prettify(slug);
  const body = tool?.summary || tool?.description || tool?.description_long || null;

  return (
    <div onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 120,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: 'var(--surface)', border: B, borderRadius: 10,
          width: 'min(520px, 100%)', maxHeight: '80vh', overflow: 'auto', padding: 28, position: 'relative' }}>
        <button onClick={onClose} aria-label="Close"
          style={{ position: 'absolute', top: 16, right: 18, border: 'none', background: 'none',
            cursor: 'pointer', fontSize: 18, color: MUT, lineHeight: 1 }}>×</button>

        <div style={{ fontFamily: MONO, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.18em', color: MUT, marginBottom: 6 }}>
          Tool
        </div>
        <h2 className="font-display" style={{ fontSize: 26, fontWeight: 400, color: 'var(--fg)', margin: '0 0 14px' }}>
          {display}
        </h2>

        {loading && <div style={{ fontFamily: MONO, fontSize: 12, color: MUT }}>Loading…</div>}

        {notFound && !loading && (
          <div style={{ fontFamily: MONO, fontSize: 12, color: MUT, lineHeight: 1.6 }}>
            We don't have details for this tool yet.
          </div>
        )}

        {tool && !loading && (
          <>
            {tool.image_url && (
              <img src={tool.image_url} alt={display}
                style={{ width: '100%', maxHeight: 200, objectFit: 'cover', borderRadius: 8, marginBottom: 16, border: B }} />
            )}
            {body && <p style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--fg-secondary)', margin: '0 0 16px' }}>{body}</p>}

            {tool.uses && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontFamily: MONO, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.18em', color: MUT, marginBottom: 4 }}>Uses</div>
                <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--fg)', margin: 0 }}>{tool.uses}</p>
              </div>
            )}

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 20px', fontFamily: MONO, fontSize: 11, color: MUT }}>
              {tool.category && <span>Category · {prettify(tool.category)}</span>}
              {tool.brand && <span>Brand · {tool.brand}</span>}
              {tool.model_number && <span>Model · {tool.model_number}</span>}
              {tool.wattage ? <span>{tool.wattage.toLocaleString()} W</span> : null}
              {tool.connected ? <span>Smart / connected</span> : null}
            </div>

            {tool.slug && (
              <a href={`/tools/${tool.slug}`}
                style={{ display: 'inline-block', marginTop: 18, fontFamily: MONO, fontSize: 11, color: 'var(--accent)', textDecoration: 'underline' }}>
                Full tool page →
              </a>
            )}
          </>
        )}
      </div>
    </div>
  );
}
