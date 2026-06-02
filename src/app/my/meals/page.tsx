// src/app/my/meals/page.tsx
'use client';

// Meals browse — a meal is a recipe at composition_level='meal'. This is one of
// the two filtered views of the single recipe catalogue (Dishes is the other,
// = the existing /my/recipes). Create a meal, then compose it in the editor.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Plus, Pencil, Trash2, BookOpen, Loader2, UtensilsCrossed } from 'lucide-react';

interface MyMeal {
  id: string; slug: string; title: string;
  cuisine: string | null; servings: number | null;
  isPublished: boolean; createdAt: string;
  componentCount: number; dishes: number; sides: number; drinks: number;
}

const MONO = { fontFamily: 'var(--font-mono)' } as const;
const B = '1px solid var(--border)';

export default function MyMealsPage() {
  const router = useRouter();
  const [meals, setMeals] = useState<MyMeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/my/meals');
        if (res.ok) setMeals(await res.json());
      } finally { setLoading(false); }
    })();
  }, []);

  async function createMeal() {
    setCreating(true);
    try {
      const res = await fetch('/api/my/meals', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'New meal' }),
      });
      if (res.ok) {
        const { id } = await res.json();
        router.push(`/my/meals/${id}`);
      }
    } finally { setCreating(false); }
  }

  async function handleDelete(id: string) {
    setDeleting(id);
    try {
      await fetch(`/api/my/meals/${id}`, { method: 'DELETE' });
      setMeals(prev => prev.filter(m => m.id !== id));
    } finally { setDeleting(null); }
  }

  function compositionLabel(m: MyMeal): string {
    const parts: string[] = [];
    if (m.dishes) parts.push(`${m.dishes} dish${m.dishes > 1 ? 'es' : ''}`);
    if (m.sides)  parts.push(`${m.sides} side${m.sides > 1 ? 's' : ''}`);
    if (m.drinks) parts.push(`${m.drinks} drink${m.drinks > 1 ? 's' : ''}`);
    return parts.length ? parts.join(' · ') : 'empty';
  }

  const TH = ({ children, last }: { children: React.ReactNode; last?: boolean }) => (
    <th style={{ padding: '7px 14px', ...MONO, fontSize: 9, textTransform: 'uppercase' as const,
      letterSpacing: '0.18em', color: 'var(--muted)', textAlign: 'left' as const,
      borderRight: last ? undefined : B }}>{children}</th>
  );
  const TD = ({ children, mono, last }: { children: React.ReactNode; mono?: boolean; last?: boolean }) => (
    <td style={{ padding: '10px 14px', borderRight: last ? undefined : B,
      width: last ? 150 : undefined, minWidth: last ? 150 : undefined,
      ...(mono ? { ...MONO, color: 'var(--muted)' } : {}) }}>{children}</td>
  );

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-8 py-10">
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
        <h1 className="font-display text-[28px] font-light" style={{ color: 'var(--fg)' }}>Meals</h1>
        <button onClick={createMeal} disabled={creating}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--accent)', color: '#fff',
            padding: '7px 16px', ...MONO, fontSize: 11, border: 'none', cursor: 'pointer', letterSpacing: '0.08em' }}
          className="hover:opacity-90 transition-opacity disabled:opacity-50">
          {creating ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} New meal
        </button>
      </div>
      <p style={{ ...MONO, fontSize: 11, color: 'var(--muted)', marginBottom: 24, lineHeight: 1.7, letterSpacing: '0.04em' }}>
        A meal is several dishes, sides and drinks served together — Soupdog turns it into one recipe.
      </p>

      {loading ? (
        <div style={{ display: 'flex', gap: 8, ...MONO, fontSize: 12, color: 'var(--muted)', padding: '48px 0' }}>
          <Loader2 size={14} className="animate-spin" /> Loading…
        </div>
      ) : meals.length === 0 ? (
        <div style={{ border: `1px dashed var(--border)`, padding: '48px 24px', textAlign: 'center', color: 'var(--muted)' }}>
          <div style={{ marginBottom: 12, opacity: 0.4, display: 'flex', justifyContent: 'center' }}><UtensilsCrossed size={32} /></div>
          <p style={{ ...MONO, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: 12 }}>No meals yet</p>
          <button onClick={createMeal} disabled={creating}
            style={{ ...MONO, fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none',
              cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}
            className="hover:underline">
            <Plus size={12} /> Compose your first meal
          </button>
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', border: B, fontSize: 12 }}>
          <thead>
            <tr style={{ background: 'var(--surface-hover)' }}>
              <TH>Meal</TH><TH>Composition</TH><TH>Cuisine</TH><TH last>Actions</TH>
            </tr>
          </thead>
          <tbody>
            {meals.map(m => (
              <tr key={m.id} style={{ borderTop: B }} className="hover:bg-[var(--surface-hover)] transition-colors">
                <TD>
                  <Link href={`/my/meals/${m.id}`} style={{ color: 'var(--fg)', textDecoration: 'none', fontWeight: 500 }}
                    className="hover:text-[var(--accent)] transition-colors">{m.title}</Link>
                </TD>
                <TD mono>{compositionLabel(m)}</TD>
                <TD mono>{m.cuisine ?? '—'}</TD>
                <TD last>
                  <div style={{ display: 'flex', gap: 2 }}>
                    <Link href={`/my/meals/${m.id}/recipe`} title="View unified recipe"
                      style={{ padding: 6, color: 'var(--muted)', display: 'flex' }}
                      className="hover:text-[var(--accent)] transition-colors">
                      <BookOpen size={12} strokeWidth={1.5} />
                    </Link>
                    <Link href={`/my/meals/${m.id}`} title="Edit"
                      style={{ padding: 6, color: 'var(--muted)', display: 'flex' }}
                      className="hover:text-[var(--accent)] transition-colors">
                      <Pencil size={12} strokeWidth={1.5} />
                    </Link>
                    {confirmDelete === m.id ? (
                      <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                        <button onClick={() => setConfirmDelete(null)}
                          style={{ padding: '3px 6px', background: 'none', border: '1px solid var(--border)', cursor: 'pointer', ...MONO, fontSize: 9, color: 'var(--muted)' }}>Cancel</button>
                        <button onClick={() => { setConfirmDelete(null); handleDelete(m.id); }}
                          style={{ padding: '3px 6px', background: '#ef4444', border: 'none', cursor: 'pointer', ...MONO, fontSize: 9, color: '#fff' }}>Delete</button>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmDelete(m.id)} disabled={deleting === m.id} title="Delete"
                        style={{ padding: 6, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}
                        className="hover:text-red-500 disabled:opacity-40 transition-colors">
                        {deleting === m.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} strokeWidth={1.5} />}
                      </button>
                    )}
                  </div>
                </TD>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
