// src/components/recipe/IngredientDetailModal.tsx
'use client';
import React, { useState, useEffect, useCallback } from 'react';

// "Tap an ingredient for details" modal — the ingredient parallel of ToolDetailModal /
// TaskDetailModal / NutrientDetailModal. Give it an ingredient slug; it fetches
// /api/ingredients/[slug] and shows name, summary (+ taste/category when present) and a
// "Full ingredient page →" link. Degrades gracefully when content is missing (some
// ingredients have no AI summary yet) — always shows name + category + the full-page link.

type Ingredient = {
  id: string; slug: string; name: string; category: string | null;
  summary: string | null; taste_profile: string | null; image_url: string | null;
};

const prettify = (s: string) => s.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

export function IngredientDetailModal({ slug, onClose }: { slug: string; onClose: () => void }) {
  const [ing, setIng] = useState<Ingredient | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setNotFound(false);
    fetch(`/api/ingredients/${encodeURIComponent(slug)}`)
      .then(async r => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then(d => { if (!cancelled) { setIng(d.ingredient ?? d); setLoading(false); } })
      .catch(() => { if (!cancelled) { setNotFound(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, [slug]);

  const onKey = useCallback((e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }, [onClose]);
  useEffect(() => { document.addEventListener('keydown', onKey); return () => document.removeEventListener('keydown', onKey); }, [onKey]);

  const MONO = 'var(--font-mono)';
  const MUT = 'var(--muted)';
  const B = '1px solid var(--border)';
  const display = ing ? prettify(ing.name) : prettify(slug);

  return (
    <div onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 120,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: 'var(--surface)', border: B, borderRadius: 10,
          width: 'min(480px, 100%)', maxHeight: '80vh', overflow: 'auto', padding: 28, position: 'relative' }}>
        <button onClick={onClose} aria-label="Close"
          style={{ position: 'absolute', top: 16, right: 18, border: 'none', background: 'none',
            cursor: 'pointer', fontSize: 18, color: MUT, lineHeight: 1 }}>×</button>

        <div style={{ fontFamily: MONO, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.18em', color: MUT, marginBottom: 6 }}>
          Ingredient
        </div>
        <h2 className="font-display" style={{ fontSize: 24, fontWeight: 400, color: 'var(--fg)', margin: '0 0 14px' }}>
          {display}
        </h2>

        {loading && <div style={{ fontFamily: MONO, fontSize: 12, color: MUT }}>Loading…</div>}

        {notFound && !loading && (
          <div style={{ fontFamily: MONO, fontSize: 12, color: MUT, lineHeight: 1.6 }}>
            We don't have details for this ingredient yet.
          </div>
        )}

        {ing && !loading && (
          <>
            {ing.image_url && (
              <img src={ing.image_url} alt={display}
                style={{ width: '100%', maxHeight: 180, objectFit: 'cover', borderRadius: 8, marginBottom: 14, border: B }} />
            )}
            {ing.summary && <p style={{ fontSize: 13.5, lineHeight: 1.7, color: 'var(--fg)', margin: '0 0 12px' }}>{ing.summary}</p>}
            {ing.taste_profile && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontFamily: MONO, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.18em', color: MUT, marginBottom: 3 }}>Taste</div>
                <p style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--fg)', margin: 0 }}>{ing.taste_profile}</p>
              </div>
            )}
            {ing.category && (
              <div style={{ fontFamily: MONO, fontSize: 11, color: MUT, marginBottom: 6 }}>
                Category · {prettify(ing.category)}
              </div>
            )}
            {!ing.summary && !ing.taste_profile && (
              <p style={{ fontSize: 12.5, lineHeight: 1.6, color: MUT, margin: '0 0 12px' }}>
                More detail on the full page.
              </p>
            )}
            {ing.slug && (
              <a href={`/ingredients/${ing.slug}`}
                style={{ display: 'inline-block', marginTop: 6, fontFamily: MONO, fontSize: 11, color: 'var(--accent)', textDecoration: 'underline' }}>
                Full ingredient page →
              </a>
            )}
          </>
        )}
      </div>
    </div>
  );
}
