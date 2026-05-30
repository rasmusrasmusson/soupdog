// src/app/my/recipes/page.tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, ExternalLink, Pencil, Trash2, Eye, EyeOff, Sparkles,
         Loader2, Bookmark, BookmarkX, Sparkles } from 'lucide-react';
import { formatDuration } from '@/lib/utils';

type Tab = 'created' | 'saved';

interface MyRecipe {
  id: string; slug: string; title: string;
  cuisine: string | null; difficulty: string;
  servings: number; totalTime: number;
  isPublished: boolean; createdAt: string;
}

interface SavedRecipe {
  saveId: string; canonicalId: string; slug: string;
  title: string; cuisine: string | null;
  difficulty: string; totalTime: number;
  savedAt: string;
}

const MONO = { fontFamily: 'var(--font-mono)' } as const;
const B = '1px solid var(--border)';

function TabBtn({ active, onClick, children }: {
  active: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button onClick={onClick} style={{
      ...MONO, fontSize: 11, padding: '6px 16px',
      border: 'none',
      borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
      color: active ? 'var(--accent)' : 'var(--muted)',
      background: 'none',
      cursor: 'pointer', fontWeight: active ? 600 : 400,
      textTransform: 'uppercase' as const, letterSpacing: '0.12em',
      transition: 'all 0.15s',
    }}>
      {children}
    </button>
  );
}

function EmptyState({ icon, label, action }: {
  icon: React.ReactNode; label: string; action?: React.ReactNode;
}) {
  return (
    <div style={{
      border: `1px dashed var(--border)`, padding: '48px 24px',
      textAlign: 'center', color: 'var(--muted)',
    }}>
      <div style={{ marginBottom: 12, opacity: 0.4 }}>{icon}</div>
      <p style={{ ...MONO, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: 12 }}>
        {label}
      </p>
      {action}
    </div>
  );
}

export default function MyRecipesPage() {
  const [tab, setTab]           = useState<Tab>('saved');
  const [recipes, setRecipes]   = useState<MyRecipe[]>([]);
  const [saved, setSaved]       = useState<SavedRecipe[]>([]);
  const [loadingMine, setLoadingMine] = useState(true);
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const [unsaving, setUnsaving] = useState<string | null>(null);

  // Load saved on mount (default tab) + on tab switch
  useEffect(() => {
    (async () => {
      setLoadingSaved(true);
      try {
        const res = await fetch('/api/my/saved-recipes');
        if (res.ok) setSaved(await res.json());
      } finally { setLoadingSaved(false); }
    })();
  }, []);

  // Load created recipes lazily when tab switches
  useEffect(() => {
    if (tab !== 'created' || recipes.length > 0) return;
    (async () => {
      setLoadingMine(true);
      try {
        const res = await fetch('/api/my/recipes');
        if (res.ok) setRecipes(await res.json());
      } finally { setLoadingMine(false); }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

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

  const handleUnsave = async (saveId: string, canonicalId: string) => {
    setUnsaving(canonicalId);
    await fetch(`/api/my/saved-recipes/${canonicalId}`, { method: 'DELETE' });
    setSaved(prev => prev.filter(s => s.saveId !== saveId));
    setUnsaving(null);
  };

  const TH = ({ children, last }: { children: React.ReactNode; last?: boolean }) => (
    <th style={{
      padding: '7px 14px', ...MONO, fontSize: 9,
      textTransform: 'uppercase' as const, letterSpacing: '0.18em',
      color: 'var(--muted)', textAlign: 'left' as const,
      borderRight: last ? undefined : B,
    }}>{children}</th>
  );

  const TD = ({ children, mono, last }: {
    children: React.ReactNode; mono?: boolean; last?: boolean;
  }) => (
    <td style={{
      padding: '10px 14px',
      borderRight: last ? undefined : B,
      ...(mono ? { ...MONO, color: 'var(--muted)' } : {}),
    }}>{children}</td>
  );

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-8 py-10">

      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 24 }}>
        <h1 className="font-display text-[28px] font-light" style={{ color: 'var(--fg)' }}>
          My Recipes
        </h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href="/my/recipes/import"
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              border: B, background: 'none', color: 'var(--fg)',
              padding: '7px 14px', ...MONO, fontSize: 11,
              textDecoration: 'none', letterSpacing: '0.08em',
            }}
            className="hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
          >
            <Sparkles size={12} /> Import
          </Link>
          <Link href="/my/recipes/new"
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'var(--accent)', color: '#fff',
              padding: '7px 14px', ...MONO, fontSize: 11,
              textDecoration: 'none', letterSpacing: '0.08em',
            }}
            className="hover:opacity-90 transition-opacity"
          >
            <Plus size={12} /> New recipe
          </Link>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ borderBottom: B, marginBottom: 24, display: 'flex', gap: 0 }}>
        <TabBtn active={tab === 'saved'} onClick={() => setTab('saved')}>
          Saved {saved.length > 0 && `(${saved.length})`}
        </TabBtn>
        <TabBtn active={tab === 'created'} onClick={() => setTab('created')}>
          Created {recipes.length > 0 && `(${recipes.length})`}
        </TabBtn>
      </div>

      {/* ── MY RECIPES TAB ── */}
      {tab === 'created' && (
        <>
          {loadingMine ? (
            <div style={{ display: 'flex', gap: 8, ...MONO, fontSize: 12, color: 'var(--muted)', padding: '48px 0' }}>
              <Loader2 size={14} className="animate-spin" /> Loading…
            </div>
          ) : recipes.length === 0 ? (
            <EmptyState
              icon={<Plus size={32} />}
              label="No recipes yet"
              action={
                <Link href="/my/recipes/new"
                  style={{ ...MONO, fontSize: 11, color: 'var(--accent)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  className="hover:underline">
                  <Plus size={12} /> Create your first recipe
                </Link>
              }
            />
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', border: B, fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--surface-hover)' }}>
                  <TH>Recipe</TH>
                  <TH>Cuisine</TH>
                  <TH>Time</TH>
                  <TH>Servings</TH>
                  <TH>Status</TH>
                  <TH last>Actions</TH>
                </tr>
              </thead>
              <tbody>
                {recipes.map(r => (
                  <tr key={r.id} style={{ borderTop: B }} className="hover:bg-[var(--surface-hover)] transition-colors">
                    <TD>
                      <Link href={`/my/recipes/${r.id}/edit`}
                        style={{ color: 'var(--fg)', textDecoration: 'none', fontWeight: 500 }}
                        className="hover:text-[var(--accent)] transition-colors">
                        {r.title}
                      </Link>
                    </TD>
                    <TD mono>{r.cuisine ?? '—'}</TD>
                    <TD mono>{formatDuration(r.totalTime)}</TD>
                    <TD mono>{r.servings}</TD>
                    <TD>
                      <span style={{
                        ...MONO, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em',
                        padding: '2px 8px', border: B,
                        borderColor: r.isPublished ? 'var(--accent)' : 'var(--border)',
                        color: r.isPublished ? 'var(--accent)' : 'var(--muted)',
                        background: r.isPublished ? 'var(--accent-subtle)' : 'transparent',
                      }}>
                        {r.isPublished ? 'Published' : 'Draft'}
                      </span>
                    </TD>
                    <TD last>
                      <div style={{ display: 'flex', gap: 2 }}>
                        {r.isPublished && (
                          <Link href={`/recipes/${r.slug}`} title="View live"
                            style={{ padding: 6, color: 'var(--muted)', display: 'flex' }}
                            className="hover:text-[var(--accent)] transition-colors">
                            <ExternalLink size={12} strokeWidth={1.5} />
                          </Link>
                        )}
                        <Link href={`/my/recipes/${r.id}/edit`} title="Edit"
                          style={{ padding: 6, color: 'var(--muted)', display: 'flex' }}
                          className="hover:text-[var(--accent)] transition-colors">
                          <Pencil size={12} strokeWidth={1.5} />
                        </Link>
                        <button onClick={() => handleTogglePublish(r.id, r.isPublished)}
                          disabled={toggling === r.id} title={r.isPublished ? 'Unpublish' : 'Publish'}
                          style={{ padding: 6, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}
                          className="hover:text-[var(--accent)] disabled:opacity-40 transition-colors">
                          {toggling === r.id
                            ? <Loader2 size={12} className="animate-spin" />
                            : r.isPublished ? <EyeOff size={12} strokeWidth={1.5} /> : <Eye size={12} strokeWidth={1.5} />
                          }
                        </button>
                        <button onClick={() => handleDelete(r.id, r.title)}
                          disabled={deleting === r.id} title="Delete"
                          style={{ padding: 6, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}
                          className="hover:text-red-500 disabled:opacity-40 transition-colors">
                          {deleting === r.id
                            ? <Loader2 size={12} className="animate-spin" />
                            : <Trash2 size={12} strokeWidth={1.5} />
                          }
                        </button>
                      </div>
                    </TD>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      {/* ── SAVED TAB ── */}
      {tab === 'saved' && (
        <>
          {loadingSaved ? (
            <div style={{ display: 'flex', gap: 8, ...MONO, fontSize: 12, color: 'var(--muted)', padding: '48px 0' }}>
              <Loader2 size={14} className="animate-spin" /> Loading…
            </div>
          ) : saved.length === 0 ? (
            <EmptyState
              icon={<Bookmark size={32} />}
              label="No saved recipes yet"
              action={
                <Link href="/recipes"
                  style={{ ...MONO, fontSize: 11, color: 'var(--accent)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  className="hover:underline">
                  Browse recipes →
                </Link>
              }
            />
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', border: B, fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--surface-hover)' }}>
                  <TH>Recipe</TH>
                  <TH>Cuisine</TH>
                  <TH>Time</TH>
                  <TH>Saved</TH>
                  <TH last>{''}</TH>
                </tr>
              </thead>
              <tbody>
                {saved.map(r => (
                  <tr key={r.saveId} style={{ borderTop: B }} className="hover:bg-[var(--surface-hover)] transition-colors">
                    <TD>
                      <Link href={`/recipes/${r.slug}`}
                        style={{ color: 'var(--fg)', textDecoration: 'none', fontWeight: 500 }}
                        className="hover:text-[var(--accent)] transition-colors">
                        {r.title}
                      </Link>
                    </TD>
                    <TD mono>{r.cuisine ?? '—'}</TD>
                    <TD mono>{formatDuration(r.totalTime)}</TD>
                    <TD mono>
                      {new Date(r.savedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </TD>
                    <TD last>
                      <div style={{ display: 'flex', gap: 2 }}>
                        <Link href={`/recipes/${r.slug}`} title="View recipe"
                          style={{ padding: 6, color: 'var(--muted)', display: 'flex' }}
                          className="hover:text-[var(--accent)] transition-colors">
                          <ExternalLink size={12} strokeWidth={1.5} />
                        </Link>
                        <button onClick={() => handleUnsave(r.saveId, r.canonicalId)}
                          disabled={unsaving === r.canonicalId} title="Remove from saved"
                          style={{ padding: 6, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}
                          className="hover:text-red-500 disabled:opacity-40 transition-colors">
                          {unsaving === r.canonicalId
                            ? <Loader2 size={12} className="animate-spin" />
                            : <BookmarkX size={12} strokeWidth={1.5} />
                          }
                        </button>
                      </div>
                    </TD>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

    </div>
  );
}
