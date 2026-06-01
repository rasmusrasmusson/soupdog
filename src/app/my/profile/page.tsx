// src/app/my/profile/page.tsx
// Phase 2 / Build A — Overview + summary-panel profile.
// Left rail (desktop) / top tab strip (mobile). Each section is a summary panel
// of rows showing value-or-empty; editing opens a modal. Overview is a grid of
// section summary cards.
//
// Live in Build A: Overview, Personal info, Cooking skills, Account.
// Stubbed (filled in Build B): Health profile, Taste profile, Eating habits.

'use client';

import { useEffect, useMemo, useState } from 'react';

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

// ── summary row ──
function Row({ label, value, onEdit }: { label: string; value: React.ReactNode; onEdit?: () => void }) {
  const empty = value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0);
  return (
    <button onClick={onEdit} disabled={!onEdit}
      style={{ display: 'flex', width: '100%', textAlign: 'left', gap: 16, alignItems: 'center', justifyContent: 'space-between', padding: '14px 4px', borderBottom: `1px solid ${C.border}`, background: 'none', border: 'none', borderTop: 'none', borderLeft: 'none', borderRight: 'none', cursor: onEdit ? 'pointer' : 'default' }}>
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

// ── day/month/year birthday picker ──
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
function BirthdayPicker({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const [y, m, d] = value ? value.split('-') : ['', '', ''];
  const yy = y, mm = m ? String(Number(m)) : '', dd = d ? String(Number(d)) : '';
  const thisYear = new Date().getFullYear();
  const years = useMemo(() => Array.from({ length: 120 }, (_, i) => thisYear - i), [thisYear]);
  const dim = (a: number, b: number) => new Date(a, b, 0).getDate();
  const maxDay = (mm && yy) ? dim(Number(yy), Number(mm)) : 31;
  const emit = (ny: string, nm: string, nd: string) => {
    if (ny && nm && nd) { const cap = Math.min(Number(nd), dim(Number(ny), Number(nm))); onChange(`${ny}-${String(Number(nm)).padStart(2,'0')}-${String(cap).padStart(2,'0')}`); }
    else onChange(null);
  };
  const sel = { ...inputS, minWidth: 0 } as const;
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <select aria-label="Day" value={dd} onChange={(e) => emit(yy, mm, e.target.value)} style={{ ...sel, flex: '0 0 72px' }}>
        <option value="">Day</option>{Array.from({ length: maxDay }, (_, i) => i + 1).map((x) => <option key={x} value={x}>{x}</option>)}
      </select>
      <select aria-label="Month" value={mm} onChange={(e) => emit(yy, e.target.value, dd)} style={{ ...sel, flex: 1 }}>
        <option value="">Month</option>{MONTHS.map((x, i) => <option key={x} value={i + 1}>{x}</option>)}
      </select>
      <select aria-label="Year" value={yy} onChange={(e) => emit(e.target.value, mm, dd)} style={{ ...sel, flex: '0 0 92px' }}>
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
  const providers = useIdentities();

  // modal state
  const [modal, setModal] = useState<null | 'name' | 'dob' | 'locale' | 'units' | 'country' | 'cooking'>(null);
  const [draft, setDraft] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/my/profile').then((r) => r.json()).then((d) => { setP({ country: null, ...d.profile }); setEmail(d.email); }).catch(() => setError('Failed to load profile'));
    fetch('/api/my/cooking').then((r) => r.json()).then(setCooking).catch(() => {});
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

  if (error && !p) return <div style={{ padding: 32, fontFamily: SANS, color: C.fg }}>Could not load profile: {error}</div>;
  if (!p) return <div style={{ padding: 32, color: C.muted, fontFamily: SANS }}>Loading profile…</div>;

  const age = ageFromDOB(p.date_of_birth);
  const langLabel = LANGUAGE_OPTIONS.find((o) => o.v === p.language)?.label ?? p.language;
  const unitLabel = UNIT_OPTIONS.find((o) => o.v === p.unit_system)?.label ?? p.unit_system;
  const filledAreas = cooking ? Object.values(cooking.areas).filter((v) => v > 0).length : 0;

  // section completeness for Overview cards
  const cards: { key: SectionKey; title: string; summary: string; done: boolean }[] = [
    { key: 'personal', title: 'Personal info', summary: p.display_name ? `${p.display_name}${age != null ? ` · ${age}` : ''}` : 'Add your name & details', done: !!p.display_name },
    { key: 'cooking', title: 'Cooking skills', summary: filledAreas ? `${filledAreas} areas rated` : 'Rate your kitchen skills', done: filledAreas > 0 },
    { key: 'health', title: 'Health profile', summary: 'Body, activity, allergies', done: false },
    { key: 'taste', title: 'Taste profile', summary: 'What you love & avoid', done: (p.preferred_cuisines?.length ?? 0) > 0 },
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
      <Row label="Display name" value={p.display_name} onEdit={() => { setDraft({ display_name: p.display_name, full_name: p.full_name ?? '' }); setModal('name'); }} />
      <Row label="Full name" value={p.full_name} onEdit={() => { setDraft({ display_name: p.display_name, full_name: p.full_name ?? '' }); setModal('name'); }} />
      <Row label="Date of birth" value={p.date_of_birth ? `${p.date_of_birth}${age != null ? `  ·  ${age} yrs` : ''}` : ''} onEdit={() => { setDraft({ dob: p.date_of_birth }); setModal('dob'); }} />
      <Row label="Country" value={p.country} onEdit={() => { setDraft({ country: p.country ?? '' }); setModal('country'); }} />
      <Row label="Language" value={langLabel} onEdit={() => { setDraft({ language: p.language }); setModal('locale'); }} />
      <Row label="Units" value={unitLabel} onEdit={() => { setDraft({ unit_system: p.unit_system }); setModal('units'); }} />
    </div>
  );

  const cookingBody = (
    <div>
      <SectionHeader title="Cooking skills" subtitle="Rated by area, the way a kitchen would — tunes difficulty and guidance." />
      <Row label="Overall" value={cooking ? (LEVELS_OVERALL[cooking.overall] ?? cooking.overall) : ''} onEdit={() => { setDraft({ ...(cooking ?? { overall: 'medium', areas: {} }) }); setModal('cooking'); }} />
      {COMPETENCY_AREAS.map((a) => (
        <Row key={a.key} label={a.label} value={cooking ? LEVELS[cooking.areas[a.key] ?? 0] : ''}
          onEdit={() => { setDraft({ ...(cooking ?? { overall: 'medium', areas: {} }) }); setModal('cooking'); }} />
      ))}
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
      <Row label="Email" value={email} />
      <Row label="Sign-in methods" value={providers === null ? 'Loading…' : providers.map((pr) => PROVIDER_LABEL[pr] ?? pr).join(', ')} />
      <p style={{ color: C.muted, fontSize: 12, marginTop: 16, lineHeight: 1.5 }}>Adding sign-in methods and password changes will live here. For now, use “Forgot password” on the sign-in page.</p>
    </div>
  );

  const bodies: Record<SectionKey, React.ReactNode> = {
    overview: overviewBody, personal: personalBody, cooking: cookingBody,
    health: stub('Health profile', 'Body, activity, conditions and allergies.', 'Coming in the next update: height & weight (with BMI), activity level, medical considerations, and your allergies — kept here as the single source of truth.'),
    taste: stub('Taste profile', 'What you love, what you avoid.', 'Coming next: foods you love, foods you won’t eat, ethical & religious choices, and a quick taste wizard (spice, sweetness, textures). Allergies will show here read-only from your Health profile.'),
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
