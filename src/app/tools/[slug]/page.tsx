'use client';
// src/app/tools/[slug]/page.tsx

import React, { useState, useEffect, use } from 'react';
import { ChevronRight, Pencil } from 'lucide-react';

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
  content_reviewed?: boolean; source?: string;
  parent?: Rel | null; siblings: Rel[]; children: ChildModel[];
  techniques: { slug: string; name: string }[];
}

const MONO = 'var(--font-mono)';
const MUT  = 'var(--muted)';
const B    = '1px solid var(--border)';

function humanCategory(key: string): string {
  if (!key) return 'Other';
  const s = key.replace(/[_-]+/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--fg)', margin: '0 0 10px' }}>
      {children}
    </h2>
  );
}

export default function ToolDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [tool, setTool]       = useState<Tool | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

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
  const hasSpecs = tool.wattage != null || tool.cavity_volume_litres != null ||
    tool.connected != null;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'Product',
          name: tool.name,
          category: 'Kitchen equipment',
          description: lead || undefined,
          url: `https://soup.dog/tools/${tool.slug}`,
          ...(tool.image_url ? { image: tool.image_url } : {}),
          ...(tool.brand ? { brand: { '@type': 'Brand', name: tool.brand } } : {}),
        }) }}
      />

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 32px 80px' }}>

        {/* Breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8,
          fontFamily: MONO, fontSize: 11, color: MUT,
          textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
          <a href="/tools" style={{ color: MUT, textDecoration: 'none' }}>Tools</a>
          <span>›</span>
          {tool.parent && (
            <>
              <a href={`/tools/${tool.parent.slug}`} style={{ color: MUT, textDecoration: 'none' }}>
                {tool.parent.name}
              </a>
              <span>›</span>
            </>
          )}
          <span style={{ color: 'var(--fg)' }}>{tool.name}</span>
        </div>

        {/* 1. Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <h1 className="font-display"
              style={{ fontSize: 30, fontWeight: 400, color: 'var(--fg)', margin: '0 0 4px' }}>
              {tool.name}
            </h1>
            <p style={{ fontSize: 13, color: MUT, margin: 0 }}>
              {humanCategory(tool.category)}
              {tool.brand && tool.parent && <> · {tool.brand}</>}
              {!tool.parent && tool.children.length > 0 && <> · the concept; specific models below</>}
            </p>
          </div>
          {isAdmin && (
            <a href={`/tools/${tool.slug}/edit`}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6,
                fontFamily: MONO, fontSize: 10, color: 'var(--accent)',
                border: '1px solid var(--accent)', padding: '6px 10px',
                textDecoration: 'none', textTransform: 'uppercase',
                letterSpacing: '0.1em', flexShrink: 0 }}>
              <Pencil size={11} /> Edit
            </a>
          )}
        </div>

        {/* 2. Hero illustration (slot — graceful when empty) */}
        <div style={{
          marginTop: 20, marginBottom: 24, height: 220, border: B,
          background: 'var(--surface)', display: 'flex', alignItems: 'center',
          justifyContent: 'center', overflow: 'hidden',
        }}>
          {tool.image_url
            ? <img src={tool.image_url} alt={tool.name}
                style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
            : <span style={{ fontFamily: MONO, fontSize: 10, color: MUT,
                textTransform: 'uppercase', letterSpacing: '0.15em' }}>
                Illustration coming soon
              </span>
          }
        </div>
        {tool.image_url && tool.image_credit && (
          <p style={{ fontFamily: MONO, fontSize: 9, color: MUT, margin: '-16px 0 24px' }}>
            {tool.image_credit}
          </p>
        )}

        {/* 3. What it is (lead) */}
        {lead && (
          <p style={{ fontSize: 17, lineHeight: 1.7, color: 'var(--fg)', margin: '0 0 24px' }}>
            {lead}
          </p>
        )}

        {/* 4. What it's for / not for + the longer read */}
        {(tool.description_long || (tool.uses?.length ?? 0) > 0) && (
          <section style={{ marginBottom: 28 }}>
            <H2>What it&rsquo;s for</H2>
            {tool.description_long && (
              <p style={{ fontSize: 16, lineHeight: 1.7, color: 'var(--fg)', margin: '0 0 12px' }}>
                {tool.description_long}
              </p>
            )}
            {(tool.uses?.length ?? 0) > 0 && (
              <ul style={{ fontSize: 16, lineHeight: 1.7, margin: 0, paddingLeft: 20, color: 'var(--fg)' }}>
                {tool.uses!.map((u, i) => <li key={i} style={{ marginBottom: 4 }}>{u}</li>)}
              </ul>
            )}
          </section>
        )}

        {/* 5. Techniques it performs (cross-links, placed high) */}
        {tool.techniques.length > 0 && (
          <section style={{ marginBottom: 28 }}>
            <H2>Used for these techniques</H2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {tool.techniques.map(t => (
                <a key={t.slug} href={`/techniques/${t.slug}`}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6,
                    fontFamily: MONO, fontSize: 12, color: 'var(--accent)',
                    border: '1px solid var(--border)', borderRadius: 0,
                    padding: '6px 12px', textDecoration: 'none' }}
                  className="hover:bg-[var(--accent-subtle)] transition-colors">
                  {t.name} <ChevronRight size={12} />
                </a>
              ))}
            </div>
          </section>
        )}

        {/* 6 + 7. (Tips / How it works live in description_long for now; dedicated
            fields can be added later. Section headers appear when content exists.) */}

        {/* 8. Specifications (subordinate) */}
        {hasSpecs && (
          <section style={{ marginBottom: 28 }}>
            <H2>Specifications</H2>
            <div style={{ border: B }}>
              {tool.wattage != null && (
                <SpecRow label="Typical power" value={`${tool.wattage} W`} />
              )}
              {tool.cavity_volume_litres != null && (
                <SpecRow label="Capacity" value={`${tool.cavity_volume_litres} L`} />
              )}
              {tool.connected != null && (
                <SpecRow label="Connected" value={tool.connected ? 'Yes (app control)' : 'No'} last />
              )}
            </div>
          </section>
        )}

        {/* 9. Specific models (child rows) */}
        {tool.children.length > 0 && (
          <section style={{ marginBottom: 28 }}>
            <H2>Specific models</H2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {tool.children.map(c => (
                <a key={c.id} href={`/tools/${c.slug}`}
                  style={{ border: B, padding: '12px 14px', textDecoration: 'none',
                    background: 'var(--surface)' }}
                  className="hover:bg-[var(--surface-hover)] transition-colors">
                  <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--fg)', marginBottom: 2 }}>
                    {c.brand ? `${c.brand} ` : ''}{c.name}
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: 11, color: MUT }}>
                    {[c.wattage != null ? `${c.wattage} W` : null,
                      c.connected ? 'app' : null,
                      c.model_number || null].filter(Boolean).join(' · ') || 'Model'}
                  </div>
                </a>
              ))}
            </div>
          </section>
        )}

        {/* Siblings (other models under the same concept) */}
        {tool.parent && tool.siblings.length > 0 && (
          <section style={{ marginBottom: 28 }}>
            <H2>Related models</H2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {tool.siblings.map(s => (
                <a key={s.id} href={`/tools/${s.slug}`}
                  style={{ fontFamily: MONO, fontSize: 12, color: 'var(--accent)',
                    border: B, padding: '6px 12px', textDecoration: 'none' }}
                  className="hover:bg-[var(--accent-subtle)] transition-colors">
                  {s.brand ? `${s.brand} ` : ''}{s.name}
                </a>
              ))}
            </div>
          </section>
        )}

        {/* 10. My kitchen pointer */}
        <div style={{ marginTop: 40, paddingTop: 20, borderTop: B,
          fontFamily: MONO, fontSize: 10, color: MUT, lineHeight: 1.7 }}>
          Tools you own live under <a href="/my/people" style={{ color: 'var(--accent)' }}>My kitchen</a>, not here.
          This page describes the tool in general.
        </div>

      </div>
    </>
  );
}

function SpecRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between',
      padding: '10px 14px', borderBottom: last ? 'none' : B, fontSize: 14 }}>
      <span style={{ color: MUT }}>{label}</span>
      <span style={{ color: 'var(--fg)' }}>{value}</span>
    </div>
  );
}
