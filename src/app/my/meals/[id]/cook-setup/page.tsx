// src/app/my/meals/[id]/cook-setup/page.tsx
'use client';

// Setup / planning mode — the stage between viewing a recipe and cooking it. The
// organiser confirms who's EATING and who's COOKING, and (optionally) divides the
// tasks among the cooks. Pressing "Start cooking" creates the session carrying those
// choices, then opens the live cooking screen.
//
// Scope (deliberate, AI-free, no Sharing & Delegation): cooks are people you OWN
// (self + managed household), via the existing owned-persons endpoint. Multi-device
// participation, skill-based time estimates, and efficiency warnings are later layers
// (see the cooking design note) — the data seams are kept open here.

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2, ChevronLeft, ChefHat, Users, Plus, Check } from 'lucide-react';
import { Avatar } from '@/components/people/Avatar';

const MONO = { fontFamily: 'var(--font-mono)' } as const;
const SERIF = { fontFamily: 'var(--font-serif, Georgia, serif)' } as const;
const B = '1px solid var(--border)';

interface MergedStep { id: string; dishTitle: string; type: string; instruction: string; isHold: boolean }
interface Person { id: string; name: string; avatarColor: string | null; avatarInitials: string | null }

export default function CookSetupPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [title, setTitle] = useState('Meal');
  const [steps, setSteps] = useState<MergedStep[]>([]);
  const [owned, setOwned] = useState<Person[]>([]);     // people you can add as cooks
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  // Selected cooks (person ids). Assignments: stepId -> personId.
  const [cooks, setCooks] = useState<string[]>([]);
  const [assignments, setAssignments] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const [recipeRes, peopleRes] = await Promise.all([
        fetch(`/api/my/meals/${id}/recipe`),
        fetch('/api/my/meal-plan/group'),
      ]);
      if (!recipeRes.ok) { setError('Could not load this meal.'); return; }
      const r = await recipeRes.json();
      setTitle(r.title ?? 'Meal');
      const merged: MergedStep[] = (r.merged?.scheduled ?? []).filter((s: any) => !s.isHold && s.type !== 'hold');
      setSteps(merged);
      if (peopleRes.ok) {
        const { people } = await peopleRes.json();
        setOwned(people ?? []);
        // Default the lead cook = the first owned person (self).
        if ((people ?? []).length) setCooks([people[0].id]);
      }
    } catch { setError('Could not load this meal.'); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const personById = useMemo(() => {
    const m: Record<string, Person> = {};
    for (const p of owned) m[p.id] = p;
    return m;
  }, [owned]);

  const toggleCook = (pid: string) => {
    setCooks(cs => cs.includes(pid) ? cs.filter(x => x !== pid) : [...cs, pid]);
    // If a removed cook had tasks, unassign them.
    setAssignments(a => {
      if (cooks.includes(pid)) {
        const next = { ...a };
        for (const k of Object.keys(next)) if (next[k] === pid) delete next[k];
        return next;
      }
      return a;
    });
  };

  const assignStep = (stepId: string, pid: string | null) => {
    setAssignments(a => {
      const next = { ...a };
      if (pid) next[stepId] = pid; else delete next[stepId];
      return next;
    });
  };

  const start = async () => {
    if (starting) return;
    setStarting(true); setError(null);
    try {
      const res = await fetch('/api/my/cooking-sessions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mealId: id, cooks, assignments }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.id) { setError(data.error ?? 'Could not start cooking.'); setStarting(false); return; }
      router.push(`/my/cooking-sessions/${data.id}`);
    } catch { setError('Could not start cooking.'); setStarting(false); }
  };

  if (loading) {
    return <div className="max-w-3xl mx-auto px-4 md:px-8 py-16" style={{ ...MONO, fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 8 }}>
      <Loader2 size={14} className="animate-spin" /> Loading…
    </div>;
  }

  const cookPeople = cooks.map(id => personById[id]).filter(Boolean) as Person[];
  const multipleCooks = cookPeople.length > 1;

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-8 py-8 md:py-10" style={{ paddingBottom: 96 }}>
      <div style={{ ...MONO, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
        <Link href={`/my/meals/${id}/recipe`} style={{ color: 'var(--muted)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }} className="hover:text-[var(--accent)]">
          <ChevronLeft size={12} /> Recipe
        </Link>
      </div>

      <h1 style={{ ...SERIF, fontSize: 30, lineHeight: 1.15, marginBottom: 4, color: 'var(--fg)' }}>{title}</h1>
      <p style={{ ...MONO, fontSize: 11, color: 'var(--muted)', marginBottom: 28 }}>Set up your cook — who's helping, and who does what.</p>

      {error && <div style={{ border: '1px solid #d8a39a', background: '#f7ece9', borderRadius: 8, padding: '10px 14px', marginBottom: 20, fontSize: 12.5, color: '#9a3b2c' }}>{error}</div>}

      {/* ── Cooks ── */}
      <section style={{ marginBottom: 32 }}>
        <div style={{ ...MONO, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          <ChefHat size={12} /> Who's cooking
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {owned.map(p => {
            const on = cooks.includes(p.id);
            return (
              <button key={p.id} onClick={() => toggleCook(p.id)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 12px 6px 6px', borderRadius: 999, border: on ? '1px solid var(--accent)' : B, background: on ? 'var(--accent-subtle)' : 'transparent', cursor: 'pointer' }}>
                <Avatar id={p.id} name={p.name} colorKey={p.avatarColor} initials={p.avatarInitials} size={26} />
                <span style={{ fontSize: 13, color: 'var(--fg)' }}>{p.name}</span>
                {on && <Check size={13} style={{ color: 'var(--accent)' }} />}
              </button>
            );
          })}
          {owned.length === 0 && (
            <p style={{ fontSize: 12.5, color: 'var(--muted)' }}>
              Just you for now. <Link href="/my/people" style={{ color: 'var(--accent)' }}>Add people</Link> to cook together.
            </p>
          )}
        </div>
      </section>

      {/* ── Task assignment (only meaningful with >1 cook) ── */}
      {multipleCooks && (
        <section style={{ marginBottom: 32 }}>
          <div style={{ ...MONO, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Users size={12} /> Divide the tasks <span style={{ textTransform: 'none', letterSpacing: 0, color: '#b3b0a8' }}>— optional; unassigned tasks are shared</span>
          </div>
          <div style={{ borderTop: B }}>
            {steps.map((s, i) => (
              <div key={s.id} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 2px', borderBottom: B }}>
                <span style={{ ...MONO, fontSize: 11, color: '#b3b0a8', width: 20, textAlign: 'right', flexShrink: 0 }}>{i + 1}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ ...MONO, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 2 }}>{s.dishTitle}</div>
                  <div style={{ fontSize: 13.5, color: 'var(--fg)', lineHeight: 1.5 }}>{s.instruction}</div>
                </div>
                {/* Assignee picker — small avatar row; tap to assign/cycle. */}
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  {cookPeople.map(p => {
                    const on = assignments[s.id] === p.id;
                    return (
                      <button key={p.id} title={`Assign to ${p.name}`}
                        onClick={() => assignStep(s.id, on ? null : p.id)}
                        style={{ borderRadius: 999, border: on ? '2px solid var(--accent)' : '2px solid transparent', padding: 0, background: 'none', cursor: 'pointer', opacity: on ? 1 : 0.5 }}>
                        <Avatar id={p.id} name={p.name} colorKey={p.avatarColor} initials={p.avatarInitials} size={26} />
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Start bar (sticky) ── */}
      <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, borderTop: B, background: 'var(--surface)', padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 50 }}>
        <span style={{ ...MONO, fontSize: 11, color: 'var(--muted)' }}>
          {cookPeople.length <= 1 ? 'Cooking solo' : `${cookPeople.length} cooks`}
          {multipleCooks && ` · ${Object.keys(assignments).length}/${steps.length} tasks assigned`}
        </span>
        <button onClick={start} disabled={starting}
          style={{ ...MONO, fontSize: 12, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--bg)', background: 'var(--accent)', border: 'none', borderRadius: 8, padding: '11px 22px', cursor: starting ? 'default' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          {starting ? <Loader2 size={14} className="animate-spin" /> : <ChefHat size={14} />} Start cooking
        </button>
      </div>
    </div>
  );
}
