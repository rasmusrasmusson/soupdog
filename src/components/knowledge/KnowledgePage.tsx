'use client';
// src/components/knowledge/KnowledgePage.tsx
//
// Shared building blocks for the "knowledge" catalogue pages — ingredients,
// tools, and (later) techniques. One visual family: cookbook / Haynes-manual
// feel over the Soupdog tokens (warm off-white, olive accent, Plex Serif/Mono,
// hairline rules, zero radius).
//
// What lives here:
//   • KLink            — the ONE internal-link style (dotted olive underline)
//   • SectionTitle     — H2 (serif) for major sections, with an anchor id
//   • SubLabel         — H3 (mono small-caps) for sub-sections
//   • CountChip        — navigational count chip ("Sauces · 43")
//   • useToc + Toc     — the Wikipedia-style on-this-page index
//   • ContentRail      — the right column as an ORDERED STACK of slots
//                        (inventory card later · AI panel · TOC), Option-1
//                        single-column model: TOC by default, AI summoned.
//
// The rail is deliberately a stack so a personal "In your kitchen" inventory
// card can drop in at the top later (account-scoped, fetched separately — the
// shared-catalogue / personal-data residency seam) without a re-layout.

import React, {
  createContext, useContext, useEffect, useMemo, useRef, useState,
} from 'react';

const MONO = 'var(--font-mono)';
const SERIF = 'var(--font-display)';
const MUT = 'var(--muted)';
const FG = 'var(--fg)';
const ACCENT = 'var(--accent)';
const B = '1px solid var(--border)';

// ───────────────────────────────────────────────────────────────
//  Internal-link style (decision: B — dotted olive underline)
//  Use for every inline link to another knowledge entity or section.
//  Count chips (CountChip) are the separate "navigational aggregate"
//  treatment; ingredient-step pills keep their own look elsewhere.
// ───────────────────────────────────────────────────────────────
export function KLink({
  href, children, external = false, style,
}: {
  href: string; children: React.ReactNode; external?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <a
      href={href}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      className="k-link"
      style={{
        color: ACCENT,
        textDecoration: 'underline',
        textDecorationStyle: 'dotted',
        textDecorationThickness: '1px',
        textUnderlineOffset: '3px',
        textDecorationColor: 'rgba(46,70,56,0.45)',
        ...style,
      }}
    >
      {children}
    </a>
  );
}

// ───────────────────────────────────────────────────────────────
//  Header hierarchy
//    H1  — page title (serif, set on the page itself)
//    H2  — SectionTitle (serif, anchored, registers with the TOC)
//    H3  — SubLabel (mono small-caps)
// ───────────────────────────────────────────────────────────────

// Slugify a heading into a stable anchor id.
export function anchorId(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function SectionTitle({
  children, id, badge, action,
}: {
  children: React.ReactNode;
  id?: string;
  badge?: string;
  action?: React.ReactNode;
}) {
  const label = typeof children === 'string' ? children : '';
  const theId = id ?? anchorId(label);
  const toc = useContext(TocCtx);

  useEffect(() => {
    if (toc && label) toc.register(theId, label, 2);
    return () => { if (toc) toc.unregister(theId); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theId, label]);

  return (
    <div
      id={theId}
      style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        gap: 12, margin: '0 0 12px', scrollMarginTop: 16,
      }}
    >
      <h2
        className="font-display"
        style={{
          fontFamily: SERIF, fontSize: 21, fontWeight: 400, lineHeight: 1.2,
          color: FG, margin: 0,
        }}
      >
        {children}
        {badge && (
          <span style={{
            fontFamily: MONO, fontSize: 9, color: MUT, border: B,
            padding: '1px 6px', marginLeft: 10, verticalAlign: 'middle',
            textTransform: 'uppercase', letterSpacing: '0.1em',
          }}>
            {badge}
          </span>
        )}
      </h2>
      {action}
    </div>
  );
}

export function SubLabel({
  children, tone = 'muted', style,
}: {
  children: React.ReactNode;
  tone?: 'muted' | 'fg' | 'error';
  style?: React.CSSProperties;
}) {
  const color = tone === 'error' ? 'var(--error)' : tone === 'fg' ? FG : MUT;
  return (
    <div style={{
      fontFamily: MONO, fontSize: 10, textTransform: 'uppercase',
      letterSpacing: '0.15em', color, margin: '0 0 8px',
      ...style,
    }}>
      {children}
    </div>
  );
}

// Render a list of saved sub-sections (headline + image + body + bullets) —
// the read-side counterpart to SubSectionEditor. Each sub-section's headline
// renders as a SubLabel (H3); a sub-section image floats right of its body.
export interface RenderedSubSection {
  id?: string; headline?: string | null; image_url?: string | null;
  image_credit?: string | null; body?: string | null; bullets?: string[] | null;
}
export function SubSections({ items }: { items: RenderedSubSection[] }) {
  if (!items?.length) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {items.map((s, i) => {
        // Bullets now live inline in body as "- " lines. Legacy rows may still
        // carry a separate bullets[] — append them so old data still renders.
        const body = [
          s.body ?? '',
          ...(s.bullets ?? []).map(b => `- ${b}`),
        ].filter(Boolean).join('\n');
        return (
          <div key={s.id ?? i}>
            {s.headline && <SubLabel tone="fg">{s.headline}</SubLabel>}
            <div style={{
              display: 'grid',
              gridTemplateColumns: s.image_url ? 'minmax(0,1fr) 140px' : '1fr',
              gap: 18, alignItems: 'start',
            }}>
              <div>{renderProse(body)}</div>
              {s.image_url && (
                <div style={{ border: B, background: 'var(--surface-hover)', overflow: 'hidden' }}>
                  <img src={s.image_url} alt={s.headline ?? ''}
                    style={{ width: '100%', height: 'auto', display: 'block' }} />
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Render plain text into lines and bullet lists. Rules (literal, predictable):
//   • a line starting with "- " (dash-space) → a bullet;
//   • consecutive bullet lines group into one <ul>;
//   • every other line renders on its own line (each Enter is a line break);
//   • a blank line produces a larger paragraph-style gap.
// The ONLY markup is the "- " bullet — no bold, headings, or links — so stored
// content stays clean text. Used for sub-section bodies and main section text.
export function renderProse(
  text: string | null | undefined,
  opts?: { fontSize?: number; color?: string },
): React.ReactNode {
  if (!text || !text.trim()) return null;
  const fontSize = opts?.fontSize ?? 13.5;
  const color = opts?.color ?? 'var(--fg-secondary)';
  const lines = text.replace(/\r\n/g, '\n').split('\n');

  const blocks: React.ReactNode[] = [];
  let bullets: string[] = [];
  let key = 0;
  let blankPending = false; // a blank line seen since the last rendered block

  const flushBullets = () => {
    if (bullets.length) {
      blocks.push(
        <ul key={`u${key++}`} style={{ fontSize, lineHeight: 1.7, color,
          margin: blocks.length ? `${blankPending ? 12 : 6}px 0 0` : 0, paddingLeft: 18,
          listStyleType: 'disc', listStylePosition: 'outside' }}>
          {bullets.map((b, i) => (
            <li key={i} style={{ marginBottom: 3, paddingLeft: 4, display: 'list-item' }}>{b}</li>
          ))}
        </ul>
      );
      bullets = [];
      blankPending = false;
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const isBullet = /^\s*-\s+/.test(line);

    if (line.trim() === '') {
      flushBullets();
      blankPending = true;
      continue;
    }
    if (isBullet) {
      bullets.push(line.replace(/^\s*-\s+/, ''));
      continue;
    }
    // Plain line — render on its own line. Bigger top gap after a blank line.
    flushBullets();
    blocks.push(
      <p key={`p${key++}`} style={{ fontSize, lineHeight: 1.6, color,
        margin: blocks.length ? `${blankPending ? 12 : 2}px 0 0` : 0 }}>
        {line.trim()}
      </p>
    );
    blankPending = false;
  }
  flushBullets();
  return <>{blocks}</>;
}

// A whole section: anchored title + body, with a hairline divider below.
// Renders nothing if `empty` (keeps the page and TOC clean).
export function Section({
  title, id, badge, action, children, empty = false, emptyNote,
}: {
  title: string;
  id?: string;
  badge?: string;
  action?: React.ReactNode;
  children?: React.ReactNode;
  empty?: boolean;
  emptyNote?: string;
}) {
  if (empty && !emptyNote) return null;
  return (
    <section style={{ padding: '4px 0 22px', borderBottom: B, marginBottom: 22 }}>
      <SectionTitle id={id} badge={badge} action={action}>{title}</SectionTitle>
      {empty
        ? <p style={{ fontSize: 12.5, color: MUT, fontStyle: 'italic', margin: 0 }}>{emptyNote}</p>
        : children}
    </section>
  );
}

// ───────────────────────────────────────────────────────────────
//  Count chip — "Sauces · 43", links to a filtered recipe view.
//  Distinct from KLink (inline prose) and from ingredient-step pills.
// ───────────────────────────────────────────────────────────────
export function CountChip({
  label, count, href, pending = false,
}: {
  label: string; count?: number | null; href?: string; pending?: boolean;
}) {
  const inner = (
    <>
      <span>{label}</span>
      {pending ? (
        <span style={{ color: 'var(--border)', marginLeft: 6 }}>·</span>
      ) : count != null ? (
        <span style={{ color: MUT, marginLeft: 6, fontVariantNumeric: 'tabular-nums' }}>{count}</span>
      ) : null}
    </>
  );
  const base: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center',
    fontFamily: MONO, fontSize: 11, padding: '4px 10px',
    border: B, background: 'var(--surface)', color: FG,
    textDecoration: 'none', whiteSpace: 'nowrap',
  };
  if (href && !pending) {
    return (
      <a href={href} style={base}
        className="hover:border-[var(--accent)] transition-colors">
        {inner}
      </a>
    );
  }
  return <span style={{ ...base, color: pending ? MUT : FG }}>{inner}</span>;
}

// ───────────────────────────────────────────────────────────────
//  Table of contents
//  SectionTitle components register themselves; the rail renders the
//  list and scroll-spies the active entry.
// ───────────────────────────────────────────────────────────────
interface TocEntry { id: string; label: string; level: number }
interface TocApi {
  register: (id: string, label: string, level: number) => void;
  unregister: (id: string) => void;
}
const TocCtx = createContext<TocApi | null>(null);

export function useTocProvider() {
  const [entries, setEntries] = useState<TocEntry[]>([]);
  const orderRef = useRef<string[]>([]);

  const api = useMemo<TocApi>(() => ({
    register(id, label, level) {
      setEntries(prev => {
        if (prev.some(e => e.id === id)) {
          return prev.map(e => (e.id === id ? { id, label, level } : e));
        }
        if (!orderRef.current.includes(id)) orderRef.current.push(id);
        const next = [...prev, { id, label, level }];
        // Keep DOM order (the order titles registered/mounted).
        next.sort((a, b) =>
          orderRef.current.indexOf(a.id) - orderRef.current.indexOf(b.id));
        return next;
      });
    },
    unregister(id) {
      setEntries(prev => prev.filter(e => e.id !== id));
    },
  }), []);

  return { entries, api };
}

export function TocProvider({ api, children }: { api: TocApi; children: React.ReactNode }) {
  return <TocCtx.Provider value={api}>{children}</TocCtx.Provider>;
}

export function Toc({ entries }: { entries: TocEntry[] }) {
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    if (!entries.length) return;
    const obs = new IntersectionObserver(
      (records) => {
        const visible = records
          .filter(r => r.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: '0px 0px -70% 0px', threshold: 0 },
    );
    entries.forEach(e => {
      const el = document.getElementById(e.id);
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
  }, [entries]);

  function go(id: string) {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  if (!entries.length) return null;

  return (
    <nav aria-label="On this page" style={{ borderLeft: `2px solid ${ACCENT}`, paddingLeft: 14 }}>
      <div style={{
        fontFamily: MONO, fontSize: 10, letterSpacing: '0.15em',
        textTransform: 'uppercase', color: MUT, marginBottom: 12,
      }}>
        On this page
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {entries.map(e => {
          const isActive = active === e.id;
          return (
            <button
              key={e.id}
              onClick={() => go(e.id)}
              style={{
                textAlign: 'left', background: 'none', border: 'none',
                cursor: 'pointer', padding: 0,
                paddingLeft: e.level >= 3 ? 12 : 0,
                fontSize: e.level >= 3 ? 12 : 12.5,
                lineHeight: 1.3,
                color: isActive ? ACCENT : MUT,
                fontWeight: isActive ? 500 : 400,
                transition: 'color 0.15s',
              }}
              className="hover:text-[var(--fg)]"
            >
              {e.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

// ───────────────────────────────────────────────────────────────
//  Content rail — the right column.
//  Option-1 single-column model: shows the TOC by default; when the
//  AI assistant is opened it takes over the rail and the TOC hides.
//  `topSlot` is reserved for the future inventory card (renders above
//  whichever mode is active).
// ───────────────────────────────────────────────────────────────
export function ContentRail({
  toc, ai, aiOpen, topSlot,
}: {
  toc: React.ReactNode;
  ai?: React.ReactNode;
  aiOpen?: boolean;
  topSlot?: React.ReactNode;
}) {
  return (
    <aside
      className="hidden lg:flex no-print"
      style={{
        width: 248, flexShrink: 0, borderLeft: B,
        position: 'sticky', top: 0, height: 'calc(100vh - 48px)',
        overflowY: 'auto', padding: '24px 20px',
        flexDirection: 'column', gap: 22,
      }}
    >
      {topSlot}
      {aiOpen ? ai : toc}
    </aside>
  );
}
