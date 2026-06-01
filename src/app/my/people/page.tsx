// src/app/my/people/page.tsx
// Household / People — manage the people you cook for.
// A person you own (e.g. a child or elderly parent) is created here as a
// "managed" person. This is the general person-management mechanism; later,
// sharing & delegation (dinner guests, caregivers, nutritionists) reuse the
// same person + person_access primitives with different roles and scopes.

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Avatar, AvatarColorPicker } from '@/components/people/Avatar';

const C = {
  bg: '#f7f6f2', fg: '#1a1a1a', accent: '#2e4638', muted: '#6b6860',
  border: '#dad7d1', surface: '#fffefb', surfaceHover: '#efede7',
};
const SERIF = 'IBM Plex Serif, serif';
const SANS = 'IBM Plex Sans, system-ui, sans-serif';
const MONO = 'IBM Plex Mono, monospace';

type Person = {
  person_id: string; role: string; access_level: string; is_self: boolean;
  display_name: string | null; full_name: string | null; date_of_birth: string | null;
  country: string | null; is_managed: boolean; avatar_color?: string | null;
  allergies?: string[]; medical_conditions?: string[];
};

const COMMON_ALLERGENS = ['Gluten', 'Crustaceans', 'Eggs', 'Fish', 'Peanuts', 'Soybeans', 'Milk', 'Tree nuts', 'Celery', 'Mustard', 'Sesame', 'Sulphites', 'Lupin', 'Molluscs'];
const COMMON_CONDITIONS = ['Type 1 diabetes', 'Type 2 diabetes', 'High blood pressure', 'High cholesterol', 'Chronic kidney disease', 'Coeliac disease', 'IBS', 'IBD', 'Acid reflux / GERD', 'Gout'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function useIsDesktop() {
  const [d, setD] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const u = () => setD(mq.matches); u();
    mq.addEventListener('change', u); return () => mq.removeEventListener('change', u);
  }, []);
  return d;
}
function ageFromDOB(dob: string | null): number | null {
  if (!dob) return null;
  const b = new Date(dob); if (isNaN(+b)) return null;
  const n = new Date(); let a = n.getFullYear() - b.getFullYear();
  const m = n.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && n.getDate() < b.getDate())) a--;
  return a;
}

const labelS = { display: 'block', fontFamily: MONO, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.15em', color: C.muted, marginBottom: 8 } as const;
const inputS = { width: '100%', padding: '9px 11px', border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 14, background: C.surface, color: C.fg, fontFamily: SANS } as const;

function BirthdayPicker({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  // Hold the three parts in local state so partial selections persist.
  // Seed from `value` once on mount (and when it changes externally).
  const parse = (v: string | null) => {
    if (!v) return { d: '', m: '', y: '' };
    const [yy, mm, dd] = v.split('-');
    return { d: dd ? String(Number(dd)) : '', m: mm ? String(Number(mm)) : '', y: yy ?? '' };
  };
  const [parts, setParts] = useState(() => parse(value));
  const lastValue = useRef(value);
  useEffect(() => {
    if (value !== lastValue.current) { lastValue.current = value; setParts(parse(value)); }
  }, [value]);

  const thisYear = new Date().getFullYear();
  const years = useMemo(() => Array.from({ length: 120 }, (_, i) => thisYear - i), [thisYear]);
  const dim = (a: number, b: number) => new Date(a, b, 0).getDate();
  const maxDay = (parts.m && parts.y) ? dim(Number(parts.y), Number(parts.m)) : 31;

  const update = (next: { d: string; m: string; y: string }) => {
    setParts(next);
    if (next.d && next.m && next.y) {
      const cap = Math.min(Number(next.d), dim(Number(next.y), Number(next.m)));
      const iso = `${next.y}-${String(Number(next.m)).padStart(2, '0')}-${String(cap).padStart(2, '0')}`;
      lastValue.current = iso;
      onChange(iso);
    } else {
      // partial — keep local state, don't wipe; only clear parent if fully empty
      if (!next.d && !next.m && !next.y) { lastValue.current = null; onChange(null); }
    }
  };

  const sel = { ...inputS, minWidth: 0 } as const;
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <select aria-label="Day" value={parts.d} onChange={(e) => update({ ...parts, d: e.target.value })} style={{ ...sel, flex: '0 0 72px' }}>
        <option value="">Day</option>{Array.from({ length: maxDay }, (_, i) => i + 1).map((x) => <option key={x} value={x}>{x}</option>)}
      </select>
      <select aria-label="Month" value={parts.m} onChange={(e) => update({ ...parts, m: e.target.value })} style={{ ...sel, flex: 1 }}>
        <option value="">Month</option>{MONTHS.map((x, i) => <option key={x} value={i + 1}>{x}</option>)}
      </select>
      <select aria-label="Year" value={parts.y} onChange={(e) => update({ ...parts, y: e.target.value })} style={{ ...sel, flex: '0 0 92px' }}>
        <option value="">Year</option>{years.map((x) => <option key={x} value={x}>{x}</option>)}
      </select>
    </div>
  );
}

function TogglePicker({ options, values, onChange, otherPlaceholder }: { options: string[]; values: string[]; onChange: (v: string[]) => void; otherPlaceholder: string }) {
  const [draft, setDraft] = useState('');
  const toggle = (o: string) => onChange(values.includes(o) ? values.filter((x) => x !== o) : [...values, o]);
  const others = values.filter((v) => !options.includes(v));
  const addOther = () => { const v = draft.trim(); if (v && !values.includes(v)) onChange([...values, v]); setDraft(''); };
  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
        {options.map((o) => { const on = values.includes(o); return <button key={o} onClick={() => toggle(o)} style={{ padding: '6px 11px', borderRadius: 7, fontSize: 13, cursor: 'pointer', border: `1px solid ${on ? C.accent : C.border}`, background: on ? C.accent : C.surface, color: on ? '#fff' : C.fg }}>{o}</button>; })}
      </div>
      {others.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          {others.map((o) => <span key={o} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: C.surfaceHover, border: `1px solid ${C.border}`, borderRadius: 6, padding: '4px 8px', fontSize: 13 }}>{o}<button onClick={() => onChange(values.filter((x) => x !== o))} style={{ border: 'none', background: 'none', cursor: 'pointer', color: C.muted, fontSize: 14, lineHeight: 1, padding: 0 }}>×</button></span>)}
        </div>
      )}
      <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addOther(); } }} onBlur={addOther} placeholder={otherPlaceholder} style={inputS} />
    </div>
  );
}

function Modal({ title, onClose, onSave, saving, children, danger }: { title: string; onClose: () => void; onSave?: () => void; saving?: boolean; children: React.ReactNode; danger?: { label: string; onClick: () => void } }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(26,26,26,0.35)', zIndex: 100, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()} className="people-modal" style={{ background: C.bg, width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto', borderRadius: '14px 14px 0 0', padding: 24, boxShadow: '0 -8px 40px rgba(0,0,0,0.15)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <h3 style={{ fontFamily: SERIF, fontSize: 19, fontWeight: 400, margin: 0 }}>{title}</h3>
          <button onClick={onClose} aria-label="Close" style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 22, color: C.muted, lineHeight: 1 }}>×</button>
        </div>
        {children}
        <div style={{ display: 'flex', gap: 12, marginTop: 24, justifyContent: 'space-between', alignItems: 'center' }}>
          <div>{danger && <button onClick={danger.onClick} style={{ background: 'none', border: 'none', color: '#a32d2d', fontSize: 13, cursor: 'pointer', padding: 0 }}>{danger.label}</button>}</div>
          {onSave && (
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={onClose} style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 7, padding: '9px 16px', fontSize: 14, cursor: 'pointer', color: C.fg }}>Cancel</button>
              <button onClick={onSave} disabled={saving} style={{ background: C.accent, color: '#fff', border: 'none', borderRadius: 7, padding: '9px 18px', fontSize: 14, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1 }}>{saving ? 'Saving…' : 'Save'}</button>
            </div>
          )}
        </div>
      </div>
      <style>{`@media (min-width:768px){.people-modal{align-self:center;border-radius:14px !important;}}`}</style>
    </div>
  );
}

export default function PeoplePage() {
  const isDesktop = useIsDesktop();
  const [people, setPeople] = useState<Person[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Person | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = () => fetch('/api/my/people').then((r) => r.json()).then((d) => setPeople(d.people)).catch(() => setError('Failed to load people'));
  useEffect(() => { load(); }, []);

  const openAdd = () => { setDraft({ display_name: '', full_name: '', date_of_birth: null, avatar_color: null, allergies: [], medical_conditions: [] }); setAdding(true); setConfirmDelete(false); };
  const openEdit = (p: Person) => { setDraft({ ...p, allergies: p.allergies ?? [], medical_conditions: p.medical_conditions ?? [] }); setEditing(p); setConfirmDelete(false); };
  const close = () => { setAdding(false); setEditing(null); setDraft(null); setConfirmDelete(false); };

  const saveAdd = async () => {
    setSaving(true); setError(null);
    try {
      const res = await fetch('/api/my/people', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not add');
      close(); load();
    } catch (e: any) { setError(e.message); } finally { setSaving(false); }
  };
  const saveEdit = async () => {
    setSaving(true); setError(null);
    try {
      const res = await fetch('/api/my/people', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not save');
      close(); load();
    } catch (e: any) { setError(e.message); } finally { setSaving(false); }
  };
  const doDelete = async () => {
    if (!editing) return;
    setSaving(true); setError(null);
    try {
      const res = await fetch(`/api/my/people?person_id=${editing.person_id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not remove');
      close(); load();
    } catch (e: any) { setError(e.message); } finally { setSaving(false); }
  };

  const field = (k: string, v: any) => setDraft((d: any) => ({ ...d, [k]: v }));

  return (
    <div style={{ background: C.bg, minHeight: '100vh', fontFamily: SANS, color: C.fg }}>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: isDesktop ? '32px 32px 96px' : '20px 16px 96px' }}>
        <p style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.2em', color: C.muted, marginBottom: 6 }}>My Kitchen</p>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 8 }}>
          <h1 style={{ fontFamily: SERIF, fontSize: 30, fontWeight: 300, margin: 0 }}>People</h1>
          <button onClick={openAdd} style={{ background: C.accent, color: '#fff', border: 'none', borderRadius: 7, padding: '9px 16px', fontSize: 14, cursor: 'pointer' }}>+ Add person</button>
        </div>
        <p style={{ color: C.muted, fontSize: 13, margin: '0 0 24px', lineHeight: 1.5, maxWidth: 520 }}>
          The people you cook for. Add family members or anyone in your care — each has their own allergies, dietary needs and profile, used across recipes and meal plans.
        </p>

        {error && <p style={{ color: '#a32d2d', fontSize: 13, marginBottom: 16 }}>{error}</p>}
        {!people && <p style={{ color: C.muted }}>Loading…</p>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {(people ?? []).map((p) => {
            const age = ageFromDOB(p.date_of_birth);
            const bits = [age != null ? `${age} yrs` : null, p.is_self ? 'You' : null].filter(Boolean);
            const allergyCount = p.allergies?.length ?? 0;
            return (
              <div key={p.person_id} style={{ display: 'flex', alignItems: 'center', gap: 14, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14 }}>
                <Avatar id={p.person_id} name={p.display_name} colorKey={p.avatar_color} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 16, fontFamily: SERIF }}>{p.display_name ?? 'Unnamed'} {bits.length > 0 && <span style={{ fontFamily: SANS, fontSize: 12.5, color: C.muted }}>· {bits.join(' · ')}</span>}</div>
                  <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2 }}>
                    {allergyCount ? `⚠ ${p.allergies!.join(', ')}` : 'No allergies recorded'}
                  </div>
                </div>
                {p.is_self ? (
                  <a href="/my/profile" style={{ color: C.muted, fontSize: 13, textDecoration: 'none', flex: '0 0 auto' }}>Profile ›</a>
                ) : (
                  <button onClick={() => openEdit(p)} style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 7, padding: '6px 12px', fontSize: 13, color: C.fg, cursor: 'pointer', flex: '0 0 auto' }}>Edit</button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {(adding || editing) && draft && (
        <Modal
          title={adding ? 'Add a person' : `Edit ${draft.display_name || 'person'}`}
          onClose={close} saving={saving}
          onSave={adding ? saveAdd : saveEdit}
          danger={editing && !confirmDelete ? { label: 'Remove this person', onClick: () => setConfirmDelete(true) } : undefined}
        >
          {confirmDelete ? (
            <div>
              <p style={{ fontSize: 14, marginBottom: 16 }}>Remove <b>{draft.display_name}</b>? This deletes their profile and can’t be undone.</p>
              <div style={{ display: 'flex', gap: 12 }}>
                <button onClick={() => setConfirmDelete(false)} style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 7, padding: '9px 16px', fontSize: 14, cursor: 'pointer' }}>Keep</button>
                <button onClick={doDelete} disabled={saving} style={{ background: '#a32d2d', color: '#fff', border: 'none', borderRadius: 7, padding: '9px 18px', fontSize: 14, cursor: 'pointer' }}>{saving ? 'Removing…' : 'Remove'}</button>
              </div>
            </div>
          ) : (
            <>
              <div style={{ marginBottom: 16 }}><label style={labelS}>Name</label><input style={inputS} value={draft.display_name ?? ''} onChange={(e) => field('display_name', e.target.value)} placeholder="e.g. Astrid" /></div>
              <div style={{ marginBottom: 16 }}><label style={labelS}>Full name (optional)</label><input style={inputS} value={draft.full_name ?? ''} onChange={(e) => field('full_name', e.target.value)} placeholder="Full / legal name" /></div>
              <div style={{ marginBottom: 16 }}><label style={labelS}>Date of birth</label><BirthdayPicker value={draft.date_of_birth} onChange={(v) => field('date_of_birth', v)} /></div>
              <div style={{ marginBottom: 16 }}>
                <label style={labelS}>Avatar colour</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <Avatar id={editing?.person_id ?? 'new'} name={draft.display_name} colorKey={draft.avatar_color} size={44} />
                  <AvatarColorPicker value={draft.avatar_color} onChange={(k) => field('avatar_color', k)} />
                </div>
              </div>
              <div style={{ marginBottom: 16 }}><label style={labelS}>Allergies</label><TogglePicker options={COMMON_ALLERGENS} values={draft.allergies ?? []} onChange={(v) => field('allergies', v)} otherPlaceholder="Other allergy — Enter to add" /></div>
              <div><label style={labelS}>Medical conditions</label><TogglePicker options={COMMON_CONDITIONS} values={draft.medical_conditions ?? []} onChange={(v) => field('medical_conditions', v)} otherPlaceholder="Other condition — Enter to add" /></div>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
