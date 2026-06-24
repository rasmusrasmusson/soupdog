// src/components/recipe/NutrientDetailModal.tsx
'use client';
import React, { useState, useEffect, useCallback } from 'react';

// "Tap a nutrient for details" modal — the nutrient parallel of ToolDetailModal /
// TaskDetailModal. Give it a nutrient key (e.g. 'protein', 'vitamin_e', 'aa_leucine');
// it fetches /api/nutrients/[key] and renders the summary, category, and a "Full page →"
// link. Optionally pass `amount` + `unit` (the value shown in the panel this was tapped
// from, e.g. 25.63 mg of Vitamin E per 100g / per serving) and it shows that amount in
// context. Self-contained; usable anywhere a nutrient is shown (recipe panel, ingredient
// page, later the demand "for your table" panel).

type Nutrient = {
  id: string; key: string; name: string; category: string; unit: string;
  summary: string | null; description: string | null; rda_reference: string | null;
};

const CATEGORY_LABELS: Record<string, string> = {
  macro: 'Macronutrient', vitamin: 'Vitamin', mineral: 'Mineral',
  fatty_acid: 'Fat / fatty acid', amino_acid: 'Amino acid', other: 'Other',
};

export function NutrientDetailModal({
  nutrientKey, amount, amountLabel, onClose,
}: {
  nutrientKey: string;
  amount?: number | null;       // optional value to show in context (e.g. amount in this food)
  amountLabel?: string;         // e.g. "per 100g" / "in this recipe" / "per serving"
  onClose: () => void;
}) {
  const [nutrient, setNutrient] = useState<Nutrient | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setNotFound(false);
    fetch(`/api/nutrients/${encodeURIComponent(nutrientKey)}`)
      .then(async r => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then(d => { if (!cancelled) { setNutrient(d.nutrient ?? null); setLoading(false); } })
      .catch(() => { if (!cancelled) { setNotFound(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, [nutrientKey]);

  const onKey = useCallback((e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }, [onClose]);
  useEffect(() => { document.addEventListener('keydown', onKey); return () => document.removeEventListener('keydown', onKey); }, [onKey]);

  const MONO = 'var(--font-mono)';
  const MUT = 'var(--muted)';
  const B = '1px solid var(--border)';
  const display = nutrient?.name ?? nutrientKey;
  const body = nutrient?.summary || nutrient?.description || null;

  return (
    <div onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 120,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: 'var(--surface)', border: B, borderRadius: 10,
          width: 'min(460px, 100%)', maxHeight: '80vh', overflow: 'auto', padding: 28, position: 'relative' }}>
        <button onClick={onClose} aria-label="Close"
          style={{ position: 'absolute', top: 16, right: 18, border: 'none', background: 'none',
            cursor: 'pointer', fontSize: 18, color: MUT, lineHeight: 1 }}>×</button>

        <div style={{ fontFamily: MONO, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.18em', color: MUT, marginBottom: 6 }}>
          {nutrient ? (CATEGORY_LABELS[nutrient.category] ?? 'Nutrient') : 'Nutrient'}
        </div>
        <h2 className="font-display" style={{ fontSize: 24, fontWeight: 400, color: 'var(--fg)', margin: '0 0 12px' }}>
          {display}
        </h2>

        {/* Context amount (when tapped from a nutrition panel) */}
        {amount != null && nutrient && (
          <div style={{ fontFamily: MONO, fontSize: 12, color: 'var(--fg)', marginBottom: 14,
            padding: '8px 12px', background: 'var(--accent-subtle)', border: B, borderRadius: 6 }}>
            <span style={{ fontSize: 15, color: 'var(--accent)' }}>{fmt(amount)} {nutrient.unit}</span>
            {amountLabel && <span style={{ color: MUT, marginLeft: 8 }}>{amountLabel}</span>}
          </div>
        )}

        {loading && <div style={{ fontFamily: MONO, fontSize: 12, color: MUT }}>Loading…</div>}

        {notFound && !loading && (
          <div style={{ fontFamily: MONO, fontSize: 12, color: MUT, lineHeight: 1.6 }}>
            We don't have details for this nutrient yet.
          </div>
        )}

        {nutrient && !loading && (
          <>
            {body && <p style={{ fontSize: 13.5, lineHeight: 1.7, color: 'var(--fg)', margin: '0 0 14px' }}>{body}</p>}
            {nutrient.rda_reference && (
              <div style={{ fontFamily: MONO, fontSize: 11, color: MUT, marginBottom: 14 }}>
                Reference · {nutrient.rda_reference}
              </div>
            )}
            <a href={`/nutrients/${nutrient.key}`}
              style={{ display: 'inline-block', marginTop: 4, fontFamily: MONO, fontSize: 11,
                color: 'var(--accent)', textDecoration: 'underline' }}>
              Learn more →
            </a>
          </>
        )}
      </div>
    </div>
  );
}

function fmt(a: number): string {
  if (a >= 100) return a.toFixed(0);
  if (a >= 1) return a.toFixed(1);
  if (a >= 0.01) return a.toFixed(2);
  return a.toFixed(3);
}
