// src/app/my/profile/page.tsx
// "My Profile" — view + simple edit form for the logged-in user's profile.
// Matches Soupdog design system. Saves via PUT /api/my/profile (upsert).

'use client';

import { useEffect, useState } from 'react';

type Profile = {
  id: string;
  display_name: string;
  unit_system: string;
  language: string;
  skill_level: string;
  allergies: string[];
  dietary_restrictions: string[];
  preferred_cuisines: string[];
  date_of_birth: string | null;   // 'YYYY-MM-DD', stored on person (design 3.1)
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

// Supported locales — design 3.1: language must be a dropdown, not free text.
const LANGUAGE_OPTIONS = [
  { v: 'en', label: 'English' },
  { v: 'sv', label: 'Svenska' },
  { v: 'zh', label: '中文' },
  { v: 'ar', label: 'العربية' },
  { v: 'fr', label: 'Français' },
];

// Editable chip/tag input for array fields
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
      <label style={{ display: 'block', fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.15em', color: C.muted, marginBottom: 8 }}>{label}</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
        {values.map((v) => (
          <span key={v} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: C.surfaceHover, border: `1px solid ${C.border}`, borderRadius: 6, padding: '4px 8px', fontSize: 13 }}>
            {v}
            <button onClick={() => onChange(values.filter((x) => x !== v))}
              style={{ border: 'none', background: 'none', cursor: 'pointer', color: C.muted, fontSize: 14, lineHeight: 1, padding: 0 }} aria-label={`Remove ${v}`}>×</button>
          </span>
        ))}
      </div>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
        onBlur={add}
        placeholder={placeholder}
        style={{ width: '100%', maxWidth: 360, padding: '8px 10px', border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 14, background: C.surface, color: C.fg }}
      />
    </div>
  );
}

export default function ProfilePage() {
  const [p, setP] = useState<Profile | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const inputStyle = { width: '100%', maxWidth: 360, padding: '8px 10px', border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 14, background: C.surface, color: C.fg } as const;
  const labelStyle = { display: 'block', fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.15em', color: C.muted, marginBottom: 8 } as const;

  return (
    <div style={{ background: C.bg, minHeight: '100vh', padding: 32, fontFamily: 'IBM Plex Sans, system-ui, sans-serif', color: C.fg }}>
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <p style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.2em', color: C.muted, marginBottom: 6 }}>My Kitchen</p>
        <h1 style={{ fontFamily: 'IBM Plex Serif, serif', fontSize: 30, fontWeight: 300, color: C.fg, margin: '0 0 4px' }}>Profile</h1>
        {email && <p style={{ color: C.muted, fontSize: 13, marginTop: 0, marginBottom: 28 }}>{email}</p>}

        <div style={{ marginBottom: 22 }}>
          <label style={labelStyle}>Display name</label>
          <input style={inputStyle} value={p.display_name ?? ''} onChange={(e) => field('display_name', e.target.value)} placeholder="What should we call you?" />
        </div>

        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 22 }}>
          <div>
            <label style={labelStyle}>Units</label>
            <select style={{ ...inputStyle, maxWidth: 220 }} value={p.unit_system} onChange={(e) => field('unit_system', e.target.value)}>
              {UNIT_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Cooking skill</label>
            <select style={{ ...inputStyle, maxWidth: 220 }} value={p.skill_level} onChange={(e) => field('skill_level', e.target.value)}>
              {SKILL_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 22 }}>
          <div>
            <label style={labelStyle}>Language</label>
            <select style={{ ...inputStyle, maxWidth: 220 }} value={p.language ?? 'en'} onChange={(e) => field('language', e.target.value)}>
              {LANGUAGE_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Date of birth</label>
            <input type="date" style={{ ...inputStyle, maxWidth: 220 }} value={p.date_of_birth ?? ''} onChange={(e) => field('date_of_birth', e.target.value)} />
          </div>
        </div>

        <ChipInput label="Allergies" values={p.allergies ?? []} onChange={(v) => field('allergies', v)} placeholder="Type an allergy, press Enter" />
        <ChipInput label="Dietary restrictions" values={p.dietary_restrictions ?? []} onChange={(v) => field('dietary_restrictions', v)} placeholder="e.g. vegetarian, halal — Enter to add" />
        <ChipInput label="Preferred cuisines" values={p.preferred_cuisines ?? []} onChange={(v) => field('preferred_cuisines', v)} placeholder="e.g. Sri Lankan, Italian — Enter to add" />

        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 28, borderTop: `1px solid ${C.border}`, paddingTop: 20 }}>
          <button onClick={save} disabled={saving}
            style={{ background: C.accent, color: '#fff', border: 'none', borderRadius: 7, padding: '10px 20px', fontSize: 14, fontWeight: 500, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Saving…' : 'Save profile'}
          </button>
          {saved && <span style={{ color: C.accent, fontSize: 13 }}>Saved ✓</span>}
          {error && <span style={{ color: '#a32d2d', fontSize: 13 }}>{error}</span>}
        </div>
      </div>
    </div>
  );
}
