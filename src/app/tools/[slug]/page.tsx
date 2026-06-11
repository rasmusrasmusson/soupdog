'use client';
// src/app/tools/[slug]/page.tsx
//
// Tool knowledge page — same cookbook layout as ingredients, tuned for
// equipment.
//   • Intro region: lead text left, hero floated right WITHOUT a background
//     surface (transparent PNG, engraved-illustration feel — per the visual
//     strategy: tools = engraved B&W).
//   • Right rail: Wikipedia-style "On this page" TOC (AI assistant takes over
//     the rail in Step 2; rail built as a slot stack so a personal "In your
//     kitchen" card can drop in later).
//   • Sections: How it's used · Versions (concept→models) · Specification ·
//     Techniques it performs · History · Related tools. Render what exists,
//     quiet "not yet" otherwise.

import React, { useState, useEffect, use } from 'react';
import { ChevronRight, Pencil } from 'lucide-react';
import {
  KLink, Section, SubLabel,
  InlineToc, useTocProvider, TocProvider,
} from '@/components/knowledge/KnowledgePage';
import { useAssistantContext } from '@/components/assistant/AssistantProvider';

interface Rel { id: string; slug: string; name: string; brand?: string }
interface ChildModel extends Rel {
  model_number?: string; wattage?: number; connected?: boolean;
}
interface Tool {
  id: string; slug: string; name: string; category: string;
  description?: string; summary?: string; description_long?: string;
  brand?: string; model_number?: string; manufacturer?: string;
  connected?: boolean; wattage?: number; cavity_volume_litres?: number;
  uses?: string[]; image_url?: string; image_credit?: string;
  content_reviewed?: boolean; source?: string; archived_at?: string | null;
  history?: string;
  parent?: Rel | null; siblings: Rel[]; children: ChildModel[];
  techniques: { slug: string; name: string }[];
}

const MONO = 'var(--font-mono)';
const SERIF = 'var(--font-display)';
const MUT = 'var(--muted)';
const FG = 'var(--fg)';
const B = '1px solid var(--border)';

function humanCategory(key: string): string {
  if (!key) return 'Other';
  const s = key.replace(/[_-]+/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function ToolDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [tool, setTool] = useState<Tool | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);

  const { entries, api } = useTocProvider();

  // Publish page context to the global assistant dock (null until loaded).
  useAssistantContext(tool ? {
    entityType: 'tool',
    entityName: tool.name,
    summary: tool.summary || tool.description || '',
    facts: {
      category: tool.category,
      wattage: tool.wattage,
      capacityLitres: tool.cavity_volume_litres,
      connected: tool.connected,
      techniques: tool.techniques?.map(t => t.name),
    },
  } : null);

  async function setArchived(next: boolean) {
    if (!tool) return;
    setArchiving(true);
    const res = await fetch(`/api/admin/equipment/${tool.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived: next }),
    });
    setArchiving(false);
    setConfirmArchive(false);
    if (res.ok) {
      if (next) window.location.href = '/tools';
      else setTool({ ...tool, archived_at: null });
    }
  }

  useEffect(() => {
    fetch(`/api/tools/${slug}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); setLoading(false); return; }
        setTool(d.tool); setLoading(false);
      })
      .catch(() => { setError('Failed to load.'); setLoading(false); });

    fetch('/api/admin/check')
      .then(r => r.json())
      .then(d => setIsAdmin(Boolean(d.isAdmin)))
      .catch(() => setIsAdmin(false));
  }, [slug]);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <span style={{ fontFamily: MONO, fontSize: 11, color: MUT,
        textTransform: 'uppercase', letterSpacing: '0.18em' }}>Loading…</span>
    </div>
  );
  if (error || !tool) return (
    <div style={{ padding: 32, fontFamily: MONO, fontSize: 12, color: MUT }}>
      {error ?? 'Tool not found.'}
    </div>
  );

  const lead = tool.summary || tool.description || '';
  const hasSpecs = tool.wattage != null || tool.cavity_volume_litres != null || tool.connected != null;
  const isConcept = !tool.parent && tool.children.length > 0;

  return (
    <TocProvider api={api}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        '@context': 'https://schema.org', '@type': 'Product', name: tool.name,
        category: 'Kitchen equipment', description: lead || undefined,
        url: `https://soup.dog/tools/${tool.slug}`,
        ...(tool.image_url ? { image: tool.image_url } : {}),
        ...(tool.brand ? { brand: { '@type': 'Brand', name: tool.brand } } : {}),
      }) }} />

      <div style={{ minHeight: '100%' }}>

        {/* ── Main content column ──────────────────────────────── */}
        <div style={{ minWidth: 0, padding: '24px 36px 80px' }}>
          <div style={{ maxWidth: 720 }}>

            {/* Breadcrumb */}
            <nav style={{ display: 'flex', alignItems: 'center', gap: 6,
              fontFamily: MONO, fontSize: 10, color: MUT,
              textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 12, flexWrap: 'wrap' }}>
              <a href="/tools" style={{ color: MUT, textDecoration: 'none' }}
                className="hover:text-[var(--fg)] transition-colors">Tools</a>
              <ChevronRight size={10} style={{ flexShrink: 0 }} />
              {tool.parent && (
                <>
                  <a href={`/tools/${tool.parent.slug}`} style={{ color: MUT, textDecoration: 'none' }}
                    className="hover:text-[var(--fg)] transition-colors">{tool.parent.name}</a>
                  <ChevronRight size={10} style={{ flexShrink: 0 }} />
                </>
              )}
              <span style={{ color: FG, fontWeight: 600 }}>{tool.name}</span>
            </nav>

            {/* ── Intro region: lead left, transparent hero right ─ */}
            <div id="introduction" style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0,1fr) 196px',
              gap: 24, alignItems: 'start',
              marginBottom: 24, paddingBottom: 24, borderBottom: B,
              scrollMarginTop: 16,
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'flex-start',
                  justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
                  <h1 className="font-display" style={{ fontFamily: SERIF, fontSize: 30,
                    fontWeight: 400, lineHeight: 1.15, color: FG, margin: 0 }}>{tool.name}</h1>
                  {isAdmin && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      {tool.archived_at ? (
                        <button onClick={() => setArchived(false)} disabled={archiving}
                          style={{ fontFamily: MONO, fontSize: 10, color: 'var(--accent)',
                            border: '1px solid var(--accent)', padding: '6px 10px', background: 'transparent',
                            cursor: archiving ? 'default' : 'pointer', opacity: archiving ? 0.6 : 1,
                            textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                          {archiving ? 'Restoring…' : 'Unarchive'}
                        </button>
                      ) : confirmArchive ? (
                        <>
                          <span style={{ fontFamily: MONO, fontSize: 10, color: MUT }}>Archive? (reversible)</span>
                          <button onClick={() => setArchived(true)} disabled={archiving}
                            style={{ fontFamily: MONO, fontSize: 10, color: '#fff', background: 'var(--muted)',
                              border: 'none', padding: '6px 10px', cursor: archiving ? 'default' : 'pointer',
                              opacity: archiving ? 0.6 : 1, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                            {archiving ? '…' : 'Archive'}
                          </button>
                          <button onClick={() => setConfirmArchive(false)} disabled={archiving}
                            style={{ fontFamily: MONO, fontSize: 10, color: MUT, background: 'none',
                              border: 'none', cursor: 'pointer' }}>Cancel</button>
                        </>
                      ) : (
                        <button onClick={() => setConfirmArchive(true)}
                          style={{ fontFamily: MONO, fontSize: 10, color: MUT, background: 'none',
                            border: 'none', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                          Archive
                        </button>
                      )}
                      <a href={`/tools/${tool.slug}/edit`}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6,
                          fontFamily: MONO, fontSize: 10, color: 'var(--accent)',
                          border: '1px solid var(--accent)', padding: '6px 10px',
                          textDecoration: 'none', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                        <Pencil size={11} /> Edit
                      </a>
                    </div>
                  )}
                </div>

                <p style={{ fontSize: 12, color: MUT, margin: '0 0 10px' }}>
                  {humanCategory(tool.category)}
                  {tool.brand && tool.parent && <> · {tool.brand}</>}
                  {isConcept && <> · the concept; specific models below</>}
                </p>

                {lead ? (
                  <p style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--fg-secondary)', margin: 0 }}>{lead}</p>
                ) : (
                  <p style={{ fontSize: 13, color: MUT, fontStyle: 'italic', margin: 0 }}>
                    No description available yet.
                  </p>
                )}
              </div>

              {/* Hero — tool: transparent, no surface fill */}
              <div style={{ width: '100%' }}>
                {tool.image_url ? (
                  <>
                    <img src={tool.image_url} alt={tool.name}
                      style={{ width: '100%', maxHeight: 260, objectFit: 'contain', display: 'block' }} />
                    {tool.image_credit && (
                      <p style={{ fontFamily: MONO, fontSize: 9, color: MUT, margin: '6px 0 0', textAlign: 'right' }}>
                        {tool.image_credit}
                      </p>
                    )}
                  </>
                ) : (
                  <div style={{ width: '100%', aspectRatio: '3/4', border: '1px dashed var(--border)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontFamily: MONO, fontSize: 9, color: MUT,
                      textTransform: 'uppercase', letterSpacing: '0.15em', textAlign: 'center', padding: 12 }}>
                      Illustration coming soon
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Inline "On this page" — the rail now belongs to the assistant */}
            <InlineToc entries={entries} />

            {/* ── How it's used ─────────────────────────────────── */}
            <Section title="How it's used" id="how-its-used"
              empty={!tool.description_long && (tool.uses?.length ?? 0) === 0}
              emptyNote="A description of how this tool is used hasn't been added yet.">
              {tool.description_long && (
                <p style={{ fontSize: 13.5, lineHeight: 1.75, color: 'var(--fg-secondary)', margin: '0 0 12px' }}>
                  {tool.description_long}
                </p>
              )}
              {(tool.uses?.length ?? 0) > 0 && (
                <ul style={{ fontSize: 13.5, lineHeight: 1.75, margin: 0, paddingLeft: 20, color: 'var(--fg-secondary)' }}>
                  {tool.uses!.map((u, i) => <li key={i} style={{ marginBottom: 4 }}>{u}</li>)}
                </ul>
              )}
            </Section>

            {/* ── Versions / models ─────────────────────────────── */}
            {(tool.children.length > 0 || (tool.parent && tool.siblings.length > 0)) && (
              <Section title="Versions" id="versions">
                {tool.children.length > 0 && (
                  <>
                    {isConcept && (
                      <p style={{ fontSize: 12.5, color: MUT, lineHeight: 1.6, margin: '0 0 12px' }}>
                        Specific models of {tool.name.toLowerCase()}.
                      </p>
                    )}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10,
                      marginBottom: (tool.parent && tool.siblings.length) ? 16 : 0 }}>
                      {tool.children.map(c => (
                        <a key={c.id} href={`/tools/${c.slug}`}
                          style={{ border: B, padding: '12px 14px', textDecoration: 'none', background: 'var(--surface)' }}
                          className="hover:bg-[var(--surface-hover)] transition-colors">
                          <div style={{ fontSize: 14, fontWeight: 500, color: FG, marginBottom: 2 }}>
                            {c.brand ? `${c.brand} ` : ''}{c.name}
                          </div>
                          <div style={{ fontFamily: MONO, fontSize: 11, color: MUT }}>
                            {[c.wattage != null ? `${c.wattage} W` : null,
                              c.connected ? 'app' : null, c.model_number || null]
                              .filter(Boolean).join(' · ') || 'Model'}
                          </div>
                        </a>
                      ))}
                    </div>
                  </>
                )}
                {tool.parent && tool.siblings.length > 0 && (
                  <div>
                    <SubLabel>Related models</SubLabel>
                    <p style={{ fontSize: 13.5, lineHeight: 1.9, margin: 0, color: 'var(--fg-secondary)' }}>
                      {tool.siblings.map((s, i) => (
                        <React.Fragment key={s.id}>
                          <KLink href={`/tools/${s.slug}`}>{s.brand ? `${s.brand} ` : ''}{s.name}</KLink>
                          {i < tool.siblings.length - 1 ? ', ' : ''}
                        </React.Fragment>
                      ))}
                    </p>
                  </div>
                )}
              </Section>
            )}

            {/* ── Specification ─────────────────────────────────── */}
            <Section title="Specification" id="specification"
              empty={!hasSpecs}
              emptyNote="Technical specifications haven't been added yet.">
              {hasSpecs && (
                <div style={{ border: B }}>
                  {tool.wattage != null && <SpecRow label="Typical power" value={`${tool.wattage} W`} />}
                  {tool.cavity_volume_litres != null && <SpecRow label="Capacity" value={`${tool.cavity_volume_litres} L`} />}
                  {tool.connected != null && (
                    <SpecRow label="Connected"
                      value={tool.connected ? 'Yes — controllable remotely' : 'No'} last />
                  )}
                </div>
              )}
            </Section>

            {/* ── Methods used with this tool (reverse lookup) ──── */}
            <Section title="Methods used with this tool" id="methods"
              empty={tool.techniques.length === 0}
              emptyNote="No techniques have been linked to this tool yet.">
              {tool.techniques.length > 0 && (
                <p style={{ fontSize: 13.5, lineHeight: 1.9, margin: 0, color: 'var(--fg-secondary)' }}>
                  {tool.techniques.map((t, i) => (
                    <React.Fragment key={t.slug}>
                      <KLink href={`/techniques/${t.slug}`}>{t.name}</KLink>
                      {i < tool.techniques.length - 1 ? ', ' : ''}
                    </React.Fragment>
                  ))}
                </p>
              )}
            </Section>

            {/* ── History ───────────────────────────────────────── */}
            <Section title="History" id="history"
              empty={!tool.history}
              emptyNote="The history of this tool is being written.">
              {tool.history && (
                <p style={{ fontSize: 13.5, lineHeight: 1.75, color: 'var(--fg-secondary)', margin: 0 }}>
                  {tool.history}
                </p>
              )}
            </Section>

            {/* My kitchen pointer */}
            <div style={{ marginTop: 32, paddingTop: 20, borderTop: B,
              fontFamily: MONO, fontSize: 10, color: MUT, lineHeight: 1.7 }}>
              Tools you own live under <KLink href="/my/people">My kitchen</KLink>, not here.
              This page describes the tool in general.
            </div>

          </div>
        </div>

        {/* (Assistant rail is now global in AppShell; TOC is inline at top.) */}
      </div>
    </TocProvider>
  );
}

function SpecRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between',
      padding: '10px 14px', borderBottom: last ? 'none' : B, fontSize: 13.5 }}>
      <span style={{ color: MUT }}>{label}</span>
      <span style={{ color: FG }}>{value}</span>
    </div>
  );
}
