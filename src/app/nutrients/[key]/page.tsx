// src/app/nutrients/[key]/page.tsx
'use client';
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

const MONO = 'var(--font-mono)';
const B = '1px solid var(--border)';

type Nutrient = {
  id: string; key: string; name: string; category: string; unit: string;
  summary: string | null; description: string | null; how_much: string | null;
  too_little: string | null; too_much: string | null; food_sources_note: string | null;
  tips: string | null; aliases: string[] | null; rda_reference: string | null;
  published: boolean; content_reviewed: boolean;
};
type Richest = { slug: string; name: string; amount: number };

const CATEGORY_LABELS: Record<string, string> = {
  macro: 'Macronutrient', vitamin: 'Vitamin', mineral: 'Mineral',
  fatty_acid: 'Fat / fatty acid', amino_acid: 'Amino acid', other: 'Other',
};

export default function NutrientDetailPage() {
  const params = useParams();
  const key = String(params.key);
  const [data, setData] = useState<{ nutrient: Nutrient; richest: Richest[]; unit: string } | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    fetch('/api/admin/check').then(r => r.json()).then(d => setIsAdmin(Boolean(d.isAdmin))).catch(() => {});
  }, []);

  useEffect(() => {
    fetch(`/api/nutrients/${encodeURIComponent(key)}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(setData)
      .catch(() => setNotFound(true));
  }, [key]);

  if (notFound) return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '40px 24px' }}>
      <p style={{ fontFamily: MONO, fontSize: 13, color: 'var(--muted)' }}>Nutrient not found.</p>
      <Link href="/nutrients" style={{ fontFamily: MONO, fontSize: 12, color: 'var(--accent)' }}>← All nutrients</Link>
    </div>
  );
  if (!data) return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '40px 24px' }}>
      <p style={{ fontFamily: MONO, fontSize: 12, color: 'var(--muted)' }}>Loading…</p>
    </div>
  );

  const n = data.nutrient;
  const maxAmount = data.richest.length ? data.richest[0].amount : 0;
  const hasProse = n.description || n.how_much || n.too_little || n.too_much || n.tips;

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 24px 80px' }}>

      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
        <Link href="/nutrients"
          style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: MONO, fontSize: 11, color: 'var(--muted)', textDecoration: 'none' }}
          className="hover:text-[var(--accent)]">
          <ArrowLeft size={12} /> Nutrients
        </Link>
        {isAdmin && (
          <Link href={`/nutrients/${n.key}/edit`}
            style={{ marginLeft: 'auto', fontFamily: MONO, fontSize: 10, color: 'var(--muted)', textDecoration: 'none' }}
            className="hover:text-[var(--accent)]">
            Edit →
          </Link>
        )}
      </div>

      {/* Header */}
      <div style={{ fontFamily: MONO, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--accent)', marginBottom: 6 }}>
        {CATEGORY_LABELS[n.category] ?? n.category} · measured in {n.unit}
      </div>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 30, fontWeight: 400, marginBottom: 8 }}>
        {n.name}
      </h1>
      {n.aliases && n.aliases.length > 0 && (
        <div style={{ fontFamily: MONO, fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>
          Also known as {n.aliases.join(', ')}
        </div>
      )}
      {n.summary && (
        <p style={{ fontFamily: MONO, fontSize: 13, color: 'var(--fg)', lineHeight: 1.65, marginBottom: 4 }}>
          {n.summary}
        </p>
      )}

      {isAdmin && !n.published && (
        <div style={{ fontFamily: MONO, fontSize: 10, color: '#b45309', border: '1px solid #b45309',
          background: '#fef3c7', padding: '5px 10px', display: 'inline-block', marginTop: 8 }}>
          DRAFT — not publicly listed{n.content_reviewed ? '' : ' · content not yet reviewed'}
        </div>
      )}

      {/* Content sections (render only when present) */}
      {n.description && <Section title="What it does" body={n.description} />}
      {n.how_much && <Section title="How much you need" body={n.how_much} note={n.rda_reference} />}
      {n.too_little && <Section title="Too little" body={n.too_little} />}
      {n.too_much && <Section title="Too much" body={n.too_much} />}

      {/* Richest ingredients — the live data view (always shown if we have data) */}
      {data.richest.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <div style={{ fontFamily: MONO, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.15em',
            color: 'var(--accent)', marginBottom: 4 }}>
            Ingredients richest in {n.name.toLowerCase()}
          </div>
          <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--muted)', marginBottom: 12 }}>
            per 100g · across Soupdog's ingredients with nutrition data
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {data.richest.map(r => (
              <Link key={r.slug} href={`/ingredients/${r.slug}`}
                style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none',
                  padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontFamily: MONO, fontSize: 12, color: 'var(--fg)', flex: '0 0 38%' }}>{r.name}</span>
                <span style={{ flex: 1, height: 6, background: 'var(--surface-hover)', position: 'relative', borderRadius: 2 }}>
                  <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0,
                    width: `${maxAmount ? Math.max(2, (r.amount / maxAmount) * 100) : 0}%`,
                    background: 'var(--accent)', borderRadius: 2 }} />
                </span>
                <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--muted)', flex: '0 0 64px', textAlign: 'right' }}>
                  {fmtAmount(r.amount)} {n.unit}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {n.food_sources_note && <Section title="Where it's found" body={n.food_sources_note} />}
      {n.tips && <Section title="Good to know" body={n.tips} />}

      {/* If there's no editorial content yet, a gentle note (not an error) */}
      {!hasProse && data.richest.length === 0 && (
        <p style={{ fontFamily: MONO, fontSize: 12, color: 'var(--muted)', marginTop: 24, lineHeight: 1.6 }}>
          We're still adding detail for {n.name.toLowerCase()}.
        </p>
      )}

      {/* Standing informational disclaimer */}
      {hasProse && (
        <p style={{ fontFamily: MONO, fontSize: 9, color: 'var(--muted)', opacity: 0.7,
          marginTop: 32, paddingTop: 12, borderTop: B, lineHeight: 1.6 }}>
          This is general information, not medical or dietary advice. Needs vary by age, sex,
          activity, pregnancy, and health conditions — consult a qualified professional for
          guidance specific to you.
        </p>
      )}
    </div>
  );
}

function Section({ title, body, note }: { title: string; body: string; note?: string | null }) {
  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ fontFamily: MONO, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--accent)', marginBottom: 8 }}>
        {title}
      </div>
      <p style={{ fontFamily: MONO, fontSize: 12.5, color: 'var(--fg)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
        {body}
      </p>
      {note && <p style={{ fontFamily: MONO, fontSize: 10, color: 'var(--muted)', marginTop: 6 }}>{note}</p>}
    </div>
  );
}

function fmtAmount(a: number): string {
  if (a >= 100) return a.toFixed(0);
  if (a >= 1) return a.toFixed(1);
  if (a >= 0.01) return a.toFixed(2);
  return a.toFixed(3);
}
