'use client';
// src/app/my/ingredients/new/page.tsx
// Create an ingredient node — generic taxonomy node or packaged product

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Loader2, Check, ChevronRight, Package } from 'lucide-react';

const MONO = 'var(--font-mono)';
const B    = '1px solid var(--border)';

function Label({ text }: { text: string }) {
  return (
    <div style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase' as const,
      letterSpacing: '0.18em', color: 'var(--muted)', marginBottom: 5 }}>
      {text}
    </div>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input {...props} style={{
      width: '100%', padding: '8px 10px', border: B,
      background: 'var(--surface)', color: 'var(--fg)',
      fontFamily: MONO, fontSize: 12, outline: 'none',
      boxSizing: 'border-box' as const, ...props.style,
    }} />
  );
}

function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea {...props} style={{
      width: '100%', padding: '8px 10px', border: B,
      background: 'var(--surface)', color: 'var(--fg)',
      fontFamily: MONO, fontSize: 12, outline: 'none',
      resize: 'vertical' as const, minHeight: 72,
      boxSizing: 'border-box' as const, ...props.style,
    }} />
  );
}

function FieldRow({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
      {children}
    </div>
  );
}

function Field({ l, hint, children }: { l: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <Label text={l} />
      {children}
      {hint && <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--muted)', marginTop: 3 }}>{hint}</div>}
    </div>
  );
}

const STORAGE_PRESETS = [
  { label: 'Frozen',       temp: -18 },
  { label: 'Refrigerated', temp:   4 },
  { label: 'Ambient',      temp:  20 },
];

export default function NewIngredientPage() {
  const router = useRouter();

  // ── Core fields ───────────────────────────────────────────
  const [name,        setName]        = useState('');
  const [description, setDescription] = useState('');
  const [category,    setCategory]    = useState('other');
  const [isProduct,   setIsProduct]   = useState(false);

  // ── Taxonomy ──────────────────────────────────────────────
  const [parentSearch,  setParentSearch]  = useState('');
  const [parentId,      setParentId]      = useState<string|null>(null);
  const [parentName,    setParentName]    = useState('');
  const [parentResults, setParentResults] = useState<any[]>([]);

  // ── Product fields ────────────────────────────────────────
  const [barcodeInput,   setBarcodeInput]   = useState('');
  const [nameSearch,     setNameSearch]     = useState('');
  const [lookupStatus,   setLookupStatus]   = useState<'idle'|'loading'|'found'|'not_found'|'error'>('idle');
  const [offResults,     setOffResults]     = useState<any[]>([]);
  const [brand,          setBrand]          = useState('');
  const [barcode,        setBarcode]        = useState('');
  const [netWeight,      setNetWeight]      = useState<number|''>('');
  const [servingSize,    setServingSize]    = useState<number|''>('');
  const [packagingType,  setPackagingType]  = useState('');
  const [producer,       setProducer]       = useState('');
  const [countryOrigin,  setCountryOrigin]  = useState('');
  const [storageTemp,    setStorageTemp]    = useState<number|''>('');
  const [ingredientList, setIngredientList] = useState('');

  // ── Save state ────────────────────────────────────────────
  const [saving,  setSaving]  = useState(false);
  const [saveErr, setSaveErr] = useState<string|null>(null);

  // ── Parent search ─────────────────────────────────────────
  useEffect(() => {
    if (!parentSearch.trim() || parentSearch.length < 2) { setParentResults([]); return; }
    const timer = setTimeout(async () => {
      try {
        const res  = await fetch(`/api/ingredients/search?q=${encodeURIComponent(parentSearch)}&exclude_products=true`);
        const data = await res.json();
        setParentResults((data ?? []).slice(0, 6));
      } catch {}
    }, 300);
    return () => clearTimeout(timer);
  }, [parentSearch]);

  // ── Barcode lookup ────────────────────────────────────────
  const lookupBarcode = useCallback(async () => {
    if (!barcodeInput.trim()) return;
    setLookupStatus('loading'); setOffResults([]);
    try {
      const res  = await fetch(`/api/products/lookup?barcode=${encodeURIComponent(barcodeInput.trim())}`);
      const data = await res.json();
      if (data.found) {
        if (!name)  setName(data.name ?? '');
        setBrand(data.brand ?? ''); setBarcode(data.off_id ?? barcodeInput.trim());
        setNetWeight(data.net_weight_g ?? ''); setPackagingType(data.packaging_type ?? '');
        setIngredientList(data.ingredient_list ?? '');
        setIsProduct(true);
        setLookupStatus('found');
      } else {
        setBarcode(barcodeInput.trim()); setLookupStatus('not_found');
      }
    } catch { setLookupStatus('error'); }
  }, [barcodeInput, name]);

  // ── Name search ───────────────────────────────────────────
  const lookupName = useCallback(async () => {
    if (!nameSearch.trim()) return;
    setLookupStatus('loading');
    try {
      const res  = await fetch(`/api/products/lookup?name=${encodeURIComponent(nameSearch.trim())}`);
      const data = await res.json();
      if (data.found && data.products?.length) { setOffResults(data.products); setLookupStatus('found'); }
      else setLookupStatus('not_found');
    } catch { setLookupStatus('error'); }
  }, [nameSearch]);

  const selectOFFResult = (p: any) => {
    if (!name) setName(p.name ?? '');
    setBrand(p.brand ?? ''); setBarcode(p.barcode ?? '');
    setNetWeight(p.net_weight_g ?? '');
    setOffResults([]); setLookupStatus('found');
    setIsProduct(true);
  };

  // ── Save ──────────────────────────────────────────────────
  const handleSave = async () => {
    if (!name.trim()) { setSaveErr('Name is required'); return; }
    setSaving(true); setSaveErr(null);
    try {
      const res = await fetch('/api/my/ingredients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(), description: description.trim() || null,
          category, is_product: isProduct,
          parent_id: parentId,
          // Product fields
          brand:             brand.trim()          || null,
          barcode:           barcode.trim()        || null,
          net_weight_g:      netWeight   !== ''    ? netWeight   : null,
          serving_size_g:    servingSize !== ''    ? servingSize : null,
          packaging_type:    packagingType         || null,
          producer:          producer.trim()       || null,
          country_of_origin: countryOrigin.trim()  || null,
          base_temp_celsius: storageTemp !== ''    ? storageTemp : null,
          ingredient_list:   ingredientList.trim() || null,
        }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error ?? 'Save failed'); }
      const data = await res.json();
      router.push(`/ingredients/${data.slug}`);
    } catch (err: any) { setSaveErr(err.message); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 24px 80px' }}>

      {/* Header */}
      <div style={{ marginBottom: 28, borderBottom: B, paddingBottom: 16 }}>
        <div style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase',
          letterSpacing: '0.22em', color: 'var(--muted)', marginBottom: 6 }}>
          My Kitchen · Ingredients
        </div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 24,
          fontWeight: 400, margin: 0 }}>Add ingredient</h1>
        <p style={{ fontFamily: MONO, fontSize: 11, color: 'var(--muted)', marginTop: 6, lineHeight: 1.6 }}>
          Add a generic ingredient to the taxonomy, or a specific packaged product.
        </p>
      </div>

      {/* ── Core fields ── */}
      <div style={{ border: B, marginBottom: 16 }}>
        <div style={{ padding: '10px 14px', background: 'var(--surface-hover)', borderBottom: B,
          fontFamily: MONO, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.18em', fontWeight: 600 }}>
          Basic information
        </div>
        <div style={{ padding: 16 }}>
          <div style={{ marginBottom: 12 }}>
            <Field l="Name *">
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Frozen pizza, Olive oil, Mango" />
            </Field>
          </div>
          <div style={{ marginBottom: 12 }}>
            <Field l="Description">
              <Textarea value={description} onChange={e => setDescription(e.target.value)}
                placeholder="Brief description..." />
            </Field>
          </div>
          <FieldRow>
            <Field l="Category">
              <select value={category} onChange={e => setCategory(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', border: B,
                  background: 'var(--surface)', color: 'var(--fg)', fontFamily: MONO, fontSize: 12 }}>
                {['other','vegetable','fruit','meat','fish','dairy','grain','spice','herb','oil','liquid','condiment','prepared'].map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </Field>
            <Field l="Parent category" hint="Where this sits in the taxonomy">
              {parentId ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 10px', border: B, background: 'var(--accent-subtle)' }}>
                  <span style={{ fontFamily: MONO, fontSize: 12, flex: 1, color: 'var(--accent)' }}>{parentName}</span>
                  <button onClick={() => { setParentId(null); setParentName(''); setParentSearch(''); }}
                    style={{ fontFamily: MONO, fontSize: 10, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
                    ✕
                  </button>
                </div>
              ) : (
                <div style={{ position: 'relative' }}>
                  <Input value={parentSearch} onChange={e => setParentSearch(e.target.value)}
                    placeholder="Search categories..." />
                  {(parentResults.length > 0 || parentSearch.length >= 2) && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0,
                      border: B, background: 'var(--surface)', zIndex: 20,
                      boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
                      {parentResults.map((r, i) => (
                        <button key={r.id}
                          onClick={() => { setParentId(r.id); setParentName(r.name); setParentSearch(''); setParentResults([]); }}
                          style={{ width: '100%', padding: '9px 12px', borderTop: i > 0 ? B : 'none',
                            background: 'none', border: 'none', cursor: 'pointer',
                            textAlign: 'left' as const, fontFamily: MONO, fontSize: 12 }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-hover)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                          {r.name}
                        </button>
                      ))}
                      {parentSearch.length >= 2 && (
                        <button
                          onClick={async () => {
                            try {
                              const res = await fetch('/api/ingredients', {
                                method: 'POST', headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ name: parentSearch.trim() }),
                              });
                              if (res.ok) {
                                const d = await res.json();
                                setParentId(d.id); setParentName(parentSearch.trim());
                                setParentSearch(''); setParentResults([]);
                              }
                            } catch {}
                          }}
                          style={{ width: '100%', padding: '9px 12px', borderTop: B,
                            background: 'none', border: 'none', cursor: 'pointer',
                            textAlign: 'left' as const, fontFamily: MONO, fontSize: 12,
                            color: 'var(--accent)' }}>
                          + Create &quot;{parentSearch}&quot; as new category
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </Field>
          </FieldRow>
        </div>
      </div>

      {/* ── Product toggle ── */}
      <div style={{ border: B, marginBottom: 16 }}>
        <button onClick={() => setIsProduct(p => !p)}
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 14px', background: isProduct ? 'var(--accent-subtle)' : 'var(--surface-hover)',
            border: 'none', cursor: 'pointer',
            borderBottom: isProduct ? B : 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Package size={13} style={{ color: isProduct ? 'var(--accent)' : 'var(--muted)' }} />
            <span style={{ fontFamily: MONO, fontSize: 10, textTransform: 'uppercase',
              letterSpacing: '0.18em', fontWeight: 600,
              color: isProduct ? 'var(--accent)' : 'var(--fg)' }}>
              This is a packaged product
            </span>
          </div>
          <span style={{ fontFamily: MONO, fontSize: 10, color: isProduct ? 'var(--accent)' : 'var(--muted)' }}>
            {isProduct ? 'ON — click to disable' : 'OFF — click to enable'}
          </span>
        </button>

        {isProduct && (
          <div style={{ padding: 16 }}>

            {/* OFF lookup */}
            <div style={{ marginBottom: 16, padding: 14, background: 'var(--surface-hover)', border: B }}>
              <div style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase',
                letterSpacing: '0.15em', color: 'var(--muted)', marginBottom: 10 }}>
                Look up on Open Food Facts (optional)
              </div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <Input placeholder="Barcode e.g. 4001724819004" value={barcodeInput}
                  onChange={e => setBarcodeInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && lookupBarcode()}
                  style={{ flex: 1 }} />
                <button onClick={lookupBarcode} disabled={lookupStatus === 'loading'}
                  style={{ padding: '8px 12px', border: 'none', background: 'var(--accent)',
                    color: '#fff', fontFamily: MONO, fontSize: 11, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
                  {lookupStatus === 'loading' ? <Loader2 size={11} className="animate-spin" /> : <Search size={11} />}
                  Look up
                </button>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Input placeholder="Or search by name..." value={nameSearch}
                  onChange={e => setNameSearch(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && lookupName()}
                  style={{ flex: 1 }} />
                <button onClick={lookupName}
                  style={{ padding: '8px 12px', border: B, background: 'none',
                    fontFamily: MONO, fontSize: 11, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
                    color: 'var(--fg)' }}>
                  <Search size={11} /> Search
                </button>
              </div>
              {lookupStatus === 'found' && offResults.length === 0 && (
                <div style={{ marginTop: 8, padding: '6px 10px', background: 'var(--accent-subtle)',
                  border: '1px solid var(--accent)', fontFamily: MONO, fontSize: 11,
                  color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Check size={11} /> Pre-filled from Open Food Facts
                </div>
              )}
              {offResults.length > 0 && (
                <div style={{ marginTop: 8, border: B }}>
                  {offResults.map((p, i) => (
                    <button key={p.barcode ?? i} onClick={() => selectOFFResult(p)}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                        padding: '8px 12px', borderTop: i > 0 ? B : 'none',
                        background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' as const }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-hover)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 600 }}>{p.name}</div>
                        {p.brand && <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--muted)' }}>{p.brand}</div>}
                      </div>
                      {p.net_weight_g && <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--muted)', flexShrink: 0 }}>{p.net_weight_g}g</span>}
                      <ChevronRight size={11} style={{ color: 'var(--muted)', flexShrink: 0 }} />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Product fields */}
            <FieldRow>
              <Field l="Brand"><Input value={brand} onChange={e => setBrand(e.target.value)} placeholder="Dr. Oetker" /></Field>
              <Field l="Barcode" hint="EAN-13 or UPC-A"><Input value={barcode} onChange={e => setBarcode(e.target.value)} placeholder="4001724819004" /></Field>
            </FieldRow>
            <FieldRow>
              <Field l="Net weight (g)">
                <Input type="number" value={netWeight} onChange={e => setNetWeight(e.target.value === '' ? '' : Number(e.target.value))} placeholder="355" />
              </Field>
              <Field l="Serving size (g)">
                <Input type="number" value={servingSize} onChange={e => setServingSize(e.target.value === '' ? '' : Number(e.target.value))} placeholder="100" />
              </Field>
            </FieldRow>
            <FieldRow>
              <Field l="Packaging">
                <select value={packagingType} onChange={e => setPackagingType(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', border: B,
                    background: 'var(--surface)', color: packagingType ? 'var(--fg)' : 'var(--muted)',
                    fontFamily: MONO, fontSize: 12 }}>
                  <option value="">— select —</option>
                  {['bottle','can','bag','box','tray','frozen_bag','loose','jar','tube','other'].map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </Field>
              <Field l="Producer"><Input value={producer} onChange={e => setProducer(e.target.value)} placeholder="Dr. August Oetker KG" /></Field>
            </FieldRow>
            <FieldRow>
              <Field l="Country of origin" hint="Affects barcode uniqueness">
                <Input value={countryOrigin} onChange={e => setCountryOrigin(e.target.value)} placeholder="Germany" />
              </Field>
              <Field l="Storage temperature (°C)">
                <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                  {STORAGE_PRESETS.map(p => (
                    <button key={p.label} onClick={() => setStorageTemp(p.temp)}
                      style={{ flex: 1, padding: '4px 6px', border: B, fontFamily: MONO, fontSize: 9,
                        cursor: 'pointer', textTransform: 'uppercase',
                        background: storageTemp === p.temp ? 'var(--accent)' : 'var(--surface)',
                        color: storageTemp === p.temp ? '#fff' : 'var(--muted)' }}>
                      {p.label}
                    </button>
                  ))}
                </div>
                <Input type="number" value={storageTemp}
                  onChange={e => setStorageTemp(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="-18" />
              </Field>
            </FieldRow>
            <Field l="Ingredient list (from packaging)">
              <Textarea value={ingredientList} onChange={e => setIngredientList(e.target.value)}
                placeholder="Wheat flour, water, tomato purée..." />
            </Field>
          </div>
        )}
      </div>

      {/* After saving hint */}
      <div style={{ border: B, marginBottom: 16, padding: '12px 16px',
        background: 'var(--surface-hover)', fontFamily: MONO, fontSize: 11,
        color: 'var(--muted)', lineHeight: 1.6 }}>
        {isProduct
          ? 'After saving, create a recipe using this product as the main ingredient to add cooking instructions.'
          : 'After saving, this ingredient will appear in the taxonomy and can be used in recipes.'}
      </div>

      {saveErr && (
        <div style={{ padding: '10px 14px', border: '1px solid #b45309',
          background: '#fef3c7', fontFamily: MONO, fontSize: 11, color: '#92400e', marginBottom: 16 }}>
          {saveErr}
        </div>
      )}

      {/* Save bar */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0,
        background: 'var(--surface)', borderTop: B, padding: '12px 24px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 50 }}>
        <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--muted)' }}>
          {isProduct ? 'Saving as packaged product' : 'Saving as generic ingredient'}
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => router.back()}
            style={{ padding: '8px 16px', border: B, background: 'none',
              fontFamily: MONO, fontSize: 11, cursor: 'pointer', color: 'var(--muted)' }}>
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving || !name.trim()}
            style={{ padding: '8px 20px', border: 'none', background: 'var(--accent)', color: '#fff',
              fontFamily: MONO, fontSize: 11, cursor: saving || !name.trim() ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 6, opacity: saving || !name.trim() ? 0.6 : 1 }}>
            {saving ? <><Loader2 size={11} className="animate-spin" /> Saving…</> : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
