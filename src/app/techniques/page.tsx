// src/app/techniques/page.tsx
'use client';
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

type Task = {
  id: string;
  slug: string | null;
  name: string;
  category: string | null;
  description: string | null;
  completion_type: string | null;
  completion_target: string | null;
  heat_mechanism: string | null;
  heat_medium: string | null;
  min_duration_seconds: number | null;
  max_duration_seconds: number | null;
  is_verified: boolean;
  archived_at: string | null;
};

// Human label for a category slug (falls back to the slug itself, prettified).
const CATEGORY_LABELS: Record<string, string> = {
  boil: 'Boiling & Simmering', simmer: 'Boiling & Simmering',
  steam: 'Steaming', fry: 'Frying & Sautéing', oven: 'Oven',
  grill: 'Grilling', braise: 'Braising & Stewing', pressure: 'Pressure',
  appliance: 'Appliances', knife_cuts: 'Knife Cuts', prepare: 'Preparation',
  mix: 'Mixing', measure: 'Measuring', transfer: 'Transferring',
  finish: 'Finishing', passive: 'Resting & Waiting', clean: 'Cleaning',
};
const prettify = (s: string) =>
  s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
const categoryLabel = (c: string | null) =>
  !c ? 'Other' : (CATEGORY_LABELS[c] ?? prettify(c));

function fmtDur(a: number | null, b: number | null): string {
  if (!a && !b) return '';
  const m = (s: number) => s % 3600 === 0 ? `${s / 3600}h` : s % 60 === 0 ? `${s / 60}m` : `${s}s`;
  return a && b && a !== b ? `${m(a)}–${m(b)}` : m((a || b)!);
}

const slugFor = (t: Task) => t.slug || t.name.toLowerCase().replace(/\s+/g, '-');

export default function TechniquesPage() {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [query, setQuery] = useState('');
  const [activeCat, setActiveCat] = useState<string>('all'); // 'all' or a category label
  const [isAdmin, setIsAdmin] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [draftsOnly, setDraftsOnly] = useState(false);

  useEffect(() => {
    fetch('/api/admin/check')
      .then(r => r.json())
      .then(d => setIsAdmin(Boolean(d.isAdmin)))
      .catch(() => setIsAdmin(false));
  }, []);

  useEffect(() => {
    const supabase = createClient() as any;
    supabase
      .from('tasks')
      .select('id, slug, name, category, description, completion_type, completion_target, heat_mechanism, heat_medium, min_duration_seconds, max_duration_seconds, is_verified, archived_at')
      .order('is_verified', { ascending: false })
      .order('name', { ascending: true })
      .then(({ data }: { data: Task[] | null }) => setTasks(data ?? []));
  }, []);

  // Visible set: live techniques only, unless an admin has toggled "show archived".
  const visibleTasks = (tasks ?? []).filter(t =>
    (showArchived || !t.archived_at) && (!draftsOnly || !t.is_verified)
  );
  const archivedCount = (tasks ?? []).filter(t => t.archived_at).length;
  const draftCount = (tasks ?? []).filter(t => !t.is_verified && !t.archived_at).length;

  // distinct category labels present in the data, with counts (for the filter buttons)
  const catCounts = new Map<string, number>();
  for (const t of visibleTasks) {
    const k = categoryLabel(t.category);
    catCounts.set(k, (catCounts.get(k) ?? 0) + 1);
  }
  const catButtons = [...catCounts.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  const filtered = visibleTasks.filter(t => {
    const matchesCat = activeCat === 'all' || categoryLabel(t.category) === activeCat;
    const matchesQuery = !query.trim()
      || t.name.toLowerCase().includes(query.toLowerCase())
      || (t.description ?? '').toLowerCase().includes(query.toLowerCase());
    return matchesCat && matchesQuery;
  });

  // group by category, then sort groups by label
  const groups = new Map<string, Task[]>();
  for (const t of filtered) {
    const k = categoryLabel(t.category);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(t);
  }
  const sortedGroups = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  const verifiedCount = visibleTasks.filter(t => t.is_verified).length;

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '32px 24px 80px' }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.12em',
          textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8,
        }}>
          Browse
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <h1 style={{
            fontFamily: 'var(--font-display)', fontSize: 34, fontWeight: 600,
            margin: 0, color: 'var(--fg)',
          }}>
            Techniques
          </h1>
          {isAdmin && (
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              {draftCount > 0 && (
                <a href="/techniques/review"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6,
                    fontFamily: 'var(--font-mono)', fontSize: 10, color: '#fff',
                    background: 'var(--accent)', border: '1px solid var(--accent)', padding: '6px 12px',
                    textDecoration: 'none', textTransform: 'uppercase',
                    letterSpacing: '0.1em', whiteSpace: 'nowrap' }}>
                  Review queue ({draftCount})
                </a>
              )}
              <a href="/techniques/new"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6,
                  fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--accent)',
                  border: '1px solid var(--accent)', padding: '6px 12px',
                  textDecoration: 'none', textTransform: 'uppercase',
                  letterSpacing: '0.1em', whiteSpace: 'nowrap' }}>
                + Add a technique
              </a>
            </div>
          )}
        </div>
        <p style={{ color: 'var(--muted)', marginTop: 8, fontSize: 14, lineHeight: 1.5 }}>
          The verified cooking techniques Soupdog understands — each with what it does,
          how it&apos;s done, and how you know it&apos;s finished.
          {tasks && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
              {' '}({verifiedCount} verified · {tasks.length} total)
            </span>
          )}
        </p>
      </div>

      <input
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Filter techniques…"
        style={{
          width: '100%', padding: '10px 14px', fontSize: 14, marginBottom: 16,
          border: '1px solid var(--border)', background: 'var(--surface)',
          color: 'var(--fg)', fontFamily: 'var(--font-mono)',
        }}
      />

      {/* Category filter buttons — derived from categories present in the data.
          (Free-text categories for now; will become a fixed set once the vocabulary
          is locked — see the knowledge-layer design's category-model note.) */}
      {tasks && catButtons.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 28 }}>
          {([['all', `All`]] as [string, string][])
            .concat(catButtons.map(([label]) => [label, label]))
            .map(([key, label]) => {
              const active = activeCat === key;
              const count = key === 'all' ? (tasks?.length ?? 0) : catCounts.get(key);
              return (
                <button
                  key={key}
                  onClick={() => setActiveCat(key)}
                  style={{
                    fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.08em',
                    textTransform: 'uppercase', padding: '6px 12px', cursor: 'pointer',
                    border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                    background: active ? 'var(--accent-subtle)' : 'transparent',
                    color: active ? 'var(--accent)' : 'var(--fg)',
                  }}
                >
                  {label}{count != null ? ` ${count}` : ''}
                </button>
              );
            })}
        </div>
      )}

      {/* Admin: show archived toggle */}
      {isAdmin && (draftCount > 0 || archivedCount > 0) && (
        <div style={{ marginBottom: 20, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {draftCount > 0 && (
            <button
              onClick={() => setDraftsOnly(s => !s)}
              style={{
                fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.08em',
                textTransform: 'uppercase', padding: '6px 12px', cursor: 'pointer',
                border: `1px solid ${draftsOnly ? 'var(--accent)' : 'var(--border)'}`,
                background: draftsOnly ? 'var(--accent-subtle)' : 'transparent',
                color: draftsOnly ? 'var(--accent)' : 'var(--muted)',
              }}>
              {draftsOnly ? 'Show all' : `Drafts only (${draftCount})`}
            </button>
          )}
          {archivedCount > 0 && (
            <button
              onClick={() => setShowArchived(s => !s)}
              style={{
                fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.08em',
                textTransform: 'uppercase', padding: '6px 12px', cursor: 'pointer',
                border: `1px solid ${showArchived ? 'var(--accent)' : 'var(--border)'}`,
                background: showArchived ? 'var(--accent-subtle)' : 'transparent',
                color: showArchived ? 'var(--accent)' : 'var(--muted)',
              }}>
              {showArchived ? 'Hide archived' : `Show archived (${archivedCount})`}
            </button>
          )}
        </div>
      )}

      {!tasks && <p style={{ color: 'var(--muted)' }}>Loading…</p>}
      {tasks && filtered.length === 0 && (
        <p style={{ color: 'var(--muted)' }}>No techniques match “{query}”.</p>
      )}

      {sortedGroups.map(([label, items]) => (
        <section key={label} style={{ marginBottom: 36 }}>
          <h2 style={{
            fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.12em',
            textTransform: 'uppercase', color: 'var(--muted)',
            borderBottom: '1px solid var(--border-subtle)', paddingBottom: 8, marginBottom: 4,
          }}>
            {label}
          </h2>
          {items.map(t => (
            <Link key={t.id} href={`/techniques/${slugFor(t)}`} style={{ textDecoration: 'none' }}>
              <div
                style={{
                  display: 'grid', gridTemplateColumns: '180px 1fr auto', gap: 16,
                  alignItems: 'baseline', padding: '14px 8px',
                  borderBottom: '1px solid var(--border-subtle)', cursor: 'pointer',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 600,
                    color: 'var(--fg)',
                  }}>
                    {t.name}
                  </span>
                  {!t.is_verified && (
                    <span title="Not yet verified" style={{
                      fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.08em',
                      textTransform: 'uppercase', color: 'var(--muted)',
                      border: '1px solid var(--border)', borderRadius: 2, padding: '1px 4px',
                    }}>
                      draft
                    </span>
                  )}
                  {t.archived_at && (
                    <span title="Archived" style={{
                      fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.08em',
                      textTransform: 'uppercase', color: 'var(--muted)',
                      border: '1px solid var(--border)', borderRadius: 2, padding: '1px 4px',
                    }}>
                      archived
                    </span>
                  )}
                </div>
                <span style={{ color: 'var(--muted)', fontSize: 13, lineHeight: 1.45 }}>
                  {t.description ?? <em style={{ opacity: 0.6 }}>No description yet</em>}
                </span>
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)',
                  whiteSpace: 'nowrap', textAlign: 'right',
                }}>
                  {t.heat_mechanism && t.heat_mechanism !== 'none'
                    ? `${t.heat_mechanism}${t.heat_medium && t.heat_medium !== 'none' ? '/' + t.heat_medium : ''}`
                    : ''}
                  {fmtDur(t.min_duration_seconds, t.max_duration_seconds) &&
                    `  ${fmtDur(t.min_duration_seconds, t.max_duration_seconds)}`}
                </span>
              </div>
            </Link>
          ))}
        </section>
      ))}
    </div>
  );
}
