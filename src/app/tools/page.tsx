'use client';
// src/app/tools/page.tsx

import React, { useState, useEffect } from 'react';
import { Search, ChevronRight } from 'lucide-react';

interface ToolRow {
  id:        string;
  slug:      string;
  name:      string;
  category:  string;
  summary?:  string;
  image_url?: string;
  archived:  boolean;
}

const MONO = 'var(--font-mono)';
const MUT  = 'var(--muted)';
const B    = '1px solid var(--border)';

// Turn an enum/string category key into a human label ("stove_top" → "Stove top").
function humanCategory(key: string): string {
  if (!key) return 'Other';
  const s = key.replace(/[_-]+/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function ToolRowItem({ t }: { t: ToolRow }) {
  return (
    <a
      href={`/tools/${t.slug}`}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '8px 0', borderBottom: B,
        textDecoration: 'none', transition: 'background 0.1s',
      }}
      className="group hover:bg-[var(--surface-hover)] -mx-3 px-3"
    >
      <div style={{
        width: 36, height: 27, flexShrink: 0,
        border: B, overflow: 'hidden', background: 'var(--surface-hover)',
      }}>
        {t.image_url
          ? <img src={t.image_url} alt={t.name}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          : <div style={{ width: '100%', height: '100%', background: 'var(--surface-hover)' }} />
        }
      </div>

      <span style={{
        flexShrink: 0, fontSize: 13, color: 'var(--fg)', fontWeight: 500,
        minWidth: 0, maxWidth: 220, overflow: 'hidden',
        textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}
        className="group-hover:text-[var(--accent)] transition-colors">
        {t.name}
      </span>

      {t.summary && (
        <span style={{
          flex: 1, minWidth: 0, fontSize: 12, color: MUT,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {t.summary}
        </span>
      )}

      {t.archived && (
        <span style={{ fontFamily: MONO, fontSize: 9, color: MUT,
          border: B, padding: '2px 6px', textTransform: 'uppercase',
          letterSpacing: '0.1em', flexShrink: 0 }}>
          Archived
        </span>
      )}

      <ChevronRight size={11} style={{ color: MUT, flexShrink: 0 }}
        className="opacity-0 group-hover:opacity-100 transition-opacity" />
    </a>
  );
}

function CategorySection({
  label, tools, defaultExpanded,
}: {
  label: string; tools: ToolRow[]; defaultExpanded: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const PREVIEW = 6;
  const shown = expanded ? tools : tools.slice(0, PREVIEW);
  const hasMore = tools.length > PREVIEW;

  return (
    <div style={{ marginBottom: 8 }}>
      <button
        onClick={() => setExpanded(e => !e)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', padding: '10px 0',
          background: 'none', border: 'none', borderTop: B, cursor: 'pointer',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            fontFamily: MONO, fontSize: 10, textTransform: 'uppercase',
            letterSpacing: '0.18em', color: 'var(--fg)', fontWeight: 600,
          }}>
            {label}
          </span>
          <span style={{ fontFamily: MONO, fontSize: 10, color: MUT }}>
            {tools.length}
          </span>
        </div>
        <ChevronRight size={12} style={{
          color: MUT, transition: 'transform 0.15s',
          transform: expanded ? 'rotate(90deg)' : 'none', flexShrink: 0,
        }} />
      </button>

      {expanded && (
        <div style={{ paddingBottom: 8 }}>
          {shown.map(t => <ToolRowItem key={t.id} t={t} />)}
          {hasMore && (
            <button
              onClick={() => setExpanded(true)}
              style={{
                fontFamily: MONO, fontSize: 10, color: 'var(--accent)',
                background: 'none', border: 'none', cursor: 'pointer',
                padding: '6px 0',
              }}
            >
              + {tools.length - PREVIEW} more
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function ToolsPage() {
  const [tools, setTools]       = useState<ToolRow[]>([]);
  const [loading, setLoading]   = useState(true);
  const [query, setQuery]       = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [isAdmin, setIsAdmin]   = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  useEffect(() => {
    fetch('/api/admin/check')
      .then(r => r.json())
      .then(d => setIsAdmin(Boolean(d.isAdmin)))
      .catch(() => setIsAdmin(false));
  }, []);

  useEffect(() => {
    async function load() {
      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient() as any;

      // Concept-level tools only: rows with no parent_id (specific models hang
      // under their concept and show on the concept's detail page).
      const { data } = await supabase
        .from('equipment')
        .select('id, slug, name, category, summary, image_url, parent_id, archived_at')
        .is('parent_id', null)
        .order('name');

      if (!data) { setLoading(false); return; }

      setTools(data.map((r: any) => ({
        id: r.id, slug: r.slug, name: r.name,
        category: r.category ?? 'other',
        summary: r.summary ?? undefined,
        image_url: r.image_url ?? undefined,
        archived: r.archived_at != null,
      })));
      setLoading(false);
    }
    load();
  }, []);

  // Visible set: live tools only, unless an admin has toggled "show archived".
  const visible = tools.filter(t => showArchived || !t.archived);

  // Categories present in the data, in alphabetical order.
  const presentCategories = Array.from(
    new Set(visible.map(t => t.category))
  ).sort();

  const filtered = visible.filter(t => {
    const matchesQuery = query.length < 2 ||
      t.name.toLowerCase().includes(query.toLowerCase()) ||
      (t.summary ?? '').toLowerCase().includes(query.toLowerCase());
    const matchesCategory = activeCategory === 'all' || t.category === activeCategory;
    return matchesQuery && matchesCategory;
  });

  const grouped = presentCategories
    .map(key => ({ key, label: humanCategory(key), tools: filtered.filter(t => t.category === key) }))
    .filter(g => g.tools.length > 0);

  const totalCount = visible.length;
  const archivedCount = tools.filter(t => t.archived).length;
  const isSearching = query.length >= 2 || activeCategory !== 'all';

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          name: 'Tools & Equipment — Soupdog',
          description: 'Guides to kitchen tools and equipment: what each one is for, how to use it well, and how it works.',
          url: 'https://soup.dog/tools',
        }) }}
      />

      <div style={{ maxWidth: 860, margin: '0 auto', padding: '32px 32px 80px' }}>

        <div style={{ marginBottom: 32, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <h1 className="font-display"
              style={{ fontSize: 28, fontWeight: 400, color: 'var(--fg)', margin: '0 0 8px' }}>
              Tools &amp; Equipment
            </h1>
            <p style={{ fontSize: 13, color: MUT, margin: 0, lineHeight: 1.6 }}>
              What each tool is for, how to use it well, and how it works.
              {totalCount > 0 && (
                <span style={{ fontFamily: MONO, fontSize: 11, marginLeft: 8 }}>
                  {totalCount} entries
                </span>
              )}
            </p>
          </div>
          {isAdmin && (
            <a href="/tools/new"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6,
                fontFamily: MONO, fontSize: 10, color: 'var(--accent)',
                border: '1px solid var(--accent)', padding: '6px 12px',
                textDecoration: 'none', textTransform: 'uppercase',
                letterSpacing: '0.1em', flexShrink: 0, whiteSpace: 'nowrap' }}>
              + Add a tool
            </a>
          )}
        </div>

        {/* Search */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          border: B, padding: '10px 14px', marginBottom: 20, background: 'var(--surface)',
        }}>
          <Search size={14} style={{ color: MUT, flexShrink: 0 }} />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search tools…"
            style={{ flex: 1, background: 'transparent', border: 'none',
              fontSize: 13, color: 'var(--fg)', outline: 'none' }}
          />
          {query && (
            <button onClick={() => setQuery('')}
              style={{ fontFamily: MONO, fontSize: 10, color: MUT,
                background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              ESC
            </button>
          )}
        </div>

        {/* Category pills (derived from data) */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 28 }}>
          {['all', ...presentCategories].map(key => {
            const active = activeCategory === key;
            return (
              <button
                key={key}
                onClick={() => setActiveCategory(active && key !== 'all' ? 'all' : key)}
                style={{
                  fontFamily: MONO, fontSize: 10, padding: '4px 12px',
                  border: active ? '1px solid var(--accent)' : B,
                  background: active ? 'var(--accent-subtle)' : 'var(--surface)',
                  color: active ? 'var(--accent)' : MUT,
                  cursor: 'pointer', transition: 'all 0.15s',
                  textTransform: 'uppercase', letterSpacing: '0.1em',
                }}
              >
                {key === 'all' ? 'All' : humanCategory(key)}
              </button>
            );
          })}
        </div>

        {/* Admin: show archived toggle */}
        {isAdmin && archivedCount > 0 && (
          <div style={{ marginBottom: 20 }}>
            <button
              onClick={() => setShowArchived(s => !s)}
              style={{
                fontFamily: MONO, fontSize: 10, padding: '4px 12px',
                border: showArchived ? '1px solid var(--accent)' : B,
                background: showArchived ? 'var(--accent-subtle)' : 'var(--surface)',
                color: showArchived ? 'var(--accent)' : MUT,
                cursor: 'pointer', transition: 'all 0.15s',
                textTransform: 'uppercase', letterSpacing: '0.1em',
              }}>
              {showArchived ? 'Hide archived' : `Show archived (${archivedCount})`}
            </button>
          </div>
        )}

        {/* Content */}
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {[1,2,3].map(i => (
              <div key={i} style={{ borderTop: B, padding: '10px 0' }}>
                <div style={{ height: 12, width: 120, background: 'var(--surface-hover)',
                  marginBottom: 12, animation: 'pulse 1.5s ease-in-out infinite' }} />
                {[1,2,3].map(j => (
                  <div key={j} style={{ height: 10, width: `${60 + j * 8}%`,
                    background: 'var(--surface-hover)', marginBottom: 8,
                    animation: 'pulse 1.5s ease-in-out infinite' }} />
                ))}
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '48px 0', textAlign: 'center', fontFamily: MONO,
            fontSize: 11, color: MUT, textTransform: 'uppercase', letterSpacing: '0.15em' }}>
            {isSearching ? 'No tools found.' : 'No tools yet.'}
          </div>
        ) : isSearching && query.length >= 2 ? (
          <div>
            <div style={{ fontFamily: MONO, fontSize: 10, color: MUT,
              textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: 12 }}>
              {filtered.length} result{filtered.length !== 1 ? 's' : ''}
            </div>
            {filtered.map(t => <ToolRowItem key={t.id} t={t} />)}
          </div>
        ) : (
          <div>
            {grouped.map((g, i) => (
              <CategorySection key={g.key} label={g.label} tools={g.tools} defaultExpanded={i < 3} />
            ))}
          </div>
        )}

        <div style={{
          marginTop: 48, paddingTop: 20, borderTop: B,
          fontFamily: MONO, fontSize: 10, color: MUT, lineHeight: 1.7,
        }}>
          Tools you own appear under My kitchen. This catalogue describes tools in general.
        </div>
      </div>

      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
      `}</style>
    </>
  );
}
