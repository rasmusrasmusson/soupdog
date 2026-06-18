// src/app/techniques/[slug]/edit/page.tsx
'use client';
import React, { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ImageUpload } from '@/components/admin/ImageUpload';
import { IngredientPicker, ToolPicker } from '@/components/techniques/BindingPickers';
import {
  DndContext, closestCenter, PointerSensor, TouchSensor, KeyboardSensor,
  useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, rectSortingStrategy, useSortable, sortableKeyboardCoordinates, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const COMPLETION_TYPES = ['', 'time','core_temp','surface_temp','color','volume','mass','texture','structural','aroma','ph','subjective'];
const HEAT_MECHANISMS = ['', 'conduction','convection','radiation','dielectric','combination','none'];
const HEAT_MEDIA = ['', 'fat','water','steam','air','direct','none'];

// Media manager option lists
const MEDIA_LANGS: { value: string; label: string }[] = [
  { value: '',   label: 'Language-neutral' },
  { value: 'en', label: 'English' },
  { value: 'zh', label: '中文' },
  { value: 'sv', label: 'Svenska' },
  { value: 'ar', label: 'العربية' },
];
const MEDIA_ROLES = ['hero', 'step_demo', 'diagram', 'detail'];
const langLabel = (v: string | null) => MEDIA_LANGS.find(l => l.value === (v ?? ''))?.label ?? (v ?? 'Language-neutral');

const L: React.CSSProperties = {
  fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.1em',
  textTransform: 'uppercase', color: 'var(--muted)', display: 'block', marginBottom: 6,
};
const I: React.CSSProperties = {
  width: '100%', padding: '8px 10px', fontSize: 14, border: '1px solid var(--border)',
  background: 'var(--surface)', color: 'var(--fg)', fontFamily: 'var(--font-body, inherit)',
};
const FIELD: React.CSSProperties = { marginBottom: 18 };

export default function TaskEditPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const router = useRouter();
  const [t, setT] = useState<any | null | 'missing'>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [draftMsg, setDraftMsg] = useState<string | null>(null);
  const [parentInfo, setParentInfo] = useState<{ name: string; slug: string } | null>(null);
  const [boundIngLabel, setBoundIngLabel] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient() as any;
    (async () => {
      let { data } = await supabase.from('tasks').select('*').eq('slug', slug).limit(1);
      if (!data || data.length === 0) {
        const r = await supabase.from('tasks').select('*').ilike('name', slug.replace(/-/g, ' ')).limit(1);
        data = r.data;
      }
      const row = data && data.length ? data[0] : null;
      setT(row ?? 'missing');
      if (row?.parent_task_id) {
        const { data: p } = await supabase.from('tasks').select('name, slug').eq('id', row.parent_task_id).maybeSingle();
        if (p) setParentInfo({ name: p.name, slug: p.slug });
      }
      if (row?.bound_ingredient_id) {
        const { data: ing } = await supabase.from('ingredients').select('name').eq('id', row.bound_ingredient_id).maybeSingle();
        if (ing) setBoundIngLabel(ing.name);
      }
    })();
  }, [slug]);

  if (t === null) return <div style={{ padding: 40, color: 'var(--muted)' }}>Loading…</div>;
  if (t === 'missing') return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: 40 }}>
      <p style={{ color: 'var(--muted)' }}>Task not found.</p>
      <Link href="/techniques" style={{ color: 'var(--accent)' }}>← Techniques</Link>
    </div>
  );

  const set = (k: string, v: any) => setT({ ...t, [k]: v });

  // AI-draft tips + common mistakes (fills the fields for review; does not save)
  const draftContent = async () => {
    setDrafting(true); setDraftMsg(null);
    try {
      const res = await fetch(`/api/admin/tasks/${t.id}/draft-content`, { method: 'POST' });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) { setDraftMsg(out.error || `Failed (${res.status})`); setDrafting(false); return; }
      // fill whichever fields came back; leave existing if the AI returned empty
      setT((prev: any) => ({
        ...prev,
        tips: out.tips || prev.tips,
        common_mistakes: out.common_mistakes || prev.common_mistakes,
      }));
      setDraftMsg('Drafted — review and Save.');
    } catch (e: any) {
      setDraftMsg(e?.message || 'Network error');
    }
    setDrafting(false);
  };

  const save = async () => {
    setSaving(true); setMsg(null);
    const payload = {
      name: t.name, category: t.category, description: t.description,
      tips: t.tips, common_mistakes: t.common_mistakes,
      completion_type: t.completion_type, completion_target: t.completion_target,
      completion_criterion: t.completion_criterion,
      heat_mechanism: t.heat_mechanism, heat_medium: t.heat_medium,
      min_duration_seconds: t.min_duration_seconds, max_duration_seconds: t.max_duration_seconds,
      typical_input_state: t.typical_input_state, typical_output_state: t.typical_output_state,
      suggested_tool_slugs: Array.isArray(t.suggested_tool_slugs) ? t.suggested_tool_slugs.join(', ') : t.suggested_tool_slugs,
      is_verified: t.is_verified,
      image_url: t.image_url ?? null,
      parent_task_id: t.parent_task_id ?? null,
      bound_ingredient_id: t.bound_ingredient_id ?? null,
      bound_tool_slug: t.bound_tool_slug ?? null,
    };
    const res = await fetch(`/api/admin/tasks/${t.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const out = await res.json().catch(() => ({}));
    setSaving(false);
    if (res.ok) { setMsg('Saved.'); setTimeout(() => router.push(`/techniques/${slug}`), 600); }
    else setMsg(`Error: ${out.error ?? res.status}`);
  };

  // archive = soft-delete (lives on the technique's own page, with full context)
  const archive = async () => {
    if (!confirm(`Archive “${t.name}”? It will be hidden from the techniques list. You can restore it later.`)) return;
    setSaving(true); setMsg(null);
    const res = await fetch(`/api/admin/tasks/${t.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived: true }),
    });
    setSaving(false);
    if (res.ok) { setMsg('Archived.'); setTimeout(() => router.push('/techniques'), 600); }
    else { const o = await res.json().catch(() => ({})); setMsg(`Error: ${o.error ?? res.status}`); }
  };

  const toolStr = Array.isArray(t.suggested_tool_slugs) ? t.suggested_tool_slugs.join(', ') : (t.suggested_tool_slugs ?? '');

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: '32px 24px 100px' }}>
      <Link href={`/techniques/${slug}`} style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--muted)', textDecoration: 'none' }}>
        ← {t.name}
      </Link>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 600, margin: '14px 0 24px', color: 'var(--fg)' }}>
        Edit technique
      </h1>

      {t.parent_task_id && (
        <div style={{ ...FIELD, padding: '12px 14px', border: '1px solid var(--border)',
          background: 'var(--surface)', borderLeft: '3px solid var(--accent)' }}>
          <div style={{ fontSize: 13, color: 'var(--fg)' }}>
            Specific version of{' '}
            {parentInfo
              ? <Link href={`/techniques/${parentInfo.slug}/edit`} style={{ color: 'var(--accent)', textDecoration: 'underline' }}>{parentInfo.name}</Link>
              : <span style={{ color: 'var(--muted)' }}>its parent</span>}.
          </div>
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: '6px 0 8px', lineHeight: 1.5 }}>
            Any field you leave empty here inherits from the parent. Fill a field only to override it.
          </p>
          <button
            onClick={() => { set('parent_task_id', null); setParentInfo(null); }}
            style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)',
              background: 'transparent', border: '1px solid var(--border)', padding: '5px 10px', cursor: 'pointer' }}>
            Make standalone (remove parent link)
          </button>
          <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 8 }}>— takes effect on Save</span>

          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 420 }}>
            <div>
              <label style={{ ...L, fontSize: 11 }}>Specialised for ingredient (optional)</label>
              <IngredientPicker value={t.bound_ingredient_id ?? null} valueLabel={boundIngLabel}
                onChange={(id, label) => { set('bound_ingredient_id', id); setBoundIngLabel(label); }} />
            </div>
            <div>
              <label style={{ ...L, fontSize: 11 }}>Specialised for tool (optional)</label>
              <ToolPicker value={t.bound_tool_slug ?? null}
                onChange={(slug) => set('bound_tool_slug', slug)} />
            </div>
            <p style={{ fontSize: 11, color: 'var(--muted)', margin: 0, lineHeight: 1.5 }}>
              These are what make this a distinct version (e.g. a bound ingredient like “lemon”, or a bound tool like “knife”). Saved with the technique.
            </p>
          </div>
        </div>
      )}

      <div style={FIELD}><label style={L}>Name</label>
        <input style={I} value={t.name ?? ''} onChange={e => set('name', e.target.value)} /></div>

      <div style={FIELD}><label style={L}>Description</label>
        <textarea style={{ ...I, minHeight: 64, resize: 'vertical' }} value={t.description ?? ''} onChange={e => set('description', e.target.value)} /></div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={FIELD}><label style={L}>Completion type</label>
          <select style={I} value={t.completion_type ?? ''} onChange={e => set('completion_type', e.target.value)}>
            {COMPLETION_TYPES.map(c => <option key={c} value={c}>{c || '—'}</option>)}
          </select></div>
        <div style={FIELD}><label style={L}>Completion target</label>
          <input style={I} value={t.completion_target ?? ''} onChange={e => set('completion_target', e.target.value)} placeholder='e.g. golden / al dente / 74' /></div>
      </div>

      <div style={FIELD}><label style={L}>Completion criterion (human phrasing)</label>
        <input style={I} value={t.completion_criterion ?? ''} onChange={e => set('completion_criterion', e.target.value)} /></div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={FIELD}><label style={L}>Heat mechanism</label>
          <select style={I} value={t.heat_mechanism ?? ''} onChange={e => set('heat_mechanism', e.target.value)}>
            {HEAT_MECHANISMS.map(c => <option key={c} value={c}>{c || '—'}</option>)}
          </select></div>
        <div style={FIELD}><label style={L}>Heat medium</label>
          <select style={I} value={t.heat_medium ?? ''} onChange={e => set('heat_medium', e.target.value)}>
            {HEAT_MEDIA.map(c => <option key={c} value={c}>{c || '—'}</option>)}
          </select></div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={FIELD}><label style={L}>Min duration (seconds)</label>
          <input style={I} type="number" value={t.min_duration_seconds ?? ''} onChange={e => set('min_duration_seconds', e.target.value)} /></div>
        <div style={FIELD}><label style={L}>Max duration (seconds)</label>
          <input style={I} type="number" value={t.max_duration_seconds ?? ''} onChange={e => set('max_duration_seconds', e.target.value)} /></div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={FIELD}><label style={L}>Input state</label>
          <input style={I} value={t.typical_input_state ?? ''} onChange={e => set('typical_input_state', e.target.value)} /></div>
        <div style={FIELD}><label style={L}>Output state</label>
          <input style={I} value={t.typical_output_state ?? ''} onChange={e => set('typical_output_state', e.target.value)} /></div>
      </div>

      <div style={FIELD}><label style={L}>Category</label>
        <input style={I} value={t.category ?? ''} onChange={e => set('category', e.target.value)} /></div>

      <div style={FIELD}><label style={L}>Tools (comma-separated slugs)</label>
        <input style={I} value={toolStr} onChange={e => set('suggested_tool_slugs', e.target.value)} placeholder='large-pot, colander' /></div>

      <div style={FIELD}><label style={L}>Hero image</label>
        <ImageUpload kind="techniques" slug={slug} value={t.image_url} onChange={url => set('image_url', url)} /></div>

      {/* Media manager — multiple images + videos, per language. Saves immediately
          (its own table), independent of the Save-technique button below. */}
      <MediaManager taskId={t.id} slug={slug} />

      {/* Concepts — specialised versions of this task (e.g. "Zest a lemon" under
          "Zest"). Only shown for generic tasks (a concept has parent_task_id set). */}
      {!t.parent_task_id && <ConceptsManager taskId={t.id} taskName={t.name} />}

      <div style={{ ...FIELD, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button onClick={draftContent} disabled={drafting}
          style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.06em',
            textTransform: 'uppercase', padding: '7px 14px', cursor: drafting ? 'default' : 'pointer',
            color: drafting ? 'var(--muted)' : 'var(--accent)', background: 'transparent',
            border: '1px solid var(--accent)' }}>
          {drafting ? 'Drafting…' : '✨ Draft tips & mistakes with AI'}
        </button>
        {draftMsg && (
          <span style={{ fontSize: 12, color: draftMsg.startsWith('Drafted') ? 'var(--accent)' : '#b4413c' }}>
            {draftMsg}
          </span>
        )}
      </div>

      <div style={FIELD}><label style={L}>Tips</label>
        <textarea style={{ ...I, minHeight: 56, resize: 'vertical' }} value={t.tips ?? ''} onChange={e => set('tips', e.target.value)} /></div>

      <div style={FIELD}><label style={L}>Common mistakes</label>
        <textarea style={{ ...I, minHeight: 56, resize: 'vertical' }} value={t.common_mistakes ?? ''} onChange={e => set('common_mistakes', e.target.value)} /></div>

      <label style={{
        display: 'flex', alignItems: 'flex-start', gap: 12, margin: '8px 0 24px',
        cursor: 'pointer', padding: '14px 16px',
        border: `1px solid ${t.is_verified ? 'var(--accent)' : 'var(--border)'}`,
        background: t.is_verified ? 'var(--accent-subtle)' : 'transparent',
      }}>
        <input type="checkbox" checked={!!t.is_verified} onChange={e => set('is_verified', e.target.checked)}
          style={{ marginTop: 2 }} />
        <span>
          <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--fg)' }}>
            {t.is_verified ? 'Published — verified' : 'Publish this technique'}
          </span>
          <span style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
            Verified techniques join the AI guide and lose the &ldquo;draft&rdquo; badge. Leave
            unchecked to keep it as a draft.
          </span>
        </span>
      </label>

      {/* Fixed bottom save bar (matches the recipe editor pattern; no chat sidebar here so right:0) */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        borderTop: '1px solid var(--border)', background: 'var(--surface)',
        padding: '10px 32px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', zIndex: 50,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--muted)' }}>
            Editing technique
          </span>
          {msg && (
            <span style={{ fontSize: 13, color: msg.startsWith('Error') ? '#b4413c' : 'var(--accent)' }}>
              {msg}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button onClick={archive} disabled={saving}
            style={{ background: 'transparent', color: '#b4413c', border: '1px solid #b4413c', padding: '9px 16px', fontSize: 13, cursor: saving ? 'default' : 'pointer', fontFamily: 'var(--font-mono)', opacity: saving ? 0.6 : 1 }}>
            Archive
          </button>
          <Link href={`/techniques/${slug}`} style={{ color: 'var(--muted)', fontSize: 14, textDecoration: 'none' }}>
            Cancel
          </Link>
          <button onClick={save} disabled={saving}
            style={{ background: 'var(--accent)', color: '#fff', border: 'none', padding: '10px 22px', fontSize: 14, cursor: saving ? 'default' : 'pointer', fontFamily: 'var(--font-mono)', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Saving…' : 'Save technique'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Media manager: lists / uploads / removes task_media rows for this task.
// Files go through /api/admin/upload-media (image -> WebP, video stored as-is);
// the returned url + path are recorded via /api/admin/tasks/{id}/media.
// Each asset carries a language so the public page can serve the user's locale.
// ---------------------------------------------------------------------------
type MediaRow = {
  id: string; kind: 'image' | 'video'; role: string;
  language: string | null; url: string; storage_path: string | null;
  caption: string | null; sort_order: number;
};

function MediaManager({ taskId, slug }: { taskId: string; slug: string }) {
  const [media, setMedia] = useState<MediaRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // form state for the next upload
  const [lang, setLang] = useState<string>('en');
  const [role, setRole] = useState<string>('step_demo');
  const [caption, setCaption] = useState<string>('');

  const load = async () => {
    try {
      const j = await fetch(`/api/admin/tasks/${taskId}/media`).then(r => r.json());
      setMedia(j.media ?? []);
    } catch {
      setMedia([]);
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [taskId]);

  const onPick = async (file: File) => {
    setBusy(true); setErr(null);
    try {
      // 1) upload the file
      const form = new FormData();
      form.append('file', file);
      form.append('kind', 'techniques');
      form.append('slug', slug);
      const up = await fetch('/api/admin/upload-media', { method: 'POST', body: form }).then(r => r.json());
      if (!up.url) { setErr(up.error || 'Upload failed'); setBusy(false); return; }
      // 2) record the row
      const row = await fetch(`/api/admin/tasks/${taskId}/media`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: up.kind,                       // 'image' | 'video' from the upload route
          role,
          language: lang || null,
          url: up.url,
          storage_path: up.path ?? null,
          caption: caption.trim() || null,
          sort_order: (media?.length ?? 0),
        }),
      }).then(r => r.json());
      if (row.error) { setErr(row.error); setBusy(false); return; }
      setCaption('');
      await load();
    } catch (e: any) {
      setErr(e?.message || 'Upload error');
    }
    setBusy(false);
  };

  const remove = async (id: string) => {
    setBusy(true); setErr(null);
    try {
      await fetch(`/api/admin/tasks/${taskId}/media?mediaId=${id}`, { method: 'DELETE' });
      await load();
    } catch (e: any) {
      setErr(e?.message || 'Delete error');
    }
    setBusy(false);
  };

  // edit a caption after upload
  const saveCaption = async (id: string, value: string) => {
    setBusy(true); setErr(null);
    try {
      await fetch(`/api/admin/tasks/${taskId}/media?mediaId=${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caption: value }),
      });
      await load();
    } catch (e: any) { setErr(e?.message || 'Save error'); }
    setBusy(false);
  };

  // reorder: swap this item's sort_order with its neighbour in the given direction
  const move = async (index: number, dir: -1 | 1) => {
    if (!media) return;
    const a = media[index];
    const b = media[index + dir];
    if (!a || !b) return;
    const aOrder = a.sort_order ?? index;
    const bOrder = b.sort_order ?? index + dir;
    setBusy(true); setErr(null);
    try {
      await Promise.all([
        fetch(`/api/admin/tasks/${taskId}/media?mediaId=${a.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sort_order: bOrder }),
        }),
        fetch(`/api/admin/tasks/${taskId}/media?mediaId=${b.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sort_order: aOrder }),
        }),
      ]);
      await load();
    } catch (e: any) { setErr(e?.message || 'Reorder error'); }
    setBusy(false);
  };

  // drag-and-drop reorder via dnd-kit (grab-and-follow, touch + mouse).
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e;
    if (!media || !over || active.id === over.id) return;
    const from = media.findIndex(m => m.id === active.id);
    const to = media.findIndex(m => m.id === over.id);
    if (from < 0 || to < 0) return;
    const arr = arrayMove(media, from, to);
    setMedia(arr);                         // optimistic — reorders instantly
    setErr(null);
    try {
      await Promise.all(arr.map((m, i) =>
        (m.sort_order ?? -1) === i ? null :
        fetch(`/api/admin/tasks/${taskId}/media?mediaId=${m.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sort_order: i }),
        })
      ).filter(Boolean) as Promise<any>[]);
      await load();                         // reconcile with server
    } catch (err: any) { setErr(err?.message || 'Reorder error'); await load(); }
  };

  return (
    <div style={{ ...FIELD, border: '1px solid var(--border)', padding: '16px', background: 'var(--surface)' }}>
      <label style={L}>Media (images &amp; video, per language)</label>
      <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 14px', lineHeight: 1.5 }}>
        Add one or more images or short video clips that explain this technique. Set the
        language for each — the public page serves the viewer&apos;s language, falling back to
        language-neutral, then English.
      </p>

      {/* existing media grid */}
      {media === null && <p style={{ fontSize: 13, color: 'var(--muted)' }}>Loading media…</p>}
      {media && media.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 14 }}>No media yet.</p>
      )}
      {media && media.length > 0 && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={media.map(m => m.id)} strategy={rectSortingStrategy}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12, marginBottom: 18 }}>
              {media.map((m: MediaRow, idx: number) => (
                <SortableCard key={m.id} m={m} idx={idx} count={media.length} busy={busy}
                  onMove={move} onRemove={remove} onCaption={saveCaption} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* upload controls */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 10 }}>
        <div>
          <label style={{ ...L, fontSize: 9 }}>Language</label>
          <select style={{ ...I, width: 'auto', padding: '6px 8px', fontSize: 13 }} value={lang} onChange={e => setLang(e.target.value)}>
            {MEDIA_LANGS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
          </select>
        </div>
        <div>
          <label style={{ ...L, fontSize: 9 }}>Role</label>
          <select style={{ ...I, width: 'auto', padding: '6px 8px', fontSize: 13 }} value={role} onChange={e => setRole(e.target.value)}>
            {MEDIA_ROLES.map(r => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}
          </select>
        </div>
        <div style={{ flex: 1, minWidth: 160 }}>
          <label style={{ ...L, fontSize: 9 }}>Caption (optional)</label>
          <input style={{ ...I, padding: '6px 8px', fontSize: 13 }} value={caption} onChange={e => setCaption(e.target.value)} placeholder='e.g. holding the microplane' />
        </div>
      </div>

      <label style={{
        display: 'inline-flex', alignItems: 'center', gap: 8, cursor: busy ? 'default' : 'pointer',
        fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase',
        color: busy ? 'var(--muted)' : 'var(--accent)', border: '1px solid var(--accent)', padding: '8px 14px',
      }}>
        {busy ? 'Uploading…' : '+ Add image or video'}
        <input type="file" accept="image/*,video/mp4,video/webm,video/quicktime" disabled={busy}
          style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) onPick(f); e.currentTarget.value = ''; }} />
      </label>

      {err && <div style={{ marginTop: 10, fontSize: 12, color: '#b4413c' }}>{err}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Concepts manager: lists + creates specialised versions of a generic task.
// A concept is a task row with parent_task_id = this task. Its content fields
// resolve from the parent (see src/lib/tasks/resolve-concept.ts); here we only
// set name + bound dimensions. Created concepts open in their own edit page.
// ---------------------------------------------------------------------------
type ConceptRow = {
  id: string; name: string; slug: string;
  bound_ingredient_id: string | null; bound_tool_slug: string | null;
  bound_quantity: number | null; bound_quantity_unit: string | null;
  is_verified: boolean; archived_at: string | null;
};

function ConceptsManager({ taskId, taskName }: { taskId: string; taskName: string }) {
  const [concepts, setConcepts] = useState<ConceptRow[] | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [boundTool, setBoundTool] = useState<string | null>(null);
  const [boundIng, setBoundIng] = useState<string | null>(null);
  const [boundIngLabel, setBoundIngLabel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [justAdded, setJustAdded] = useState<{ name: string; slug: string } | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const load = async () => {
    try {
      const j = await fetch(`/api/admin/tasks/${taskId}/concepts`).then(r => r.json());
      setConcepts(j.concepts ?? []);
    } catch { setConcepts([]); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [taskId]);

  const create = async () => {
    if (!name.trim()) { setErr('Give the specific version a name.'); return; }
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/admin/tasks/${taskId}/concepts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          bound_tool_slug: boundTool || null,
          bound_ingredient_id: boundIng || null,
        }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(out.error || `Failed (${res.status})`); setBusy(false); return; }
      // stay on the parent: refresh the list, clear the form, keep adding.
      // edit a concept's own content later by clicking it in the list.
      setJustAdded({ name: out.concept.name, slug: out.concept.slug });
      setName(''); setBoundTool(null); setBoundIng(null); setBoundIngLabel(null);
      await load();
      setBusy(false);
    } catch (e: any) {
      setErr(e?.message || 'Network error'); setBusy(false);
    }
  };

  return (
    <div style={{ ...FIELD, borderTop: '1px solid var(--border)', paddingTop: 18, marginTop: 8 }}>
      <label style={L}>Specific versions</label>
      <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 12px', lineHeight: 1.5 }}>
        More specific forms of <strong>{taskName}</strong> (e.g. “{taskName} a lemon”).
        They inherit this technique’s content and override only what differs.
      </p>

      {(() => {
        const active = (concepts ?? []).filter(c => !c.archived_at);
        const archived = (concepts ?? []).filter(c => c.archived_at);
        return (
          <>
            {active.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
                {active.map(c => (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13,
                    padding: '7px 10px', border: '1px solid var(--border)', background: 'var(--surface)' }}>
                    <Link href={`/techniques/${c.slug}/edit`} style={{ color: 'var(--accent)', textDecoration: 'none', flex: 1 }}>
                      {c.name}
                    </Link>
                    {c.bound_tool_slug && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)' }}>{c.bound_tool_slug}</span>}
                    {!c.is_verified && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>draft</span>}
                  </div>
                ))}
              </div>
            )}
            {concepts && active.length === 0 && archived.length === 0 && (
              <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 12px' }}>No specific versions yet.</p>
            )}
            {archived.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <button onClick={() => setShowArchived(v => !v)}
                  style={{ background: 'transparent', border: 'none', color: 'var(--muted)', fontSize: 12, cursor: 'pointer', padding: 0, fontFamily: 'var(--font-mono)' }}>
                  {showArchived ? '▾' : '▸'} {archived.length} archived
                </button>
                {showArchived && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                    {archived.map(c => (
                      <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13,
                        padding: '7px 10px', border: '1px solid var(--border)', background: 'var(--surface)', opacity: 0.6 }}>
                        <Link href={`/techniques/${c.slug}/edit`} style={{ color: 'var(--muted)', textDecoration: 'none', flex: 1 }}>
                          {c.name}
                        </Link>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>archived</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        );
      })()}

      {justAdded && (
        <div style={{ fontSize: 12, color: 'var(--accent)', marginBottom: 10 }}>
          Added “{justAdded.name}”. Add another below, or{' '}
          <Link href={`/techniques/${justAdded.slug}/edit`} style={{ color: 'var(--accent)', textDecoration: 'underline' }}>
            edit its content
          </Link>.
        </div>
      )}

      {!showForm && (
        <button onClick={() => { setShowForm(true); setJustAdded(null); }}
          style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.06em',
            textTransform: 'uppercase', padding: '7px 14px', cursor: 'pointer',
            color: 'var(--accent)', background: 'transparent', border: '1px solid var(--accent)' }}>
          + Add a specific version
        </button>
      )}

      {showForm && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 420 }}>
          <div>
            <label style={{ ...L, fontSize: 11 }}>Name</label>
            <input style={I} value={name} onChange={e => setName(e.target.value)}
              placeholder={`e.g. ${taskName} a lemon`} />
          </div>
          <div>
            <label style={{ ...L, fontSize: 11 }}>Bound ingredient (optional)</label>
            <IngredientPicker value={boundIng} valueLabel={boundIngLabel}
              onChange={(id, label) => { setBoundIng(id); setBoundIngLabel(label); }} />
          </div>
          <div>
            <label style={{ ...L, fontSize: 11 }}>Bound tool (optional)</label>
            <ToolPicker value={boundTool} onChange={(slug) => setBoundTool(slug)} />
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button onClick={create} disabled={busy}
              style={{ background: 'var(--accent)', color: '#fff', border: 'none', padding: '8px 18px',
                fontSize: 13, cursor: busy ? 'default' : 'pointer', fontFamily: 'var(--font-mono)', opacity: busy ? 0.6 : 1 }}>
              {busy ? 'Adding…' : 'Add'}
            </button>
            <button onClick={() => { setShowForm(false); setErr(null); }}
              style={{ background: 'transparent', color: 'var(--muted)', border: 'none', fontSize: 13, cursor: 'pointer' }}>
              Done
            </button>
          </div>
          <p style={{ fontSize: 11, color: 'var(--muted)', margin: 0 }}>
            Adds a specific version and keeps this form open so you can add more
            (e.g. a lemon, an orange, a lime). Click any in the list above to add its own content and media.
          </p>
          {err && <div style={{ fontSize: 12, color: '#b4413c' }}>{err}</div>}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SortableCard — one media tile, draggable via dnd-kit (grab-and-follow,
// touch + mouse). Arrows remain as an explicit fallback. Caption editable.
// ---------------------------------------------------------------------------
function SortableCard({
  m, idx, count, busy, onMove, onRemove, onCaption,
}: {
  m: MediaRow; idx: number; count: number; busy: boolean;
  onMove: (idx: number, dir: -1 | 1) => void | Promise<void>;
  onRemove: (id: string) => void | Promise<void>;
  onCaption: (id: string, value: string) => void | Promise<void>;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: m.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    border: '1px solid var(--border)',
    padding: 8,
    background: 'var(--bg, #fff)',
    opacity: isDragging ? 0.6 : 1,
    boxShadow: isDragging ? '0 6px 18px rgba(0,0,0,0.18)' : 'none',
    zIndex: isDragging ? 10 : 'auto',
  };
  return (
    <div ref={setNodeRef} style={style}>
      {/* drag handle = the media itself */}
      <div {...attributes} {...listeners} style={{ cursor: busy ? 'default' : 'grab', touchAction: 'none' }}>
        {m.kind === 'video'
          ? <video src={m.url} style={{ width: '100%', height: 90, objectFit: 'cover', background: '#000', pointerEvents: 'none' }} />
          : <img src={m.url} alt={m.caption ?? ''} style={{ width: '100%', height: 90, objectFit: 'cover', pointerEvents: 'none' }} />}
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', marginTop: 6, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>{m.kind} · {langLabel(m.language)} · {m.role}</span>
        <span style={{ display: 'flex', gap: 4 }}>
          <button onClick={() => onMove(idx, -1)} disabled={busy || idx === 0} title="Move left"
            style={{ border: '1px solid var(--border)', background: 'transparent', cursor: (busy || idx === 0) ? 'default' : 'pointer', color: idx === 0 ? 'var(--border)' : 'var(--muted)', padding: '0 6px', fontSize: 12, lineHeight: 1.6 }}>&larr;</button>
          <button onClick={() => onMove(idx, 1)} disabled={busy || idx === count - 1} title="Move right"
            style={{ border: '1px solid var(--border)', background: 'transparent', cursor: (busy || idx === count - 1) ? 'default' : 'pointer', color: idx === count - 1 ? 'var(--border)' : 'var(--muted)', padding: '0 6px', fontSize: 12, lineHeight: 1.6 }}>&rarr;</button>
        </span>
      </div>
      <input
        defaultValue={m.caption ?? ''}
        placeholder="caption…"
        onBlur={e => { const v = e.target.value.trim(); if (v !== (m.caption ?? '')) onCaption(m.id, v); }}
        style={{ width: '100%', marginTop: 6, fontSize: 11, padding: '4px 6px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--fg)' }} />
      <button onClick={() => onRemove(m.id)} disabled={busy}
        style={{ marginTop: 6, fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.06em',
          textTransform: 'uppercase', color: '#b4413c', background: 'transparent',
          border: '1px solid var(--border)', padding: '3px 8px', cursor: busy ? 'default' : 'pointer' }}>
        Remove
      </button>
    </div>
  );
}
