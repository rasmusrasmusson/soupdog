// src/app/my/recipes/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Plus, ExternalLink, Pencil, Archive, ArchiveRestore, Eye, EyeOff,
         Loader2, Bookmark, BookmarkX } from 'lucide-react';
import { formatDuration } from '@/lib/utils';

type Tab = 'created' | 'saved' | 'archived';

interface MyRecipe {
  id: string; slug: string; title: string;
  cuisine: string | null; difficulty: string;
  servings: number; totalTime: number;
  isPublished: boolean; createdAt: string; archivedAt: string | null;
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

// ── Bulk re-specialise: apply newer technique versions across all my recipes ──
// Concepts added after a recipe was created don't retroactively bind. This scans every
// recipe the user authored and groups the proposed changes by TASK-UPDATE (e.g.
// "Slice → Slice cucumber: 3 recipes"). Each task-update is a checkbox (default on);
// "Apply selected" writes the checked ones across all affected recipes. Author-scoped on
// the server — only the user's own recipes are touched.
interface TaskUpdate {
  toTaskId: string; from: string; to: string;
  recipeCount: number; stepCount: number; recipes: string[];
}
function BulkRespecialise() {
  const [updates, setUpdates] = useState<TaskUpdate[] | null>(null);
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/my/recipes/respecialise-all')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (cancelled || !d || (d.taskUpdateCount ?? 0) === 0) return;
        setUpdates(d.taskUpdates ?? []);
        const init: Record<string, boolean> = {};
        for (const u of (d.taskUpdates ?? [])) init[u.toTaskId] = true; // default on
        setChecked(init);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  if (!updates || updates.length === 0) return null;

  const selectedIds = Object.entries(checked).filter(([, v]) => v).map(([k]) => k);

  const apply = async () => {
    if (selectedIds.length === 0) return;
    setBusy(true); setMsg(null);
    try {
      const r = await fetch('/api/my/recipes/respecialise-all?apply=true', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ onlyTaskIds: selectedIds }),
      });
      const d = await r.json();
      if (!r.ok) setMsg(d.error ?? 'Failed');
      else {
        setMsg(`Updated ${d.updated} step${d.updated === 1 ? '' : 's'} across your recipes.`);
        setTimeout(() => window.location.reload(), 900);
      }
    } catch { setMsg('Apply failed'); }
    setBusy(false);
  };

  return (
    <>
      <button onClick={() => setOpen(true)}
        style={{ display: 'flex', alignItems: 'center', gap: 6, border: '1px solid var(--accent)',
          background: 'transparent', color: 'var(--accent)', padding: '7px 16px',
          ...MONO, fontSize: 11, letterSpacing: '0.08em', cursor: 'pointer' }}
        title="Newer technique versions are available for some of your recipes">
        Re-specialise ({updates.length})
      </button>

      {open && (
        <div onClick={() => !busy && setOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 100,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
              width: 'min(560px, 100%)', maxHeight: '80vh', overflow: 'auto', padding: 24, ...MONO }}>
            <h2 className="font-display" style={{ fontSize: 20, fontWeight: 400, color: 'var(--fg)', marginBottom: 6 }}>
              Apply newer technique versions
            </h2>
            <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 18 }}>
              These technique updates can be applied across your recipes. Uncheck any you don't want.
              Each applies to every recipe where it fits.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
              {updates.map(u => (
                <label key={u.toTaskId}
                  style={{ display: 'flex', gap: 12, alignItems: 'flex-start', cursor: 'pointer',
                    border: '1px solid var(--border)', padding: '12px 14px', borderRadius: 8 }}>
                  <input type="checkbox" checked={!!checked[u.toTaskId]}
                    onChange={e => setChecked(c => ({ ...c, [u.toTaskId]: e.target.checked }))}
                    style={{ marginTop: 2, accentColor: 'var(--accent)' }} />
                  <span style={{ flex: 1 }}>
                    <span style={{ fontSize: 13, color: 'var(--fg)' }}>
                      <span style={{ color: 'var(--muted)' }}>{u.from}</span>
                      <span style={{ color: 'var(--accent)' }}> → {u.to}</span>
                    </span>
                    <span style={{ display: 'block', fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                      {u.stepCount} step{u.stepCount === 1 ? '' : 's'} in{' '}
                      <a href={`/my/recipes/affected?task=${encodeURIComponent(u.toTaskId)}`}
                        target="_blank" rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        style={{ color: 'var(--accent)', textDecoration: 'underline' }}>
                        {u.recipeCount} recipe{u.recipeCount === 1 ? '' : 's'} ↗
                      </a>
                    </span>
                  </span>
                </label>
              ))}
            </div>

            {msg && <div style={{ fontSize: 12, color: 'var(--accent)', marginBottom: 14 }}>{msg}</div>}

            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <button onClick={apply} disabled={busy || selectedIds.length === 0}
                style={{ background: 'var(--accent)', color: '#fff', border: 'none', padding: '8px 18px',
                  fontSize: 12, ...MONO, cursor: (busy || selectedIds.length === 0) ? 'default' : 'pointer',
                  opacity: (busy || selectedIds.length === 0) ? 0.5 : 1 }}>
                {busy ? 'Applying…' : `Apply selected (${selectedIds.length})`}
              </button>
              <button onClick={() => setOpen(false)} disabled={busy}
                style={{ background: 'transparent', color: 'var(--muted)', border: 'none', fontSize: 12,
                  ...MONO, cursor: 'pointer', textDecoration: 'underline' }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function MyRecipesPage() {
  const router = useRouter();
  const [banner, setBanner] = useState<{type: 'saved'|'published', title: string}|null>(null);
  const [tab, setTab] = useState<Tab>('created');

  // Read and immediately clear sessionStorage banner — shows once, never again on return
  useEffect(() => {
    const saved     = sessionStorage.getItem('soupdog_saved');
    const published = sessionStorage.getItem('soupdog_published');
    if (saved)     { setBanner({ type: 'saved',     title: saved });     sessionStorage.removeItem('soupdog_saved'); }
    if (published) { setBanner({ type: 'published', title: published }); sessionStorage.removeItem('soupdog_published'); }
  }, []);
  const [recipes, setRecipes]   = useState<MyRecipe[]>([]);
  const [saved, setSaved]       = useState<SavedRecipe[]>([]);
  const [loadingMine, setLoadingMine] = useState(true);
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [archiving,      setArchiving]      = useState<string | null>(null);
  const [confirmArchive, setConfirmArchive] = useState<string | null>(null);
  const [archived,       setArchived]       = useState<MyRecipe[]>([]);
  const [loadingArchived, setLoadingArchived] = useState(false);
  const [restoring,      setRestoring]      = useState<string | null>(null);
  const [mealNote,       setMealNote]       = useState<string | null>(null);
  const [toggling,       setToggling]       = useState<string | null>(null);
  const [unsaving,       setUnsaving]       = useState<string | null>(null);

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

  // Load created recipes once on mount
  useEffect(() => {
    (async () => {
      setLoadingMine(true);
      try {
        const res = await fetch('/api/my/recipes');
        if (res.ok) setRecipes(await res.json());
      } finally { setLoadingMine(false); }
    })();
  }, []);

  // Load archived recipes when that tab is opened (once).
  useEffect(() => {
    if (tab !== 'archived' || archived.length > 0 || loadingArchived) return;
    (async () => {
      setLoadingArchived(true);
      try {
        const res = await fetch('/api/my/recipes?archived=1');
        if (res.ok) setArchived(await res.json());
      } finally { setLoadingArchived(false); }
    })();
  }, [tab, archived.length, loadingArchived]);

  const handleArchive = async (id: string) => {
    setArchiving(id);
    setMealNote(null);
    try {
      const res = await fetch(`/api/my/recipes/${id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      const row = recipes.find(r => r.id === id);
      setRecipes(prev => prev.filter(r => r.id !== id));
      // Drop it into the archived list too (so it shows immediately if opened).
      if (row) setArchived(prev => [{ ...row, archivedAt: new Date().toISOString() }, ...prev.filter(r => r.id !== id)]);
      if (data?.usedInMeals > 0) {
        setMealNote(`Archived. This dish is still used in ${data.usedInMeals} meal${data.usedInMeals === 1 ? '' : 's'} — those meals keep working.`);
      }
    } finally {
      setArchiving(null);
    }
  };

  const handleUnarchive = async (id: string) => {
    setRestoring(id);
    try {
      const res = await fetch(`/api/my/recipes/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unarchive: true }),
      });
      if (res.ok) {
        const row = archived.find(r => r.id === id);
        setArchived(prev => prev.filter(r => r.id !== id));
        if (row) setRecipes(prev => [{ ...row, archivedAt: null }, ...prev.filter(r => r.id !== id)]);
      }
    } finally {
      setRestoring(null);
    }
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
      width: last ? 180 : undefined,
      minWidth: last ? 180 : undefined,
      ...(mono ? { ...MONO, color: 'var(--muted)' } : {}),
    }}>{children}</td>
  );

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-8 py-10">

      {/* Success banner after saving from import page */}
      {banner && (
        <div style={{
          background: 'var(--accent-subtle)', border: '1px solid var(--accent)',
          padding: '10px 16px', marginBottom: 20, display: 'flex',
          alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent)' }}>
            {banner.type === 'saved'
              ? `✓ "${banner.title}" saved as draft — publish it when ready.`
              : `✓ "${banner.title}" is now published.`
            }
          </span>
          <button onClick={() => setBanner(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
            ✕
          </button>
        </div>
      )}

      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 24 }}>
        <h1 className="font-display text-[28px] font-light" style={{ color: 'var(--fg)' }}>
          My Recipes
        </h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <BulkRespecialise />
          <Link href="/my/recipes/import"
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'var(--accent)', color: '#fff',
              padding: '7px 16px', ...MONO, fontSize: 11,
              textDecoration: 'none', letterSpacing: '0.08em',
            }}
            className="hover:opacity-90 transition-opacity"
          >
            <Plus size={12} /> Add recipe
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
        <TabBtn active={tab === 'archived'} onClick={() => setTab('archived')}>
          Archived {archived.length > 0 && `(${archived.length})`}
        </TabBtn>
      </div>

      {mealNote && (
        <div style={{ ...MONO, fontSize: 11, color: 'var(--fg)', background: 'var(--accent-subtle)',
          border: B, padding: '10px 14px', marginBottom: 16, display: 'flex',
          alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span>{mealNote}</span>
          <button onClick={() => setMealNote(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', ...MONO, fontSize: 11 }}>×</button>
        </div>
      )}

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
                <Link href="/my/recipes/import"
                  style={{ ...MONO, fontSize: 11, color: 'var(--accent)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  className="hover:underline">
                  <Plus size={12} /> Add your first recipe
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
                        {/* View / Preview */}
                        <Link href={`/recipes/${r.slug}`} title={r.isPublished ? 'View live' : 'Preview draft'}
                          style={{ padding: 6, color: 'var(--muted)', display: 'flex' }}
                          className="hover:text-[var(--accent)] transition-colors">
                          <ExternalLink size={12} strokeWidth={1.5} />
                        </Link>
                        {/* Edit */}
                        <Link href={`/my/recipes/${r.id}`} title="Edit"
                          style={{ padding: 6, color: 'var(--muted)', display: 'flex' }}
                          className="hover:text-[var(--accent)] transition-colors">
                          <Pencil size={12} strokeWidth={1.5} />
                        </Link>
                        {/* Publish / Unpublish */}
                        <button onClick={() => handleTogglePublish(r.id, r.isPublished)}
                          disabled={toggling === r.id} title={r.isPublished ? 'Unpublish' : 'Publish'}
                          style={{ padding: 6, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}
                          className="hover:text-[var(--accent)] disabled:opacity-40 transition-colors">
                          {toggling === r.id
                            ? <Loader2 size={12} className="animate-spin" />
                            : r.isPublished ? <EyeOff size={12} strokeWidth={1.5} /> : <Eye size={12} strokeWidth={1.5} />
                          }
                        </button>
                        {confirmArchive === r.id ? (
                          <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                            <button onClick={() => setConfirmArchive(null)}
                              style={{ padding: '3px 6px', background: 'none', border: '1px solid var(--border)', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)' }}>
                              Cancel
                            </button>
                            <button onClick={() => { setConfirmArchive(null); handleArchive(r.id); }}
                              style={{ padding: '3px 6px', background: 'var(--accent)', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--bg)' }}>
                              Archive
                            </button>
                          </div>
                        ) : (
                          <button onClick={() => setConfirmArchive(r.id)}
                            disabled={archiving === r.id} title="Archive"
                            style={{ padding: 6, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}
                            className="hover:text-[var(--accent)] disabled:opacity-40 transition-colors">
                            {archiving === r.id
                              ? <Loader2 size={12} className="animate-spin" />
                              : <Archive size={12} strokeWidth={1.5} />
                            }
                          </button>
                        )}
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

      {/* ── ARCHIVED TAB ── */}
      {tab === 'archived' && (
        <>
          {loadingArchived ? (
            <div style={{ display: 'flex', gap: 8, ...MONO, fontSize: 12, color: 'var(--muted)', padding: '48px 0' }}>
              <Loader2 size={14} className="animate-spin" /> Loading…
            </div>
          ) : archived.length === 0 ? (
            <EmptyState icon={<Archive size={32} />} label="Nothing archived" />
          ) : (
            <>
              <p style={{ ...MONO, fontSize: 11, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 16 }}>
                Archived recipes are hidden from your recipe list, browsing and search, but stay
                intact — any meal that uses them keeps working. Restore one to bring it back.
              </p>
              <table style={{ width: '100%', borderCollapse: 'collapse', border: B, fontSize: 12 }}>
                <thead>
                  <tr style={{ background: 'var(--surface-hover)' }}>
                    <TH>Recipe</TH>
                    <TH>Cuisine</TH>
                    <TH>Time</TH>
                    <TH>Servings</TH>
                    <TH last>Actions</TH>
                  </tr>
                </thead>
                <tbody>
                  {archived.map(r => (
                    <tr key={r.id} style={{ borderTop: B }} className="hover:bg-[var(--surface-hover)] transition-colors">
                      <TD><span style={{ color: 'var(--fg)' }}>{r.title}</span></TD>
                      <TD>{r.cuisine ?? '—'}</TD>
                      <TD>{r.totalTime > 0 ? formatDuration(r.totalTime) : '—'}</TD>
                      <TD>{r.servings}</TD>
                      <TD last>
                        <button onClick={() => handleUnarchive(r.id)}
                          disabled={restoring === r.id} title="Restore"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, ...MONO, fontSize: 10,
                            color: 'var(--accent)', border: '1px solid var(--accent)', padding: '4px 9px',
                            background: 'transparent', cursor: restoring === r.id ? 'default' : 'pointer',
                            opacity: restoring === r.id ? 0.5 : 1 }}>
                          {restoring === r.id
                            ? <Loader2 size={11} className="animate-spin" />
                            : <ArchiveRestore size={11} strokeWidth={1.5} />}
                          Restore
                        </button>
                      </TD>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </>
      )}

    </div>
  );
}
