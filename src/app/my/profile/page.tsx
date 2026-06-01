// src/app/my/profile/page.tsx
// Phase 1 — Sectioned profile shell.
// Left-rail section nav on desktop (md+); horizontal scrollable tab strip on mobile.
// Sections: Account · Basic · Cooking · Nutrition (stub) · Taste (stub).
// Basic writes display_name + full_name + date_of_birth to `person` (via the
// profile API which syncs), and units/language/skill/arrays to user_profiles.
// Birthday uses a day/month/year picker (no native calendar — easier for DOB).

'use client';

import { useEffect, useMemo, useState } from 'react';

type Profile = {
  id: string;
  display_name: string;
  full_name: string | null;
  unit_system: string;
  language: string;
  skill_level: string;
  allergies: string[];
  dietary_restrictions: string[];
  preferred_cuisines: string[];
  date_of_birth: string | null; // 'YYYY-MM-DD'
};

const C = {
  bg: '#f7f6f2', fg: '#1a1a1a', accent: '#2e4638', muted: '#6b6860',
  border: '#dad7d1', surface: '#fffefb', surfaceHover: '#efede7',
};

const UNIT_OPTIONS = [
  { v: 'si', label: 'Metric / SI (g, ml, °C)' },
  { v: 'imperial', label: 'Imperial (oz, lb, °F)' },
  { v: 'us', label: 'US customary (cups, °F)' },
];
const SKILL_OPTIONS = [
  { v: 'trivial', label: 'Just starting out' },
  { v: 'easy', label: 'Beginner' },
  { v: 'medium', label: 'Comfortable' },
  { v: 'hard', label: 'Confident' },
  { v: 'expert', label: 'Expert' },
];
const LANGUAGE_OPTIONS = [
  { v: 'en', label: 'English' },
  { v: 'sv', label: 'Svenska' },
  { v: 'zh', label: '中文' },
  { v: 'ar', label: 'العربية' },
  { v: 'fr', label: 'Français' },
];

const SECTIONS = [
  { key: 'account', label: 'Account' },
  { key: 'basic', label: 'Basic' },
  { key: 'cooking', label: 'Cooking' },
  { key: 'nutrition', label: 'Nutrition' },
  { key: 'taste', label: 'Taste' },
] as const;
type SectionKey = typeof SECTIONS[number]['key'];

// ── small responsive hook ────────────────────────────────────────────────
function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return isDesktop;
}

const labelStyle = { display: 'block', fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.15em', color: C.muted, marginBottom: 8 } as const;
const inputStyle = { width: '100%', maxWidth: 360, padding: '8px 10px', border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 14, background: C.surface, color: C.fg } as const;

// ── chip input ─────────────────────────────────────────────────────────────
function ChipInput({ label, values, onChange, placeholder }: {
  label: string; values: string[]; onChange: (v: string[]) => void; placeholder: string;
}) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const v = draft.trim();
    if (v && !values.includes(v)) onChange([...values, v]);
    setDraft('');
  };
  return (
    <div style={{ marginBottom: 22 }}>
      <label style={labelStyle}>{label}</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
        {values.map((v) => (
          <span key={v} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: C.surfaceHover, border: `1px solid ${C.border}`, borderRadius: 6, padding: '4px 8px', fontSize: 13 }}>
            {v}
            <button onClick={() => onChange(values.filter((x) => x !== v))}
              style={{ border: 'none', background: 'none', cursor: 'pointer', color: C.muted, fontSize: 14, lineHeight: 1, padding: 0 }} aria-label={`Remove ${v}`}>×</button>
          </span>
        ))}
      </div>
      <input value={draft} onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
        onBlur={add} placeholder={placeholder} style={inputStyle} />
    </div>
  );
}

// ── day / month / year birthday picker ──────────────────────────────────────
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
function parseDOB(s: string | null): { y: string; m: string; d: string } {
  if (!s) return { y: '', m: '', d: '' };
  const [y, m, d] = s.split('-');
  return { y: y ?? '', m: m ? String(Number(m)) : '', d: d ? String(Number(d)) : '' };
}
function BirthdayPicker({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const { y, m, d } = parseDOB(value);
  const thisYear = new Date().getFullYear();
  const years = useMemo(() => Array.from({ length: 120 }, (_, i) => thisYear - i), [thisYear]); // newest first
  const daysInMonth = (yy: number, mm: number) => new Date(yy, mm, 0).getDate();
  const maxDay = (m && y) ? daysInMonth(Number(y), Number(m)) : 31;
  const days = Array.from({ length: maxDay }, (_, i) => i + 1);

  const emit = (ny: string, nm: string, nd: string) => {
    if (ny && nm && nd) {
      const cap = Math.min(Number(nd), daysInMonth(Number(ny), Number(nm)));
      onChange(`${ny}-${String(Number(nm)).padStart(2, '0')}-${String(cap).padStart(2, '0')}`);
    } else {
      onChange(null);
    }
  };

  const sel = { ...inputStyle, maxWidth: 'unset', flex: 1, minWidth: 0 } as const;
  return (
    <div>
      <label style={labelStyle}>Date of birth</label>
      <div style={{ display: 'flex', gap: 8, maxWidth: 360 }}>
        <select aria-label="Day" value={d} onChange={(e) => emit(y, m, e.target.value)} style={{ ...sel, flexBasis: 70 }}>
          <option value="">Day</option>
          {days.map((dd) => <option key={dd} value={dd}>{dd}</option>)}
        </select>
        <select aria-label="Month" value={m} onChange={(e) => emit(y, e.target.value, d)} style={{ ...sel, flexBasis: 130 }}>
          <option value="">Month</option>
          {MONTHS.map((mm, i) => <option key={mm} value={i + 1}>{mm}</option>)}
        </select>
        <select aria-label="Year" value={y} onChange={(e) => emit(e.target.value, m, d)} style={{ ...sel, flexBasis: 90 }}>
          <option value="">Year</option>
          {years.map((yy) => <option key={yy} value={yy}>{yy}</option>)}
        </select>
      </div>
    </div>
  );
}

// ── provider identities (Account section) ───────────────────────────────────
function useIdentities() {
  const [providers, setProviders] = useState<string[] | null>(null);
  useEffect(() => {
    (async () => {
      try {
        const { createClient } = await import('@/lib/supabase/client');
        const supabase = createClient();
        const { data } = await supabase.auth.getUserIdentities();
        const list = (data?.identities ?? []).map((i: any) => i.provider);
        setProviders(list.length ? list : ['email']);
      } catch {
        setProviders([]);
      }
    })();
  }, []);
  return providers;
}

const PROVIDER_LABEL: Record<string, string> = {
  email: 'Email & password', google: 'Google', azure: 'Microsoft', apple: 'Apple',
};

export default function ProfilePage() {
  const [p, setP] = useState<Profile | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [section, setSection] = useState<SectionKey>('basic');
  const isDesktop = useIsDesktop();
  const providers = useIdentities();

  useEffect(() => {
    fetch('/api/my/profile')
      .then((r) => (r.ok ? r.json() : r.json().then((e) => Promise.reject(e.error))))
      .then((d) => { setP(d.profile); setEmail(d.email); })
      .catch((e) => setError(typeof e === 'string' ? e : 'Failed to load profile'));
  }, []);

  const save = async () => {
    if (!p) return;
    setSaving(true); setSaved(false); setError(null);
    try {
      const res = await fetch('/api/my/profile', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Save failed');
      if (data.warning) { setError(data.warning); }
      else { setSaved(true); setTimeout(() => setSaved(false), 2500); }
    } catch (e: any) {
      setError(e.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const field = (k: keyof Profile, v: any) => setP((prev) => prev ? { ...prev, [k]: v } : prev);

  if (error && !p) return <div style={{ padding: 32, fontFamily: 'IBM Plex Sans, sans-serif', color: C.fg }}>Could not load profile: {error}</div>;
  if (!p) return <div style={{ padding: 32, color: C.muted }}>Loading profile…</div>;

  // ── section bodies ──
  const accountBody = (
    <div>
      <SectionHeader title="Account" subtitle="Your login and how you sign in." />
      <div style={{ marginBottom: 22 }}>
        <label style={labelStyle}>Email</label>
        <div style={{ ...inputStyle, background: C.surfaceHover, color: C.muted }}>{email ?? '—'}</div>
      </div>
      <div style={{ marginBottom: 22 }}>
        <label style={labelStyle}>Sign-in methods</label>
        {providers === null ? (
          <p style={{ color: C.muted, fontSize: 13 }}>Loading…</p>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {providers.map((pr) => (
              <span key={pr} style={{ background: C.surfaceHover, border: `1px solid ${C.border}`, borderRadius: 6, padding: '6px 10px', fontSize: 13 }}>
                {PROVIDER_LABEL[pr] ?? pr}
              </span>
            ))}
          </div>
        )}
      </div>
      <p style={{ color: C.muted, fontSize: 12, maxWidth: 420, lineHeight: 1.5 }}>
        Managing additional sign-in methods and password changes will live here. For now, use “Forgot password” on the sign-in page to reset.
      </p>
    </div>
  );

  const basicBody = (
    <div>
      <SectionHeader title="Basic" subtitle="Who you are and how Soupdog talks to you." />
      <div style={{ marginBottom: 22 }}>
        <label style={labelStyle}>Display name</label>
        <input style={inputStyle} value={p.display_name ?? ''} onChange={(e) => field('display_name', e.target.value)} placeholder="What should we call you?" />
      </div>
      <div style={{ marginBottom: 22 }}>
        <label style={labelStyle}>Full name</label>
        <input style={inputStyle} value={p.full_name ?? ''} onChange={(e) => field('full_name', e.target.value)} placeholder="Your full / legal name (optional)" />
      </div>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 22 }}>
        <div>
          <label style={labelStyle}>Units</label>
          <select style={{ ...inputStyle, maxWidth: 220 }} value={p.unit_system} onChange={(e) => field('unit_system', e.target.value)}>
            {UNIT_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Language</label>
          <select style={{ ...inputStyle, maxWidth: 220 }} value={p.language ?? 'en'} onChange={(e) => field('language', e.target.value)}>
            {LANGUAGE_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
          </select>
        </div>
      </div>
      <div style={{ marginBottom: 4 }}>
        <BirthdayPicker value={p.date_of_birth} onChange={(v) => field('date_of_birth', v)} />
      </div>
    </div>
  );

  const cookingBody = (
    <div>
      <SectionHeader title="Cooking" subtitle="How confident you are in the kitchen — tunes difficulty and guidance." />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 360 }}>
        {SKILL_OPTIONS.map((o) => {
          const active = p.skill_level === o.v;
          return (
            <button key={o.v} onClick={() => field('skill_level', o.v)}
              style={{ textAlign: 'left', padding: '12px 14px', borderRadius: 8, cursor: 'pointer',
                border: `1px solid ${active ? C.accent : C.border}`,
                background: active ? C.accent : C.surface,
                color: active ? '#fff' : C.fg, fontSize: 14 }}>
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );

  const nutritionBody = (
    <div>
      <SectionHeader title="Nutrition" subtitle="Goals, demographics, allergies and dietary needs." />
      <ChipInput label="Allergies" values={p.allergies ?? []} onChange={(v) => field('allergies', v)} placeholder="Type an allergy, press Enter" />
      <ChipInput label="Dietary restrictions" values={p.dietary_restrictions ?? []} onChange={(v) => field('dietary_restrictions', v)} placeholder="e.g. vegetarian, halal — Enter to add" />
      <StubNote text="Calorie & macro goals, demographics and medical considerations move here next, computed from your date of birth rather than a stored age." />
    </div>
  );

  const tasteBody = (
    <div>
      <SectionHeader title="Taste" subtitle="What you like to eat." />
      <ChipInput label="Preferred cuisines" values={p.preferred_cuisines ?? []} onChange={(v) => field('preferred_cuisines', v)} placeholder="e.g. Sri Lankan, Italian — Enter to add" />
      <StubNote text="A guided taste profile (spice, sweetness, textures, liked & disliked ingredients) is coming — for now, add the cuisines you reach for most." />
    </div>
  );

  const bodies: Record<SectionKey, React.ReactNode> = {
    account: accountBody, basic: basicBody, cooking: cookingBody,
    nutrition: nutritionBody, taste: tasteBody,
  };

  // ── nav ──
  const railItem = (s: typeof SECTIONS[number]) => {
    const active = section === s.key;
    return (
      <button key={s.key} onClick={() => setSection(s.key)}
        style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', borderRadius: 7,
          border: 'none', cursor: 'pointer', marginBottom: 2,
          background: active ? C.surfaceHover : 'transparent',
          color: active ? C.fg : C.muted,
          fontWeight: active ? 600 : 400, fontSize: 14,
          fontFamily: 'IBM Plex Sans, sans-serif' }}>
        {s.label}
      </button>
    );
  };
  const tabItem = (s: typeof SECTIONS[number]) => {
    const active = section === s.key;
    return (
      <button key={s.key} onClick={() => setSection(s.key)}
        style={{ flex: '0 0 auto', padding: '8px 14px', border: 'none', cursor: 'pointer',
          background: 'transparent', whiteSpace: 'nowrap', fontSize: 14,
          color: active ? C.accent : C.muted, fontWeight: active ? 600 : 400,
          borderBottom: `2px solid ${active ? C.accent : 'transparent'}` }}>
        {s.label}
      </button>
    );
  };

  return (
    <div style={{ background: C.bg, minHeight: '100vh', fontFamily: 'IBM Plex Sans, system-ui, sans-serif', color: C.fg }}>
      <div style={{ maxWidth: 880, margin: '0 auto', padding: isDesktop ? '32px 32px 96px' : '20px 16px 96px' }}>
        <p style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.2em', color: C.muted, marginBottom: 6 }}>My Kitchen</p>
        <h1 style={{ fontFamily: 'IBM Plex Serif, serif', fontSize: 30, fontWeight: 300, margin: '0 0 24px' }}>Profile</h1>

        {/* Mobile: horizontal tab strip */}
        {!isDesktop && (
          <div style={{ display: 'flex', gap: 4, overflowX: 'auto', borderBottom: `1px solid ${C.border}`, marginBottom: 24, WebkitOverflowScrolling: 'touch' }}>
            {SECTIONS.map(tabItem)}
          </div>
        )}

        <div style={{ display: 'flex', gap: 40, alignItems: 'flex-start' }}>
          {/* Desktop: left rail */}
          {isDesktop && (
            <nav style={{ flex: '0 0 180px', position: 'sticky', top: 32 }}>
              {SECTIONS.map(railItem)}
            </nav>
          )}

          <div style={{ flex: 1, minWidth: 0, maxWidth: 560 }}>
            {bodies[section]}

            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 28, borderTop: `1px solid ${C.border}`, paddingTop: 20, flexWrap: 'wrap' }}>
              <button onClick={save} disabled={saving}
                style={{ background: C.accent, color: '#fff', border: 'none', borderRadius: 7, padding: '10px 20px', fontSize: 14, fontWeight: 500, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Saving…' : 'Save profile'}
              </button>
              {saved && <span style={{ color: C.accent, fontSize: 13 }}>Saved ✓</span>}
              {error && <span style={{ color: '#a32d2d', fontSize: 13 }}>{error}</span>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <h2 style={{ fontFamily: 'IBM Plex Serif, serif', fontSize: 20, fontWeight: 400, margin: '0 0 4px' }}>{title}</h2>
      <p style={{ color: C.muted, fontSize: 13, margin: 0, lineHeight: 1.5 }}>{subtitle}</p>
    </div>
  );
}

function StubNote({ text }: { text: string }) {
  return (
    <div style={{ marginTop: 18, padding: '12px 14px', border: `1px dashed ${C.border}`, borderRadius: 8, background: C.surface }}>
      <p style={{ color: C.muted, fontSize: 12.5, margin: 0, lineHeight: 1.55 }}>{text}</p>
    </div>
  );
}
