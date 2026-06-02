'use client';

// src/app/plan/page.tsx — Step 2b
// Menu view + wired interactions: cuisine/time on hero, Swap (pick alternative),
// manage participants via avatars (add/remove people you own), Add a meal.

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';

type Participant = { id: string; status: string; personId: string; name: string; avatarColor: string | null };
type Meal = {
  id: string; date: string; slot: string; source: string;
  scheduledTime: string | null;
  dishName: string; cuisine: string | null; totalTimeMinutes: number | null; servings: number | null;
  recipeId: string | null; recipeSlug: string | null; note: string | null; participants: Participant[];
};
type Prefs = { personId: string; planActive: boolean; activeSlots: string[]; horizonDays: number };
type Person = { id: string; name: string; avatarColor: string | null };
type Option = { id: string; title: string; cuisine: string | null; totalTimeMinutes: number | null };

const ACCENT = 'var(--accent)';
const SERIF = "var(--font-serif, Georgia, serif)";
const MONO = "var(--font-mono, monospace)";
const B = '1px solid var(--border)';

const SLOT_ORDER = ['breakfast', 'lunch', 'dinner', 'snack', 'meal'];
const SLOT_LABEL: Record<string, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack', meal: 'Meal' };

const PALETTE: Record<string, string> = {
  olive: '#5a6b52', sage: '#7d8c6a', clay: '#a8634a', slate: '#5c6b72',
  plum: '#6d5168', teal: '#3f6b63', ochre: '#9c7a3c', rose: '#9c5f6b',
};
const PALETTE_KEYS = Object.keys(PALETTE);
function colorFor(id: string, key: string | null): string {
  if (key && PALETTE[key]) return PALETTE[key];
  let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) | 0;
  return PALETTE[PALETTE_KEYS[Math.abs(h) % PALETTE_KEYS.length]];
}
function monogram(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
}
function ymd(d: Date): string { return d.toISOString().slice(0, 10); }
function prettyDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
}
function isToday(iso: string): boolean { return iso === ymd(new Date()); }
// Sort meals by scheduled time (HH:MM lexical sort works), nulls (snack/generic)
// last, slot order as final tiebreaker. This is the time model's ordering.
function byTime(a: Meal, b: Meal): number {
  const at = a.scheduledTime, bt = b.scheduledTime;
  if (at && bt) { if (at !== bt) return at < bt ? -1 : 1; }
  else if (at && !bt) return -1;
  else if (!at && bt) return 1;
  return SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot);
}
function metaLine(m: Meal): string {
  return [m.cuisine, m.totalTimeMinutes ? `${m.totalTimeMinutes} min` : null, m.servings ? `serves ${m.servings}` : null]
    .filter(Boolean).join(' · ');
}

export default function PlanPage() {
  const { user, loading: authLoading } = useAuth();
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [household, setHousehold] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'day' | 'week'>('day');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // active modal: {kind:'swap'|'participants'|'add', ...}
  const [modal, setModal] = useState<any>(null);

  const reloadMeals = useCallback(async () => {
    const data = await fetch('/api/my/meal-plan').then(r => r.json());
    setMeals(data.meals ?? []);
  }, []);

  const load = useCallback(async () => {
    const p: Prefs = await fetch('/api/my/meal-plan/prefs').then(r => r.json());
    setPrefs(p);
    if (p.planActive) {
      await reloadMeals();
      const h = await fetch('/api/my/meal-plan/household').then(r => r.json());
      setHousehold(h.people ?? []);
    }
  }, [reloadMeals]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { setLoading(false); return; }
    load().catch(() => setError('Could not load your plan')).finally(() => setLoading(false));
  }, [user, authLoading, load]);

  async function activate(slots: string[], times?: Record<string, string>) {
    setBusy(true); setError(null);
    try {
      // If the user fine-tuned meal times, save them first so the first
      // generated plan uses them.
      if (times && Object.keys(times).length > 0) {
        await fetch('/api/my/meal-plan/habits', {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ default: times }),
        });
      }
      await fetch('/api/my/meal-plan/prefs', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planActive: true, activeSlots: slots, horizonDays: 5 }),
      });
      await fetch('/api/my/meal-plan/generate', { method: 'POST' });
      await load();
    } catch { setError('Something went wrong setting up your plan.'); }
    finally { setBusy(false); }
  }

  // ── interaction handlers ──
  async function doSwap(mealId: string, recipeId: string) {
    await fetch('/api/my/meal-plan/meal', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mealId, recipeId }),
    });
    setModal(null); await reloadMeals();
  }
  async function doAdd(date: string, slot: string, recipeId: string) {
    await fetch('/api/my/meal-plan/meal', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, slot, recipeId }),
    });
    setModal(null); await reloadMeals();
  }
  async function doRemove(mealId: string) {
    await fetch('/api/my/meal-plan/meal', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mealId }),
    });
    await reloadMeals();
  }
  async function addParticipant(mealId: string, personId: string) {
    await fetch('/api/my/meal-plan/participant', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mealId, personId }),
    });
    await reloadMeals();
  }
  async function removeParticipant(mealId: string, personId: string) {
    await fetch('/api/my/meal-plan/participant', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mealId, personId }),
    });
    await reloadMeals();
  }

  if (authLoading || loading) {
    return <div style={{ padding: '48px 32px', fontFamily: MONO, fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.15em' }}>Loading…</div>;
  }
  if (!user) return <div style={{ padding: '48px 32px', color: 'var(--muted)' }}>Please sign in to see your plan.</div>;

  if (!prefs?.planActive) return <NoPlan onActivate={activate} busy={busy} error={error} />;

  const today = ymd(new Date());
  const activeSlots = prefs.activeSlots ?? ['dinner'];
  const mealsByDate: Record<string, Meal[]> = {};
  for (const m of meals) (mealsByDate[m.date] ??= []).push(m);
  const sortSlots = byTime;

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: '40px 32px 80px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--muted)' }}>{prettyDate(today)}</div>
        <div style={{ display: 'inline-flex', border: B, borderRadius: 7, overflow: 'hidden' }}>
          <button onClick={() => setView('day')} style={toggleStyle(view === 'day')}>Day</button>
          <button onClick={() => setView('week')} style={toggleStyle(view === 'week')}>Week</button>
        </div>
      </div>

      {view === 'day' ? (
        <DayView
          meals={(mealsByDate[today] ?? []).sort(sortSlots)}
          activeSlots={activeSlots}
          household={household}
          onSwap={(m) => setModal({ kind: 'swap', meal: m })}
          onAdd={(slot) => setModal({ kind: 'add', date: today, slot })}
          onAddPerson={addParticipant}
          onRemovePerson={removeParticipant}
          onRemove={doRemove}
        />
      ) : (
        <WeekView meals={meals} onSwap={(m) => setModal({ kind: 'swap', meal: m })} onRemove={doRemove} />
      )}

      {error && <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 16 }}>{error}</div>}

      {modal?.kind === 'swap' && (
        <RecipePicker
          title={`Swap ${SLOT_LABEL[modal.meal.slot]?.toLowerCase()}`}
          onPick={(rid) => doSwap(modal.meal.id, rid)}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.kind === 'add' && (
        <RecipePicker
          title={`Add ${SLOT_LABEL[modal.slot]?.toLowerCase()}`}
          onPick={(rid) => doAdd(modal.date, modal.slot, rid)}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

// ── Day view ──
function DayView({ meals, activeSlots, household, onSwap, onAdd, onAddPerson, onRemovePerson, onRemove }: {
  meals: Meal[]; activeSlots: string[]; household: Person[];
  onSwap: (m: Meal) => void; onAdd: (slot: string) => void;
  onAddPerson: (mealId: string, personId: string) => void; onRemovePerson: (mealId: string, personId: string) => void;
  onRemove: (mealId: string) => void;
}) {
  const [addMenu, setAddMenu] = useState(false);
  // Group meals by slot, keeping ALL meals (no collapsing). Sort within a slot by
  // time, and order the slot SECTIONS by their earliest scheduled time (so the
  // day reads in time order — an 08:00 dinner precedes a 13:00 breakfast).
  const bySlot: Record<string, Meal[]> = {};
  for (const m of meals) (bySlot[m.slot] ??= []).push(m);
  for (const s of Object.keys(bySlot)) bySlot[s].sort(byTime);
  const slotsWithMeals = Object.keys(bySlot);
  // active slots with no meal still show (for the + Add affordance), placed by
  // their default habitual time via a representative ordering key.
  const allSlots = Array.from(new Set([...slotsWithMeals, ...activeSlots]));
  function slotSortKey(slot: string): string {
    const first = bySlot[slot]?.[0]?.scheduledTime;
    if (first) return first;
    // empty active slot: order by default slot time so it lands sensibly
    return ({ breakfast: '07:30', lunch: '12:30', dinner: '19:00', snack: '23:58', meal: '23:59' } as Record<string, string>)[slot] ?? '23:59';
  }
  const orderedSlots = allSlots.sort((a, b) => {
    const ka = slotSortKey(a), kb = slotSortKey(b);
    if (ka !== kb) return ka < kb ? -1 : 1;
    return SLOT_ORDER.indexOf(a) - SLOT_ORDER.indexOf(b);
  });

  return (
    <>
      <div style={{ fontFamily: SERIF, fontSize: 27, color: 'var(--fg)', margin: '0 0 26px' }}>Today</div>
      <div style={{ borderTop: B }}>
        {orderedSlots.map(slot => {
          const slotMeals = bySlot[slot] ?? [];
          return (
            <div key={slot} style={{ padding: '22px 2px', borderBottom: B }}>
              <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#9a978f', marginBottom: 7 }}>{SLOT_LABEL[slot] ?? slot}</div>
              {slotMeals.length > 0 ? (
                slotMeals.map((m, i) => (
                  <div key={m.id} style={{ marginTop: i === 0 ? 0 : 20 }}>
                    <MealRow meal={m} household={household} onSwap={onSwap} onAddPerson={onAddPerson} onRemovePerson={onRemovePerson} onRemove={onRemove} />
                  </div>
                ))
              ) : (
                <button
                  onClick={() => onAdd(slot)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 7,
                    border: '1px dashed var(--border)', borderRadius: 8,
                    background: 'transparent', color: ACCENT, cursor: 'pointer',
                    fontSize: 13.5, padding: '9px 15px', fontFamily: 'inherit',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <span style={{ fontSize: 15, lineHeight: 1 }}>+</span> Add {SLOT_LABEL[slot]?.toLowerCase() ?? slot}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Always-available add: pick any slot */}
      <div style={{ textAlign: 'center', marginTop: 18, position: 'relative' }}>
        <span onClick={() => setAddMenu(v => !v)} style={{ fontSize: 12.5, color: ACCENT, cursor: 'pointer' }}>+ Add a meal</span>
        {addMenu && (
          <div style={{ ...popover, left: '50%', right: 'auto', transform: 'translateX(-50%)', top: 28, minWidth: 160 }}>
            <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted)', padding: '2px 8px 8px' }}>Which meal?</div>
            {SLOT_ORDER.map(slot => (
              <div key={slot} onClick={() => { setAddMenu(false); onAdd(slot); }}
                style={{ padding: '8px', cursor: 'pointer', fontSize: 13.5, borderRadius: 6, textAlign: 'left' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                {SLOT_LABEL[slot]}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// ── Week view ──
function WeekView({ meals, onSwap, onRemove }: { meals: Meal[]; onSwap: (m: Meal) => void; onRemove: (mealId: string) => void }) {
  const byDate: Record<string, Meal[]> = {};
  for (const m of meals) (byDate[m.date] ??= []).push(m);
  const dates = Object.keys(byDate).sort();
  if (dates.length === 0) return <div style={{ fontSize: 14, color: 'var(--muted)', padding: '24px 0' }}>No meals planned yet.</div>;

  return (
    <div style={{ marginTop: 8 }}>
      {dates.map(date => (
        <div key={date} style={{ marginBottom: 22 }}>
          <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: isToday(date) ? ACCENT : '#9a978f', marginBottom: 8 }}>
            {isToday(date) ? 'Today' : prettyDate(date)}
          </div>
          <div style={{ borderTop: B }}>
            {byDate[date].sort(byTime).map(m => (
              <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 2px', borderBottom: B }}>
                <div>
                  <span style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#b3b0a8', marginRight: 10 }}>{SLOT_LABEL[m.slot]}</span>
                  {m.recipeSlug ? (
                    <a href={`/recipes/${m.recipeSlug}`} style={{ fontFamily: SERIF, fontSize: 16, color: 'var(--fg)', textDecoration: 'none' }}>{m.dishName}</a>
                  ) : (
                    <span style={{ fontFamily: SERIF, fontSize: 16, color: 'var(--fg)' }}>{m.dishName}</span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <AvatarStack participants={m.participants} small />
                  <span onClick={() => onSwap(m)} title="Swap dish" style={{ cursor: 'pointer', color: 'var(--muted)', display: 'flex', alignItems: 'center' }}>
                    <SwapIcon />
                  </span>
                  <span onClick={() => onRemove(m.id)} title="Remove meal" style={{ cursor: 'pointer', color: 'var(--muted)', display: 'flex', alignItems: 'center', fontSize: 16, lineHeight: 1 }}>×</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Meal hero row (day view) ──
function MealRow({ meal, household, onSwap, onAddPerson, onRemovePerson, onRemove }: {
  meal: Meal; household: Person[];
  onSwap: (m: Meal) => void; onAddPerson: (mealId: string, personId: string) => void; onRemovePerson: (mealId: string, personId: string) => void;
  onRemove: (mealId: string) => void;
}) {
  const [openAdd, setOpenAdd] = useState(false);
  const [openPerson, setOpenPerson] = useState<string | null>(null); // personId whose popover is open
  const inMeal = new Set(meal.participants.map(p => p.personId));
  const addable = household.filter(h => !inMeal.has(h.id));
  const meta = metaLine(meal);

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
        <div>
          {meal.recipeSlug ? (
            <a href={`/recipes/${meal.recipeSlug}`} style={{ fontFamily: SERIF, fontSize: 21, color: 'var(--fg)', marginBottom: 4, textDecoration: 'none', display: 'inline-block' }}>{meal.dishName}</a>
          ) : (
            <div style={{ fontFamily: SERIF, fontSize: 21, color: 'var(--fg)', marginBottom: 4 }}>{meal.dishName}</div>
          )}
          {meta && <div style={{ fontSize: 13, color: 'var(--muted)' }}>{meta}</div>}
        </div>
        <div style={{ position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            {meal.participants.map((p, i) => (
              <span key={p.id} title={p.name}
                onClick={() => { setOpenPerson(v => v === p.personId ? null : p.personId); setOpenAdd(false); }}
                style={{ width: 30, height: 30, borderRadius: '50%', background: colorFor(p.personId, p.avatarColor), color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, border: '2px solid var(--bg)', marginLeft: i === 0 ? 0 : -6, cursor: 'pointer' }}>
                {monogram(p.name)}
              </span>
            ))}
            {addable.length > 0 && (
              <span title="Add someone" onClick={() => { setOpenAdd(v => !v); setOpenPerson(null); }}
                style={{ width: 30, height: 30, borderRadius: '50%', border: '1px dashed var(--border)', color: 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, marginLeft: meal.participants.length ? 4 : 0, cursor: 'pointer' }}>+</span>
            )}
          </div>

          {/* person popover: name + remove */}
          {openPerson && (() => {
            const p = meal.participants.find(x => x.personId === openPerson);
            if (!p) return null;
            return (
              <div style={popover}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '4px 6px 10px' }}>
                  <span style={{ width: 28, height: 28, borderRadius: '50%', background: colorFor(p.personId, p.avatarColor), color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, flexShrink: 0 }}>{monogram(p.name)}</span>
                  <span style={{ fontSize: 13.5, color: 'var(--fg)' }}>{p.name}</span>
                </div>
                <div onClick={() => { onRemovePerson(meal.id, p.personId); setOpenPerson(null); }}
                  style={{ borderTop: B, padding: '9px 8px 2px', fontSize: 13, color: '#9c5f4a', cursor: 'pointer' }}>
                  Remove from this meal
                </div>
              </div>
            );
          })()}

          {/* add-person picker */}
          {openAdd && addable.length > 0 && (
            <div style={popover}>
              <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted)', padding: '2px 8px 8px' }}>Add to this meal</div>
              {addable.map(h => (
                <div key={h.id} onClick={() => { onAddPerson(meal.id, h.id); setOpenAdd(false); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px', cursor: 'pointer', fontSize: 13.5, borderRadius: 6 }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <span style={{ width: 26, height: 26, borderRadius: '50%', background: colorFor(h.id, h.avatarColor), color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, flexShrink: 0 }}>{monogram(h.name)}</span>
                  <span style={{ whiteSpace: 'nowrap' }}>{h.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 18, marginTop: 14 }}>
        <span onClick={() => onSwap(meal)} style={{ fontSize: 12.5, color: 'var(--muted)', cursor: 'pointer' }}>Swap</span>
        <span onClick={() => onRemove(meal.id)} style={{ fontSize: 12.5, color: 'var(--muted)', cursor: 'pointer' }}>Remove</span>
      </div>
    </>
  );
}

function SwapIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 4 3 8l4 4" />
      <path d="M3 8h14" />
      <path d="m17 20 4-4-4-4" />
      <path d="M21 16H7" />
    </svg>
  );
}

function AvatarStack({ participants, small }: { participants: Participant[]; small?: boolean }) {
  const size = small ? 24 : 30;
  return (
    <div style={{ display: 'flex' }}>
      {participants.map((p, i) => (
        <span key={p.id} title={p.name} style={{ width: size, height: size, borderRadius: '50%', background: colorFor(p.personId, p.avatarColor), color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: small ? 10 : 12, border: '2px solid var(--bg)', marginLeft: i === 0 ? 0 : -6 }}>{monogram(p.name)}</span>
      ))}
    </div>
  );
}

// ── Recipe picker modal (swap / add) ──
function RecipePicker({ title, onPick, onClose }: { title: string; onPick: (recipeId: string) => void; onClose: () => void }) {
  const [opts, setOpts] = useState<Option[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/my/meal-plan/options').then(r => r.json()).then(d => setOpts(d.options ?? [])).finally(() => setLoading(false));
  }, []);

  const filtered = q.trim()
    ? opts.filter(o => o.title.toLowerCase().includes(q.toLowerCase()) || (o.cuisine ?? '').toLowerCase().includes(q.toLowerCase()))
    : opts;

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,18,14,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', border: B, borderRadius: 12, width: 'min(440px, 92vw)', maxHeight: '78vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '18px 20px 12px', borderBottom: B }}>
          <div style={{ fontFamily: SERIF, fontSize: 18, color: 'var(--fg)', marginBottom: 10 }}>{title}</div>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search dishes…"
            style={{ width: '100%', padding: '8px 12px', border: B, borderRadius: 8, fontSize: 14, background: 'var(--bg)', color: 'var(--fg)', boxSizing: 'border-box' }} />
        </div>
        <div style={{ overflowY: 'auto', padding: '6px 0' }}>
          {loading ? (
            <div style={{ padding: 20, fontSize: 13, color: 'var(--muted)' }}>Loading…</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 20, fontSize: 13, color: 'var(--muted)' }}>No dishes found.</div>
          ) : filtered.map(o => (
            <div key={o.id} onClick={() => onPick(o.id)}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '11px 20px', cursor: 'pointer' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
              <span style={{ fontFamily: SERIF, fontSize: 15, color: 'var(--fg)' }}>{o.title}</span>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>{[o.cuisine, o.totalTimeMinutes ? `${o.totalTimeMinutes} min` : null].filter(Boolean).join(' · ')}</span>
            </div>
          ))}
        </div>
        <div style={{ padding: '12px 20px', borderTop: B, textAlign: 'right' }}>
          <span onClick={onClose} style={{ fontSize: 13, color: 'var(--muted)', cursor: 'pointer' }}>Cancel</span>
        </div>
      </div>
    </div>
  );
}

// ── No-plan / activation ──
function NoPlan({ onActivate, busy, error }: { onActivate: (slots: string[], times?: Record<string, string>) => void; busy: boolean; error: string | null }) {
  const [slots, setSlots] = useState<string[]>(['dinner']);
  const [setup, setSetup] = useState(false);
  const [tune, setTune] = useState(false);
  const DEFAULT_TIMES: Record<string, string> = { breakfast: '07:30', lunch: '12:30', dinner: '19:00' };
  const [times, setTimes] = useState<Record<string, string>>(DEFAULT_TIMES);

  function toggleSlot(s: string) { setSlots(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]); }
  function setTime(slot: string, v: string) { setTimes(prev => ({ ...prev, [slot]: v })); }

  // only offer time tuning for the named meals the user actually selected
  const tunableSlots = ['breakfast', 'lunch', 'dinner'].filter(s => slots.includes(s));

  function start() {
    const chosen = slots.length ? slots : ['dinner'];
    // only send times for selected named slots, and only if the user opened tuning
    const send: Record<string, string> = {};
    if (tune) for (const s of tunableSlots) if (times[s]) send[s] = times[s];
    onActivate(chosen, Object.keys(send).length ? send : undefined);
  }

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: '40px 32px 80px' }}>
      <div style={{ border: B, background: 'var(--surface)', borderRadius: 12, padding: '26px 28px' }}>
        <div style={{ fontFamily: SERIF, fontSize: 22, color: 'var(--fg)', marginBottom: 6 }}>Let Soupdog plan your week</div>
        <div style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 20, maxWidth: 440 }}>
          Soupdog keeps a calm, rolling menu — what to cook today and the days ahead — built around your household and what you like.
        </div>
        {!setup ? (
          <button onClick={() => setSetup(true)} style={primaryBtn}>Set up my plan</button>
        ) : (
          <div>
            <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 10 }}>Which meals should I plan?</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
              {['breakfast', 'lunch', 'dinner'].map(s => (
                <button key={s} onClick={() => toggleSlot(s)}
                  style={{ fontSize: 13, padding: '7px 15px', borderRadius: 999, cursor: 'pointer', border: slots.includes(s) ? `1px solid ${ACCENT}` : B, background: slots.includes(s) ? ACCENT : 'var(--surface)', color: slots.includes(s) ? '#fff' : 'var(--fg)' }}>
                  {SLOT_LABEL[s]}
                </button>
              ))}
            </div>

            {/* optional fine-tune: collapsed by default; fast path skips it */}
            {tunableSlots.length > 0 && (
              <div style={{ marginBottom: 18 }}>
                {!tune ? (
                  <span onClick={() => setTune(true)} style={{ fontSize: 12.5, color: ACCENT, cursor: 'pointer' }}>
                    Adjust meal times (optional)
                  </span>
                ) : (
                  <div style={{ border: B, borderRadius: 10, padding: '14px 16px' }}>
                    <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 4 }}>When do you usually eat?</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>This helps Soupdog suggest when to start cooking. You can change it later.</div>
                    {tunableSlots.map(s => (
                      <div key={s} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0' }}>
                        <span style={{ fontSize: 14, color: 'var(--fg)' }}>{SLOT_LABEL[s]}</span>
                        <input type="time" value={times[s] ?? ''} onChange={e => setTime(s, e.target.value)}
                          style={{ fontSize: 14, padding: '5px 8px', border: B, borderRadius: 7, background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'inherit' }} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <button onClick={start} disabled={busy}
              style={{ ...primaryBtn, opacity: busy ? 0.6 : 1, cursor: busy ? 'default' : 'pointer' }}>
              {busy ? 'Setting up your menu…' : 'Start my plan'}
            </button>
          </div>
        )}
        {error && <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 14 }}>{error}</div>}
      </div>
      <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 18, lineHeight: 1.6 }}>
        You can change which meals are planned, who&rsquo;s eating, when you eat, and swap any dish at any time.
      </p>
    </div>
  );
}

function toggleStyle(active: boolean): React.CSSProperties {
  return { padding: '5px 13px', fontSize: 12, border: 'none', cursor: 'pointer', background: active ? 'var(--surface)' : 'transparent', color: active ? ACCENT : 'var(--muted)' };
}
const primaryBtn: React.CSSProperties = { background: ACCENT, color: '#fff', border: 'none', fontSize: 13.5, padding: '10px 20px', borderRadius: 8, cursor: 'pointer' };

const popover: React.CSSProperties = {
  position: 'absolute', right: 0, top: 38, background: 'var(--surface)', border: B,
  borderRadius: 10, padding: 8, zIndex: 20, minWidth: 200,
  boxShadow: '0 6px 22px rgba(0,0,0,0.10)',
};
