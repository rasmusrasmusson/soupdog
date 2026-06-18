// src/app/techniques/[slug]/page.tsx
'use client';
import React, { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { resolveConcept } from '@/lib/tasks/resolve-concept';
import { useLocale } from '@/lib/locale-context';

type MediaRow = { id: string; kind: 'image' | 'video'; role: string; language: string | null; url: string; caption: string | null; sort_order: number | null };

// keep the best-matching language tier per role (viewer locale → neutral → en → any)
function pickForLocale(rows: MediaRow[], locale: string): MediaRow[] {
  const tier = (r: MediaRow) => (r.language === locale ? 0 : r.language == null ? 1 : r.language === 'en' ? 2 : 3);
  const groups = new Map<string, MediaRow[]>();
  for (const r of rows) { const k = r.role || 'detail'; if (!groups.has(k)) groups.set(k, []); groups.get(k)!.push(r); }
  const out: MediaRow[] = [];
  for (const [, gs] of groups) {
    const best = Math.min(...gs.map(tier));
    out.push(...gs.filter(g => tier(g) === best).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)));
  }
  return out;
}

type Task = {
  id: string; slug: string | null; name: string; category: string | null;
  description: string | null; tips: string | null; common_mistakes: string | null;
  completion_type: string | null; completion_target: string | null; completion_criterion: string | null;
  heat_mechanism: string | null; heat_medium: string | null;
  min_duration_seconds: number | null; max_duration_seconds: number | null;
  typical_input_state: string | null; typical_output_state: string | null;
  suggested_tool_slugs: string[] | null; image_url: string | null; is_verified: boolean;
  archived_at: string | null;
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
  const [children, setChildren] = useState<{ id: string; name: string; slug: string }[]>([]);
  const [parentLink, setParentLink] = useState<{ name: string; slug: string } | null>(null);
  const [media, setMedia] = useState<MediaRow[]>([]);
  const [lightbox, setLightbox] = useState<MediaRow | null>(null);
  const { locale } = useLocale();
  const [isAdmin, setIsAdmin] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);

  async function setArchived(next: boolean) {
    if (!task || task === 'missing') return;
    setArchiving(true);
    const res = await fetch(`/api/admin/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived: next }),
    });
    setArchiving(false);
    setConfirmArchive(false);
    if (res.ok) {
      if (next) window.location.href = '/techniques';
      else setTask({ ...task, archived_at: null });
    }
  }

  useEffect(() => {
    fetch('/api/admin/check')
      .then(r => r.ok ? r.json() : { isAdmin: false })
      .then((d: any) => setIsAdmin(!!d.isAdmin))
      .catch(() => setIsAdmin(false));
  }, []);

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
      const row = data && data.length ? data[0] : null;
      if (!row) { setTask('missing'); return; }
      // concept resolution: if this task has a parent, fill empty content fields
      // from the parent (own value wins). Identity + bound_* stay the concept's own.
      if (row.parent_task_id) {
        const { data: parent } = await supabase.from('tasks').select('*').eq('id', row.parent_task_id).maybeSingle();
        setTask(resolveConcept(row, parent ?? null));
        if (parent) setParentLink({ name: parent.name, slug: parent.slug });
      } else {
        setTask(row);
      }
      // list this task's specific versions (active only — archived hidden here)
      const { data: kids } = await supabase.from('tasks')
        .select('id, name, slug, archived_at')
        .eq('parent_task_id', row.id)
        .order('name');
      setChildren((kids ?? []).filter((k: any) => !k.archived_at).map((k: any) => ({ id: k.id, name: k.name, slug: k.slug })));

      // media: this task's own, falling back to the parent's if a concept has none
      let mediaList: MediaRow[] = [];
      try {
        const mr = await fetch(`/api/admin/tasks/${row.id}/media`).then(r => r.json());
        mediaList = Array.isArray(mr?.media) ? mr.media : [];
      } catch { mediaList = []; }
      if (mediaList.length === 0 && row.parent_task_id) {
        try {
          const pm = await fetch(`/api/admin/tasks/${row.parent_task_id}/media`).then(r => r.json());
          if (Array.isArray(pm?.media)) mediaList = pm.media;
        } catch { /* ignore */ }
      }
      setMedia(mediaList);
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

  // split media into a hero (role=hero, else fall back to the legacy image_url)
  // and the ordered instructional "step" media (everything else, by sort_order).
  const localised = pickForLocale(media, locale);
  const heroMedia = localised.find(m => m.role === 'hero') ?? null;
  const heroAsset = heroMedia
    ? { url: heroMedia.url, video: heroMedia.kind === 'video', media: heroMedia as MediaRow }
    : (task.image_url ? { url: task.image_url, video: false, media: null as MediaRow | null } : null);
  const stepMedia = localised
    .filter(m => m.role !== 'hero')
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '32px 24px 80px' }}>
      <Link href="/techniques" style={{
        fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--muted)',
        textDecoration: 'none',
      }}>
        ← Techniques
      </Link>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
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
          {task.archived_at && (
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em',
              textTransform: 'uppercase', color: 'var(--muted)',
              border: '1px solid var(--border)', borderRadius: 2, padding: '2px 6px',
            }}>
              archived
            </span>
          )}
        </div>
        {isAdmin && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {task.archived_at ? (
              <button onClick={() => setArchived(false)} disabled={archiving}
                style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--accent)',
                  border: '1px solid var(--accent)', padding: '6px 14px', background: 'transparent',
                  cursor: archiving ? 'default' : 'pointer', opacity: archiving ? 0.6 : 1 }}>
                {archiving ? 'Restoring…' : 'Unarchive'}
              </button>
            ) : confirmArchive ? (
              <>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)' }}>
                  Archive? (reversible)
                </span>
                <button onClick={() => setArchived(true)} disabled={archiving}
                  style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: '#fff',
                    background: 'var(--muted)', border: 'none', padding: '6px 14px',
                    cursor: archiving ? 'default' : 'pointer', opacity: archiving ? 0.6 : 1 }}>
                  {archiving ? 'Archiving…' : 'Archive'}
                </button>
                <button onClick={() => setConfirmArchive(false)} disabled={archiving}
                  style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)',
                    background: 'none', border: 'none', cursor: 'pointer' }}>
                  Cancel
                </button>
              </>
            ) : (
              <button onClick={() => setConfirmArchive(true)}
                style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--muted)',
                  background: 'none', border: 'none', cursor: 'pointer' }}>
                Archive
              </button>
            )}
            <Link href={`/techniques/${slug}/edit`} style={{
              fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--accent)',
              border: '1px solid var(--accent)', padding: '6px 14px', textDecoration: 'none',
            }}>
              Edit
            </Link>
          </div>
        )}
      </div>

      {/* intro: description left, hero right (matches ingredient pages) */}
      <div style={{ display: 'flex', gap: 24, marginTop: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 320px', minWidth: 280 }}>
          {task.description && (
            <p style={{ fontSize: 17, lineHeight: 1.55, color: 'var(--fg)', margin: 0 }}>
              {task.description}
            </p>
          )}
        </div>
        {heroAsset && (
          <div style={{ flex: '0 0 280px', maxWidth: 320, border: '1px solid var(--border)', background: 'var(--surface)', overflow: 'hidden', cursor: 'pointer' }}
            onClick={() => heroAsset.media && setLightbox(heroAsset.media)}>
            {heroAsset.video
              ? <video src={heroAsset.url} controls playsInline style={{ display: 'block', width: '100%', background: '#000' }} />
              : <img src={heroAsset.url} alt={task.name} style={{ display: 'block', width: '100%', objectFit: 'cover' }} />}
          </div>
        )}
      </div>

      {/* instructional media: ordered grid of step cards (images + videos mixed), click to enlarge */}
      {stepMedia.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.12em',
            textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 12 }}>Step by step</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 14 }}>
            {stepMedia.map((m, i) => (
              <button key={m.id} onClick={() => setLightbox(m)}
                style={{ textAlign: 'left', padding: 0, border: '1px solid var(--border)', background: 'var(--surface)',
                  cursor: 'pointer', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <div style={{ position: 'relative', width: '100%', aspectRatio: '4 / 3', background: '#000', overflow: 'hidden' }}>
                  {m.kind === 'video'
                    ? <>
                        <video src={m.url} muted playsInline preload="metadata" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: '#fff', fontSize: 26, textShadow: '0 1px 4px rgba(0,0,0,0.6)' }}>▸</span>
                      </>
                    : <img src={m.url} alt={m.caption ?? ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                  <span style={{ position: 'absolute', top: 6, left: 6, fontFamily: 'var(--font-mono)', fontSize: 11,
                    color: '#fff', background: 'rgba(0,0,0,0.55)', padding: '1px 7px', borderRadius: 2 }}>{i + 1}</span>
                </div>
                {m.caption && <div style={{ fontSize: 12, color: 'var(--fg)', padding: '8px 10px', lineHeight: 1.4 }}>{m.caption}</div>}
              </button>
            ))}
          </div>
        </div>
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

      {parentLink && (
        <div style={{ marginTop: 24, fontSize: 13, color: 'var(--muted)' }}>
          A specific version of{' '}
          <Link href={`/techniques/${parentLink.slug}`} style={{ color: 'var(--accent)', textDecoration: 'none' }}>
            {parentLink.name}
          </Link>.
        </div>
      )}

      {children.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h2 style={{
            fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.12em',
            textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 10,
          }}>Specific versions</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {children.map(c => (
              <Link key={c.id} href={`/techniques/${c.slug}`}
                style={{ fontSize: 14, color: 'var(--accent)', textDecoration: 'none',
                  padding: '8px 12px', border: '1px solid var(--border)', background: 'var(--surface)' }}>
                {c.name}
              </Link>
            ))}
          </div>
        </div>
      )}

      {lightbox && (
        <div onClick={() => setLightbox(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.8)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ maxWidth: 900, width: '100%', maxHeight: '90vh', background: 'var(--bg)', overflow: 'auto' }}>
            {lightbox.kind === 'video'
              ? <video src={lightbox.url} controls autoPlay playsInline style={{ display: 'block', width: '100%', maxHeight: '80vh', background: '#000' }} />
              : <img src={lightbox.url} alt={lightbox.caption ?? task.name} style={{ display: 'block', width: '100%', maxHeight: '80vh', objectFit: 'contain', background: '#000' }} />}
            {lightbox.caption && <div style={{ fontSize: 14, color: 'var(--fg)', padding: '12px 16px' }}>{lightbox.caption}</div>}
          </div>
          <button onClick={() => setLightbox(null)}
            style={{ position: 'fixed', top: 18, right: 22, fontSize: 26, color: '#fff', background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1 }}>
            ×
          </button>
        </div>
      )}
    </div>
  );
}
