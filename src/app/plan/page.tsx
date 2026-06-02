'use client';

// src/app/plan/page.tsx
// Meal plan home (built at /plan first; flip to home once happy).
// Three states: no-plan (activation offer) / activating (setup) / active (menu).
// Step 2a: display + states. Actions (manage participants, swap) come in 2b.

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';

type Participant = { id: string; status: string; personId: string; name: string; avatarColor: string | null };
type Meal = {
  id: string; date: string; slot: string; source: string;
  dishName: string; recipeId: string | null; recipeSlug: string | null;
  note: string | null; participants: Participant[];
};
type Prefs = { personId: string; planActive: boolean; activeSlots: string[]; horizonDays: number };

const ACCENT = 'var(--accent)';
const SERIF = "var(--font-serif, Georgia, serif)";
const MONO = "var(--font-mono, monospace)";
const B = '1px solid var(--border)';

const SLOT_ORDER = ['breakfast', 'lunch', 'dinner', 'snack'];
const SLOT_LABEL: Record<string, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' };

// Palette keys → hex (mirrors the Avatar component's intent; kept local to avoid
// a hard dependency. avatar_color stores a key; fall back to a deterministic pick.)
const PALETTE: Record<string, string> = {
  olive: '#5a6b52', sage: '#7d8c6a', clay: '#a8634a', slate: '#5c6b72',
  plum: '#6d5168', teal: '#3f6b63', ochre: '#9c7a3c', rose: '#9c5f6b',
};
const PALETTE_KEYS = Object.keys(PALETTE);
function colorFor(p: Participant): string {
  if (p.avatarColor && PALETTE[p.avatarColor]) return PALETTE[p.avatarColor];
  let h = 0; for (const c of p.personId) h = (h * 31 + c.charCodeAt(0)) | 0;
  return PALETTE[PALETTE_KEYS[Math.abs(h) % PALETTE_KEYS.length]];
}
function monogram(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
}

function ymd(d: Date): string { return d.toISOString().slice(0, 10); }
function prettyDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
}
function isToday(iso: string): boolean { return iso === ymd(new Date()); }

export default function PlanPage() {
  const { user, loading: authLoading } = useAuth();
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'day' | 'week'>('day');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const p: Prefs = await fetch('/api/my/meal-plan/prefs').then(r => r.json());
    setPrefs(p);
    if (p.planActive) {
      const data = await fetch('/api/my/meal-plan').then(r => r.json());
      setMeals(data.meals ?? []);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { setLoading(false); return; }
    load().catch(() => setError('Could not load your plan')).finally(() => setLoading(false));
  }, [user, authLoading, load]);

  // Activation: set prefs active, then generate the first horizon.
  async function activate(slots: string[]) {
    setBusy(true); setError(null);
    try {
      await fetch('/api/my/meal-plan/prefs', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planActive: true, activeSlots: slots, horizonDays: 5 }),
      });
      await fetch('/api/my/meal-plan/generate', { method: 'POST' });
      await load();
    } catch {
      setError('Something went wrong setting up your plan.');
    } finally {
      setBusy(false);
    }
  }

  if (authLoading || loading) {
    return <div style={{ padding: '48px 32px', fontFamily: MONO, fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.15em' }}>Loading…</div>;
  }
  if (!user) {
    return <div style={{ padding: '48px 32px', color: 'var(--muted)' }}>Please sign in to see your plan.</div>;
  }

  // ── State: no plan yet → activation offer ──
  if (!prefs?.planActive) {
    return <NoPlan onActivate={activate} busy={busy} error={error} />;
  }

  // ── State: active → the menu ──
  const today = ymd(new Date());
  const activeSlots = (prefs.activeSlots ?? ['dinner']);

  const mealsByDate: Record<string, Meal[]> = {};
  for (const m of meals) (mealsByDate[m.date] ??= []).push(m);

  const sortSlots = (a: Meal, b: Meal) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot);

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: '40px 32px 80px' }}>

      {/* header: date + view toggle */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--muted)' }}>
          {prettyDate(today)}
        </div>
        <div style={{ display: 'inline-flex', border: B, borderRadius: 7, overflow: 'hidden' }}>
          <button onClick={() => setView('day')} style={toggleStyle(view === 'day')}>Day</button>
          <button onClick={() => setView('week')} style={toggleStyle(view === 'week')}>Week</button>
        </div>
      </div>

      {view === 'day' ? (
        <DayView
          dateLabel="Today"
          meals={(mealsByDate[today] ?? []).sort(sortSlots)}
          activeSlots={activeSlots}
        />
      ) : (
        <WeekView meals={meals} activeSlots={activeSlots} />
      )}

      {error && <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 16 }}>{error}</div>}
    </div>
  );
}

// ── Day view ──────────────────────────────────────────────────────────────
function DayView({ dateLabel, meals, activeSlots }: { dateLabel: string; meals: Meal[]; activeSlots: string[] }) {
  // Build a row per active slot for today; empty slots show a gentle "add" prompt.
  const bySlot: Record<string, Meal | undefined> = {};
  for (const m of meals) bySlot[m.slot] = m;
  const orderedSlots = SLOT_ORDER.filter(s => activeSlots.includes(s));

  return (
    <>
      <div style={{ fontFamily: SERIF, fontSize: 27, color: 'var(--fg)', margin: '0 0 26px' }}>{dateLabel}</div>
      <div style={{ borderTop: B }}>
        {orderedSlots.map(slot => {
          const m = bySlot[slot];
          return (
            <div key={slot} style={{ padding: '22px 2px', borderBottom: B }}>
              <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#9a978f', marginBottom: 7 }}>
                {SLOT_LABEL[slot] ?? slot}
              </div>
              {m ? <MealRow meal={m} /> : <EmptySlot />}
            </div>
          );
        })}
      </div>
      <div style={{ textAlign: 'center', marginTop: 18 }}>
        <span style={{ fontSize: 12.5, color: ACCENT, cursor: 'pointer' }}>+ Add a meal</span>
      </div>
    </>
  );
}

// ── Week view (rolling horizon) ─────────────────────────────────────────────
function WeekView({ meals, activeSlots }: { meals: Meal[]; activeSlots: string[] }) {
  // Group by date, show the next ~7 dates that have meals (or are within horizon).
  const byDate: Record<string, Meal[]> = {};
  for (const m of meals) (byDate[m.date] ??= []).push(m);
  const dates = Object.keys(byDate).sort();

  if (dates.length === 0) {
    return <div style={{ fontSize: 14, color: 'var(--muted)', padding: '24px 0' }}>No meals planned yet.</div>;
  }

  return (
    <div style={{ marginTop: 8 }}>
      {dates.map(date => (
        <div key={date} style={{ marginBottom: 22 }}>
          <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: isToday(date) ? ACCENT : '#9a978f', marginBottom: 8 }}>
            {isToday(date) ? 'Today' : prettyDate(date)}
          </div>
          <div style={{ borderTop: B }}>
            {byDate[date].sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot)).map(m => (
              <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '13px 2px', borderBottom: B }}>
                <div>
                  <span style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#b3b0a8', marginRight: 10 }}>{SLOT_LABEL[m.slot]}</span>
                  <span style={{ fontFamily: SERIF, fontSize: 16, color: 'var(--fg)' }}>{m.dishName}</span>
                </div>
                <Avatars participants={m.participants} small />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── A single meal row (day view hero) ───────────────────────────────────────
function MealRow({ meal }: { meal: Meal }) {
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
        <div>
          <div style={{ fontFamily: SERIF, fontSize: 21, color: 'var(--fg)', marginBottom: 4 }}>{meal.dishName}</div>
        </div>
        <Avatars participants={meal.participants} />
      </div>
      <div style={{ display: 'flex', gap: 18, marginTop: 14 }}>
        {meal.recipeSlug && (
          <a href={`/recipes/${meal.recipeSlug}`} style={{ fontSize: 12.5, color: ACCENT, textDecoration: 'none' }}>View recipe</a>
        )}
        <span style={{ fontSize: 12.5, color: 'var(--muted)', cursor: 'pointer' }}>Swap</span>
      </div>
    </>
  );
}

function EmptySlot() {
  return (
    <div style={{ fontSize: 14, color: 'var(--muted)' }}>
      Nothing planned — <span style={{ color: ACCENT, cursor: 'pointer' }}>add something</span>
    </div>
  );
}

// ── Participant avatars (also the who's-eating control in 2b) ────────────────
function Avatars({ participants, small }: { participants: Participant[]; small?: boolean }) {
  const size = small ? 24 : 30;
  return (
    <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
      <div style={{ display: 'flex' }}>
        {participants.map((p, i) => (
          <span
            key={p.id}
            title={p.name}
            style={{
              width: size, height: size, borderRadius: '50%',
              background: colorFor(p), color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: small ? 10 : 12, border: '2px solid var(--bg)',
              marginLeft: i === 0 ? 0 : -6,
            }}
          >
            {monogram(p.name)}
          </span>
        ))}
      </div>
      {/* add-participant affordance (wired in 2b) */}
      <span
        title="Add someone"
        style={{
          width: size, height: size, borderRadius: '50%',
          border: '1px dashed var(--border)', color: 'var(--muted)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: small ? 13 : 15, marginLeft: participants.length ? 4 : 0, cursor: 'pointer',
        }}
      >
        +
      </span>
    </div>
  );
}

// ── No-plan state: activation offer + (promoted recipes live in the real home) ──
function NoPlan({ onActivate, busy, error }: { onActivate: (slots: string[]) => void; busy: boolean; error: string | null }) {
  const [slots, setSlots] = useState<string[]>(['dinner']);
  const [setup, setSetup] = useState(false);

  function toggleSlot(s: string) {
    setSlots(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
  }

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: '40px 32px 80px' }}>
      <div style={{ border: B, background: 'var(--surface)', borderRadius: 12, padding: '26px 28px' }}>
        <div style={{ fontFamily: SERIF, fontSize: 22, color: 'var(--fg)', marginBottom: 6 }}>
          Let Soupdog plan your week
        </div>
        <div style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 20, maxWidth: 440 }}>
          Soupdog keeps a calm, rolling menu — what to cook today and the days ahead — built around your household and what you like.
        </div>

        {!setup ? (
          <button onClick={() => setSetup(true)} style={primaryBtn}>Set up my plan</button>
        ) : (
          <div>
            <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 10 }}>
              Which meals should I plan?
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
              {['breakfast', 'lunch', 'dinner'].map(s => (
                <button
                  key={s}
                  onClick={() => toggleSlot(s)}
                  style={{
                    fontSize: 13, padding: '7px 15px', borderRadius: 999, cursor: 'pointer',
                    border: slots.includes(s) ? `1px solid ${ACCENT}` : B,
                    background: slots.includes(s) ? ACCENT : 'var(--surface)',
                    color: slots.includes(s) ? '#fff' : 'var(--fg)',
                  }}
                >
                  {SLOT_LABEL[s]}
                </button>
              ))}
            </div>
            <button
              onClick={() => onActivate(slots.length ? slots : ['dinner'])}
              disabled={busy}
              style={{ ...primaryBtn, opacity: busy ? 0.6 : 1, cursor: busy ? 'default' : 'pointer' }}
            >
              {busy ? 'Setting up your menu…' : 'Start my plan'}
            </button>
          </div>
        )}

        {error && <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 14 }}>{error}</div>}
      </div>

      <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 18, lineHeight: 1.6 }}>
        You can change which meals are planned, who&rsquo;s eating, and swap any dish at any time.
      </p>
    </div>
  );
}

function toggleStyle(active: boolean): React.CSSProperties {
  return {
    padding: '5px 13px', fontSize: 12, border: 'none', cursor: 'pointer',
    background: active ? 'var(--surface)' : 'transparent',
    color: active ? ACCENT : 'var(--muted)',
  };
}

const primaryBtn: React.CSSProperties = {
  background: ACCENT, color: '#fff', border: 'none',
  fontSize: 13.5, padding: '10px 20px', borderRadius: 8, cursor: 'pointer',
};
