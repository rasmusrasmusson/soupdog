// src/components/techniques/TaskDetailModal.tsx
'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { resolveConcept } from '@/lib/tasks/resolve-concept';

// Reusable "click a task for instructions" modal. Self-contained: give it a
// taskId, it fetches the task's archive content (description, completion, heat,
// tips, common mistakes) + its media (images/video), and renders them with a
// language cascade. Usable from a recipe step, cook mode, meal view, anywhere.

type TaskRow = {
  id: string; name: string; slug: string | null;
  description: string | null; tips: string | null; common_mistakes: string | null;
  completion_type: string | null; completion_target: string | null; completion_criterion: string | null;
  heat_mechanism: string | null; heat_medium: string | null;
  min_duration_seconds: number | null; max_duration_seconds: number | null;
  image_url: string | null;
};
type MediaRow = {
  id: string; kind: 'image' | 'video'; role: string;
  language: string | null; url: string; caption: string | null; sort_order: number;
};

const prettify = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

function fmtDur(a: number | null, b: number | null): string {
  if (!a && !b) return '';
  const m = (s: number) => s % 3600 === 0 ? `${s / 3600} h` : s % 60 === 0 ? `${s / 60} min` : `${s}s`;
  return a && b && a !== b ? `${m(a)}–${m(b)}` : m((a || b)!);
}

// Pick the best media for the viewer's language:
//   exact locale  ->  language-neutral (null)  ->  English  ->  whatever exists.
// Applied per role group so a hero and a step-demo can each resolve independently.
function pickForLocale(rows: MediaRow[], locale: string): MediaRow[] {
  if (rows.length === 0) return [];
  const byPref = (r: MediaRow) =>
    r.language === locale ? 0 : r.language == null ? 1 : r.language === 'en' ? 2 : 3;
  // group by role, then within each role keep the best-matching language tier present
  const groups = new Map<string, MediaRow[]>();
  for (const r of rows) {
    const k = r.role || 'detail';
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(r);
  }
  const out: MediaRow[] = [];
  for (const list of groups.values()) {
    const bestTier = Math.min(...list.map(byPref));
    // keep all assets at the best available tier for this role (allows >1 image)
    for (const r of list) if (byPref(r) === bestTier) out.push(r);
  }
  return out.sort((a, b) => a.sort_order - b.sort_order);
}

export function TaskDetailModal({
  taskId,
  locale = 'en',
  onClose,
}: {
  taskId: string;
  locale?: string;
  onClose: () => void;
}) {
  const [task, setTask] = useState<TaskRow | null>(null);
  const [media, setMedia] = useState<MediaRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const supabase = createClient() as any;
      const [{ data: taskData }, mediaRes] = await Promise.all([
        supabase.from('tasks').select(
          'id, name, slug, description, tips, common_mistakes, completion_type, completion_target, completion_criterion, heat_mechanism, heat_medium, min_duration_seconds, max_duration_seconds, image_url, parent_task_id'
        ).eq('id', taskId).maybeSingle(),
        fetch(`/api/admin/tasks/${taskId}/media`).then(r => r.json()).catch(() => ({ media: [] })),
      ]);
      if (cancelled) return;

      let resolved = taskData ?? null;
      let mediaList = Array.isArray(mediaRes?.media) ? mediaRes.media : [];

      // concept resolution: fill empty content fields from the parent; if the
      // concept has no media of its own, fall back to the parent's media.
      if (taskData?.parent_task_id) {
        const { data: parent } = await supabase.from('tasks').select('*').eq('id', taskData.parent_task_id).maybeSingle();
        if (!cancelled) {
          resolved = resolveConcept(taskData, parent ?? null);
          if (mediaList.length === 0 && parent?.id) {
            const pm = await fetch(`/api/admin/tasks/${parent.id}/media`).then(r => r.json()).catch(() => ({ media: [] }));
            if (!cancelled && Array.isArray(pm?.media)) mediaList = pm.media;
          }
        }
      }
      if (cancelled) return;
      setTask(resolved);
      setMedia(mediaList);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [taskId]);

  // close on Escape
  const onKey = useCallback((e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }, [onClose]);
  useEffect(() => {
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onKey]);

  const shown = pickForLocale(media, locale);
  const heat = task?.heat_mechanism && task.heat_mechanism !== 'none'
    ? `${prettify(task.heat_mechanism)}${task.heat_medium && task.heat_medium !== 'none' ? ` in ${task.heat_medium}` : ''}`
    : '';
  const dur = task ? fmtDur(task.min_duration_seconds, task.max_duration_seconds) : '';
  const doneWhen = task?.completion_criterion
    || (task?.completion_target ? `${task.completion_target}${task.completion_type ? ` (${prettify(task.completion_type)})` : ''}` : '');

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(20,18,14,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--surface, #fff)', border: '1px solid var(--border)',
          maxWidth: 560, width: '100%', maxHeight: '85vh', overflowY: 'auto',
          padding: '24px 26px', position: 'relative',
        }}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            position: 'absolute', top: 12, right: 14, background: 'transparent', border: 'none',
            fontSize: 22, lineHeight: 1, color: 'var(--muted)', cursor: 'pointer',
          }}
        >×</button>

        {loading && <p style={{ color: 'var(--muted)' }}>Loading…</p>}

        {!loading && !task && <p style={{ color: 'var(--muted)' }}>Technique not found.</p>}

        {!loading && task && (
          <>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 6 }}>
              Technique
            </div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 600, margin: '0 0 10px', color: 'var(--fg)' }}>
              {task.name}
            </h2>

            {task.description && (
              <p style={{ fontSize: 15, lineHeight: 1.6, color: 'var(--fg)', margin: '0 0 16px' }}>
                {task.description}
              </p>
            )}

            {/* media gallery — locale-resolved */}
            {shown.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: shown.length > 1 ? 'repeat(auto-fit, minmax(200px, 1fr))' : '1fr', gap: 10, margin: '0 0 18px' }}>
                {shown.map(m => (
                  <figure key={m.id} style={{ margin: 0 }}>
                    {m.kind === 'video'
                      ? <video src={m.url} controls playsInline style={{ width: '100%', borderRadius: 2, background: '#000' }} />
                      : <img src={m.url} alt={m.caption ?? task.name} style={{ width: '100%', borderRadius: 2, display: 'block' }} />}
                    {m.caption && (
                      <figcaption style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{m.caption}</figcaption>
                    )}
                  </figure>
                ))}
              </div>
            )}

            {/* compact facts */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 18px', fontSize: 13, color: 'var(--muted)', marginBottom: doneWhen || task.tips || task.common_mistakes ? 16 : 0 }}>
              {heat && <span><strong style={{ color: 'var(--fg)', fontWeight: 600 }}>Heat:</strong> {heat}</span>}
              {dur && <span><strong style={{ color: 'var(--fg)', fontWeight: 600 }}>Typical time:</strong> {dur}</span>}
            </div>

            {doneWhen && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 4 }}>Done when</div>
                <p style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--fg)', margin: 0 }}>{doneWhen}</p>
              </div>
            )}

            {task.tips && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 4 }}>Tips</div>
                <p style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--fg)', margin: 0 }}>{task.tips}</p>
              </div>
            )}

            {task.common_mistakes && (
              <div style={{ marginBottom: 4 }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 4 }}>Common mistakes</div>
                <p style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--fg)', margin: 0 }}>{task.common_mistakes}</p>
              </div>
            )}

            {task.slug && (
              <a href={`/techniques/${task.slug}`} style={{ display: 'inline-block', marginTop: 16, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent)', textDecoration: 'none' }}>
                Full technique page →
              </a>
            )}
          </>
        )}
      </div>
    </div>
  );
}
