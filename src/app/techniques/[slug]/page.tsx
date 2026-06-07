// src/app/techniques/[slug]/page.tsx
'use client';
import React, { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

type Task = {
  id: string; slug: string | null; name: string; category: string | null;
  description: string | null; tips: string | null; common_mistakes: string | null;
  completion_type: string | null; completion_target: string | null; completion_criterion: string | null;
  heat_mechanism: string | null; heat_medium: string | null;
  min_duration_seconds: number | null; max_duration_seconds: number | null;
  typical_input_state: string | null; typical_output_state: string | null;
  suggested_tool_slugs: string[] | null; image_url: string | null; is_verified: boolean;
};

const prettify = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
function fmtDur(a: number | null, b: number | null): string {
  if (!a && !b) return '';
  const m = (s: number) => s % 3600 === 0 ? `${s / 3600}h` : s % 60 === 0 ? `${s / 60}m` : `${s}s`;
  return a && b && a !== b ? `${m(a)}–${m(b)}` : m((a || b)!);
}

// Plain-language gloss of the completion signal (the appliance-grade doneness model).
const COMPLETION_GLOSS: Record<string, string> = {
  time: 'timed — done after a set duration',
  core_temp: 'by internal temperature (a probe reading)',
  surface_temp: 'by surface temperature',
  color: 'by colour — watch how it browns',
  volume: 'by volume — reduced to a target amount',
  mass: 'by weight — reduced as moisture leaves',
  texture: 'by texture — feel/firmness/viscosity',
  structural: 'by visible state',
  aroma: 'by smell',
  ph: 'by acidity (pH)',
  subjective: 'by judgement — to taste',
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  if (!children) return null;
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '160px 1fr', gap: 16,
      padding: '12px 0', borderBottom: '1px solid var(--border-subtle)',
    }}>
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.1em',
        textTransform: 'uppercase', color: 'var(--muted)',
      }}>
        {label}
      </div>
      <div style={{ color: 'var(--fg)', fontSize: 14, lineHeight: 1.5 }}>{children}</div>
    </div>
  );
}

export default function TechniqueDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [task, setTask] = useState<Task | null | 'missing'>(null);

  useEffect(() => {
    const supabase = createClient() as any;
    (async () => {
      // try slug match, then fall back to name match (slug may be null on some rows)
      let { data } = await supabase.from('tasks').select('*').eq('slug', slug).limit(1);
      if (!data || data.length === 0) {
        const name = slug.replace(/-/g, ' ');
        const r = await supabase.from('tasks').select('*').ilike('name', name).limit(1);
        data = r.data;
      }
      setTask(data && data.length ? data[0] : 'missing');
    })();
  }, [slug]);

  if (task === null) return <div style={{ padding: 40, color: 'var(--muted)' }}>Loading…</div>;
  if (task === 'missing') return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: 40 }}>
      <p style={{ color: 'var(--muted)' }}>That technique wasn&apos;t found.</p>
      <Link href="/techniques" style={{ color: 'var(--accent)' }}>← All techniques</Link>
    </div>
  );

  const heat = task.heat_mechanism && task.heat_mechanism !== 'none'
    ? `${prettify(task.heat_mechanism)}${task.heat_medium && task.heat_medium !== 'none' ? ` in ${task.heat_medium}` : ''}`
    : null;
  const completion = task.completion_type
    ? `${COMPLETION_GLOSS[task.completion_type] ?? task.completion_type}${task.completion_target ? ` (${task.completion_target})` : ''}`
    : null;

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '32px 24px 80px' }}>
      <Link href="/techniques" style={{
        fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--muted)',
        textDecoration: 'none',
      }}>
        ← Techniques
      </Link>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16 }}>
        <h1 style={{
          fontFamily: 'var(--font-display)', fontSize: 34, fontWeight: 600, margin: 0,
          color: 'var(--fg)',
        }}>
          {task.name}
        </h1>
        {!task.is_verified && (
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em',
            textTransform: 'uppercase', color: 'var(--muted)',
            border: '1px solid var(--border)', borderRadius: 2, padding: '2px 6px',
          }}>
            draft — not yet verified
          </span>
        )}
      </div>

      {task.description && (
        <p style={{ fontSize: 17, lineHeight: 1.55, color: 'var(--fg)', marginTop: 14 }}>
          {task.description}
        </p>
      )}

      <div style={{ marginTop: 24 }}>
        <Row label="Done when">{completion}</Row>
        <Row label="Heat">{heat}</Row>
        <Row label="Typical time">{fmtDur(task.min_duration_seconds, task.max_duration_seconds) || null}</Row>
        <Row label="Transforms">
          {(task.typical_input_state || task.typical_output_state)
            ? `${task.typical_input_state ?? '?'} → ${task.typical_output_state ?? '?'}`
            : null}
        </Row>
        <Row label="Tools">
          {task.suggested_tool_slugs?.length ? (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {task.suggested_tool_slugs.map(s => (
                <span key={s} style={{
                  fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg)',
                  border: '1px solid var(--border)', padding: '3px 9px', borderRadius: 2,
                }}>
                  {s}
                </span>
              ))}
            </div>
          ) : null}
        </Row>
        <Row label="Category">{task.category ? prettify(task.category) : null}</Row>
      </div>

      {task.tips && (
        <div style={{ marginTop: 28 }}>
          <h2 style={{
            fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.12em',
            textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8,
          }}>Tips</h2>
          <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--fg)' }}>{task.tips}</p>
        </div>
      )}
      {task.common_mistakes && (
        <div style={{ marginTop: 24 }}>
          <h2 style={{
            fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.12em',
            textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8,
          }}>Common mistakes</h2>
          <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--fg)' }}>{task.common_mistakes}</p>
        </div>
      )}
    </div>
  );
}
