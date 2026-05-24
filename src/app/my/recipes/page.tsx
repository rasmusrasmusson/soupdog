// src/app/my/recipes/page.tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, ExternalLink, Pencil, Trash2, Eye, EyeOff, Loader2 } from 'lucide-react';
import { formatDuration } from '@/lib/utils';

interface MyRecipe {
  id:          string;
  slug:        string;
  title:       string;
  cuisine:     string | null;
  difficulty:  string;
  servings:    number;
  totalTime:   number;
  isPublished: boolean;
  createdAt:   string;
}

export default function MyRecipesPage() {
  const [recipes,  setRecipes]  = useState<MyRecipe[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/my/recipes');
      if (res.ok) setRecipes(await res.json());
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;
    setDeleting(id);
    await fetch(`/api/my/recipes/${id}`, { method: 'DELETE' });
    setRecipes(prev => prev.filter(r => r.id !== id));
    setDeleting(null);
  };

  const handleTogglePublish = async (id: string, current: boolean) => {
    setToggling(id);
    await fetch(`/api/my/recipes/${id}/publish`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ publish: !current }),
    });
    setRecipes(prev => prev.map(r => r.id === id ? { ...r, isPublished: !current } : r));
    setToggling(null);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-8 py-10">

      {/* Header */}
      <div className="flex items-baseline justify-between mb-8">
        <h1 className="font-display text-[28px] font-light text-[var(--fg)]">My Recipes</h1>
        <Link
          href="/my/recipes/new"
          className="flex items-center gap-2 bg-[var(--accent)] text-white px-4 py-2 text-[12px] font-mono hover:bg-[var(--accent-mid)] transition-colors tracking-wide"
        >
          <Plus size={13} /> New recipe
        </Link>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-[var(--muted)] text-[12px] font-mono py-12">
          <Loader2 size={14} className="animate-spin" /> Loading…
        </div>
      ) : recipes.length === 0 ? (
        <div className="border border-dashed border-[var(--border)] py-16 text-center">
          <p className="font-mono text-[11px] uppercase tracking-widest text-[var(--muted)] mb-4">
            No recipes yet
          </p>
          <Link href="/my/recipes/new"
            className="inline-flex items-center gap-2 text-[11px] font-mono text-[var(--accent)] hover:underline">
            <Plus size={12} /> Create your first recipe
          </Link>
        </div>
      ) : (
        <table className="w-full text-[12px]" style={{ borderCollapse: 'collapse', border: '1px solid var(--border)' }}>
          <thead>
            <tr style={{ background: 'var(--surface-hover)' }}>
              {['Recipe', 'Cuisine', 'Time', 'Servings', 'Status', ''].map((h, i, arr) => (
                <th key={h + i} style={{
                  padding: '7px 14px',
                  fontFamily: 'var(--font-mono)', fontSize: 9,
                  textTransform: 'uppercase', letterSpacing: '0.18em', color: 'var(--muted)',
                  textAlign: 'left',
                  borderRight: i < arr.length - 1 ? '1px solid var(--border)' : undefined,
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {recipes.map(r => (
              <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}
                className="hover:bg-[var(--surface-hover)] transition-colors">
                <td style={{ padding: '10px 14px', borderRight: '1px solid var(--border)', fontWeight: 500 }}>
                  <Link href={`/my/recipes/${r.id}/edit`}
                    className="hover:text-[var(--accent)] transition-colors"
                    style={{ color: 'var(--fg)', textDecoration: 'none' }}>
                    {r.title}
                  </Link>
                </td>
                <td style={{ padding: '10px 14px', borderRight: '1px solid var(--border)', color: 'var(--muted)' }}>
                  {r.cuisine ?? '—'}
                </td>
                <td style={{ padding: '10px 14px', borderRight: '1px solid var(--border)', fontFamily: 'var(--font-mono)', color: 'var(--muted)' }}>
                  {formatDuration(r.totalTime)}
                </td>
                <td style={{ padding: '10px 14px', borderRight: '1px solid var(--border)', fontFamily: 'var(--font-mono)', color: 'var(--muted)' }}>
                  {r.servings}
                </td>
                <td style={{ padding: '10px 14px', borderRight: '1px solid var(--border)' }}>
                  <span className={`font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 border ${
                    r.isPublished
                      ? 'border-[var(--accent)] text-[var(--accent)] bg-[var(--accent-subtle)]'
                      : 'border-[var(--border)] text-[var(--muted)]'
                  }`}>
                    {r.isPublished ? 'Published' : 'Draft'}
                  </span>
                </td>
                <td style={{ padding: '8px 12px' }}>
                  <div className="flex items-center gap-1">
                    {r.isPublished && (
                      <Link href={`/recipes/${r.slug}`} title="View live"
                        className="p-1.5 text-[var(--muted)] hover:text-[var(--accent)] transition-colors">
                        <ExternalLink size={12} strokeWidth={1.5} />
                      </Link>
                    )}
                    <Link href={`/my/recipes/${r.id}/edit`} title="Edit"
                      className="p-1.5 text-[var(--muted)] hover:text-[var(--accent)] transition-colors">
                      <Pencil size={12} strokeWidth={1.5} />
                    </Link>
                    <button
                      onClick={() => handleTogglePublish(r.id, r.isPublished)}
                      disabled={toggling === r.id}
                      title={r.isPublished ? 'Unpublish' : 'Publish'}
                      className="p-1.5 text-[var(--muted)] hover:text-[var(--accent)] disabled:opacity-40 transition-colors"
                    >
                      {toggling === r.id
                        ? <Loader2 size={12} className="animate-spin" />
                        : r.isPublished ? <EyeOff size={12} strokeWidth={1.5} /> : <Eye size={12} strokeWidth={1.5} />
                      }
                    </button>
                    <button
                      onClick={() => handleDelete(r.id, r.title)}
                      disabled={deleting === r.id}
                      title="Delete"
                      className="p-1.5 text-[var(--muted)] hover:text-[var(--error)] disabled:opacity-40 transition-colors"
                    >
                      {deleting === r.id
                        ? <Loader2 size={12} className="animate-spin" />
                        : <Trash2 size={12} strokeWidth={1.5} />
                      }
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
