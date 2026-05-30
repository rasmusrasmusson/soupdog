'use client';
// src/app/my/products/new/page.tsx
// Create a new product (ingredient with is_product=true) + optional cooking profile

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Loader2, Check, Plus, Trash2, ChevronDown, ChevronUp, Zap } from 'lucide-react';
import { APPLIANCES } from '@/lib/appliances';

const MONO = 'var(--font-mono)';
const B    = '1px solid var(--border)';

// ── Shared style helpers ──────────────────────────────────────
const label = (text: string) => (
  <div style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase' as const,
    letterSpacing: '0.18em', color: 'var(--muted)', marginBottom: 5 }}>
    {text}
  </div>
);

const input = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input {...props} style={{
    width: '100%', padding: '8px 10px', border: B,
    background: 'var(--surface)', color: 'var(--fg)',
    fontFamily: MONO, fontSize: 12, outline: 'none',
    boxSizing: 'border-box' as const,
    ...props.style,
  }} />
);

const textarea = (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea {...props} style={{
    width: '100%', padding: '8px 10px', border: B,
    background: 'var(--surface)', color: 'var(--fg)',
    fontFamily: MONO, fontSize: 12, outline: 'none', resize: 'vertical' as const,
    boxSizing: 'border-box' as const, minHeight: 72,
    ...props.style,
  }} />
);

// ── Execution step type ───────────────────────────────────────
interface ExecStep {
  id:                  string;
  instruction:         string;
  duration_seconds:    number | '';
  temperature_celsius: number | '';
  appliance_settings:  any;
}

// ── Section wrapper ───────────────────────────────────────────
function Section({ title, children, defaultOpen = true }: {
  title: string; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ border: B, marginBottom: 16 }}>
      <button onClick={() => setOpen(o => !o)} style={{
        width: '100%', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', padding: '10px 14px',
        background: 'var(--surface-hover)', border: 'none', cursor: 'pointer',
        fontFamily: MONO, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.18em',
        color: 'var(--fg)', fontWeight: 600,
      }}>
        <span>{title}</span>
        {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>
      {open && <div style={{ padding: 16 }}>{children}</div>}
    </div>
  );
}

// ── Field grid ────────────────────────────────────────────────
function FieldRow({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
      {children}
    </div>
  );
}

function Field({ l, children }: { l: string; children: React.ReactNode }) {
  return (
    <div>
      {label(l)}
      {children}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────
export default function NewProductPage() {
  const router = useRouter();

  // ── Product state ─────────────────────────────────────────
  const [barcodeInput, setBarcodeInput]         = useState('');
  const [nameSearch,   setNameSearch]           = useState('');
  const [lookupStatus, setLookupStatus]         = useState<'idle'|'loading'|'found'|'not_found'|'error'>('idle');
  const [offResults,   setOffResults]           = useState<any[]>([]);

  const [name,          setName]          = useState('');
  const [brand,         setBrand]         = useState('');
  const [barcode,       setBarcode]       = useState('');
  const [netWeight,     setNetWeight]     = useState<number|''>('');
  const [servingSize,   setServingSize]   = useState<number|''>('');
  const [packagingType, setPackagingType] = useState('');
  const [baseState,     setBaseState]     = useState('ambient');
  const [baseTemp,      setBaseTemp]      = useState<number|''>('');
  const [producer,      setProducer]      = useState('');
  const [ingredientList, setIngredientList] = useState('');
  const [parentSearch,  setParentSearch]  = useState('');
  const [parentId,      setParentId]      = useState<string|null>(null);
  const [parentName,    setParentName]    = useState('');
  const [parentResults, setParentResults] = useState<any[]>([]);

  // ── Profile state ─────────────────────────────────────────
  const [addProfile,  setAddProfile]  = useState(false);
  const [equipmentId, setEquipmentId] = useState('');
  const [equipmentList, setEquipmentList] = useState<any[]>([]);
  const [initialTemp,    setInitialTemp]    = useState<number|''>('');
  const [timeOut,        setTimeOut]        = useState<number|''>('');
  const [method,         setMethod]         = useState('convection');
  const [tempCelsius,    setTempCelsius]    = useState<number|''>('');
  const [durationSec,    setDurationSec]    = useState<number|''>('');
  const [execSteps,      setExecSteps]      = useState<ExecStep[]>([]);
  const [resultOverall,  setResultOverall]  = useState<number|''>('');
  const [resultTexture,  setResultTexture]  = useState<number|''>('');
  const [resultColour,   setResultColour]   = useState<number|''>('');
  const [outcomeNotes,   setOutcomeNotes]   = useState('');
  const [mfrInstructions, setMfrInstructions] = useState('');

  const [saving,  setSaving]  = useState(false);
  const [saveErr, setSaveErr] = useState<string|null>(null);

  // ── Load equipment ─────────────────────────────────────────
  useEffect(() => {
    fetch('/api/equipment/tree')
      .then(r => r.json())
      .then(data => setEquipmentList(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  // ── Barcode lookup ─────────────────────────────────────────
  const lookupBarcode = useCallback(async () => {
    if (!barcodeInput.trim()) return;
    setLookupStatus('loading');
    setOffResults([]);
    try {
      const res = await fetch(`/api/products/lookup?barcode=${encodeURIComponent(barcodeInput.trim())}`);
      const data = await res.json();
      if (data.found) {
        setName(data.name ?? '');
        setBrand(data.brand ?? '');
        setBarcode(data.off_id ?? barcodeInput.trim());
        setNetWeight(data.net_weight_g ?? '');
        setPackagingType(data.packaging_type ?? '');
        setIngredientList(data.ingredient_list ?? '');
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
      const res = await fetch(`/api/products/lookup?name=${encodeURIComponent(nameSearch.trim())}`);
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
    setName(p.name ?? '');
    setBrand(p.brand ?? '');
    setBarcode(p.barcode ?? '');
    setNetWeight(p.net_weight_g ?? '');
    setOffResults([]);
    setLookupStatus('found');
  };

  // ── Parent ingredient search ───────────────────────────────
  useEffect(() => {
    if (!parentSearch.trim() || parentSearch.length < 2) {
      setParentResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/ingredients/search?q=${encodeURIComponent(parentSearch)}`);
        const data = await res.json();
        setParentResults((data ?? []).filter((i: any) => !i.is_product).slice(0, 6));
      } catch {}
    }, 300);
    return () => clearTimeout(timer);
  }, [parentSearch]);

  // ── Exec steps ─────────────────────────────────────────────
  const addStep = () => setExecSteps(s => [...s, {
    id: Math.random().toString(36).slice(2),
    instruction: '', duration_seconds: '', temperature_celsius: '',
    appliance_settings: null,
  }]);

  const removeStep = (id: string) => setExecSteps(s => s.filter(x => x.id !== id));

  const updateStep = (id: string, key: keyof ExecStep, value: any) =>
    setExecSteps(s => s.map(x => x.id === id ? { ...x, [key]: value } : x));

  // ── Base state → temp helper ───────────────────────────────
  const handleBaseStateChange = (val: string) => {
    setBaseState(val);
    if (val === 'frozen'       && baseTemp === '') setBaseTemp(-18);
    if (val === 'refrigerated' && baseTemp === '') setBaseTemp(4);
    if (val === 'ambient'      && baseTemp === '') setBaseTemp(20);
  };

  // ── Save ───────────────────────────────────────────────────
  const handleSave = async () => {
    if (!name.trim()) { setSaveErr('Product name is required'); return; }
    setSaving(true); setSaveErr(null);

    try {
      // 1. Create the product (ingredient with is_product=true)
      const productRes = await fetch('/api/my/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          brand: brand.trim() || null,
          barcode: barcode.trim() || null,
          net_weight_g:    netWeight   !== '' ? netWeight   : null,
          serving_size_g:  servingSize !== '' ? servingSize : null,
          packaging_type:  packagingType || null,
          base_state:      baseState,
          base_temp_celsius: baseTemp  !== '' ? baseTemp    : null,
          producer:        producer.trim() || null,
          ingredient_list: ingredientList.trim() || null,
          parent_id:       parentId,
          source:          'human_authored',
          confidence:      1.0,
        }),
      });

      if (!productRes.ok) {
        const err = await productRes.json();
        throw new Error(err.error ?? 'Failed to create product');
      }

      const product = await productRes.json();

      // 2. Optionally create cooking profile
      if (addProfile && equipmentId) {
        const profileRes = await fetch(`/api/my/products/${product.id}/profiles`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            equipment_id:                equipmentId,
            food_state:                  baseState,
            initial_temp_celsius:        initialTemp  !== '' ? initialTemp  : null,
            time_out_of_storage_minutes: timeOut      !== '' ? timeOut      : null,
            method,
            temperature_celsius:         tempCelsius  !== '' ? tempCelsius  : null,
            duration_seconds:            durationSec  !== '' ? durationSec  : null,
            execution_steps: execSteps.length ? execSteps.map(s => ({
              instruction:         s.instruction,
              duration_seconds:    s.duration_seconds    !== '' ? s.duration_seconds    : null,
              temperature_celsius: s.temperature_celsius !== '' ? s.temperature_celsius : null,
            })) : null,
            result_scores: (resultOverall !== '' || resultTexture !== '' || resultColour !== '')
              ? {
                  overall: resultOverall !== '' ? resultOverall : null,
                  texture: resultTexture !== '' ? resultTexture : null,
                  colour:  resultColour  !== '' ? resultColour  : null,
                }
              : null,
            outcome_notes:              outcomeNotes.trim()    || null,
            manufacturer_instructions:  mfrInstructions.trim() || null,
            source:     'human_authored',
            confidence: 1.0,
          }),
        });

        if (!profileRes.ok) {
          console.warn('[new product] Profile save failed:', await profileRes.text());
          // Don't block — product was created successfully
        }
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
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '24px 24px 80px' }}>

      {/* Header */}
      <div style={{ marginBottom: 24, borderBottom: B, paddingBottom: 16 }}>
        <div style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase',
          letterSpacing: '0.22em', color: 'var(--muted)', marginBottom: 6 }}>
          My Kitchen · Products
        </div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 24,
          fontWeight: 400, margin: 0, color: 'var(--fg)' }}>
          Register product
        </h1>
        <p style={{ fontFamily: MONO, fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>
          A product is a specific packaged food — a leaf in the ingredient taxonomy.
        </p>
      </div>

      {/* ── Step 1: Find product ── */}
      <Section title="1 · Find product (Open Food Facts)">
        <div style={{ marginBottom: 12 }}>
          {label('Search by barcode')}
          <div style={{ display: 'flex', gap: 8 }}>
            {input({
              placeholder: '5000112637922',
              value: barcodeInput,
              onChange: e => setBarcodeInput(e.target.value),
              onKeyDown: e => e.key === 'Enter' && lookupBarcode(),
              style: { flex: 1 },
            })}
            <button onClick={lookupBarcode} disabled={lookupStatus === 'loading'}
              style={{ padding: '8px 14px', border: B, background: 'var(--accent)',
                color: '#fff', fontFamily: MONO, fontSize: 11, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
              {lookupStatus === 'loading'
                ? <Loader2 size={12} className="animate-spin" />
                : <Search size={12} />}
              Look up
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase' }}>or</span>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        </div>

        <div>
          {label('Search by name')}
          <div style={{ display: 'flex', gap: 8 }}>
            {input({
              placeholder: 'Dr. Oetker Ristorante...',
              value: nameSearch,
              onChange: e => setNameSearch(e.target.value),
              onKeyDown: e => e.key === 'Enter' && lookupName(),
              style: { flex: 1 },
            })}
            <button onClick={lookupName} disabled={lookupStatus === 'loading'}
              style={{ padding: '8px 14px', border: B, background: 'var(--surface-hover)',
                color: 'var(--fg)', fontFamily: MONO, fontSize: 11, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
              <Search size={12} /> Search
            </button>
          </div>
        </div>

        {/* Status feedback */}
        {lookupStatus === 'found' && offResults.length === 0 && (
          <div style={{ marginTop: 10, padding: '8px 12px', background: 'var(--accent-subtle)',
            border: '1px solid var(--accent)', fontFamily: MONO, fontSize: 11,
            color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Check size={12} /> Found on Open Food Facts — fields pre-filled below
          </div>
        )}
        {lookupStatus === 'not_found' && (
          <div style={{ marginTop: 10, padding: '8px 12px', background: 'var(--surface-hover)',
            border: B, fontFamily: MONO, fontSize: 11, color: 'var(--muted)' }}>
            Not found on Open Food Facts — fill in manually below
          </div>
        )}

        {/* Name search results */}
        {offResults.length > 0 && (
          <div style={{ marginTop: 10, border: B }}>
            {offResults.map((p, i) => (
              <button key={p.barcode ?? i} onClick={() => selectOFFResult(p)}
                style={{ width: '100%', display: 'flex', alignItems: 'center',
                  gap: 10, padding: '8px 12px', borderTop: i > 0 ? B : 'none',
                  background: 'none', border: 'none', cursor: 'pointer',
                  textAlign: 'left' as const }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 600 }}>{p.name}</div>
                  {p.brand && <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--muted)' }}>{p.brand}</div>}
                </div>
                {p.net_weight_g && (
                  <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--muted)', flexShrink: 0 }}>
                    {p.net_weight_g}g
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </Section>

      {/* ── Step 2: Product details ── */}
      <Section title="2 · Product details">
        <FieldRow>
          <Field l="Product name *">
            {input({ value: name, onChange: e => setName(e.target.value), placeholder: 'Ristorante Mozzarella' })}
          </Field>
          <Field l="Brand">
            {input({ value: brand, onChange: e => setBrand(e.target.value), placeholder: 'Dr. Oetker' })}
          </Field>
        </FieldRow>
        <FieldRow>
          <Field l="Barcode (EAN/UPC)">
            {input({ value: barcode, onChange: e => setBarcode(e.target.value), placeholder: '4001724819004' })}
          </Field>
          <Field l="Net weight (g)">
            {input({ type: 'number', value: netWeight, onChange: e => setNetWeight(e.target.value === '' ? '' : Number(e.target.value)), placeholder: '355' })}
          </Field>
        </FieldRow>
        <FieldRow>
          <Field l="Packaging">
            <select value={packagingType} onChange={e => setPackagingType(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', border: B,
                background: 'var(--surface)', color: 'var(--fg)', fontFamily: MONO, fontSize: 12 }}>
              <option value="">— select —</option>
              {['bottle','can','bag','box','tray','frozen_bag','loose','other'].map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </Field>
          <Field l="Producer">
            {input({ value: producer, onChange: e => setProducer(e.target.value), placeholder: 'Dr. August Oetker KG' })}
          </Field>
        </FieldRow>

        {/* Base state */}
        <div style={{ marginBottom: 12 }}>
          {label('Storage state')}
          <div style={{ display: 'flex', gap: 8 }}>
            {(['frozen','refrigerated','ambient'] as const).map(s => (
              <button key={s} onClick={() => handleBaseStateChange(s)}
                style={{ flex: 1, padding: '8px', border: B, fontFamily: MONO, fontSize: 10,
                  textTransform: 'uppercase', letterSpacing: '0.1em', cursor: 'pointer',
                  background: baseState === s ? 'var(--accent)' : 'var(--surface)',
                  color: baseState === s ? '#fff' : 'var(--muted)',
                }}>
                {s}
              </button>
            ))}
          </div>
        </div>

        <FieldRow>
          <Field l="Storage temperature (°C)">
            {input({ type: 'number', value: baseTemp, onChange: e => setBaseTemp(e.target.value === '' ? '' : Number(e.target.value)), placeholder: '-18' })}
          </Field>
          <Field l="Serving size (g)">
            {input({ type: 'number', value: servingSize, onChange: e => setServingSize(e.target.value === '' ? '' : Number(e.target.value)), placeholder: '100' })}
          </Field>
        </FieldRow>

        {/* Parent ingredient */}
        <div style={{ marginBottom: 12 }}>
          {label('Parent ingredient (taxonomy)')}
          {parentId ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', border: B, background: 'var(--accent-subtle)' }}>
              <span style={{ fontFamily: MONO, fontSize: 12, flex: 1, color: 'var(--accent)' }}>{parentName}</span>
              <button onClick={() => { setParentId(null); setParentName(''); setParentSearch(''); }}
                style={{ fontFamily: MONO, fontSize: 10, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
                ✕ remove
              </button>
            </div>
          ) : (
            <div style={{ position: 'relative' }}>
              {input({
                value: parentSearch,
                onChange: e => setParentSearch(e.target.value),
                placeholder: 'Frozen pizza',
              })}
              {parentResults.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, border: B,
                  background: 'var(--surface)', zIndex: 20, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
                  {parentResults.map((r, i) => (
                    <button key={r.id} onClick={() => { setParentId(r.id); setParentName(r.name); setParentSearch(''); setParentResults([]); }}
                      style={{ width: '100%', padding: '8px 12px', borderTop: i > 0 ? B : 'none',
                        background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
                        fontFamily: MONO, fontSize: 12 }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-hover)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                      {r.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--muted)', marginTop: 4 }}>
            Places this product in the ingredient taxonomy, e.g. "Frozen pizza" → "Dr. Oetker Ristorante"
          </div>
        </div>

        <div>
          {label('Ingredient list (from packaging)')}
          {textarea({ value: ingredientList, onChange: e => setIngredientList(e.target.value), placeholder: 'Wheat flour, water, tomato sauce...' })}
        </div>
      </Section>

      {/* ── Step 3: Cooking profile ── */}
      <Section title="3 · Cooking profile (optional)" defaultOpen={false}>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={addProfile} onChange={e => setAddProfile(e.target.checked)} />
            <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--fg)' }}>
              Add a cooking profile for this product
            </span>
          </label>
        </div>

        {addProfile && (
          <>
            {/* Appliance */}
            <div style={{ marginBottom: 12 }}>
              {label('Appliance *')}
              <select value={equipmentId} onChange={e => setEquipmentId(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', border: B,
                  background: 'var(--surface)', color: equipmentId ? 'var(--fg)' : 'var(--muted)',
                  fontFamily: MONO, fontSize: 12 }}>
                <option value="">— select appliance —</option>
                {/* Connected appliances first */}
                <optgroup label="Connected appliances">
                  {APPLIANCES.map(a => (
                    <option key={a.id} value={a.id}>{a.model}</option>
                  ))}
                </optgroup>
                <optgroup label="Other equipment">
                  {equipmentList
                    .filter(e => e.category === 'oven' || e.category === 'appliance')
                    .filter(e => !APPLIANCES.find(a => a.id === e.id))
                    .map(e => (
                      <option key={e.id} value={e.id}>{e.name}</option>
                    ))}
                </optgroup>
              </select>
            </div>

            {/* Initial food state */}
            <div style={{ borderTop: B, paddingTop: 14, marginTop: 14, marginBottom: 12 }}>
              <div style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase',
                letterSpacing: '0.18em', color: 'var(--muted)', marginBottom: 10 }}>
                Food state at start of cooking
              </div>
              <FieldRow>
                <Field l="Temperature at start (°C)">
                  {input({ type: 'number', value: initialTemp,
                    onChange: e => setInitialTemp(e.target.value === '' ? '' : Number(e.target.value)),
                    placeholder: '-18 (straight from freezer)' })}
                </Field>
                <Field l="Minutes out of storage">
                  {input({ type: 'number', value: timeOut,
                    onChange: e => setTimeOut(e.target.value === '' ? '' : Number(e.target.value)),
                    placeholder: '0' })}
                </Field>
              </FieldRow>
            </div>

            {/* Method */}
            <div style={{ borderTop: B, paddingTop: 14, marginTop: 14, marginBottom: 12 }}>
              <div style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase',
                letterSpacing: '0.18em', color: 'var(--muted)', marginBottom: 10 }}>
                Cooking method
              </div>
              <FieldRow>
                <Field l="Method">
                  <select value={method} onChange={e => setMethod(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', border: B,
                      background: 'var(--surface)', color: 'var(--fg)', fontFamily: MONO, fontSize: 12 }}>
                    {['convection','steam','microwave','grill','air_fry','steam+convection','steam+grill','sous_vide','stovetop','other'].map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </Field>
                <Field l="Temperature (°C)">
                  {input({ type: 'number', value: tempCelsius,
                    onChange: e => setTempCelsius(e.target.value === '' ? '' : Number(e.target.value)),
                    placeholder: '220' })}
                </Field>
              </FieldRow>
              <Field l="Total duration (seconds)">
                {input({ type: 'number', value: durationSec,
                  onChange: e => setDurationSec(e.target.value === '' ? '' : Number(e.target.value)),
                  placeholder: '720 (= 12 min)' })}
              </Field>
            </div>

            {/* Execution steps */}
            <div style={{ borderTop: B, paddingTop: 14, marginTop: 14, marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase',
                  letterSpacing: '0.18em', color: 'var(--muted)' }}>
                  Execution steps
                </div>
                <button onClick={addStep} style={{ display: 'flex', alignItems: 'center', gap: 4,
                  padding: '4px 10px', border: B, background: 'none', fontFamily: MONO,
                  fontSize: 10, cursor: 'pointer', color: 'var(--fg)' }}>
                  <Plus size={10} /> Add step
                </button>
              </div>

              {execSteps.length === 0 && (
                <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--muted)',
                  padding: '12px', border: `1px dashed var(--border)`, textAlign: 'center' }}>
                  No steps added — uses method/temp/duration above as a single step
                </div>
              )}

              {execSteps.map((step, i) => (
                <div key={step.id} style={{ border: B, marginBottom: 8, padding: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--muted)',
                      background: 'var(--surface-hover)', padding: '2px 8px', flexShrink: 0 }}>
                      Step {i + 1}
                    </span>
                    <div style={{ flex: 1 }} />
                    <button onClick={() => removeStep(step.id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                  <div style={{ marginBottom: 8 }}>
                    {label('Instruction')}
                    {input({
                      value: step.instruction,
                      onChange: e => updateStep(step.id, 'instruction', e.target.value),
                      placeholder: 'Preheat oven to 220°C convection',
                    })}
                  </div>
                  <FieldRow>
                    <Field l="Duration (seconds)">
                      {input({ type: 'number', value: step.duration_seconds,
                        onChange: e => updateStep(step.id, 'duration_seconds', e.target.value === '' ? '' : Number(e.target.value)),
                        placeholder: '300' })}
                    </Field>
                    <Field l="Temperature (°C)">
                      {input({ type: 'number', value: step.temperature_celsius,
                        onChange: e => updateStep(step.id, 'temperature_celsius', e.target.value === '' ? '' : Number(e.target.value)),
                        placeholder: '220' })}
                    </Field>
                  </FieldRow>
                </div>
              ))}
            </div>

            {/* Result */}
            <div style={{ borderTop: B, paddingTop: 14, marginTop: 14, marginBottom: 12 }}>
              <div style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase',
                letterSpacing: '0.18em', color: 'var(--muted)', marginBottom: 10 }}>
                Result scores (0–100)
              </div>
              <FieldRow>
                <Field l="Overall">
                  {input({ type: 'number', min: 0, max: 100, value: resultOverall,
                    onChange: e => setResultOverall(e.target.value === '' ? '' : Number(e.target.value)),
                    placeholder: '85' })}
                </Field>
                <Field l="Texture">
                  {input({ type: 'number', min: 0, max: 100, value: resultTexture,
                    onChange: e => setResultTexture(e.target.value === '' ? '' : Number(e.target.value)),
                    placeholder: '80' })}
                </Field>
              </FieldRow>
              <Field l="Colour / browning">
                {input({ type: 'number', min: 0, max: 100, value: resultColour,
                  onChange: e => setResultColour(e.target.value === '' ? '' : Number(e.target.value)),
                  placeholder: '90' })}
              </Field>
            </div>

            <div style={{ marginBottom: 12 }}>
              {label('Manufacturer instructions (from packaging)')}
              {textarea({ value: mfrInstructions, onChange: e => setMfrInstructions(e.target.value),
                placeholder: 'Preheat oven to 220°C. Remove from freezer. Place on middle rack. Bake 10–12 min.' })}
              <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--muted)', marginTop: 4 }}>
                The baseline to compare against — Soupdog's profile should be better than this.
              </div>
            </div>

            <div>
              {label('Cooking notes')}
              {textarea({ value: outcomeNotes, onChange: e => setOutcomeNotes(e.target.value),
                placeholder: 'Crust was crisp, cheese fully melted. Centre still slightly soft — may need +1 min.' })}
            </div>
          </>
        )}
      </Section>

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
        padding: '12px 24px', display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', zIndex: 50 }}>
        <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--muted)' }}>
          {addProfile ? 'Product + cooking profile will be saved' : 'Product only — add profile later'}
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => router.back()}
            style={{ padding: '8px 16px', border: B, background: 'none',
              fontFamily: MONO, fontSize: 11, cursor: 'pointer', color: 'var(--muted)' }}>
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            style={{ padding: '8px 20px', border: 'none',
              background: 'var(--accent)', color: '#fff',
              fontFamily: MONO, fontSize: 11, cursor: saving ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 6, opacity: saving ? 0.7 : 1 }}>
            {saving ? <><Loader2 size={11} className="animate-spin" /> Saving…</> : 'Save product'}
          </button>
        </div>
      </div>
    </div>
  );
}
