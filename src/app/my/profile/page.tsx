// src/app/my/profile/page.tsx
// Phase 2 / Build A — Overview + summary-panel profile.
// Left rail (desktop) / top tab strip (mobile). Each section is a summary panel
// of rows showing value-or-empty; editing opens a modal. Overview is a grid of
// section summary cards.
//
// Live in Build A: Overview, Personal info, Cooking skills, Account.
// Stubbed (filled in Build B): Health profile, Taste profile, Eating habits.

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Avatar, AvatarColorPicker } from '@/components/people/Avatar';

// ── design tokens ──
const C = {
  bg: '#f7f6f2', fg: '#1a1a1a', accent: '#2e4638', muted: '#6b6860',
  border: '#dad7d1', surface: '#fffefb', surfaceHover: '#efede7',
};
const SERIF = 'IBM Plex Serif, serif';
const SANS = 'IBM Plex Sans, system-ui, sans-serif';
const MONO = 'IBM Plex Mono, monospace';

// ── types ──
type Profile = {
  id: string; display_name: string; full_name: string | null;
  unit_system: string; language: string; skill_level: string;
  allergies: string[]; dietary_restrictions: string[]; preferred_cuisines: string[];
  date_of_birth: string | null; country: string | null;
  avatar_color: string | null;
};

const UNIT_OPTIONS = [
  { v: 'si', label: 'Metric / SI (g, ml, °C)' },
  { v: 'imperial', label: 'Imperial (oz, lb, °F)' },
  { v: 'us', label: 'US customary (cups, °F)' },
];
const LANGUAGE_OPTIONS = [
  { v: 'en', label: 'English' }, { v: 'sv', label: 'Svenska' },
  { v: 'zh', label: '中文' }, { v: 'ar', label: 'العربية' }, { v: 'fr', label: 'Français' },
];
// short country list — extend later / replace with a full ISO list
const COUNTRY_OPTIONS = [
  '', 'Sweden', 'United States', 'United Kingdom', 'China', 'France', 'Sri Lanka',
  'Germany', 'India', 'Japan', 'Singapore', 'Australia', 'Canada',
];

const COMPETENCY_AREAS: { key: string; label: string }[] = [
  { key: 'knife_skills', label: 'Knife skills' },
  { key: 'mise_timing', label: 'Mise-en-place & timing' },
  { key: 'sauces', label: 'Sauces' },
  { key: 'fish', label: 'Fish & seafood' },
  { key: 'butchery', label: 'Meat & butchery' },
  { key: 'roasting_grilling', label: 'Roasting & grilling' },
  { key: 'baking_bread', label: 'Baking & bread' },
  { key: 'pastry_desserts', label: 'Pastry & desserts' },
  { key: 'fermentation', label: 'Fermentation & preserving' },
  { key: 'plating', label: 'Plating & presentation' },
];
const LEVELS = ['—', 'Follows a recipe', 'Confident', 'Can improvise'];

const SEX_OPTIONS = [
  { v: 'female', label: 'Female' },
  { v: 'male', label: 'Male' },
  { v: 'unspecified', label: 'Prefer not to say' },
];
const ACTIVITY_OPTIONS = [
  { v: 'sedentary', label: 'Sedentary (little exercise)' },
  { v: 'light', label: 'Lightly active' },
  { v: 'moderate', label: 'Moderately active' },
  { v: 'active', label: 'Active' },
  { v: 'very_active', label: 'Very active' },
];
const TASTE_AXES = [
  { key: 'spice_tolerance', label: 'Spice & heat' },
  { key: 'sweet_preference', label: 'Sweetness' },
  { key: 'sour_preference', label: 'Sourness & acidity' },
  { key: 'bitter_tolerance', label: 'Bitterness' },
] as const;
// 4-point labelled scale (even — forces a lean, no mushy middle).
const AXIS_LEVELS = ['Avoid', 'A little', 'Enjoy', 'Love it'];

// EU-14 major allergens (+ free-text "other" in the UI).
const COMMON_ALLERGENS = [
  'Gluten', 'Crustaceans', 'Eggs', 'Fish', 'Peanuts', 'Soybeans', 'Milk',
  'Tree nuts', 'Celery', 'Mustard', 'Sesame', 'Sulphites', 'Lupin', 'Molluscs',
];
// Diet-relevant conditions for meal planning (+ free-text "other").
const COMMON_CONDITIONS = [
  'Type 1 diabetes', 'Type 2 diabetes', 'High blood pressure', 'High cholesterol',
  'Chronic kidney disease', 'Coeliac disease', 'IBS', 'IBD', 'Acid reflux / GERD', 'Gout',
];

type Health = {
  height_cm: number | null; weight_kg: number | null;
  sex_at_birth: string | null; activity_level: string | null;
  allergies: string[]; medical_conditions: string[];
};
type Taste = {
  liked_cuisines: string[]; disliked_cuisines: string[];
  liked_ingredients: string[]; disliked_ingredients: string[];
  liked_textures: string[]; disliked_textures: string[];
  spice_tolerance: number | null; sweet_preference: number | null;
  sour_preference: number | null; umami_preference: number | null; bitter_tolerance: number | null;
};

const SECTIONS = [
  { key: 'overview', label: 'Overview' },
  { key: 'personal', label: 'Personal info' },
  { key: 'cooking', label: 'Cooking skills' },
  { key: 'health', label: 'Health profile' },
  { key: 'taste', label: 'Taste profile' },
  { key: 'eating', label: 'Eating habits' },
  { key: 'account', label: 'Account' },
] as const;
type SectionKey = typeof SECTIONS[number]['key'];

// ── responsive hook ──
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

// ── shared styles ──
const labelS = { display: 'block', fontFamily: MONO, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.15em', color: C.muted, marginBottom: 8 } as const;
const inputS = { width: '100%', padding: '9px 11px', border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 14, background: C.surface, color: C.fg, fontFamily: SANS } as const;

// ── modal ──
function Modal({ title, onClose, onSave, saving, children }: {
  title: string; onClose: () => void; onSave?: () => void; saving?: boolean; children: React.ReactNode;
}) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(26,26,26,0.35)', zIndex: 100, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.bg, width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto', borderRadius: '14px 14px 0 0', padding: 24, boxShadow: '0 -8px 40px rgba(0,0,0,0.15)' }}
        className="profile-modal">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <h3 style={{ fontFamily: SERIF, fontSize: 19, fontWeight: 400, margin: 0 }}>{title}</h3>
          <button onClick={onClose} aria-label="Close" style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 22, color: C.muted, lineHeight: 1 }}>×</button>
        </div>
        {children}
        {onSave && (
          <div style={{ display: 'flex', gap: 12, marginTop: 24, justifyContent: 'flex-end' }}>
            <button onClick={onClose} style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 7, padding: '9px 16px', fontSize: 14, cursor: 'pointer', color: C.fg }}>Cancel</button>
            <button onClick={onSave} disabled={saving} style={{ background: C.accent, color: '#fff', border: 'none', borderRadius: 7, padding: '9px 18px', fontSize: 14, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1 }}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        )}
      </div>
      <style>{`@media (min-width:768px){.profile-modal{align-self:center;border-radius:14px !important;}}`}</style>
    </div>
  );
}

// ── one white panel wrapping a section's rows (#2 pattern) ──
function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: '4px 16px', overflow: 'hidden' }}>
      {children}
    </div>
  );
}

// ── summary row ──
function Row({ label, value, onEdit, last }: { label: string; value: React.ReactNode; onEdit?: () => void; last?: boolean }) {
  const empty = value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0);
  return (
    <button onClick={onEdit} disabled={!onEdit}
      style={{ display: 'flex', width: '100%', textAlign: 'left', gap: 16, alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', borderBottom: last ? 'none' : `1px solid ${C.border}`, background: 'none', borderTop: 'none', borderLeft: 'none', borderRight: 'none', cursor: onEdit ? 'pointer' : 'default' }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: MONO, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.13em', color: C.muted, marginBottom: 4 }}>{label}</div>
        <div style={{ fontSize: 14.5, color: empty ? C.muted : C.fg, fontStyle: empty ? 'italic' : 'normal' }}>{empty ? 'Not set' : value}</div>
      </div>
      {onEdit && <span style={{ color: C.muted, fontSize: 13, flex: '0 0 auto' }}>Edit ›</span>}
    </button>
  );
}

// ── chip input (used in modals) ──
function ChipInput({ values, onChange, placeholder }: { values: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [draft, setDraft] = useState('');
  const add = () => { const v = draft.trim(); if (v && !values.includes(v)) onChange([...values, v]); setDraft(''); };
  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
        {values.map((v) => (
          <span key={v} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: C.surfaceHover, border: `1px solid ${C.border}`, borderRadius: 6, padding: '4px 8px', fontSize: 13 }}>
            {v}<button onClick={() => onChange(values.filter((x) => x !== v))} style={{ border: 'none', background: 'none', cursor: 'pointer', color: C.muted, fontSize: 14, lineHeight: 1, padding: 0 }} aria-label={`Remove ${v}`}>×</button>
          </span>
        ))}
      </div>
      <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} onBlur={add} placeholder={placeholder} style={inputS} />
    </div>
  );
}

// ── toggle-button group with a free-text "other" for the long tail ──
function TogglePicker({ options, values, onChange, otherPlaceholder }: {
  options: string[]; values: string[]; onChange: (v: string[]) => void; otherPlaceholder: string;
}) {
  const [draft, setDraft] = useState('');
  const toggle = (o: string) => onChange(values.includes(o) ? values.filter((x) => x !== o) : [...values, o]);
  const others = values.filter((v) => !options.includes(v));
  const addOther = () => { const v = draft.trim(); if (v && !values.includes(v)) onChange([...values, v]); setDraft(''); };
  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
        {options.map((o) => {
          const on = values.includes(o);
          return (
            <button key={o} onClick={() => toggle(o)} style={{ padding: '6px 11px', borderRadius: 7, fontSize: 13, cursor: 'pointer', border: `1px solid ${on ? C.accent : C.border}`, background: on ? C.accent : C.surface, color: on ? '#fff' : C.fg }}>{o}</button>
          );
        })}
      </div>
      {others.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          {others.map((o) => (
            <span key={o} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: C.surfaceHover, border: `1px solid ${C.border}`, borderRadius: 6, padding: '4px 8px', fontSize: 13 }}>
              {o}<button onClick={() => onChange(values.filter((x) => x !== o))} style={{ border: 'none', background: 'none', cursor: 'pointer', color: C.muted, fontSize: 14, lineHeight: 1, padding: 0 }} aria-label={`Remove ${o}`}>×</button>
            </span>
          ))}
        </div>
      )}
      <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addOther(); } }} onBlur={addOther} placeholder={otherPlaceholder} style={inputS} />
    </div>
  );
}

// ── 4-point labelled scale (even — forces a lean). value 1..4 or null ──
function Scale4({ value, onChange }: { value: number | null; onChange: (v: number) => void }) {
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {AXIS_LEVELS.map((label, i) => {
        const lvl = i + 1; const on = value === lvl;
        return (
          <button key={lvl} onClick={() => onChange(lvl)} style={{ flex: 1, padding: '9px 4px', borderRadius: 7, fontSize: 12.5, cursor: 'pointer', border: `1px solid ${on ? C.accent : C.border}`, background: on ? C.accent : C.surface, color: on ? '#fff' : C.fg }}>{label}</button>
        );
      })}
    </div>
  );
}

// ── day/month/year birthday picker ──
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
function BirthdayPicker({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
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
      const iso = `${next.y}-${String(Number(next.m)).padStart(2,'0')}-${String(cap).padStart(2,'0')}`;
      lastValue.current = iso; onChange(iso);
    } else if (!next.d && !next.m && !next.y) { lastValue.current = null; onChange(null); }
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

// ── identities (Account) ──
function useIdentities() {
  const [p, setP] = useState<string[] | null>(null);
  useEffect(() => { (async () => {
    try { const { createClient } = await import('@/lib/supabase/client'); const s = createClient();
      const { data } = await s.auth.getUserIdentities();
      const l = (data?.identities ?? []).map((i: any) => i.provider); setP(l.length ? l : ['email']);
    } catch { setP([]); }
  })(); }, []);
  return p;
}
const PROVIDER_LABEL: Record<string, string> = { email: 'Email & password', google: 'Google', azure: 'Microsoft', apple: 'Apple' };

// ════════════════════════════════════════════════════════════════════════════
export default function ProfilePage() {
  const isDesktop = useIsDesktop();
  const [section, setSection] = useState<SectionKey>('overview');
  const [p, setP] = useState<Profile | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // cooking
  const [cooking, setCooking] = useState<{ overall: string; areas: Record<string, number> } | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [taste, setTaste] = useState<Taste | null>(null);
  const providers = useIdentities();

  // modal state
  const [modal, setModal] = useState<null | 'name' | 'dob' | 'locale' | 'units' | 'country' | 'cooking'
    | 'h_sex' | 'h_body' | 'h_activity' | 'h_allergies' | 'h_conditions'
    | 't_cuisines' | 't_ingredients' | 't_axes' | 'health_all' | 'taste_all' | 'avatar'>(null);
  const [draft, setDraft] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/my/profile').then((r) => r.json()).then((d) => { setP({ country: null, avatar_color: null, ...d.profile }); setEmail(d.email); }).catch(() => setError('Failed to load profile'));
    fetch('/api/my/cooking').then((r) => r.json()).then(setCooking).catch(() => {});
    fetch('/api/my/health').then((r) => r.json()).then((d) => setHealth(d.health)).catch(() => {});
    fetch('/api/my/taste').then((r) => r.json()).then((d) => setTaste(d.taste)).catch(() => {});
  }, []);

  const saveProfile = async (patch: Partial<Profile>) => {
    setSaving(true);
    try {
      const next = { ...(p as Profile), ...patch };
      const res = await fetch('/api/my/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Save failed');
      setP(next); setModal(null);
      if (data.warning) setError(data.warning); else setError(null);
    } catch (e: any) { setError(e.message || 'Save failed'); }
    finally { setSaving(false); }
  };

  const saveCooking = async (next: { overall: string; areas: Record<string, number> }) => {
    setSaving(true);
    try {
      const res = await fetch('/api/my/cooking', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next) });
      if (!res.ok) throw new Error((await res.json()).error || 'Save failed');
      setCooking(next); setModal(null); setError(null);
    } catch (e: any) { setError(e.message || 'Save failed'); }
    finally { setSaving(false); }
  };

  const saveHealth = async (next: Health) => {
    setSaving(true);
    try {
      const res = await fetch('/api/my/health', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next) });
      if (!res.ok) throw new Error((await res.json()).error || 'Save failed');
      setHealth(next); setModal(null); setError(null);
    } catch (e: any) { setError(e.message || 'Save failed'); }
    finally { setSaving(false); }
  };

  const saveTaste = async (next: Taste) => {
    setSaving(true);
    try {
      const res = await fetch('/api/my/taste', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next) });
      if (!res.ok) throw new Error((await res.json()).error || 'Save failed');
      setTaste(next); setModal(null); setError(null);
    } catch (e: any) { setError(e.message || 'Save failed'); }
    finally { setSaving(false); }
  };

  if (error && !p) return <div style={{ padding: 32, fontFamily: SANS, color: C.fg }}>Could not load profile: {error}</div>;
  if (!p) return <div style={{ padding: 32, color: C.muted, fontFamily: SANS }}>Loading profile…</div>;

  const age = ageFromDOB(p.date_of_birth);
  const langLabel = LANGUAGE_OPTIONS.find((o) => o.v === p.language)?.label ?? p.language;
  const unitLabel = UNIT_OPTIONS.find((o) => o.v === p.unit_system)?.label ?? p.unit_system;
  const filledAreas = cooking ? Object.values(cooking.areas).filter((v) => v > 0).length : 0;

  const bmi = (health?.height_cm && health?.weight_kg)
    ? +(health.weight_kg / Math.pow(health.height_cm / 100, 2)).toFixed(1) : null;
  const healthDone = !!(health && (health.height_cm || health.weight_kg || health.sex_at_birth || health.activity_level || health.allergies.length || health.medical_conditions.length));
  const tasteDone = !!(taste && (taste.liked_cuisines.length || taste.liked_ingredients.length || taste.spice_tolerance != null));
  const sexLabel = SEX_OPTIONS.find((o) => o.v === health?.sex_at_birth)?.label ?? null;
  const actLabel = ACTIVITY_OPTIONS.find((o) => o.v === health?.activity_level)?.label ?? null;

  // section completeness for Overview cards
  const cards: { key: SectionKey; title: string; summary: string; done: boolean }[] = [
    { key: 'personal', title: 'Personal info', summary: p.display_name ? `${p.display_name}${age != null ? ` · ${age}` : ''}` : 'Add your name & details', done: !!p.display_name },
    { key: 'cooking', title: 'Cooking skills', summary: filledAreas ? `${filledAreas} areas rated` : 'Rate your kitchen skills', done: filledAreas > 0 },
    { key: 'health', title: 'Health profile', summary: bmi ? `BMI ${bmi}${actLabel ? ` · ${actLabel.split(' ')[0]}` : ''}` : 'Body, activity, allergies', done: healthDone },
    { key: 'taste', title: 'Taste profile', summary: tasteDone ? `${(taste?.liked_cuisines.length ?? 0) + (taste?.liked_ingredients.length ?? 0)} likes` : 'What you love & avoid', done: tasteDone },
    { key: 'eating', title: 'Eating habits', summary: 'Set up with your meal plan', done: false },
    { key: 'account', title: 'Account', summary: email ?? '', done: true },
  ];

  // ── section bodies ──
  const overviewBody = (
    <div>
      <SectionHeader title="Overview" subtitle="Everything Soupdog knows about how you cook and eat." />
      <div style={{ display: 'grid', gridTemplateColumns: isDesktop ? '1fr 1fr' : '1fr', gap: 12 }}>
        {cards.map((c) => (
          <button key={c.key} onClick={() => setSection(c.key)}
            style={{ textAlign: 'left', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 16, cursor: 'pointer' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontFamily: SERIF, fontSize: 16 }}>{c.title}</span>
              <span style={{ width: 8, height: 8, borderRadius: 9, background: c.done ? C.accent : C.border, flex: '0 0 auto' }} />
            </div>
            <div style={{ fontSize: 13, color: C.muted }}>{c.summary || '—'}</div>
          </button>
        ))}
      </div>
    </div>
  );

  const personalBody = (
    <div>
      <SectionHeader title="Personal info" subtitle="Who you are and how Soupdog talks to you." />
      <Panel>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderBottom: `1px solid ${C.border}` }}>
          <Avatar id={p.id} name={p.display_name || p.full_name} colorKey={p.avatar_color} size={48} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, color: C.muted }}>Avatar colour</div>
            <div style={{ fontSize: 14, color: C.fg, textTransform: 'capitalize' }}>{p.avatar_color || 'Auto (from your name)'}</div>
          </div>
          <button type="button" onClick={() => { setDraft({ avatar_color: p.avatar_color }); setModal('avatar'); }} style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.accent, borderRadius: 7, padding: '6px 12px', fontSize: 13, cursor: 'pointer' }}>Edit</button>
        </div>
        <Row label="Display name" value={p.display_name} onEdit={() => { setDraft({ display_name: p.display_name, full_name: p.full_name ?? '' }); setModal('name'); }} />
        <Row label="Full name" value={p.full_name} onEdit={() => { setDraft({ display_name: p.display_name, full_name: p.full_name ?? '' }); setModal('name'); }} />
        <Row label="Date of birth" value={p.date_of_birth ? `${p.date_of_birth}${age != null ? `  ·  ${age} yrs` : ''}` : ''} onEdit={() => { setDraft({ dob: p.date_of_birth }); setModal('dob'); }} />
        <Row label="Country" value={p.country} onEdit={() => { setDraft({ country: p.country ?? '' }); setModal('country'); }} />
        <Row label="Language" value={langLabel} onEdit={() => { setDraft({ language: p.language }); setModal('locale'); }} />
        <Row label="Units" value={unitLabel} last onEdit={() => { setDraft({ unit_system: p.unit_system }); setModal('units'); }} />
      </Panel>
    </div>
  );

  const cookingBody = (
    <div>
      <SectionHeader title="Cooking skills" subtitle="Rated by area, the way a kitchen would — tunes difficulty and guidance." />
      <Panel>
        <Row label="Overall" value={cooking ? (LEVELS_OVERALL[cooking.overall] ?? cooking.overall) : ''} onEdit={() => { setDraft({ ...(cooking ?? { overall: 'medium', areas: {} }) }); setModal('cooking'); }} />
        {COMPETENCY_AREAS.map((a, i) => (
          <Row key={a.key} label={a.label} value={cooking ? LEVELS[cooking.areas[a.key] ?? 0] : ''} last={i === COMPETENCY_AREAS.length - 1}
            onEdit={() => { setDraft({ ...(cooking ?? { overall: 'medium', areas: {} }) }); setModal('cooking'); }} />
        ))}
      </Panel>
    </div>
  );

  const stub = (title: string, sub: string, note: string) => (
    <div>
      <SectionHeader title={title} subtitle={sub} />
      <div style={{ padding: '16px 18px', border: `1px dashed ${C.border}`, borderRadius: 10, background: C.surface }}>
        <p style={{ color: C.muted, fontSize: 13, margin: 0, lineHeight: 1.55 }}>{note}</p>
      </div>
    </div>
  );

  const accountBody = (
    <div>
      <SectionHeader title="Account" subtitle="Your login and how you sign in." />
      <Panel>
        <Row label="Email" value={email} />
        <Row label="Sign-in methods" value={providers === null ? 'Loading…' : providers.map((pr) => PROVIDER_LABEL[pr] ?? pr).join(', ')} last />
      </Panel>
      <p style={{ color: C.muted, fontSize: 12, marginTop: 16, lineHeight: 1.5 }}>Adding sign-in methods and password changes will live here. For now, use “Forgot password” on the sign-in page.</p>
    </div>
  );

  const healthBody = (
    <div>
      <SectionHeaderWithAll title="Health profile" subtitle="Body, activity and medical considerations — used to tailor nutrition and recommendations." onAll={() => { setDraft({ ...(health ?? {}) }); setModal('health_all'); }} />
      <Panel>
        <Row label="Sex (for nutrition calculations)" value={sexLabel} onEdit={() => { setDraft({ ...(health ?? {}) }); setModal('h_sex'); }} />
        <Row label="Height" value={health?.height_cm ? `${health.height_cm} cm` : ''} onEdit={() => { setDraft({ ...(health ?? {}) }); setModal('h_body'); }} />
        <Row label="Weight" value={health?.weight_kg ? `${health.weight_kg} kg` : ''} onEdit={() => { setDraft({ ...(health ?? {}) }); setModal('h_body'); }} />
        <Row label="BMI" value={bmi != null ? String(bmi) : ''} />
        <Row label="Activity level" value={actLabel} onEdit={() => { setDraft({ ...(health ?? {}) }); setModal('h_activity'); }} />
        <Row label="Allergies" value={health?.allergies?.length ? health.allergies.join(', ') : ''} onEdit={() => { setDraft({ ...(health ?? {}) }); setModal('h_allergies'); }} />
        <Row label="Medical conditions" value={health?.medical_conditions?.length ? health.medical_conditions.join(', ') : ''} last onEdit={() => { setDraft({ ...(health ?? {}) }); setModal('h_conditions'); }} />
      </Panel>
      <p style={{ color: C.muted, fontSize: 12, marginTop: 14, lineHeight: 1.5 }}>Sex is asked only because it changes energy and nutrient calculations — it isn’t shown publicly. Conditions are used to tailor meal planning and aren’t medical advice. Your allergies set here are the single source of truth and appear read-only elsewhere.</p>
    </div>
  );

  const tasteBody = (
    <div>
      <SectionHeaderWithAll title="Taste profile" subtitle="What you love and what you avoid — the more you add, the better recommendations get." onAll={() => { setDraft({ ...(taste ?? {}) }); setModal('taste_all'); }} />
      <Panel>
        <Row label="Cuisines you love" value={taste?.liked_cuisines?.length ? taste.liked_cuisines.join(', ') : ''} onEdit={() => { setDraft({ ...(taste ?? {}) }); setModal('t_cuisines'); }} />
        <Row label="Cuisines you dislike" value={taste?.disliked_cuisines?.length ? taste.disliked_cuisines.join(', ') : ''} onEdit={() => { setDraft({ ...(taste ?? {}) }); setModal('t_cuisines'); }} />
        <Row label="Foods you love" value={taste?.liked_ingredients?.length ? taste.liked_ingredients.join(', ') : ''} onEdit={() => { setDraft({ ...(taste ?? {}) }); setModal('t_ingredients'); }} />
        <Row label="Foods you dislike" value={taste?.disliked_ingredients?.length ? taste.disliked_ingredients.join(', ') : ''} onEdit={() => { setDraft({ ...(taste ?? {}) }); setModal('t_ingredients'); }} />
        <Row label="Taste preferences" value={taste && taste.spice_tolerance != null ? TASTE_AXES.map((a) => `${a.label.split(' ')[0]} ${AXIS_LEVELS[((taste as any)[a.key] ?? 1) - 1]}`).join(' · ') : ''} last onEdit={() => { setDraft({ ...(taste ?? {}) }); setModal('t_axes'); }} />
      </Panel>
      <div style={{ marginTop: 14 }}>
        <div style={{ fontFamily: MONO, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.13em', color: C.muted, marginBottom: 8 }}>Hard exclusions (set elsewhere)</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {(health?.allergies ?? []).map((a) => <span key={`al-${a}`} style={{ background: '#f3e7e7', border: '1px solid #e3cfcf', borderRadius: 6, padding: '3px 8px', fontSize: 12.5 }}>⚠ {a}</span>)}
          {(p.dietary_restrictions ?? []).map((d) => <span key={`dr-${d}`} style={{ background: C.surfaceHover, border: `1px solid ${C.border}`, borderRadius: 6, padding: '3px 8px', fontSize: 12.5 }}>{d}</span>)}
          {!(health?.allergies?.length) && !(p.dietary_restrictions?.length) && <span style={{ color: C.muted, fontSize: 12.5, fontStyle: 'italic' }}>No allergies or dietary restrictions set</span>}
        </div>
        <p style={{ color: C.muted, fontSize: 12, marginTop: 8 }}>Allergies live in your Health profile; dietary restrictions in Personal info. Shown here read-only.</p>
      </div>
    </div>
  );

  const bodies: Record<SectionKey, React.ReactNode> = {
    overview: overviewBody, personal: personalBody, cooking: cookingBody,
    health: healthBody,
    taste: tasteBody,
    eating: stub('Eating habits', 'Which meals you eat, and where.', 'Set up alongside your meal plan — weekday vs weekend patterns and meal context are gathered when you activate planning, then shown here.'),
    account: accountBody,
  };

  return (
    <div style={{ background: C.bg, minHeight: '100vh', fontFamily: SANS, color: C.fg }}>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: isDesktop ? '32px 32px 96px' : '20px 16px 96px' }}>
        <p style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.2em', color: C.muted, marginBottom: 6 }}>My Kitchen</p>
        <h1 style={{ fontFamily: SERIF, fontSize: 30, fontWeight: 300, margin: '0 0 24px' }}>Profile</h1>

        {!isDesktop && (
          <div style={{ display: 'flex', gap: 4, overflowX: 'auto', borderBottom: `1px solid ${C.border}`, marginBottom: 24 }}>
            {SECTIONS.map((s) => {
              const a = section === s.key;
              return <button key={s.key} onClick={() => setSection(s.key)} style={{ flex: '0 0 auto', padding: '8px 12px', border: 'none', cursor: 'pointer', background: 'none', whiteSpace: 'nowrap', fontSize: 14, color: a ? C.accent : C.muted, fontWeight: a ? 600 : 400, borderBottom: `2px solid ${a ? C.accent : 'transparent'}` }}>{s.label}</button>;
            })}
          </div>
        )}

        <div style={{ display: 'flex', gap: 40, alignItems: 'flex-start' }}>
          {isDesktop && (
            <nav style={{ flex: '0 0 184px', position: 'sticky', top: 32 }}>
              {SECTIONS.map((s) => {
                const a = section === s.key;
                return <button key={s.key} onClick={() => setSection(s.key)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', borderRadius: 7, border: 'none', cursor: 'pointer', marginBottom: 2, background: a ? C.surfaceHover : 'transparent', color: a ? C.fg : C.muted, fontWeight: a ? 600 : 400, fontSize: 14, fontFamily: SANS }}>{s.label}</button>;
              })}
            </nav>
          )}
          <div style={{ flex: 1, minWidth: 0, maxWidth: 600 }}>
            {bodies[section]}
            {error && <p style={{ color: '#a32d2d', fontSize: 13, marginTop: 16 }}>{error}</p>}
          </div>
        </div>
      </div>

      {/* ── modals ── */}
      {modal === 'name' && (
        <Modal title="Name" onClose={() => setModal(null)} saving={saving} onSave={() => saveProfile({ display_name: draft.display_name, full_name: draft.full_name })}>
          <div style={{ marginBottom: 16 }}><label style={labelS}>Display name</label><input style={inputS} value={draft.display_name ?? ''} onChange={(e) => setDraft({ ...draft, display_name: e.target.value })} placeholder="What should we call you?" /></div>
          <div><label style={labelS}>Full name</label><input style={inputS} value={draft.full_name ?? ''} onChange={(e) => setDraft({ ...draft, full_name: e.target.value })} placeholder="Your full / legal name (optional)" /></div>
        </Modal>
      )}
      {modal === 'avatar' && (
        <Modal title="Avatar colour" onClose={() => setModal(null)} saving={saving} onSave={() => saveProfile({ avatar_color: draft.avatar_color ?? null })}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
            <Avatar id={p.id} name={p.display_name || p.full_name} colorKey={draft.avatar_color} size={56} />
            <p style={{ color: C.muted, fontSize: 13, margin: 0 }}>Pick a colour for your monogram, or tap the selected one again to go back to the automatic colour.</p>
          </div>
          <AvatarColorPicker value={draft.avatar_color} onChange={(key) => setDraft({ ...draft, avatar_color: key })} />
        </Modal>
      )}
      {modal === 'dob' && (
        <Modal title="Date of birth" onClose={() => setModal(null)} saving={saving} onSave={() => saveProfile({ date_of_birth: draft.dob })}>
          <label style={labelS}>Date of birth</label>
          <BirthdayPicker value={draft.dob} onChange={(v) => setDraft({ ...draft, dob: v })} />
          <p style={{ color: C.muted, fontSize: 12, marginTop: 12 }}>We store your birthday and compute age when needed.</p>
        </Modal>
      )}
      {modal === 'country' && (
        <Modal title="Country" onClose={() => setModal(null)} saving={saving} onSave={() => saveProfile({ country: draft.country || null })}>
          <label style={labelS}>Country</label>
          <select style={inputS} value={draft.country ?? ''} onChange={(e) => setDraft({ ...draft, country: e.target.value })}>
            {COUNTRY_OPTIONS.map((c) => <option key={c} value={c}>{c || 'Select a country'}</option>)}
          </select>
        </Modal>
      )}
      {modal === 'locale' && (
        <Modal title="Language" onClose={() => setModal(null)} saving={saving} onSave={() => saveProfile({ language: draft.language })}>
          <label style={labelS}>Language</label>
          <select style={inputS} value={draft.language ?? 'en'} onChange={(e) => setDraft({ ...draft, language: e.target.value })}>
            {LANGUAGE_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
          </select>
        </Modal>
      )}
      {modal === 'units' && (
        <Modal title="Units" onClose={() => setModal(null)} saving={saving} onSave={() => saveProfile({ unit_system: draft.unit_system })}>
          <label style={labelS}>Units</label>
          <select style={inputS} value={draft.unit_system ?? 'si'} onChange={(e) => setDraft({ ...draft, unit_system: e.target.value })}>
            {UNIT_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
          </select>
        </Modal>
      )}
      {modal === 'cooking' && draft && (
        <Modal title="Cooking skills" onClose={() => setModal(null)} saving={saving} onSave={() => saveCooking(draft)}>
          <div style={{ marginBottom: 18 }}>
            <label style={labelS}>Overall</label>
            <select style={inputS} value={draft.overall} onChange={(e) => setDraft({ ...draft, overall: e.target.value })}>
              {Object.entries(LEVELS_OVERALL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <label style={labelS}>By area</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {COMPETENCY_AREAS.map((a) => (
              <div key={a.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <span style={{ fontSize: 14 }}>{a.label}</span>
                <select style={{ ...inputS, width: 170, flex: '0 0 auto' }} value={draft.areas[a.key] ?? 0} onChange={(e) => setDraft({ ...draft, areas: { ...draft.areas, [a.key]: Number(e.target.value) } })}>
                  {LEVELS.map((l, i) => <option key={i} value={i}>{l}</option>)}
                </select>
              </div>
            ))}
          </div>
        </Modal>
      )}
      {(modal === 'h_sex' || modal === 'health_all') && draft && (
        <Modal title={modal === 'health_all' ? 'Health profile' : 'Sex'} onClose={() => setModal(null)} saving={saving} onSave={() => saveHealth(healthFrom(draft))}>
          {modal === 'health_all' && <SubLabel>Sex (for nutrition calculations)</SubLabel>}
          {modal !== 'health_all' && <label style={labelS}>Sex (for nutrition calculations)</label>}
          <select style={inputS} value={draft.sex_at_birth ?? ''} onChange={(e) => setDraft({ ...draft, sex_at_birth: e.target.value || null })}>
            <option value="">Not set</option>
            {SEX_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
          </select>
          {modal === 'health_all' && <HealthAllRest draft={draft} setDraft={setDraft} />}
        </Modal>
      )}
      {modal === 'h_body' && draft && (
        <Modal title="Height & weight" onClose={() => setModal(null)} saving={saving} onSave={() => saveHealth(healthFrom(draft))}>
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}><label style={labelS}>Height (cm)</label><input type="number" inputMode="decimal" style={inputS} value={draft.height_cm ?? ''} onChange={(e) => setDraft({ ...draft, height_cm: e.target.value === '' ? null : Number(e.target.value) })} placeholder="e.g. 178" /></div>
            <div style={{ flex: 1 }}><label style={labelS}>Weight (kg)</label><input type="number" inputMode="decimal" style={inputS} value={draft.weight_kg ?? ''} onChange={(e) => setDraft({ ...draft, weight_kg: e.target.value === '' ? null : Number(e.target.value) })} placeholder="e.g. 74" /></div>
          </div>
        </Modal>
      )}
      {modal === 'h_activity' && draft && (
        <Modal title="Activity level" onClose={() => setModal(null)} saving={saving} onSave={() => saveHealth(healthFrom(draft))}>
          <label style={labelS}>Activity level</label>
          <select style={inputS} value={draft.activity_level ?? ''} onChange={(e) => setDraft({ ...draft, activity_level: e.target.value || null })}>
            <option value="">Not set</option>
            {ACTIVITY_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
          </select>
        </Modal>
      )}
      {modal === 'h_allergies' && draft && (
        <Modal title="Allergies" onClose={() => setModal(null)} saving={saving} onSave={() => saveHealth(healthFrom(draft))}>
          <label style={labelS}>Allergies</label>
          <TogglePicker options={COMMON_ALLERGENS} values={draft.allergies ?? []} onChange={(v) => setDraft({ ...draft, allergies: v })} otherPlaceholder="Other allergy — Enter to add" />
        </Modal>
      )}
      {modal === 'h_conditions' && draft && (
        <Modal title="Medical conditions" onClose={() => setModal(null)} saving={saving} onSave={() => saveHealth(healthFrom(draft))}>
          <label style={labelS}>Conditions relevant to meal planning</label>
          <TogglePicker options={COMMON_CONDITIONS} values={draft.medical_conditions ?? []} onChange={(v) => setDraft({ ...draft, medical_conditions: v })} otherPlaceholder="Other condition — Enter to add" />
          <p style={{ color: C.muted, fontSize: 12, marginTop: 10 }}>Used to tailor meal planning. This isn’t medical advice.</p>
        </Modal>
      )}

      {(modal === 't_cuisines' || modal === 'taste_all') && draft && (
        <Modal title={modal === 'taste_all' ? 'Taste profile' : 'Cuisines'} onClose={() => setModal(null)} saving={saving} onSave={() => saveTaste(draft)}>
          <div style={{ marginBottom: 16 }}><label style={labelS}>Cuisines you love</label><ChipInput values={draft.liked_cuisines ?? []} onChange={(v) => setDraft({ ...draft, liked_cuisines: v })} placeholder="e.g. Sri Lankan, Sichuan — Enter to add" /></div>
          <div style={{ marginBottom: modal === 'taste_all' ? 16 : 0 }}><label style={labelS}>Cuisines you dislike</label><ChipInput values={draft.disliked_cuisines ?? []} onChange={(v) => setDraft({ ...draft, disliked_cuisines: v })} placeholder="Enter to add" /></div>
          {modal === 'taste_all' && <TasteAllRest draft={draft} setDraft={setDraft} />}
        </Modal>
      )}
      {modal === 't_ingredients' && draft && (
        <Modal title="Foods you love & dislike" onClose={() => setModal(null)} saving={saving} onSave={() => saveTaste(draft)}>
          <div style={{ marginBottom: 16 }}><label style={labelS}>Foods you love</label><ChipInput values={draft.liked_ingredients ?? []} onChange={(v) => setDraft({ ...draft, liked_ingredients: v })} placeholder="e.g. garlic, ramen, mango — Enter to add" /></div>
          <div><label style={labelS}>Foods you dislike</label><ChipInput values={draft.disliked_ingredients ?? []} onChange={(v) => setDraft({ ...draft, disliked_ingredients: v })} placeholder="e.g. cilantro, olives — Enter to add" /></div>
        </Modal>
      )}
      {modal === 't_axes' && draft && (
        <Modal title="Taste preferences" onClose={() => setModal(null)} saving={saving} onSave={() => saveTaste(draft)}>
          <AxisFields draft={draft} setDraft={setDraft} />
        </Modal>
      )}
    </div>
  );
}

function SubLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ ...labelS, marginTop: 4 }}>{children}</div>;
}
function HealthAllRest({ draft, setDraft }: { draft: any; setDraft: (d: any) => void }) {
  return (
    <>
      <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
        <div style={{ flex: 1 }}><label style={labelS}>Height (cm)</label><input type="number" inputMode="decimal" style={inputS} value={draft.height_cm ?? ''} onChange={(e) => setDraft({ ...draft, height_cm: e.target.value === '' ? null : Number(e.target.value) })} placeholder="e.g. 178" /></div>
        <div style={{ flex: 1 }}><label style={labelS}>Weight (kg)</label><input type="number" inputMode="decimal" style={inputS} value={draft.weight_kg ?? ''} onChange={(e) => setDraft({ ...draft, weight_kg: e.target.value === '' ? null : Number(e.target.value) })} placeholder="e.g. 74" /></div>
      </div>
      <div style={{ marginTop: 16 }}><label style={labelS}>Activity level</label>
        <select style={inputS} value={draft.activity_level ?? ''} onChange={(e) => setDraft({ ...draft, activity_level: e.target.value || null })}>
          <option value="">Not set</option>{ACTIVITY_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
        </select>
      </div>
      <div style={{ marginTop: 16 }}><label style={labelS}>Allergies</label><TogglePicker options={COMMON_ALLERGENS} values={draft.allergies ?? []} onChange={(v) => setDraft({ ...draft, allergies: v })} otherPlaceholder="Other allergy — Enter to add" /></div>
      <div style={{ marginTop: 16 }}><label style={labelS}>Medical conditions</label><TogglePicker options={COMMON_CONDITIONS} values={draft.medical_conditions ?? []} onChange={(v) => setDraft({ ...draft, medical_conditions: v })} otherPlaceholder="Other condition — Enter to add" /></div>
    </>
  );
}
function TasteAllRest({ draft, setDraft }: { draft: any; setDraft: (d: any) => void }) {
  return (
    <>
      <div style={{ marginBottom: 16 }}><label style={labelS}>Foods you love</label><ChipInput values={draft.liked_ingredients ?? []} onChange={(v) => setDraft({ ...draft, liked_ingredients: v })} placeholder="e.g. garlic, ramen, mango — Enter to add" /></div>
      <div style={{ marginBottom: 16 }}><label style={labelS}>Foods you dislike</label><ChipInput values={draft.disliked_ingredients ?? []} onChange={(v) => setDraft({ ...draft, disliked_ingredients: v })} placeholder="e.g. cilantro, olives — Enter to add" /></div>
      <AxisFields draft={draft} setDraft={setDraft} />
    </>
  );
}
function AxisFields({ draft, setDraft }: { draft: any; setDraft: (d: any) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {TASTE_AXES.map((a) => (
        <div key={a.key}>
          <div style={{ fontSize: 13, marginBottom: 6 }}>{a.label}</div>
          <Scale4 value={draft[a.key] ?? null} onChange={(v) => setDraft({ ...draft, [a.key]: v })} />
        </div>
      ))}
    </div>
  );
}

const LEVELS_OVERALL: Record<string, string> = {
  trivial: 'Just starting out', easy: 'Beginner', medium: 'Comfortable', hard: 'Confident', expert: 'Expert',
};

function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <h2 style={{ fontFamily: SERIF, fontSize: 21, fontWeight: 400, margin: '0 0 4px' }}>{title}</h2>
      <p style={{ color: C.muted, fontSize: 13, margin: 0, lineHeight: 1.5 }}>{subtitle}</p>
    </div>
  );
}

function SectionHeaderWithAll({ title, subtitle, onAll }: { title: string; subtitle: string; onAll: () => void }) {
  return (
    <div style={{ marginBottom: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
      <div>
        <h2 style={{ fontFamily: SERIF, fontSize: 21, fontWeight: 400, margin: '0 0 4px' }}>{title}</h2>
        <p style={{ color: C.muted, fontSize: 13, margin: 0, lineHeight: 1.5 }}>{subtitle}</p>
      </div>
      <button onClick={onAll} style={{ flex: '0 0 auto', background: 'none', border: `1px solid ${C.border}`, borderRadius: 7, padding: '6px 12px', fontSize: 13, color: C.fg, cursor: 'pointer', whiteSpace: 'nowrap' }}>Edit all</button>
    </div>
  );
}

function healthFrom(draft: any): Health {
  return {
    height_cm: draft.height_cm ?? null, weight_kg: draft.weight_kg ?? null,
    sex_at_birth: draft.sex_at_birth ?? null, activity_level: draft.activity_level ?? null,
    allergies: draft.allergies ?? [], medical_conditions: draft.medical_conditions ?? [],
  };
}
