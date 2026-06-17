// src/app/techniques/review/page.tsx
'use client';
import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

// --- task shape (the curation-relevant columns) -----------------------------
type Task = {
  id: string;
  slug: string | null;
  name: string;
  category: string | null;
  description: string | null;
  tips: string | null;
  common_mistakes: string | null;
  completion_type: string | null;
  completion_target: string | null;
  heat_mechanism: string | null;
  heat_medium: string | null;
  min_duration_seconds: number | null;
  max_duration_seconds: number | null;
  typical_input_state: string | null;
  typical_output_state: string | null;
  suggested_tool_slugs: string[] | string | null;
  is_verified: boolean;
  archived_at: string | null;
};

// enum option lists — mirror the admin route's guards exactly
const COMPLETION_TYPES = ['', 'time', 'core_temp', 'surface_temp', 'color', 'volume', 'mass', 'texture', 'structural', 'aroma', 'ph', 'subjective'];
const HEAT_MECHANISMS = ['', 'conduction', 'convection', 'radiation', 'dielectric', 'combination', 'none'];
const HEAT_MEDIA = ['', 'fat', 'water', 'steam', 'air', 'direct', 'none'];

const prettify = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
const slugFor = (t: Task) => t.slug || t.name.toLowerCase().replace(/\s+/g, '-');
const toolStr = (v: Task['suggested_tool_slugs']) =>
  Array.isArray(v) ? v.join(', ') : (v ?? '');

function fmtDur(a: number | null, b: number | null): string {
  if (!a && !b) return '—';
  const m = (s: number) => s % 3600 === 0 ? `${s / 3600}h` : s % 60 === 0 ? `${s / 60}m` : `${s}s`;
  return a && b && a !== b ? `${m(a)}–${m(b)}` : m((a || b)!);
}

// shared style tokens (house style)
const MONO = 'var(--font-mono)';
const LABEL: React.CSSProperties = {
  fontFamily: MONO, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase',
  color: 'var(--muted)', marginBottom: 4, display: 'block',
};
const FIELD: React.CSSProperties = {
  width: '100%', padding: '5px 8px', fontSize: 12, fontFamily: MONO,
  border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--fg)',
};

export default function TechniqueReviewQueue() {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [edits, setEdits] = useState<Record<string, Partial<Task>>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [blessedCount, setBlessedCount] = useState(0);
  const [catFilter, setCatFilter] = useState<string>('all');

  useEffect(() => {
    fetch('/api/admin/check')
      .then(r => r.json())
      .then(d => setIsAdmin(Boolean(d.isAdmin)))
      .catch(() => setIsAdmin(false));
  }, []);

  useEffect(() => {
    if (isAdmin !== true) return;
    const supabase = createClient() as any;
    supabase
      .from('tasks')
      .select('id, slug, name, category, description, tips, common_mistakes, completion_type, completion_target, heat_mechanism, heat_medium, min_duration_seconds, max_duration_seconds, typical_input_state, typical_output_state, suggested_tool_slugs, is_verified, archived_at')
      .eq('is_verified', false)
      .is('archived_at', null)
      .order('category', { ascending: true })
      .order('name', { ascending: true })
      .then(({ data }: { data: Task[] | null }) => setTasks(data ?? []));
  }, [isAdmin]);

  // a per-task field value: edited value if present, else the original
  const valueOf = (t: Task, key: keyof Task): any => {
    const e = edits[t.id];
    if (e && key in e) return (e as any)[key];
    return (t as any)[key];
  };
  const setField = (id: string, key: keyof Task, val: any) =>
    setEdits((prev: Record<string, Partial<Task>>) => ({ ...prev, [id]: { ...(prev[id] || {}), [key]: val } }));

  // distinct categories present, for the filter chips
  const cats = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of (tasks ?? []) as Task[]) {
      const k = t.category || '(none)';
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [tasks]);

  const visible = (tasks ?? []).filter(t =>
    catFilter === 'all' || (t.category || '(none)') === catFilter
  );

  // PATCH helper. extra merges into the edited fields (e.g. is_verified:true on bless)
  async function patch(t: Task, extra: Partial<Task> & { is_verified?: boolean }) {
    setBusy(t.id); setError(null);
    const e = edits[t.id] || {};
    const payload: any = { ...e, ...extra };
    // normalise tools to the comma-string the route accepts (matches edit page)
    if ('suggested_tool_slugs' in payload && Array.isArray(payload.suggested_tool_slugs)) {
      payload.suggested_tool_slugs = payload.suggested_tool_slugs.join(', ');
    }
    // empty string enums → null (clear)
    for (const k of ['completion_type', 'heat_mechanism', 'heat_medium', 'category', 'completion_target']) {
      if (payload[k] === '') payload[k] = null;
    }
    try {
      const res = await fetch(`/api/admin/tasks/${t.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setError(j.error || `Update failed (${res.status})`); setBusy(null); return false; }
      return true;
    } catch (err: any) {
      setError(err?.message || 'Network error'); setBusy(null); return false;
    }
  }

  // bless = save edits + flip is_verified, then drop from the queue
  async function bless(t: Task) {
    const ok = await patch(t, { is_verified: true });
    setBusy(null);
    if (ok) {
      setTasks((prev: Task[] | null) => (prev ?? []).filter((x: Task) => x.id !== t.id));
      setEdits((prev: Record<string, Partial<Task>>) => { const n = { ...prev }; delete n[t.id]; return n; });
      setBlessedCount((c: number) => c + 1);
    }
  }

  // save edits without blessing (keeps it in the queue)
  async function saveOnly(t: Task) {
    const ok = await patch(t, {});
    setBusy(null);
    if (ok) {
      // fold edits into the loaded row so the card reflects saved state
      setTasks((prev: Task[] | null) => (prev ?? []).map((x: Task) => x.id === t.id ? { ...x, ...(edits[t.id] || {}) } : x));
      setEdits((prev: Record<string, Partial<Task>>) => { const n = { ...prev }; delete n[t.id]; return n; });
    }
  }

  // --- gating ---------------------------------------------------------------
  if (isAdmin === null) return <Shell><p style={{ color: 'var(--muted)' }}>Checking access…</p></Shell>;
  if (isAdmin === false) return <Shell><p style={{ color: 'var(--muted)' }}>This page is for administrators.</p></Shell>;

  const remaining = tasks?.length ?? 0;

  return (
    <Shell>
      <div style={{ marginBottom: 8, fontFamily: MONO, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--muted)' }}>
        Curation
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 600, margin: 0, color: 'var(--fg)' }}>
          Review queue
        </h1>
        <Link href="/techniques" style={{ fontFamily: MONO, fontSize: 11, color: 'var(--muted)', textDecoration: 'none' }}>
          ← All techniques
        </Link>
      </div>
      <p style={{ color: 'var(--muted)', marginTop: 8, fontSize: 14, lineHeight: 1.5 }}>
        Unverified techniques awaiting a blessing. Check the content, fill any missing
        completion/heat metadata, then bless — it leaves the queue and becomes available
        to the decomposition guide and the public pages.
        <span style={{ fontFamily: MONO, fontSize: 12 }}>
          {' '}({remaining} to review{blessedCount > 0 ? ` · ${blessedCount} blessed this session` : ''})
        </span>
      </p>

      {error && (
        <div style={{ margin: '12px 0', padding: '8px 12px', fontFamily: MONO, fontSize: 12,
          color: '#8A1C1C', border: '1px solid #E5C9C9', background: '#FBF2F2' }}>
          {error}
        </div>
      )}

      {/* category filter chips */}
      {tasks && cats.length > 1 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '16px 0 24px' }}>
          {([['all', `All (${tasks.length})`]] as [string, string][])
            .concat(cats.map(([c, n]) => [c, `${prettify(c)} (${n})`]))
            .map(([key, label]) => (
              <button key={key} onClick={() => setCatFilter(key)}
                style={{
                  fontFamily: MONO, fontSize: 10, padding: '5px 10px', cursor: 'pointer',
                  textTransform: 'uppercase', letterSpacing: '0.08em',
                  border: '1px solid ' + (catFilter === key ? 'var(--accent)' : 'var(--border)'),
                  background: catFilter === key ? 'var(--accent)' : 'transparent',
                  color: catFilter === key ? '#fff' : 'var(--muted)',
                }}>
                {label}
              </button>
            ))}
        </div>
      )}

      {!tasks && <p style={{ color: 'var(--muted)' }}>Loading…</p>}
      {tasks && remaining === 0 && (
        <div style={{ padding: '40px 0', textAlign: 'center' }}>
          <p style={{ fontFamily: 'var(--font-display)', fontSize: 20, color: 'var(--fg)' }}>
            Queue clear.
          </p>
          <p style={{ color: 'var(--muted)', fontSize: 14 }}>
            {blessedCount > 0 ? `${blessedCount} technique${blessedCount === 1 ? '' : 's'} blessed.` : 'No unverified techniques.'}
          </p>
        </div>
      )}

      {/* the queue */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {visible.map((t: Task) => {
          const dirty = !!edits[t.id] && Object.keys(edits[t.id]).length > 0;
          const isBusy = busy === t.id;
          const missingMeta = !valueOf(t, 'completion_type') || !valueOf(t, 'heat_mechanism');
          return (
            <div key={t.id} style={{
              border: '1px solid var(--border)', background: 'var(--surface)',
              padding: '16px 18px', opacity: isBusy ? 0.6 : 1,
            }}>
              {/* header row */}
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 19, fontWeight: 600, color: 'var(--fg)' }}>
                    {t.name}
                  </span>
                  <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--muted)' }}>
                    {prettify(t.category || 'uncategorised')}
                  </span>
                  {missingMeta && (
                    <span style={{ fontFamily: MONO, fontSize: 9, color: '#9A6A00', background: '#FBF4E3',
                      border: '1px solid #E8D9B0', padding: '2px 6px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                      metadata incomplete
                    </span>
                  )}
                </div>
                <Link href={`/techniques/${slugFor(t)}/edit`} target="_blank"
                  style={{ fontFamily: MONO, fontSize: 10, color: 'var(--muted)', textDecoration: 'none', whiteSpace: 'nowrap' }}>
                  Full edit ↗
                </Link>
              </div>

              {/* description (read-only here; big rewrites go to the edit page) */}
              <p style={{ fontSize: 13, lineHeight: 1.5, color: t.description ? 'var(--fg)' : 'var(--muted)', margin: '0 0 12px' }}>
                {t.description || 'No description yet — open Full edit to add one.'}
              </p>

              {/* inline metadata editors — the gaps the audit found */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 12 }}>
                <div>
                  <label style={LABEL}>Category</label>
                  <input style={FIELD} value={valueOf(t, 'category') ?? ''} list="cat-options"
                    onChange={e => setField(t.id, 'category', e.target.value)} placeholder="e.g. fry" />
                </div>
                <div>
                  <label style={LABEL}>Completion type</label>
                  <select style={FIELD} value={valueOf(t, 'completion_type') ?? ''}
                    onChange={e => setField(t.id, 'completion_type', e.target.value)}>
                    {COMPLETION_TYPES.map(o => <option key={o} value={o}>{o || '—'}</option>)}
                  </select>
                </div>
                <div>
                  <label style={LABEL}>Completion target</label>
                  <input style={FIELD} value={valueOf(t, 'completion_target') ?? ''}
                    onChange={e => setField(t.id, 'completion_target', e.target.value)} placeholder="e.g. al dente / 74°C" />
                </div>
                <div>
                  <label style={LABEL}>Heat mechanism</label>
                  <select style={FIELD} value={valueOf(t, 'heat_mechanism') ?? ''}
                    onChange={e => setField(t.id, 'heat_mechanism', e.target.value)}>
                    {HEAT_MECHANISMS.map(o => <option key={o} value={o}>{o || '—'}</option>)}
                  </select>
                </div>
                <div>
                  <label style={LABEL}>Heat medium</label>
                  <select style={FIELD} value={valueOf(t, 'heat_medium') ?? ''}
                    onChange={e => setField(t.id, 'heat_medium', e.target.value)}>
                    {HEAT_MEDIA.map(o => <option key={o} value={o}>{o || '—'}</option>)}
                  </select>
                </div>
                <div>
                  <label style={LABEL}>Tools (comma-sep)</label>
                  <input style={FIELD} value={toolStr(valueOf(t, 'suggested_tool_slugs'))}
                    onChange={e => setField(t.id, 'suggested_tool_slugs', e.target.value)} placeholder="large-pot, colander" />
                </div>
              </div>

              {/* at-a-glance context */}
              <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--muted)', marginBottom: 12 }}>
                {(valueOf(t, 'typical_input_state') || valueOf(t, 'typical_output_state'))
                  ? <>transforms {valueOf(t, 'typical_input_state') || '?'} → {valueOf(t, 'typical_output_state') || '?'} · </>
                  : null}
                time {fmtDur(t.min_duration_seconds, t.max_duration_seconds)}
              </div>

              {/* actions */}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <button onClick={() => bless(t)} disabled={isBusy}
                  style={{ fontFamily: MONO, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em',
                    padding: '7px 16px', cursor: isBusy ? 'default' : 'pointer',
                    background: 'var(--accent)', color: '#fff', border: '1px solid var(--accent)' }}>
                  {isBusy ? 'Saving…' : dirty ? 'Save & bless' : 'Bless'}
                </button>
                {dirty && (
                  <button onClick={() => saveOnly(t)} disabled={isBusy}
                    style={{ fontFamily: MONO, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em',
                      padding: '7px 14px', cursor: isBusy ? 'default' : 'pointer',
                      background: 'transparent', color: 'var(--accent)', border: '1px solid var(--accent)' }}>
                    Save, keep in queue
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* shared datalist for the category input autocomplete */}
      <datalist id="cat-options">
        {cats.map(([c]) => <option key={c} value={c} />)}
      </datalist>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div style={{ maxWidth: 860, margin: '0 auto', padding: '32px 24px 96px' }}>{children}</div>;
}
