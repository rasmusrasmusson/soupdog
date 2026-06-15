// src/app/my/cooking-sessions/[id]/page.tsx
'use client';

// The active cooking screen — the "first-class destination" a cook lands on while a
// session is running. It reads the session's FROZEN timeline snapshot and lets the cook
// tap each step through pending → in progress → done, persisting every change to the
// server (resumable across devices). Built on the existing cook-together step grammar so
// it shares Soupdog's visual language; the one new idea is that each step is a large,
// glanceable touch target with three states (kitchen use, busy hands).

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2, Flame, Clock, Check, ChevronLeft, CircleDot, Circle } from 'lucide-react';

const MONO = { fontFamily: 'var(--font-mono)' } as const;
const SERIF = { fontFamily: 'var(--font-serif, Georgia, serif)' } as const;
const B = '1px solid var(--border)';

type StepType = 'human' | 'machine' | 'passive' | 'hold';
type StepStatus = 'pending' | 'in_progress' | 'done' | 'skipped';

interface ScheduledStep {
  id: string; dishTitle: string; dishCanonicalId: string; group: string | null;
  type: StepType; instruction: string; durationSeconds: number;
  temperatureCelsius: number | null;
  ingredients: { name: string; quantityValue: number; quantityUnit: string; prep: string | null }[];
  startOffsetSeconds: number; endOffsetSeconds: number; isHold: boolean; meanwhile: boolean;
}
interface Timeline { totalSeconds: number; scheduled: ScheduledStep[]; hasDurations: boolean }
interface StepState { step_id: string; dish_canonical_id: string | null; status: StepStatus; started_at: string | null; completed_at: string | null }

interface Session {
  id: string; mealCanonicalId: string; mealSlug: string | null; title: string;
  status: 'active' | 'paused' | 'completed' | 'abandoned';
  serveTargetTime: string | null; startedAt: string; completedAt: string | null;
  timeline: Timeline; steps: StepState[];
  participants: { person_id: string | null; role: string; joined_at: string }[];
  recipeUpdated: boolean; updatedDishes: string[];
}

const fmtOffset = (s: number) => {
  if (s <= 0) return 'at serving';
  const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60);
  if (h > 0) return `${h}h${m.toString().padStart(2, '0')} before`;
  if (m > 0) return `${m} min before`;
  return 'just before';
};
const fmtQty = (v: number, u: string) => (Number.isInteger(v) ? v : v.toFixed(1)) + (u && u !== 'count' ? ` ${u}` : '');

export default function ActiveCookingPage() {
  const { id } = useParams<{ id: string }>();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyStep, setBusyStep] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/my/cooking-sessions/${id}`);
      if (!res.ok) { setError(res.status === 404 ? 'This cooking session was not found.' : 'Could not load the session.'); return; }
      setSession(await res.json());
    } catch { setError('Could not load the session.'); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Map step_id → status for quick lookup while rendering the timeline.
  const statusOf = (stepId: string): StepStatus =>
    session?.steps.find(s => s.step_id === stepId)?.status ?? 'pending';

  // Tap cycles: pending → in_progress → done → pending. Optimistic, then persisted.
  const advance = async (stepId: string) => {
    if (!session || busyStep) return;
    const cur = statusOf(stepId);
    const next: StepStatus = cur === 'pending' ? 'in_progress' : cur === 'in_progress' ? 'done' : 'pending';
    setBusyStep(stepId);
    // Optimistic update.
    setSession(s => s ? { ...s, steps: s.steps.map(st => st.step_id === stepId ? { ...st, status: next } : st) } : s);
    try {
      const res = await fetch(`/api/my/cooking-sessions/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stepId, status: next }),
      });
      if (!res.ok) await load(); // reconcile on failure
    } catch { await load(); }
    finally { setBusyStep(null); }
  };

  const setSessionStatus = async (sessionStatus: Session['status']) => {
    if (!session) return;
    setSession(s => s ? { ...s, status: sessionStatus } : s);
    await fetch(`/api/my/cooking-sessions/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionStatus }),
    }).catch(() => {});
  };

  if (loading) {
    return <div className="max-w-2xl mx-auto px-4 md:px-8 py-16" style={{ ...MONO, fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 8 }}>
      <Loader2 size={14} className="animate-spin" /> Loading your cook…
    </div>;
  }
  if (error || !session) {
    return <div className="max-w-2xl mx-auto px-4 md:px-8 py-16" style={{ color: 'var(--muted)' }}>
      {error ?? 'Session not found.'}
      <div style={{ marginTop: 16 }}><Link href="/my/recipes" style={{ ...MONO, fontSize: 11, color: 'var(--accent)' }}>← Back to My Recipes</Link></div>
    </div>;
  }

  const steps = session.timeline?.scheduled ?? [];
  const cookable = steps.filter(s => s.type !== 'hold');
  const doneCount = cookable.filter(s => statusOf(s.id) === 'done').length;
  const pct = cookable.length ? Math.round((doneCount / cookable.length) * 100) : 0;
  const allDone = cookable.length > 0 && doneCount === cookable.length;
  const isFinished = session.status === 'completed';

  // The current focus: first step not yet done (and not a hold).
  const currentId = cookable.find(s => statusOf(s.id) !== 'done')?.id ?? null;

  return (
    <div className="max-w-2xl mx-auto px-4 md:px-8 py-8 md:py-10">
      {/* Breadcrumb / exit */}
      <div style={{ ...MONO, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 6 }}>
        <Link href={`/my/meals/${session.mealCanonicalId}/recipe`} style={{ color: 'var(--muted)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }} className="hover:text-[var(--accent)]">
          <ChevronLeft size={12} /> Recipe
        </Link>
      </div>

      {/* Title + progress — the page's signature: how far through the cook you are. */}
      <h1 style={{ ...SERIF, fontSize: 30, lineHeight: 1.15, marginBottom: 4, color: 'var(--fg)' }}>{session.title}</h1>
      <div style={{ ...MONO, fontSize: 11, color: 'var(--muted)', marginBottom: 16 }}>
        {isFinished ? 'Finished' : session.status === 'paused' ? 'Paused' : 'Cooking now'} · {doneCount} of {cookable.length} steps done
      </div>

      {/* Progress bar */}
      <div style={{ height: 6, background: 'var(--border)', borderRadius: 999, overflow: 'hidden', marginBottom: 20 }}>
        <div style={{ height: '100%', width: `${pct}%`, background: 'var(--accent)', borderRadius: 999, transition: 'width 240ms ease' }} />
      </div>

      {/* "Recipe updated" notice — the session keeps its frozen steps; this just informs. */}
      {session.recipeUpdated && (
        <div style={{ border: B, borderRadius: 8, padding: '10px 14px', marginBottom: 20, background: 'var(--accent-subtle)', fontSize: 12.5, color: 'var(--fg)', lineHeight: 1.5 }}>
          One of these recipes has been updated since you started cooking. You're following the version you began with — finish this cook, then start a fresh one to use the latest.
        </div>
      )}

      {/* All-done / completion control */}
      {allDone && !isFinished && (
        <button onClick={() => setSessionStatus('completed')}
          style={{ width: '100%', marginBottom: 20, padding: '12px', border: 'none', borderRadius: 8, background: 'var(--accent)', color: 'var(--bg)', ...MONO, fontSize: 12, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer' }}>
          Everything's done — finish cooking
        </button>
      )}
      {isFinished && (
        <div style={{ border: B, borderRadius: 8, padding: '14px', marginBottom: 20, textAlign: 'center', ...MONO, fontSize: 12, color: 'var(--accent)' }}>
          ✓ Cooked and done. Enjoy!
        </div>
      )}

      {/* The live timeline — each step a tappable target. */}
      {steps.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--muted)', fontStyle: 'italic' }}>This session has no timed steps.</div>
      ) : (
        <div style={{ borderTop: B }}>
          {(() => {
            let n = 0;
            return steps.map((s) => {
              const isHold = s.type === 'hold';
              const nonBlocking = s.type === 'machine' || s.type === 'passive';
              if (!isHold) n += 1;
              const st = statusOf(s.id);
              const isCurrent = s.id === currentId;
              const isDone = st === 'done';
              const inProgress = st === 'in_progress';

              return (
                <button
                  key={s.id}
                  onClick={() => !isHold && advance(s.id)}
                  disabled={isHold || busyStep === s.id || isFinished}
                  style={{
                    width: '100%', textAlign: 'left', display: 'flex', gap: 14, padding: '14px 8px',
                    borderBottom: B, border: 'none', cursor: isHold || isFinished ? 'default' : 'pointer',
                    background: isCurrent ? 'var(--accent-subtle)' : isHold ? 'var(--accent-subtle)' : 'transparent',
                    opacity: isDone ? 0.55 : 1,
                    transition: 'background 160ms ease, opacity 160ms ease',
                    fontFamily: 'inherit',
                  }}
                >
                  {/* State marker — the touch affordance. */}
                  <span style={{ flexShrink: 0, width: 28, display: 'flex', justifyContent: 'center', paddingTop: 2, color: isDone ? 'var(--accent)' : inProgress ? 'var(--accent)' : '#b3b0a8' }}>
                    {isHold ? <span style={{ ...MONO, fontSize: 13 }}>⏸</span>
                      : isDone ? <Check size={18} strokeWidth={2.5} />
                      : inProgress ? <CircleDot size={18} />
                      : <Circle size={18} />}
                  </span>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap', marginBottom: 3 }}>
                      <span style={{ ...MONO, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--accent)' }}>{s.dishTitle}</span>
                      {!isHold && <span style={{ ...MONO, fontSize: 11, color: '#b3b0a8' }}>{n}</span>}
                      {s.meanwhile && !isHold && (
                        <span style={{ ...MONO, fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)', border: B, padding: '1px 6px', borderRadius: 999 }}>meanwhile</span>
                      )}
                      {nonBlocking && <span style={{ ...MONO, fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)' }}>hands-free</span>}
                      {inProgress && <span style={{ ...MONO, fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--accent)' }}>in progress</span>}
                    </div>
                    <div style={{ fontSize: 15.5, color: 'var(--fg)', lineHeight: 1.55, textDecoration: isDone ? 'line-through' : 'none' }}>{s.instruction}</div>
                    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 5, ...MONO, fontSize: 10.5, color: 'var(--muted)' }}>
                      <span>{fmtOffset(s.startOffsetSeconds)}</span>
                      {s.temperatureCelsius ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Flame size={10} /> {s.temperatureCelsius}°C</span> : null}
                      {s.durationSeconds ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Clock size={10} /> {Math.round(s.durationSeconds / 60)} min</span> : null}
                      {s.ingredients?.map((ing, k) => (
                        <span key={k}>{ing.name}{ing.quantityValue ? ` (${fmtQty(ing.quantityValue, ing.quantityUnit)})` : ''}</span>
                      ))}
                    </div>
                  </div>
                </button>
              );
            });
          })()}
        </div>
      )}

      {/* Pause / resume — quiet, below the steps. */}
      {!isFinished && (
        <div style={{ marginTop: 24, display: 'flex', gap: 12 }}>
          {session.status === 'active' ? (
            <button onClick={() => setSessionStatus('paused')} style={{ ...MONO, fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted)', background: 'transparent', border: B, borderRadius: 6, padding: '8px 14px', cursor: 'pointer' }}>
              Pause cooking
            </button>
          ) : (
            <button onClick={() => setSessionStatus('active')} style={{ ...MONO, fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--accent)', background: 'transparent', border: '1px solid var(--accent)', borderRadius: 6, padding: '8px 14px', cursor: 'pointer' }}>
              Resume cooking
            </button>
          )}
        </div>
      )}

      <p style={{ ...MONO, fontSize: 10, color: 'var(--muted)', marginTop: 18, lineHeight: 1.6 }}>
        Tap a step to start it, tap again to mark it done. Your progress is saved — you can close this and pick up where you left off.
      </p>
    </div>
  );
}
