// src/app/my/cooking-sessions/[id]/page.tsx
'use client';

// The active cooking screen — the meal's recipe, shown live, via the same <RecipeDisplay>
// table as every other recipe. The difference is interactivity: ingredient and step
// checkboxes are wired to the session's persisted progress (resumable across devices).
//
// Lifecycle:
//   • Gathering an ingredient is a task too — ingredient checks persist (keyed "ing:i").
//   • Completion is DERIVED from step progress: tick the last step → offer to finish;
//     untick it → back to cooking (no stuck "finished" state).
//   • Two explicit endings, always available: Finish (completed) and Stop (abandoned).

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2, ChevronLeft } from 'lucide-react';
import { RecipeDisplay } from '@/components/recipe/RecipeDisplay';
import { snapshotToRecipe, stepIdsInDisplayOrder } from '@/lib/snapshot-to-recipe';
import { Avatar } from '@/components/people/Avatar';

const MONO = { fontFamily: 'var(--font-mono)' } as const;
const SERIF = { fontFamily: 'var(--font-serif, Georgia, serif)' } as const;
const B = '1px solid var(--border)';

type StepStatus = 'pending' | 'in_progress' | 'done' | 'skipped';
interface StepState { step_id: string; status: StepStatus; assigned_to?: string | null }
interface PersonInfo { id: string; name: string; avatarColor: string | null; avatarInitials: string | null }
interface Session {
  id: string; mealCanonicalId: string; mealSlug: string | null; title: string;
  status: 'active' | 'paused' | 'completed' | 'abandoned';
  serveTargetTime: string | null; startedAt: string; completedAt: string | null;
  timeline: { totalSeconds: number; scheduled: any[]; hasDurations?: boolean };
  steps: StepState[];
  participants: { person_id: string | null; role: string }[];
  people: Record<string, PersonInfo>;
  recipeUpdated: boolean; updatedDishes: string[];
}

export default function ActiveCookingPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Done-state keyed by item key (step id, or "ing:<index>"), mirrored from the server.
  const [doneById, setDoneById] = useState<Record<string, boolean>>({});
  const [ending, setEnding] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/my/cooking-sessions/${id}`);
      if (!res.ok) { setError(res.status === 404 ? 'This cooking session was not found.' : 'Could not load the session.'); return; }
      const s: Session = await res.json();
      setSession(s);
      const map: Record<string, boolean> = {};
      for (const st of s.steps) map[st.step_id] = st.status === 'done';
      setDoneById(map);
    } catch { setError('Could not load the session.'); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const recipe = useMemo(
    () => session ? snapshotToRecipe(session.timeline, { title: session.title }) : null,
    [session]
  );
  const stepIds = useMemo(() => recipe ? stepIdsInDisplayOrder(recipe) : [], [recipe]);

  // Persist any item (step or ingredient) by its key.
  const persist = async (key: string, done: boolean) => {
    try {
      const res = await fetch(`/api/my/cooking-sessions/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stepId: key, status: done ? 'done' : 'pending' }),
      });
      if (!res.ok) await load();
    } catch { await load(); }
  };

  const toggleItem = (key: string) => {
    if (!session || session.status === 'completed' || session.status === 'abandoned') return;
    const next = !doneById[key];
    setDoneById(m => ({ ...m, [key]: next }));   // optimistic
    persist(key, next);
  };

  const endSession = async (status: 'completed' | 'abandoned') => {
    if (ending) return;
    setEnding(true);
    setSession(s => s ? { ...s, status } : s);
    try {
      await fetch(`/api/my/cooking-sessions/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionStatus: status }),
      });
    } catch { /* optimistic; banner will reconcile elsewhere */ }
    // After ending, leave the cooking surface — back to the recipe.
    router.push(`/my/meals/${session?.mealCanonicalId}/recipe`);
  };

  if (loading) {
    return <div className="max-w-3xl mx-auto px-4 md:px-8 py-16" style={{ ...MONO, fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 8 }}>
      <Loader2 size={14} className="animate-spin" /> Loading your cook…
    </div>;
  }
  if (error || !session || !recipe) {
    return <div className="max-w-3xl mx-auto px-4 md:px-8 py-16" style={{ color: 'var(--muted)' }}>
      {error ?? 'Session not found.'}
      <div style={{ marginTop: 16 }}><Link href="/my/recipes" style={{ ...MONO, fontSize: 11, color: 'var(--accent)' }}>← Back to My Recipes</Link></div>
    </div>;
  }

  const total = stepIds.length;
  const doneCount = stepIds.filter(sid => doneById[sid]).length;
  const pct = total ? Math.round((doneCount / total) * 100) : 0;
  // Completion is DERIVED: all steps done → finished-ready. Unticking reverts it.
  const allStepsDone = total > 0 && doneCount === total;
  const isOver = session.status === 'completed' || session.status === 'abandoned';

  // The cooks in this session (for the "cooking together" strip).
  const cookList = (session.participants ?? [])
    .map(p => p.person_id ? session.people?.[p.person_id] : null)
    .filter(Boolean) as PersonInfo[];

  // RecipeDisplay's interactive contract: checked[] + toggle(i) by index.
  const interactive = {
    ingChecks: {
      checked: recipe.ingredients.map((_: unknown, i: number) => !!doneById[`ing:${i}`]),
      toggle: (i: number) => toggleItem(`ing:${i}`),
    },
    stepChecks: {
      checked: stepIds.map(sid => !!doneById[sid]),
      toggle: (i: number) => { const sid = stepIds[i]; if (sid) toggleItem(sid); },
    },
    servings: recipe.servings,
  };

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-8 py-8 md:py-10" style={{ paddingBottom: isOver ? undefined : 90 }}>
      <div style={{ ...MONO, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
        <Link href={`/my/meals/${session.mealCanonicalId}/recipe`} style={{ color: 'var(--muted)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }} className="hover:text-[var(--accent)]">
          <ChevronLeft size={12} /> Recipe
        </Link>
      </div>

      <h1 style={{ ...SERIF, fontSize: 30, lineHeight: 1.15, marginBottom: 4, color: 'var(--fg)' }}>{session.title}</h1>
      <div style={{ ...MONO, fontSize: 11, color: 'var(--muted)', marginBottom: 20 }}>
        {session.status === 'completed' ? 'Finished'
          : session.status === 'abandoned' ? 'Stopped'
          : 'Cooking now'}
      </div>

      {/* Who's cooking — shown when more than one cook. Per-task avatars +
          reassignment + per-cook filter are the next layer (see design note). */}
      {cookList.length > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          <span style={{ ...MONO, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted)' }}>Cooking together:</span>
          {cookList.map(p => (
            <span key={p.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Avatar id={p.id} name={p.name} colorKey={p.avatarColor} initials={p.avatarInitials} size={24} />
              <span style={{ fontSize: 12, color: 'var(--fg)' }}>{p.name}</span>
            </span>
          ))}
        </div>
      )}

      {session.recipeUpdated && !isOver && (
        <div style={{ border: B, borderRadius: 8, padding: '10px 14px', marginBottom: 20, background: 'var(--accent-subtle)', fontSize: 12.5, color: 'var(--fg)', lineHeight: 1.5 }}>
          One of these recipes has been updated since you started cooking. You&apos;re following the version you began with — finish this cook, then start a fresh one to use the latest.
        </div>
      )}

      <div style={{ border: B, borderRadius: 10, overflow: 'hidden' }}>
        <RecipeDisplay recipe={recipe} interactive={interactive} />
      </div>

      <p style={{ ...MONO, fontSize: 10, color: 'var(--muted)', marginTop: 18, lineHeight: 1.6 }}>
        Tick ingredients as you gather them and steps as you finish them. Your progress is saved — close this and pick up where you left off.
      </p>

      {/* ── Fixed footer: progress + endings, always visible while cooking. ──
          Stop (abandon) sits low-key on the left; progress in the middle; Finish
          on the right, becoming prominent once every step is done. */}
      {!isOver && (
        <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, borderTop: B, background: 'var(--surface)', padding: '10px 24px', display: 'flex', alignItems: 'center', gap: 16, zIndex: 50 }}>
          <button onClick={() => endSession('abandoned')} disabled={ending}
            style={{ ...MONO, fontSize: 10.5, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--muted)', background: 'transparent', border: 'none', cursor: ending ? 'default' : 'pointer', flexShrink: 0 }}>
            Stop
          </button>

          {/* Progress: count + bar, takes the middle. */}
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <span style={{ ...MONO, fontSize: 11, color: 'var(--muted)', flexShrink: 0 }}>{doneCount} / {total}</span>
            <div style={{ flex: 1, height: 6, background: 'var(--border)', borderRadius: 999, overflow: 'hidden', minWidth: 60 }}>
              <div style={{ height: '100%', width: `${pct}%`, background: 'var(--accent)', borderRadius: 999, transition: 'width 240ms ease' }} />
            </div>
          </div>

          <button onClick={() => endSession('completed')} disabled={ending}
            style={{ ...MONO, fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', flexShrink: 0,
              color: allStepsDone ? 'var(--bg)' : 'var(--accent)',
              background: allStepsDone ? 'var(--accent)' : 'transparent',
              border: allStepsDone ? 'none' : '1px solid var(--border)',
              borderRadius: 8, padding: allStepsDone ? '10px 20px' : '9px 16px',
              cursor: ending ? 'default' : 'pointer' }}>
            {ending ? 'Finishing…' : allStepsDone ? "Everything's done — finish" : 'Finish'}
          </button>
        </div>
      )}
    </div>
  );
}
