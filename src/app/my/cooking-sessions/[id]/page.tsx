// src/app/my/cooking-sessions/[id]/page.tsx
'use client';

// The active cooking screen — the meal's recipe, shown live. It renders the SAME
// <RecipeDisplay> table (ingredients · tools · procedure) as every other recipe, fed
// from the session's frozen snapshot via snapshotToRecipe. The difference from a
// read-only recipe is only interactivity: the procedure checkboxes are wired to the
// session's per-step progress and persist to the server (resumable across devices).
//
// A meal is a recipe — one list of items. Before a session is started the recipe shows
// without checkboxes (the meal recipe page); once cooking, the same list becomes the
// interactive work order here.

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2, ChevronLeft } from 'lucide-react';
import { RecipeDisplay } from '@/components/recipe/RecipeDisplay';
import { snapshotToRecipe, stepIdsInDisplayOrder } from '@/lib/snapshot-to-recipe';

const MONO = { fontFamily: 'var(--font-mono)' } as const;
const SERIF = { fontFamily: 'var(--font-serif, Georgia, serif)' } as const;
const B = '1px solid var(--border)';

type StepStatus = 'pending' | 'in_progress' | 'done' | 'skipped';
interface StepState { step_id: string; status: StepStatus }
interface Session {
  id: string; mealCanonicalId: string; mealSlug: string | null; title: string;
  status: 'active' | 'paused' | 'completed' | 'abandoned';
  serveTargetTime: string | null; startedAt: string; completedAt: string | null;
  timeline: { totalSeconds: number; scheduled: any[]; hasDurations?: boolean };
  steps: StepState[];
  recipeUpdated: boolean; updatedDishes: string[];
}

export default function ActiveCookingPage() {
  const { id } = useParams<{ id: string }>();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Done-state keyed by step_id, mirrored from the server and updated optimistically.
  const [doneById, setDoneById] = useState<Record<string, boolean>>({});

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

  // Build the recipe from the frozen snapshot — same shape RecipeDisplay renders.
  const recipe = useMemo(
    () => session ? snapshotToRecipe(session.timeline, { title: session.title }) : null,
    [session]
  );
  // checklist index i <-> this step id (snapshotToRecipe preserves order, drops holds).
  const stepIds = useMemo(() => recipe ? stepIdsInDisplayOrder(recipe) : [], [recipe]);

  const persistStep = async (stepId: string, status: StepStatus) => {
    try {
      const res = await fetch(`/api/my/cooking-sessions/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stepId, status }),
      });
      if (!res.ok) await load();
    } catch { await load(); }
  };

  const setSessionStatus = async (sessionStatus: Session['status']) => {
    setSession(s => s ? { ...s, status: sessionStatus } : s);
    await fetch(`/api/my/cooking-sessions/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionStatus }),
    }).catch(() => {});
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
  const allDone = total > 0 && doneCount === total;
  const isFinished = session.status === 'completed';

  // RecipeDisplay's interactive contract: checked[] + toggle(i) by checklist index.
  const interactive = {
    ingChecks: {
      // Ingredient ticking is local-only convenience (not part of session progress).
      checked: recipe.ingredients.map(() => false),
      toggle: () => {},
    },
    stepChecks: {
      checked: stepIds.map(sid => !!doneById[sid]),
      toggle: (i: number) => {
        if (isFinished) return;
        const sid = stepIds[i];
        if (!sid) return;
        const next = !doneById[sid];
        setDoneById(m => ({ ...m, [sid]: next }));            // optimistic
        persistStep(sid, next ? 'done' : 'pending');
      },
    },
    servings: recipe.servings,
  };

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-8 py-8 md:py-10">
      {/* Breadcrumb / back to the recipe */}
      <div style={{ ...MONO, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
        <Link href={`/my/meals/${session.mealCanonicalId}/recipe`} style={{ color: 'var(--muted)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }} className="hover:text-[var(--accent)]">
          <ChevronLeft size={12} /> Recipe
        </Link>
      </div>

      {/* Title + progress */}
      <h1 style={{ ...SERIF, fontSize: 30, lineHeight: 1.15, marginBottom: 4, color: 'var(--fg)' }}>{session.title}</h1>
      <div style={{ ...MONO, fontSize: 11, color: 'var(--muted)', marginBottom: 12 }}>
        {isFinished ? 'Finished' : session.status === 'paused' ? 'Paused' : 'Cooking now'} · {doneCount} of {total} steps done
      </div>
      <div style={{ height: 6, background: 'var(--border)', borderRadius: 999, overflow: 'hidden', marginBottom: 20 }}>
        <div style={{ height: '100%', width: `${pct}%`, background: 'var(--accent)', borderRadius: 999, transition: 'width 240ms ease' }} />
      </div>

      {/* "Recipe updated" notice — the session keeps its frozen list; this just informs. */}
      {session.recipeUpdated && (
        <div style={{ border: B, borderRadius: 8, padding: '10px 14px', marginBottom: 20, background: 'var(--accent-subtle)', fontSize: 12.5, color: 'var(--fg)', lineHeight: 1.5 }}>
          One of these recipes has been updated since you started cooking. You&apos;re following the version you began with — finish this cook, then start a fresh one to use the latest.
        </div>
      )}

      {allDone && !isFinished && (
        <button onClick={() => setSessionStatus('completed')}
          style={{ width: '100%', marginBottom: 20, padding: '12px', border: 'none', borderRadius: 8, background: 'var(--accent)', color: 'var(--bg)', ...MONO, fontSize: 12, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer' }}>
          Everything&apos;s done — finish cooking
        </button>
      )}
      {isFinished && (
        <div style={{ border: B, borderRadius: 8, padding: '14px', marginBottom: 20, textAlign: 'center', ...MONO, fontSize: 12, color: 'var(--accent)' }}>
          ✓ Cooked and done. Enjoy!
        </div>
      )}

      {/* The recipe, live. Same table as everywhere — interactive checkboxes wired to
          session progress. Bordered to match the recipe page's central column. */}
      <div style={{ border: B, borderRadius: 10, overflow: 'hidden' }}>
        <RecipeDisplay recipe={recipe} interactive={interactive} />
      </div>

      {/* Pause / resume */}
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
        Tick a step as you finish it. Your progress is saved — you can close this and pick up where you left off.
      </p>
    </div>
  );
}
