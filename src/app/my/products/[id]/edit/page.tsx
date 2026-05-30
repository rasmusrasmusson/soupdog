'use client';
// src/app/my/products/[id]/edit/page.tsx
// Register a product — an ingredient with is_product=true
// Cooking instructions are added as regular recipes in the recipe editor

import React, { useState, useEffect, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Loader2, Check, ChevronRight } from 'lucide-react';

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
      boxSizing: 'border-box' as const,
      ...props.style,
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
      boxSizing: 'border-box' as const,
      ...props.style,
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
      {hint && (
        <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--muted)', marginTop: 3 }}>
          {hint}
        </div>
      )}
    </div>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ borderBottom: B, paddingBottom: 10, marginBottom: 16 }}>
      <div style={{ fontFamily: MONO, fontSize: 10, textTransform: 'uppercase' as const,
        letterSpacing: '0.18em', color: 'var(--fg)', fontWeight: 600 }}>
        {title}
      </div>
      {subtitle && (
        <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--muted)', marginTop: 3 }}>
          {subtitle}
        </div>
      )}
    </div>
  );
}

export default function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [loadingProduct, setLoadingProduct] = useState(true);

  // ── Lookup state ──────────────────────────────────────────
  const [barcodeInput,  setBarcodeInput]  = useState('');
  const [nameSearch,    setNameSearch]    = useState('');
  const [lookupStatus,  setLookupStatus]  = useState<'idle'|'loading'|'found'|'not_found'|'error'>('idle');
  const [offResults,    setOffResults]    = useState<any[]>([]);

  // ── Product fields ────────────────────────────────────────
  const [name,           setName]           = useState('');
  const [brand,          setBrand]          = useState('');
  const [barcode,        setBarcode]        = useState('');
  const [netWeight,      setNetWeight]      = useState<number|''>('');
  const [servingSize,    setServingSize]    = useState<number|''>('');
  const [packagingType,  setPackagingType]  = useState('');
  const [producer,       setProducer]       = useState('');
  const [countryOrigin,  setCountryOrigin]  = useState('');
  const [storageTemp,    setStorageTemp]    = useState<number|''>('');
  const [ingredientList, setIngredientList] = useState('');
  const [description,    setDescription]   = useState('');

  // ── Parent ingredient ─────────────────────────────────────
  const [parentSearch,   setParentSearch]  = useState('');
  const [parentId,       setParentId]      = useState<string|null>(null);
  const [parentName,     setParentName]    = useState('');
  const [parentResults,  setParentResults] = useState<any[]>([]);

  // ── Save state ────────────────────────────────────────────
  const [saving,  setSaving]  = useState(false);
  const [saveErr, setSaveErr] = useState<string|null>(null);

  // ── Load existing product ─────────────────────────────────
  useEffect(() => {
    async function load() {
      try {
        const { createClient } = await import('@/lib/supabase/client');
        const supabase = createClient() as any;
        const { data, error } = await supabase
          .from('ingredients')
          .select('id, slug, name, brand, barcode, net_weight_g, serving_size_g, packaging_type, producer, country_of_origin, base_temp_celsius, ingredient_list, description, parent_id, off_id')
          .eq('id', id)
          .eq('is_product', true)
          .single();
        if (error || !data) { setLoadingProduct(false); return; }
        setName(data.name ?? '');
        setBrand(data.brand ?? '');
        setBarcode(data.barcode ?? '');
        setNetWeight(data.net_weight_g ?? '');
        setServingSize(data.serving_size_g ?? '');
        setPackagingType(data.packaging_type ?? '');
        setProducer(data.producer ?? '');
        setCountryOrigin(data.country_of_origin ?? '');
        setStorageTemp(data.base_temp_celsius ?? '');
        setIngredientList(data.ingredient_list ?? '');
        setDescription(data.description ?? '');
        if (data.parent_id) {
          setParentId(data.parent_id);
          // fetch parent name
          const { data: par } = await supabase.from('ingredients').select('name').eq('id', data.parent_id).single();
          if (par) setParentName(par.name);
        }
      } finally {
        setLoadingProduct(false);
      }
    }
    load();
  }, [id]);

  // ── Storage temp presets ──────────────────────────────────
  const STORAGE_PRESETS = [
    { label: 'Frozen',       temp: -18 },
    { label: 'Refrigerated', temp:   4 },
    { label: 'Ambient',      temp:  20 },
  ];

  // ── Barcode lookup ─────────────────────────────────────────
  const lookupBarcode = useCallback(async () => {
    if (!barcodeInput.trim()) return;
    setLookupStatus('loading');
    setOffResults([]);
    try {
      const res  = await fetch(`/api/products/lookup?barcode=${encodeURIComponent(barcodeInput.trim())}`);
      const data = await res.json();
      if (data.found) {
        setName(data.name           ?? '');
        setBrand(data.brand          ?? '');
        setBarcode(data.off_id       ?? barcodeInput.trim());
        setNetWeight(data.net_weight_g ?? '');
        setPackagingType(data.packaging_type ?? '');
        setIngredientList(data.ingredient_list ?? '');
        setCountryOrigin(data.country_of_origin ?? '');
        setLookupStatus('found');
      } else {
        setBarcode(barcodeInput.trim());
        setLookupStatus('not_found');
      }
    } catch {
      setLookupStatus('error');
    }
  }, [barcodeInput]);

  // ── Name search ────────────────────────────────────────────
  const lookupName = useCallback(async () => {
    if (!nameSearch.trim()) return;
    setLookupStatus('loading');
    try {
      const res  = await fetch(`/api/products/lookup?name=${encodeURIComponent(nameSearch.trim())}`);
      const data = await res.json();
      if (data.found && data.products?.length) {
        setOffResults(data.products);
        setLookupStatus('found');
      } else {
        setLookupStatus('not_found');
      }
    } catch {
      setLookupStatus('error');
    }
  }, [nameSearch]);

  const selectOFFResult = (p: any) => {
    setName(p.name              ?? '');
    setBrand(p.brand             ?? '');
    setBarcode(p.barcode         ?? '');
    setNetWeight(p.net_weight_g  ?? '');
    setOffResults([]);
    setLookupStatus('found');
  };

  // ── Parent search ──────────────────────────────────────────
  useEffect(() => {
    if (!parentSearch.trim() || parentSearch.length < 2) {
      setParentResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res  = await fetch(`/api/ingredients/search?q=${encodeURIComponent(parentSearch)}`);
        const data = await res.json();
        setParentResults(
          (data ?? []).filter((i: any) => !i.is_product).slice(0, 6)
        );
      } catch {}
    }, 300);
    return () => clearTimeout(timer);
  }, [parentSearch]);

  // ── Save ───────────────────────────────────────────────────
  const handleSave = async () => {
    if (!name.trim()) { setSaveErr('Product name is required'); return; }
    setSaving(true);
    setSaveErr(null);
    try {
      const res = await fetch('/api/ingredients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:              name.trim(),
          brand:             brand.trim()          || null,
          barcode:           barcode.trim()        || null,
          net_weight_g:      netWeight    !== ''   ? netWeight    : null,
          serving_size_g:    servingSize  !== ''   ? servingSize  : null,
          packaging_type:    packagingType         || null,
          producer:          producer.trim()       || null,
          country_of_origin: countryOrigin.trim()  || null,
          base_temp_celsius: storageTemp  !== ''   ? storageTemp  : null,
          ingredient_list:   ingredientList.trim() || null,
          description:       description.trim()    || null,
          parent_id:         parentId,
          source:            'human_authored',
          confidence:        1.0,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? 'Failed to save');
      }
      router.push('/my/products');
    } catch (err: any) {
      setSaveErr(err.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 24px 80px' }}>

      {/* Header */}
      <div style={{ marginBottom: 28, borderBottom: B, paddingBottom: 16 }}>
        <div style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase',
          letterSpacing: '0.22em', color: 'var(--muted)', marginBottom: 6 }}>
          My Kitchen · Products
        </div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 24,
          fontWeight: 400, margin: 0, color: 'var(--fg)' }}>
          Edit product
        </h1>
      </div>

      {loadingProduct ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
          <Loader2 size={16} className='animate-spin' style={{ color: 'var(--muted)' }} />
        </div>
      ) : null}

      {/* ── Lookup ── */}
      <div style={{ border: B, marginBottom: 20 }}>
        <div style={{ padding: '10px 14px', background: 'var(--surface-hover)',
          borderBottom: B, fontFamily: MONO, fontSize: 10, textTransform: 'uppercase',
          letterSpacing: '0.18em', fontWeight: 600 }}>
          1 · Find on Open Food Facts
        </div>
        <div style={{ padding: 16 }}>

          {/* Barcode */}
          <div style={{ marginBottom: 14 }}>
            <Label text="Barcode (EAN / UPC)" />
            <div style={{ display: 'flex', gap: 8 }}>
              <Input
                placeholder="e.g. 4001724819004"
                value={barcodeInput}
                onChange={e => setBarcodeInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && lookupBarcode()}
                style={{ flex: 1 }}
              />
              <button onClick={lookupBarcode} disabled={lookupStatus === 'loading'}
                style={{ padding: '8px 14px', border: 'none',
                  background: 'var(--accent)', color: '#fff',
                  fontFamily: MONO, fontSize: 11, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
                  opacity: lookupStatus === 'loading' ? 0.7 : 1 }}>
                {lookupStatus === 'loading'
                  ? <Loader2 size={12} className="animate-spin" />
                  : <Search size={12} />}
                Look up
              </button>
            </div>
          </div>

          {/* Divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase' }}>or search by name</span>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          </div>

          {/* Name search */}
          <div style={{ display: 'flex', gap: 8 }}>
            <Input
              placeholder="e.g. Dr. Oetker Ristorante"
              value={nameSearch}
              onChange={e => setNameSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && lookupName()}
              style={{ flex: 1 }}
            />
            <button onClick={lookupName} disabled={lookupStatus === 'loading'}
              style={{ padding: '8px 14px', border: B, background: 'var(--surface-hover)',
                color: 'var(--fg)', fontFamily: MONO, fontSize: 11, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
              <Search size={12} /> Search
            </button>
          </div>

          {/* Status */}
          {lookupStatus === 'found' && offResults.length === 0 && (
            <div style={{ marginTop: 10, padding: '8px 12px',
              background: 'var(--accent-subtle)', border: '1px solid var(--accent)',
              fontFamily: MONO, fontSize: 11, color: 'var(--accent)',
              display: 'flex', alignItems: 'center', gap: 6 }}>
              <Check size={12} /> Found — fields pre-filled below
            </div>
          )}
          {lookupStatus === 'not_found' && (
            <div style={{ marginTop: 10, padding: '8px 12px',
              background: 'var(--surface-hover)', border: B,
              fontFamily: MONO, fontSize: 11, color: 'var(--muted)' }}>
              Not found on Open Food Facts — fill in manually below
            </div>
          )}
          {lookupStatus === 'error' && (
            <div style={{ marginTop: 10, padding: '8px 12px',
              background: '#fef3c7', border: '1px solid #b45309',
              fontFamily: MONO, fontSize: 11, color: '#92400e' }}>
              Lookup failed — check your connection or fill in manually
            </div>
          )}

          {/* Name search results */}
          {offResults.length > 0 && (
            <div style={{ marginTop: 10, border: B }}>
              {offResults.map((p, i) => (
                <button key={p.barcode ?? i} onClick={() => selectOFFResult(p)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center',
                    gap: 10, padding: '10px 12px',
                    borderTop: i > 0 ? B : 'none',
                    background: 'none', border: 'none', cursor: 'pointer',
                    textAlign: 'left' as const }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-hover)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 600 }}>{p.name}</div>
                    {p.brand && (
                      <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--muted)' }}>{p.brand}</div>
                    )}
                  </div>
                  {p.net_weight_g && (
                    <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--muted)', flexShrink: 0 }}>
                      {p.net_weight_g}g
                    </span>
                  )}
                  <ChevronRight size={12} style={{ color: 'var(--muted)', flexShrink: 0 }} />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Product details ── */}
      <div style={{ border: B, marginBottom: 20 }}>
        <div style={{ padding: '10px 14px', background: 'var(--surface-hover)',
          borderBottom: B, fontFamily: MONO, fontSize: 10, textTransform: 'uppercase',
          letterSpacing: '0.18em', fontWeight: 600 }}>
          2 · Product details
        </div>
        <div style={{ padding: 16 }}>

          <FieldRow>
            <Field l="Product name *">
              <Input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Ristorante Mozzarella"
              />
            </Field>
            <Field l="Brand">
              <Input
                value={brand}
                onChange={e => setBrand(e.target.value)}
                placeholder="Dr. Oetker"
              />
            </Field>
          </FieldRow>

          <FieldRow>
            <Field l="Barcode" hint="EAN-13 or UPC-A">
              <Input
                value={barcode}
                onChange={e => setBarcode(e.target.value)}
                placeholder="4001724819004"
              />
            </Field>
            <Field l="Country of origin" hint="Affects barcode uniqueness">
              <Input
                value={countryOrigin}
                onChange={e => setCountryOrigin(e.target.value)}
                placeholder="Germany"
              />
            </Field>
          </FieldRow>

          <FieldRow>
            <Field l="Net weight (g)">
              <Input
                type="number"
                value={netWeight}
                onChange={e => setNetWeight(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="355"
              />
            </Field>
            <Field l="Serving size (g)">
              <Input
                type="number"
                value={servingSize}
                onChange={e => setServingSize(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="100"
              />
            </Field>
          </FieldRow>

          <FieldRow>
            <Field l="Packaging">
              <select
                value={packagingType}
                onChange={e => setPackagingType(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', border: B,
                  background: 'var(--surface)', color: packagingType ? 'var(--fg)' : 'var(--muted)',
                  fontFamily: MONO, fontSize: 12 }}>
                <option value="">— select —</option>
                {['bottle','can','bag','box','tray','frozen_bag','loose','jar','tube','other'].map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </Field>
            <Field l="Producer">
              <Input
                value={producer}
                onChange={e => setProducer(e.target.value)}
                placeholder="Dr. August Oetker KG"
              />
            </Field>
          </FieldRow>

          {/* Storage temperature */}
          <div style={{ marginBottom: 12 }}>
            <Label text="Storage temperature (°C)" />
            <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
              {STORAGE_PRESETS.map(p => (
                <button
                  key={p.label}
                  onClick={() => setStorageTemp(p.temp)}
                  style={{
                    padding: '5px 12px', border: B, fontFamily: MONO, fontSize: 10,
                    cursor: 'pointer', background: storageTemp === p.temp ? 'var(--accent)' : 'var(--surface)',
                    color: storageTemp === p.temp ? '#fff' : 'var(--muted)',
                    transition: 'all 0.15s',
                  }}>
                  {p.label} ({p.temp}°C)
                </button>
              ))}
            </div>
            <Input
              type="number"
              value={storageTemp}
              onChange={e => setStorageTemp(e.target.value === '' ? '' : Number(e.target.value))}
              placeholder="e.g. -18 for deep frozen, 4 for refrigerated, 20 for ambient"
            />
            <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--muted)', marginTop: 3 }}>
              Stored as a number — more precise than a label like "frozen"
            </div>
          </div>

          {/* Description */}
          <div style={{ marginBottom: 12 }}>
            <Field l="Description">
              <Textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Stone-baked pizza base with tomato sauce and mozzarella."
              />
            </Field>
          </div>

          {/* Ingredient list */}
          <Field l="Ingredient list (from packaging)">
            <Textarea
              value={ingredientList}
              onChange={e => setIngredientList(e.target.value)}
              placeholder="Wheat flour, water, tomato purée, mozzarella (14%), ..."
            />
          </Field>
        </div>
      </div>

      {/* ── Taxonomy ── */}
      <div style={{ border: B, marginBottom: 20 }}>
        <div style={{ padding: '10px 14px', background: 'var(--surface-hover)',
          borderBottom: B, fontFamily: MONO, fontSize: 10, textTransform: 'uppercase',
          letterSpacing: '0.18em', fontWeight: 600 }}>
          3 · Place in ingredient taxonomy
        </div>
        <div style={{ padding: 16 }}>
          <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--muted)',
            marginBottom: 12, lineHeight: 1.6 }}>
            Link this product to its generic ingredient parent.
            e.g. "Dr. Oetker Ristorante" → parent: "Frozen pizza"
          </div>

          {parentId ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 12px', border: B, background: 'var(--accent-subtle)' }}>
              <span style={{ fontFamily: MONO, fontSize: 12, flex: 1, color: 'var(--accent)', fontWeight: 600 }}>
                {parentName}
              </span>
              <button
                onClick={() => { setParentId(null); setParentName(''); setParentSearch(''); }}
                style={{ fontFamily: MONO, fontSize: 10, color: 'var(--muted)',
                  background: 'none', border: 'none', cursor: 'pointer' }}>
                ✕ change
              </button>
            </div>
          ) : (
            <div style={{ position: 'relative' }}>
              <Input
                value={parentSearch}
                onChange={e => setParentSearch(e.target.value)}
                placeholder="Search ingredients... e.g. Frozen pizza"
              />
              {(parentResults.length > 0 || parentSearch.length >= 2) && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0,
                  border: B, background: 'var(--surface)', zIndex: 20,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
                  {parentResults.map((r, i) => (
                    <button
                      key={r.id}
                      onClick={() => { setParentId(r.id); setParentName(r.name); setParentSearch(''); setParentResults([]); }}
                      style={{ width: '100%', padding: '9px 12px',
                        borderTop: i > 0 ? B : 'none',
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
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ name: parentSearch.trim() }),
                          });
                          if (res.ok) {
                            const d = await res.json();
                            setParentId(d.id); setParentName(parentSearch.trim()); setParentSearch(''); setParentResults([]);
                          }
                        } catch {}
                      }}
                      style={{ width: '100%', padding: '9px 12px',
                        borderTop: B, background: 'none', border: 'none', cursor: 'pointer',
                        textAlign: 'left' as const, fontFamily: MONO, fontSize: 12,
                        color: 'var(--accent)' }}>
                      + Create &quot;{parentSearch}&quot; as new category
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Next step hint ── */}
      <div style={{ border: B, marginBottom: 20, padding: 16,
        background: 'var(--surface-hover)' }}>
        <div style={{ fontFamily: MONO, fontSize: 10, textTransform: 'uppercase',
          letterSpacing: '0.15em', color: 'var(--muted)', marginBottom: 6 }}>
          After saving
        </div>
        <p style={{ fontFamily: MONO, fontSize: 11, color: 'var(--fg)', margin: 0, lineHeight: 1.7 }}>
          To add cooking instructions, create a recipe in the recipe editor and use this product as the
          main ingredient. Each appliance gets its own recipe — that's how the coverage matrix is built.
        </p>
      </div>

      {/* Error */}
      {saveErr && (
        <div style={{ padding: '10px 14px', border: '1px solid #b45309',
          background: '#fef3c7', fontFamily: MONO, fontSize: 11,
          color: '#92400e', marginBottom: 16 }}>
          {saveErr}
        </div>
      )}

      {/* Save bar */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0,
        background: 'var(--surface)', borderTop: B,
        padding: '12px 24px', display: 'flex',
        justifyContent: 'space-between', alignItems: 'center', zIndex: 50 }}>
        <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--muted)' }}>
          Editing product metadata
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => router.back()}
            style={{ padding: '8px 16px', border: B, background: 'none',
              fontFamily: MONO, fontSize: 11, cursor: 'pointer', color: 'var(--muted)' }}>
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving || !name.trim()}
            style={{ padding: '8px 20px', border: 'none',
              background: 'var(--accent)', color: '#fff',
              fontFamily: MONO, fontSize: 11,
              cursor: saving || !name.trim() ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
              opacity: saving || !name.trim() ? 0.6 : 1 }}>
            {saving
              ? <><Loader2 size={11} className="animate-spin" /> Saving…</>
              : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
