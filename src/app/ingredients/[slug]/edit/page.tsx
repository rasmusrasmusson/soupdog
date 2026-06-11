'use client';
// src/app/ingredients/[slug]/edit/page.tsx
//
// Admin edit form for an ingredient. Parity with the tool editor:
// fixed bottom save bar, ImageUpload (kind='ingredients'), content-reviewed
// (publish) toggle. PATCHes /api/admin/ingredients/[id]. Returns to the view
// page on save. Not-authorised guard via /api/admin/check.

import React, { useState, useEffect, use } from 'react';
import { ImageUpload } from '@/components/admin/ImageUpload';
import { SubSectionEditor, SubSection } from '@/components/knowledge/SubSectionEditor';
import { CompositionEditor, type CompositionEntry } from '@/components/knowledge/CompositionEditor';

interface IngredientEdit {
  id: string; slug: string; name: string; category: string;
  summary?: string; short_description?: string; description?: string;
  taste_profile?: string; storage_notes?: string; history?: string;
  manufacturing_notes?: string; cultural_notes?: string;
  uses?: string[]; allergens?: string[]; season?: string[];
  is_vegan?: boolean | null; is_vegetarian?: boolean | null;
  is_halal?: boolean | null; is_kosher?: boolean | null; is_gluten_free?: boolean | null;
  image_url?: string; image_credit?: string;
  is_product?: boolean;
  brand?: string; manufacturer?: string; barcode?: string;
  net_weight_g?: number | null; serving_size_g?: number | null;
  packaging_type?: string; producer?: string; country_of_origin?: string;
  ingredient_list?: string; off_id?: string;
  content_reviewed?: boolean;
  archived?: boolean;
}

const MONO = 'var(--font-mono)';
const MUT = 'var(--muted)';
const B = '1px solid var(--border)';

const labelStyle: React.CSSProperties = {
  display: 'block', fontFamily: MONO, fontSize: 10, color: MUT,
  textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 6,
};
const inputStyle: React.CSSProperties = {
  width: '100%', border: B, background: 'var(--surface)', padding: '8px 10px',
  fontSize: 14, color: 'var(--fg)', outline: 'none',
};
const sectionLabel: React.CSSProperties = {
  fontFamily: MONO, fontSize: 10, color: 'var(--accent)',
  textTransform: 'uppercase', letterSpacing: '0.15em',
  margin: '28px 0 14px', paddingBottom: 6, borderBottom: B,
};

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <label style={labelStyle}>{label}</label>
      {children}
      {hint && <p style={{ fontFamily: MONO, fontSize: 10, color: MUT, margin: '6px 0 0' }}>{hint}</p>}
    </div>
  );
}

// Tri-state dietary picker: Yes / No / Unknown(null).
function TriState({ value, onChange }: { value: boolean | null | undefined; onChange: (v: boolean | null) => void }) {
  const opts: [string, boolean | null][] = [['Yes', true], ['No', false], ['Unknown', null]];
  return (
    <div style={{ display: 'inline-flex', border: B }}>
      {opts.map(([label, v], i) => {
        const active = (value ?? null) === v;
        return (
          <button key={label} type="button" onClick={() => onChange(v)}
            style={{ fontFamily: MONO, fontSize: 11, padding: '5px 12px',
              borderLeft: i === 0 ? 'none' : B, cursor: 'pointer',
              background: active ? 'var(--accent)' : 'transparent',
              color: active ? '#fff' : MUT }}>
            {label}
          </button>
        );
      })}
    </div>
  );
}

export default function IngredientEditPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [ing, setIng] = useState<IngredientEdit | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [subSections, setSubSections] = useState<Record<string, SubSection[]>>({});
  const [composition, setComposition] = useState<CompositionEntry[]>([]);

  useEffect(() => {
    fetch('/api/admin/check')
      .then(r => r.json())
      .then(d => setAllowed(Boolean(d.isAdmin)))
      .catch(() => setAllowed(false));

    fetch(`/api/ingredients/${slug}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); setLoading(false); return; }
        const t = d.ingredient;
        setIng({
          id: t.id, slug: t.slug, name: t.name, category: t.category ?? 'other',
          summary: t.summary ?? '', short_description: t.short_description ?? '',
          description: t.description ?? '',
          taste_profile: t.taste_profile ?? '', storage_notes: t.storage_notes ?? '',
          history: t.history ?? '', manufacturing_notes: t.manufacturing_notes ?? '',
          cultural_notes: t.cultural_notes ?? '',
          uses: t.uses ?? [], allergens: t.allergens ?? [], season: t.season ?? [],
          is_vegan: t.is_vegan ?? null, is_vegetarian: t.is_vegetarian ?? null,
          is_halal: t.is_halal ?? null, is_kosher: t.is_kosher ?? null,
          is_gluten_free: t.is_gluten_free ?? null,
          image_url: t.image_url ?? '', image_credit: t.image_credit ?? '',
          is_product: Boolean(t.is_product),
          brand: t.brand ?? '', manufacturer: t.manufacturer ?? '', barcode: t.barcode ?? '',
          net_weight_g: t.net_weight_g ?? null, serving_size_g: t.serving_size_g ?? null,
          packaging_type: t.packaging_type ?? '', producer: t.producer ?? '',
          country_of_origin: t.country_of_origin ?? '', ingredient_list: t.ingredient_list ?? '',
          off_id: t.off_id ?? '',
          content_reviewed: Boolean(t.content_reviewed),
          archived: t.archived_at != null,
        });
        // Normalise loaded sub-sections (API returns rows per section_key).
        const raw = d.ingredient.sections ?? {};
        const norm: Record<string, SubSection[]> = {};
        for (const key of Object.keys(raw)) {
          norm[key] = (raw[key] ?? []).map((r: any) => ({
            headline: r.headline ?? '', image_url: r.image_url ?? '',
            image_credit: r.image_credit ?? '', body: r.body ?? '',
            bullets: Array.isArray(r.bullets) ? r.bullets : [],
          }));
        }
        setSubSections(norm);
        setComposition(d.ingredient.composition ?? []);
        setLoading(false);
      })
      .catch(() => { setError('Failed to load.'); setLoading(false); });
  }, [slug]);

  function set<K extends keyof IngredientEdit>(k: K, v: IngredientEdit[K]) {
    setIng(t => t ? { ...t, [k]: v } : t);
    setSaved(false);
  }

  async function save() {
    if (!ing) return;
    setSaving(true); setError(null);
    const res = await fetch(`/api/admin/ingredients/${ing.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: ing.name, category: ing.category,
        summary: ing.summary, short_description: ing.short_description,
        description: ing.description, taste_profile: ing.taste_profile,
        storage_notes: ing.storage_notes, history: ing.history,
        manufacturing_notes: ing.manufacturing_notes, cultural_notes: ing.cultural_notes,
        uses: ing.uses, allergens: ing.allergens, season: ing.season,
        is_vegan: ing.is_vegan, is_vegetarian: ing.is_vegetarian,
        is_halal: ing.is_halal, is_kosher: ing.is_kosher, is_gluten_free: ing.is_gluten_free,
        image_url: ing.image_url, image_credit: ing.image_credit,
        brand: ing.brand, manufacturer: ing.manufacturer, barcode: ing.barcode,
        net_weight_g: ing.net_weight_g, serving_size_g: ing.serving_size_g,
        packaging_type: ing.packaging_type, producer: ing.producer,
        country_of_origin: ing.country_of_origin, ingredient_list: ing.ingredient_list,
        off_id: ing.off_id,
        content_reviewed: ing.content_reviewed,
      }),
    });
    const d = await res.json();
    if (!res.ok) { setSaving(false); setError(d.error ?? 'Save failed.'); return; }

    // Persist all sub-section groups (one replace-all POST per section_key).
    try {
      const keys = Object.keys(subSections);
      await Promise.all(keys.map(async (sectionKey) => {
        const r = await fetch('/api/admin/content-sections', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            entityType: 'ingredient', entityId: ing.id, sectionKey,
            items: subSections[sectionKey],
          }),
        });
        if (!r.ok) {
          let detail = `HTTP ${r.status}`;
          try {
            const e = await r.json();
            if (e?.error) detail = e.error;
          } catch {
            if (r.status === 404) detail = 'Save endpoint not found (route not deployed?)';
          }
          throw new Error(`${sectionKey}: ${detail}`);
        }
      }));
    } catch (e: any) {
      setSaving(false);
      setError(e.message ?? 'Sub-sections failed to save.');
      return;
    }

    setSaving(false);
    setSaved(true);
    window.location.href = `/ingredients/${ing.slug}`;
  }

  if (allowed === false) return (
    <div style={{ padding: 32, fontFamily: MONO, fontSize: 12, color: MUT }}>Not authorised.</div>
  );
  if (loading || !ing) return (
    <div className="flex items-center justify-center h-64">
      <span style={{ fontFamily: MONO, fontSize: 11, color: MUT,
        textTransform: 'uppercase', letterSpacing: '0.18em' }}>Loading…</span>
    </div>
  );

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 32px 100px' }}>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8,
        fontFamily: MONO, fontSize: 11, color: MUT,
        textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
        <a href="/ingredients" style={{ color: MUT, textDecoration: 'none' }}>Ingredients</a>
        <span>›</span>
        <a href={`/ingredients/${ing.slug}`} style={{ color: MUT, textDecoration: 'none' }}>{ing.name}</a>
        <span>›</span>
        <span style={{ color: 'var(--fg)' }}>Edit</span>
      </div>

      <h1 className="font-display" style={{ fontSize: 26, fontWeight: 400, margin: '0 0 24px' }}>
        Edit: {ing.name}
      </h1>

      {/* ── Basics ──────────────────────────────────────────── */}
      <Field label="Name">
        <input style={inputStyle} value={ing.name} onChange={e => set('name', e.target.value)} />
      </Field>
      <Field label="Category">
        <input style={inputStyle} value={ing.category} onChange={e => set('category', e.target.value)} />
      </Field>
      <Field label="Summary (the page lead — 2-3 sentences)">
        <textarea style={{ ...inputStyle, minHeight: 70, resize: 'vertical' }}
          value={ing.summary} onChange={e => set('summary', e.target.value)} />
      </Field>
      <Field label="Short description (one line; for the recipe click-to-reveal)"
        hint="Optional. Leave blank to fall back to the first sentence of the summary.">
        <input style={inputStyle} value={ing.short_description} onChange={e => set('short_description', e.target.value)} />
      </Field>
      <Field label="Taste profile">
        <textarea style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }}
          value={ing.taste_profile} onChange={e => set('taste_profile', e.target.value)} />
      </Field>

      {/* ── Content sections ────────────────────────────────── */}
      <div style={sectionLabel}>Content sections</div>
      <Field label="How to use — common uses (one per line)">
        <textarea style={{ ...inputStyle, minHeight: 90, resize: 'vertical' }}
          value={(ing.uses ?? []).join('\n')}
          onChange={e => set('uses', e.target.value.split('\n').map(s => s.trim()).filter(Boolean))} />
      </Field>
      <Field label="Storing and shelf life">
        <textarea style={{ ...inputStyle, minHeight: 110, resize: 'vertical' }}
          value={ing.storage_notes} onChange={e => set('storage_notes', e.target.value)} />
      </Field>
      <SubSectionEditor slug={ing.slug} sectionKey="storing" sectionLabel="Storing"
        imageKind="ingredients" value={subSections['storing'] ?? []}
        onChange={next => { setSubSections(s => ({ ...s, storing: next })); setSaved(false); }} />

      <Field label="Culture and religion">
        <textarea style={{ ...inputStyle, minHeight: 90, resize: 'vertical' }}
          value={ing.cultural_notes} onChange={e => set('cultural_notes', e.target.value)} />
      </Field>
      <SubSectionEditor slug={ing.slug} sectionKey="culture" sectionLabel="Culture"
        imageKind="ingredients" value={subSections['culture'] ?? []}
        onChange={next => { setSubSections(s => ({ ...s, culture: next })); setSaved(false); }} />

      <Field label="Production / cultivation">
        <textarea style={{ ...inputStyle, minHeight: 110, resize: 'vertical' }}
          value={ing.manufacturing_notes} onChange={e => set('manufacturing_notes', e.target.value)} />
      </Field>
      <SubSectionEditor slug={ing.slug} sectionKey="production" sectionLabel="Production"
        imageKind="ingredients" value={subSections['production'] ?? []}
        onChange={next => { setSubSections(s => ({ ...s, production: next })); setSaved(false); }} />

      <Field label="History">
        <textarea style={{ ...inputStyle, minHeight: 110, resize: 'vertical' }}
          value={ing.history} onChange={e => set('history', e.target.value)} />
      </Field>
      <SubSectionEditor slug={ing.slug} sectionKey="history" sectionLabel="History"
        imageKind="ingredients" value={subSections['history'] ?? []}
        onChange={next => { setSubSections(s => ({ ...s, history: next })); setSaved(false); }} />

      {/* ── Composition (derived ingredients) ───────────────── */}
      <div style={sectionLabel}>Composition</div>
      <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 12px', lineHeight: 1.5 }}>
        Ingredients that come from {ing.name?.toLowerCase()} — pulp, juice, zest, etc. Each is its own
        ingredient. Changes here save immediately.
      </p>
      <CompositionEditor parentId={ing.id} parentName={ing.name ?? 'this ingredient'} value={composition} />

      {/* ── Allergies & diets ───────────────────────────────── */}
      <div style={sectionLabel}>Allergies &amp; diets</div>
      <Field label="Allergens (one per line — e.g. nuts, milk, gluten)">
        <textarea style={{ ...inputStyle, minHeight: 70, resize: 'vertical' }}
          value={(ing.allergens ?? []).join('\n')}
          onChange={e => set('allergens', e.target.value.split('\n').map(s => s.trim()).filter(Boolean))} />
      </Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 24px' }}>
        <Field label="Vegan"><TriState value={ing.is_vegan} onChange={v => set('is_vegan', v)} /></Field>
        <Field label="Vegetarian"><TriState value={ing.is_vegetarian} onChange={v => set('is_vegetarian', v)} /></Field>
        <Field label="Halal"><TriState value={ing.is_halal} onChange={v => set('is_halal', v)} /></Field>
        <Field label="Kosher"><TriState value={ing.is_kosher} onChange={v => set('is_kosher', v)} /></Field>
        <Field label="Gluten-free"><TriState value={ing.is_gluten_free} onChange={v => set('is_gluten_free', v)} /></Field>
      </div>

      {/* ── Image ───────────────────────────────────────────── */}
      <div style={sectionLabel}>Hero image</div>
      <Field label="Hero image">
        <ImageUpload kind="ingredients" slug={ing.slug} value={ing.image_url} onChange={url => set('image_url', url)} />
      </Field>
      <Field label="Image credit">
        <input style={inputStyle} value={ing.image_credit} onChange={e => set('image_credit', e.target.value)} />
      </Field>

      {/* ── Product fields (products only) ──────────────────── */}
      {ing.is_product && (
        <>
          <div style={sectionLabel}>Product information</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Field label="Brand"><input style={inputStyle} value={ing.brand} onChange={e => set('brand', e.target.value)} /></Field>
            <Field label="Manufacturer"><input style={inputStyle} value={ing.manufacturer} onChange={e => set('manufacturer', e.target.value)} /></Field>
            <Field label="Barcode"><input style={inputStyle} value={ing.barcode} onChange={e => set('barcode', e.target.value)} /></Field>
            <Field label="Producer"><input style={inputStyle} value={ing.producer} onChange={e => set('producer', e.target.value)} /></Field>
            <Field label="Net weight (g)">
              <input style={inputStyle} type="number" value={ing.net_weight_g ?? ''}
                onChange={e => set('net_weight_g', e.target.value === '' ? null : Number(e.target.value))} />
            </Field>
            <Field label="Serving size (g)">
              <input style={inputStyle} type="number" value={ing.serving_size_g ?? ''}
                onChange={e => set('serving_size_g', e.target.value === '' ? null : Number(e.target.value))} />
            </Field>
            <Field label="Packaging"><input style={inputStyle} value={ing.packaging_type} onChange={e => set('packaging_type', e.target.value)} /></Field>
            <Field label="Country of origin"><input style={inputStyle} value={ing.country_of_origin} onChange={e => set('country_of_origin', e.target.value)} /></Field>
          </div>
          <Field label="Ingredient list (from packaging)">
            <textarea style={{ ...inputStyle, minHeight: 70, resize: 'vertical' }}
              value={ing.ingredient_list} onChange={e => set('ingredient_list', e.target.value)} />
          </Field>
        </>
      )}

      {/* ── Curation ────────────────────────────────────────── */}
      <div style={sectionLabel}>Curation</div>
      <div style={{ border: B, padding: 14, background: ing.content_reviewed ? 'var(--accent-subtle)' : 'var(--surface)' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, cursor: 'pointer' }}>
          <input type="checkbox" checked={Boolean(ing.content_reviewed)}
            onChange={e => set('content_reviewed', e.target.checked)} />
          <span>
            <strong style={{ fontWeight: 500 }}>
              {ing.content_reviewed ? 'Verified — content reviewed' : 'Mark as verified'}
            </strong>
            <span style={{ display: 'block', fontSize: 12, color: MUT, marginTop: 2 }}>
              Verified ingredients show the “Verified” badge instead of “AI · Draft”.
            </span>
          </span>
        </label>
      </div>

      {/* Fixed bottom save bar (no chat sidebar → right:0) */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0,
        borderTop: B, background: 'var(--surface)', padding: '10px 32px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 50 }}>
        <span style={{ fontFamily: MONO, fontSize: 11, color: error ? '#a33' : MUT }}>
          {error ? error : saved ? 'Saved.' : ing.archived ? 'Archived' : 'Editing'}
        </span>
        <button onClick={save} disabled={saving}
          style={{ fontFamily: MONO, fontSize: 12, color: '#fff',
            background: 'var(--accent)', border: 'none', padding: '8px 20px',
            cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1,
            textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}
