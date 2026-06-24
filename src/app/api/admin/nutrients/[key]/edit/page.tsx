// src/app/nutrients/[key]/edit/page.tsx
'use client';
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

const MONO = 'var(--font-mono)';
const B = '1px solid var(--border)';

type Form = {
  name: string; summary: string; description: string; how_much: string;
  too_little: string; too_much: string; food_sources_note: string; tips: string;
  aliases: string; rda_reference: string; published: boolean; content_reviewed: boolean;
};

const EMPTY: Form = {
  name: '', summary: '', description: '', how_much: '', too_little: '', too_much: '',
  food_sources_note: '', tips: '', aliases: '', rda_reference: '', published: false, content_reviewed: false,
};

export default function NutrientEditPage() {
  const params = useParams();
  const router = useRouter();
  const key = String(params.key);
  const [form, setForm] = useState<Form | null>(null);
  const [meta, setMeta] = useState<{ name: string; category: string; unit: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    fetch('/api/admin/check').then(r => r.json()).then(d => { if (!d.isAdmin) setDenied(true); }).catch(() => setDenied(true));
  }, []);

  useEffect(() => {
    const supabase = createClient() as any;
    supabase.from('nutrient')
      .select('name, category, unit, summary, description, how_much, too_little, too_much, food_sources_note, tips, aliases, rda_reference, published, content_reviewed')
      .eq('key', key).single()
      .then(({ data }: any) => {
        if (!data) { setError('Nutrient not found'); return; }
        setMeta({ name: data.name, category: data.category, unit: data.unit });
        setForm({
          name: data.name ?? '', summary: data.summary ?? '', description: data.description ?? '',
          how_much: data.how_much ?? '', too_little: data.too_little ?? '', too_much: data.too_much ?? '',
          food_sources_note: data.food_sources_note ?? '', tips: data.tips ?? '',
          aliases: (data.aliases ?? []).join(', '), rda_reference: data.rda_reference ?? '',
          published: !!data.published, content_reviewed: !!data.content_reviewed,
        });
      });
  }, [key]);

  const save = async () => {
    if (!form) return;
    setSaving(true); setError(null);
    try {
      const res = await fetch(`/api/admin/nutrients/${encodeURIComponent(key)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? 'Save failed');
      router.push(`/nutrients/${key}`);
    } catch (e: any) {
      setError(e.message ?? 'Save failed');
    } finally { setSaving(false); }
  };

  if (denied) return <div style={{ maxWidth: 720, margin: '0 auto', padding: 40, fontFamily: MONO, fontSize: 13, color: 'var(--muted)' }}>Admin only.</div>;
  if (!form || !meta) return <div style={{ maxWidth: 720, margin: '0 auto', padding: 40, fontFamily: MONO, fontSize: 12, color: 'var(--muted)' }}>Loading…</div>;

  const set = (k: keyof Form, v: any) => setForm(f => f ? { ...f, [k]: v } : f);

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 24px 100px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
        <Link href={`/nutrients/${key}`}
          style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: MONO, fontSize: 11, color: 'var(--muted)', textDecoration: 'none' }}>
          <ArrowLeft size={12} /> {meta.name}
        </Link>
      </div>

      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 400, marginBottom: 4 }}>
        Edit: {meta.name}
      </h1>
      <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--muted)', marginBottom: 24 }}>
        {meta.category} · {meta.unit} · key: {key}
      </div>

      <Field label="Name" value={form.name} onChange={v => set('name', v)} />
      <Field label="Summary (one line — shows in the modal & page intro)" value={form.summary} onChange={v => set('summary', v)} textarea rows={2} />
      <Field label="What it does" value={form.description} onChange={v => set('description', v)} textarea rows={4} />
      <Field label="How much you need (ranges; informational, not prescriptive)" value={form.how_much} onChange={v => set('how_much', v)} textarea rows={3} />
      <Field label="Reference value (short, e.g. ~2000 kcal/day adult)" value={form.rda_reference} onChange={v => set('rda_reference', v)} />
      <Field label="Too little (deficiency)" value={form.too_little} onChange={v => set('too_little', v)} textarea rows={3} />
      <Field label="Too much (excess / toxicity — keep informational)" value={form.too_much} onChange={v => set('too_much', v)} textarea rows={3} />
      <Field label="Where it's found (optional prose; the richest-ingredients list is automatic)" value={form.food_sources_note} onChange={v => set('food_sources_note', v)} textarea rows={2} />
      <Field label="Good to know / tips" value={form.tips} onChange={v => set('tips', v)} textarea rows={2} />
      <Field label="Aliases (comma-separated, e.g. Vitamin B9)" value={form.aliases} onChange={v => set('aliases', v)} />

      <div style={{ display: 'flex', gap: 20, marginTop: 16 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontFamily: MONO, fontSize: 11, color: 'var(--fg)', cursor: 'pointer' }}>
          <input type="checkbox" checked={form.content_reviewed} onChange={e => set('content_reviewed', e.target.checked)} />
          Content reviewed
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontFamily: MONO, fontSize: 11, color: 'var(--fg)', cursor: 'pointer' }}>
          <input type="checkbox" checked={form.published} onChange={e => set('published', e.target.checked)} />
          Published (listed publicly)
        </label>
      </div>

      {error && (
        <div style={{ fontFamily: MONO, fontSize: 11, color: '#92400e', border: '1px solid #b45309',
          background: '#fef3c7', padding: '8px 12px', marginTop: 16 }}>{error}</div>
      )}

      {/* Fixed bottom save bar (no chat sidebar here → right: 0) */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, borderTop: B, background: 'var(--surface)',
        padding: '10px 24px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, zIndex: 50 }}>
        <Link href={`/nutrients/${key}`}
          style={{ fontFamily: MONO, fontSize: 11, color: 'var(--muted)', padding: '8px 16px', border: B, textDecoration: 'none' }}>
          Cancel
        </Link>
        <button onClick={save} disabled={saving}
          style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 20px', border: 'none',
            background: 'var(--accent)', color: 'var(--bg)', fontFamily: MONO, fontSize: 11,
            cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
          {saving ? <><Loader2 size={12} className="animate-spin" /> Saving…</> : 'Save'}
        </button>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, textarea, rows }: {
  label: string; value: string; onChange: (v: string) => void; textarea?: boolean; rows?: number;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--muted)', marginBottom: 4 }}>
        {label}
      </div>
      {textarea ? (
        <textarea value={value} onChange={e => onChange(e.target.value)} rows={rows ?? 3}
          style={{ width: '100%', padding: '8px 11px', border: B, background: 'var(--bg)', color: 'var(--fg)',
            fontFamily: MONO, fontSize: 12, outline: 'none', resize: 'vertical', lineHeight: 1.6, boxSizing: 'border-box' }} />
      ) : (
        <input value={value} onChange={e => onChange(e.target.value)}
          style={{ width: '100%', padding: '8px 11px', border: B, background: 'var(--bg)', color: 'var(--fg)',
            fontFamily: MONO, fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
      )}
    </div>
  );
}
