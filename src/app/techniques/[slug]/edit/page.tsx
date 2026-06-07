// src/app/techniques/[slug]/edit/page.tsx
'use client';
import React, { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

const COMPLETION_TYPES = ['', 'time','core_temp','surface_temp','color','volume','mass','texture','structural','aroma','ph','subjective'];
const HEAT_MECHANISMS = ['', 'conduction','convection','radiation','dielectric','combination','none'];
const HEAT_MEDIA = ['', 'fat','water','steam','air','direct','none'];

const L: React.CSSProperties = {
  fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.1em',
  textTransform: 'uppercase', color: 'var(--muted)', display: 'block', marginBottom: 6,
};
const I: React.CSSProperties = {
  width: '100%', padding: '8px 10px', fontSize: 14, border: '1px solid var(--border)',
  background: 'var(--surface)', color: 'var(--fg)', fontFamily: 'var(--font-body, inherit)',
};
const FIELD: React.CSSProperties = { marginBottom: 18 };

export default function TaskEditPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const router = useRouter();
  const [t, setT] = useState<any | null | 'missing'>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient() as any;
    (async () => {
      let { data } = await supabase.from('tasks').select('*').eq('slug', slug).limit(1);
      if (!data || data.length === 0) {
        const r = await supabase.from('tasks').select('*').ilike('name', slug.replace(/-/g, ' ')).limit(1);
        data = r.data;
      }
      setT(data && data.length ? data[0] : 'missing');
    })();
  }, [slug]);

  if (t === null) return <div style={{ padding: 40, color: 'var(--muted)' }}>Loading…</div>;
  if (t === 'missing') return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: 40 }}>
      <p style={{ color: 'var(--muted)' }}>Task not found.</p>
      <Link href="/techniques" style={{ color: 'var(--accent)' }}>← Techniques</Link>
    </div>
  );

  const set = (k: string, v: any) => setT({ ...t, [k]: v });

  const save = async () => {
    setSaving(true); setMsg(null);
    const payload = {
      name: t.name, category: t.category, description: t.description,
      tips: t.tips, common_mistakes: t.common_mistakes,
      completion_type: t.completion_type, completion_target: t.completion_target,
      completion_criterion: t.completion_criterion,
      heat_mechanism: t.heat_mechanism, heat_medium: t.heat_medium,
      min_duration_seconds: t.min_duration_seconds, max_duration_seconds: t.max_duration_seconds,
      typical_input_state: t.typical_input_state, typical_output_state: t.typical_output_state,
      suggested_tool_slugs: Array.isArray(t.suggested_tool_slugs) ? t.suggested_tool_slugs.join(', ') : t.suggested_tool_slugs,
      is_verified: t.is_verified,
    };
    const res = await fetch(`/api/admin/tasks/${t.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const out = await res.json().catch(() => ({}));
    setSaving(false);
    if (res.ok) { setMsg('Saved.'); setTimeout(() => router.push(`/techniques/${slug}`), 600); }
    else setMsg(`Error: ${out.error ?? res.status}`);
  };

  const toolStr = Array.isArray(t.suggested_tool_slugs) ? t.suggested_tool_slugs.join(', ') : (t.suggested_tool_slugs ?? '');

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: '32px 24px 100px' }}>
      <Link href={`/techniques/${slug}`} style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--muted)', textDecoration: 'none' }}>
        ← {t.name}
      </Link>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 600, margin: '14px 0 24px', color: 'var(--fg)' }}>
        Edit technique
      </h1>

      <div style={FIELD}><label style={L}>Name</label>
        <input style={I} value={t.name ?? ''} onChange={e => set('name', e.target.value)} /></div>

      <div style={FIELD}><label style={L}>Description</label>
        <textarea style={{ ...I, minHeight: 64, resize: 'vertical' }} value={t.description ?? ''} onChange={e => set('description', e.target.value)} /></div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={FIELD}><label style={L}>Completion type</label>
          <select style={I} value={t.completion_type ?? ''} onChange={e => set('completion_type', e.target.value)}>
            {COMPLETION_TYPES.map(c => <option key={c} value={c}>{c || '—'}</option>)}
          </select></div>
        <div style={FIELD}><label style={L}>Completion target</label>
          <input style={I} value={t.completion_target ?? ''} onChange={e => set('completion_target', e.target.value)} placeholder='e.g. golden / al dente / 74' /></div>
      </div>

      <div style={FIELD}><label style={L}>Completion criterion (human phrasing)</label>
        <input style={I} value={t.completion_criterion ?? ''} onChange={e => set('completion_criterion', e.target.value)} /></div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={FIELD}><label style={L}>Heat mechanism</label>
          <select style={I} value={t.heat_mechanism ?? ''} onChange={e => set('heat_mechanism', e.target.value)}>
            {HEAT_MECHANISMS.map(c => <option key={c} value={c}>{c || '—'}</option>)}
          </select></div>
        <div style={FIELD}><label style={L}>Heat medium</label>
          <select style={I} value={t.heat_medium ?? ''} onChange={e => set('heat_medium', e.target.value)}>
            {HEAT_MEDIA.map(c => <option key={c} value={c}>{c || '—'}</option>)}
          </select></div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={FIELD}><label style={L}>Min duration (seconds)</label>
          <input style={I} type="number" value={t.min_duration_seconds ?? ''} onChange={e => set('min_duration_seconds', e.target.value)} /></div>
        <div style={FIELD}><label style={L}>Max duration (seconds)</label>
          <input style={I} type="number" value={t.max_duration_seconds ?? ''} onChange={e => set('max_duration_seconds', e.target.value)} /></div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={FIELD}><label style={L}>Input state</label>
          <input style={I} value={t.typical_input_state ?? ''} onChange={e => set('typical_input_state', e.target.value)} /></div>
        <div style={FIELD}><label style={L}>Output state</label>
          <input style={I} value={t.typical_output_state ?? ''} onChange={e => set('typical_output_state', e.target.value)} /></div>
      </div>

      <div style={FIELD}><label style={L}>Category</label>
        <input style={I} value={t.category ?? ''} onChange={e => set('category', e.target.value)} /></div>

      <div style={FIELD}><label style={L}>Tools (comma-separated slugs)</label>
        <input style={I} value={toolStr} onChange={e => set('suggested_tool_slugs', e.target.value)} placeholder='large-pot, colander' /></div>

      <div style={FIELD}><label style={L}>Tips</label>
        <textarea style={{ ...I, minHeight: 56, resize: 'vertical' }} value={t.tips ?? ''} onChange={e => set('tips', e.target.value)} /></div>

      <div style={FIELD}><label style={L}>Common mistakes</label>
        <textarea style={{ ...I, minHeight: 56, resize: 'vertical' }} value={t.common_mistakes ?? ''} onChange={e => set('common_mistakes', e.target.value)} /></div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '8px 0 24px', cursor: 'pointer' }}>
        <input type="checkbox" checked={!!t.is_verified} onChange={e => set('is_verified', e.target.checked)} />
        <span style={{ fontSize: 14, color: 'var(--fg)' }}>Verified (part of the guide / shown without a draft badge)</span>
      </label>

      {/* Fixed bottom save bar (matches the recipe editor pattern; no chat sidebar here so right:0) */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        borderTop: '1px solid var(--border)', background: 'var(--surface)',
        padding: '10px 32px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', zIndex: 50,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--muted)' }}>
            Editing technique
          </span>
          {msg && (
            <span style={{ fontSize: 13, color: msg.startsWith('Error') ? '#b4413c' : 'var(--accent)' }}>
              {msg}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Link href={`/techniques/${slug}`} style={{ color: 'var(--muted)', fontSize: 14, textDecoration: 'none' }}>
            Cancel
          </Link>
          <button onClick={save} disabled={saving}
            style={{ background: 'var(--accent)', color: '#fff', border: 'none', padding: '10px 22px', fontSize: 14, cursor: saving ? 'default' : 'pointer', fontFamily: 'var(--font-mono)', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Saving…' : 'Save technique'}
          </button>
        </div>
      </div>
    </div>
  );
}
