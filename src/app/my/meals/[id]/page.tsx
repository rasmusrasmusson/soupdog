// src/app/my/meals/[id]/page.tsx
'use client';

// Meal editor — compose a meal from existing dish-recipes (dish / side / drink),
// set a servings target, reorder, save. Manual compose (the "advanced" mode);
// AI compose is a later slice. Every component is a real recipe canonical — there
// is no free text, so nutrition/cost always compute.

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Plus, Trash2, Loader2, BookOpen, ChevronUp, ChevronDown, GripVertical } from 'lucide-react';

type CompType = 'dish' | 'side' | 'drink';
interface Component {
  id?: string;
  componentCanonicalId: string;
  componentType: CompType;
  position: number;
  servingsTarget: number | null;
  note: string | null;
  title: string;
  cuisine: string | null;
  totalTimeMinutes: number | null;
  baseServings: number | null;
  slug: string | null;
}
interface Option { id: string; title: string; cuisine: string | null; totalTimeMinutes: number | null }

const MONO = { fontFamily: 'var(--font-mono)' } as const;
const SERIF = { fontFamily: 'var(--font-serif, Georgia, serif)' } as const;
const B = '1px solid var(--border)';
const TYPE_LABEL: Record<CompType, string> = { dish: 'Dish', side: 'Side', drink: 'Drink' };
// UI offers Dish + Drink only. 'side' stays in the data model (and renders if an
// existing component has it) but is no longer a button — a side is just a dish
// playing a supporting role; the main/side distinction is inferred later (sizing/plating).
const TYPE_ORDER: CompType[] = ['dish', 'drink'];
// All types that can appear as a section (so a legacy 'side' component still shows).
const ALL_TYPES: CompType[] = ['dish', 'side', 'drink'];

export default function MealEditorPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [title, setTitle] = useState('');
  const [servings, setServings] = useState<number | ''>('');
  const [components, setComponents] = useState<Component[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [picker, setPicker] = useState<CompType | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/my/meals/${id}`);
      if (res.ok) {
        const d = await res.json();
        setTitle(d.title ?? '');
        setServings(d.servings ?? '');
        setComponents((d.components ?? []).sort((a: Component, b: Component) => a.position - b.position));
      }
    } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { if (id) load(); }, [id, load]);

  async function save(thenGo?: string) {
    setSaving(true);
    try {
      await fetch(`/api/my/meals/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim() || 'Untitled meal',
          servings: servings === '' ? null : Number(servings),
          components: components.map((c, i) => ({
            componentCanonicalId: c.componentCanonicalId,
            componentType: c.componentType,
            position: i,
            servingsTarget: c.servingsTarget,
            note: c.note,
          })),
        }),
      });
      // Rebuild the materialised unified recipe from the saved components. Awaited
      // so that navigating to the recipe view shows the fresh merge. Best-effort:
      // a failed build never blocks the save (the recipe view falls back to L0).
      try { await fetch(`/api/my/meals/${id}/build`, { method: 'POST' }); } catch { /* non-fatal */ }
      if (thenGo) router.push(thenGo);
    } finally { setSaving(false); }
  }

  function addComponent(type: CompType, opt: Option) {
    if (components.some(c => c.componentCanonicalId === opt.id)) { setPicker(null); return; }
    setComponents(prev => [...prev, {
      componentCanonicalId: opt.id, componentType: type, position: prev.length,
      servingsTarget: servings === '' ? null : Number(servings), note: null,
      title: opt.title, cuisine: opt.cuisine, totalTimeMinutes: opt.totalTimeMinutes,
      baseServings: null, slug: null,
    }]);
    setPicker(null);
  }
  function removeComponent(idx: number) { setComponents(prev => prev.filter((_, i) => i !== idx)); }
  function move(idx: number, dir: -1 | 1) {
    setComponents(prev => {
      const next = [...prev];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  }
  function setType(idx: number, type: CompType) {
    setComponents(prev => prev.map((c, i) => i === idx ? { ...c, componentType: type } : c));
  }
  function setCompServings(idx: number, v: string) {
    setComponents(prev => prev.map((c, i) => i === idx ? { ...c, servingsTarget: v === '' ? null : Number(v) } : c));
  }

  if (loading) {
    return <div className="max-w-2xl mx-auto px-4 md:px-8 py-10" style={{ ...MONO, fontSize: 12, color: 'var(--muted)' }}>
      <Loader2 size={14} className="animate-spin inline mr-2" /> Loading…
    </div>;
  }

  return (
    <div className="max-w-2xl mx-auto px-4 md:px-8 py-10" style={{ paddingBottom: 96 }}>
      {/* Breadcrumb */}
      <div style={{ ...MONO, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 18 }}>
        <Link href="/my/meals" style={{ color: 'var(--muted)', textDecoration: 'none' }} className="hover:text-[var(--accent)]">Meals</Link>
        <span style={{ margin: '0 8px' }}>/</span>
        <span>Edit</span>
        <Link href={`/my/meals/${id}/recipe`} style={{ float: 'right', color: 'var(--accent)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5 }} className="hover:underline">
          <BookOpen size={12} /> View recipe
        </Link>
      </div>

      {/* Title */}
      <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Meal name"
        style={{ ...SERIF, fontSize: 30, color: 'var(--fg)', border: 'none', borderBottom: '1px solid transparent',
          background: 'transparent', outline: 'none', width: '100%', marginBottom: 6, padding: '2px 0' }}
        onFocus={e => (e.currentTarget.style.borderBottomColor = 'var(--border)')}
        onBlur={e => (e.currentTarget.style.borderBottomColor = 'transparent')} />

      {/* Meal-level servings */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28 }}>
        <span style={{ ...MONO, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted)' }}>Serves</span>
        <input type="number" min={1} value={servings} onChange={e => setServings(e.target.value === '' ? '' : Number(e.target.value))}
          placeholder="—" style={{ ...MONO, fontSize: 13, width: 56, padding: '4px 8px', border: B, background: 'var(--bg)', color: 'var(--fg)' }} />
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>Soupdog will size each component to the meal (override per component below).</span>
      </div>

      {/* Components grouped by type. Render dish & drink always, plus any other
          type (e.g. a legacy 'side') that has rows, so nothing is hidden. */}
      {ALL_TYPES.filter(type => TYPE_ORDER.includes(type) || components.some(c => c.componentType === type)).map(type => {
        const rows = components
          .map((c, i) => ({ c, i }))
          .filter(({ c }) => c.componentType === type);
        const isOfferable = TYPE_ORDER.includes(type);
        return (
          <div key={type} style={{ marginBottom: 26 }}>
            <div style={{ ...MONO, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#9a978f', marginBottom: 10 }}>
              {TYPE_LABEL[type]}{rows.length > 1 ? 's' : ''}
            </div>
            <div style={{ borderTop: B }}>
              {rows.map(({ c, i }) => (
                <div key={c.componentCanonicalId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 2px', borderBottom: B }}>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <button onClick={() => move(i, -1)} style={iconBtn} title="Move up"><ChevronUp size={13} /></button>
                    <button onClick={() => move(i, 1)} style={iconBtn} title="Move down"><ChevronDown size={13} /></button>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ ...SERIF, fontSize: 17, color: 'var(--fg)' }}>{c.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                      {[c.cuisine, c.totalTimeMinutes ? `${c.totalTimeMinutes} min` : null].filter(Boolean).join(' · ') || '—'}
                    </div>
                  </div>
                  {/* type switcher — offers Dish/Drink, plus the current value if it's
                      something else (e.g. a legacy Side) so it stays selectable. */}
                  <select value={c.componentType} onChange={e => setType(i, e.target.value as CompType)}
                    style={{ ...MONO, fontSize: 10, padding: '3px 4px', border: B, background: 'var(--bg)', color: 'var(--muted)' }}>
                    {(TYPE_ORDER.includes(c.componentType) ? TYPE_ORDER : [c.componentType, ...TYPE_ORDER])
                      .map(t => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
                  </select>
                  {/* per-component servings override */}
                  <input type="number" min={1} value={c.servingsTarget ?? ''} placeholder="serv"
                    onChange={e => setCompServings(i, e.target.value)}
                    title="Servings for this component (blank = inherit meal)"
                    style={{ ...MONO, fontSize: 11, width: 46, padding: '3px 6px', border: B, background: 'var(--bg)', color: 'var(--fg)' }} />
                  <button onClick={() => removeComponent(i)} style={{ ...iconBtn, color: 'var(--muted)' }} title="Remove"
                    className="hover:text-red-500"><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
            {isOfferable && (
              <button onClick={() => setPicker(type)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 10, border: '1px dashed var(--border)',
                  borderRadius: 8, background: 'transparent', color: 'var(--accent)', cursor: 'pointer', fontSize: 13, padding: '8px 14px' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                <Plus size={14} /> Add {TYPE_LABEL[type].toLowerCase()}
              </button>
            )}
          </div>
        );
      })}

      {/* Save bar */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, borderTop: B, background: 'var(--surface)',
        padding: '12px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 50 }}>
        <Link href="/my/meals" style={{ ...MONO, fontSize: 11, color: 'var(--muted)', textDecoration: 'none' }}>← Meals</Link>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => save(`/my/meals/${id}/recipe`)} disabled={saving}
            style={{ ...MONO, fontSize: 11, padding: '8px 16px', border: B, background: 'transparent', color: 'var(--fg)', cursor: 'pointer' }}>
            Save & view recipe
          </button>
          <button onClick={() => save('/my/meals')} disabled={saving}
            style={{ ...MONO, fontSize: 11, padding: '8px 18px', border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer', letterSpacing: '0.06em' }}>
            {saving ? <><Loader2 size={11} className="animate-spin inline mr-1" /> Saving…</> : 'Save meal'}
          </button>
        </div>
      </div>

      {picker && <RecipePicker type={picker} existing={components.map(c => c.componentCanonicalId)} onPick={(o) => addComponent(picker, o)} onClose={() => setPicker(null)} />}
    </div>
  );
}

const iconBtn: React.CSSProperties = { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 2, display: 'flex', lineHeight: 1 };

// Reuses the meal-plan options endpoint (lists existing recipes). Excludes
// already-added components and (best-effort) the meal itself.
function RecipePicker({ type, existing, onPick, onClose }: {
  type: CompType; existing: string[]; onPick: (o: Option) => void; onClose: () => void;
}) {
  const [opts, setOpts] = useState<Option[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/my/meal-plan/options?level=dish').then(r => r.json())
      .then(d => setOpts(d.options ?? [])).finally(() => setLoading(false));
  }, []);

  const ex = new Set(existing);
  const filtered = opts
    .filter(o => !ex.has(o.id))
    .filter(o => !q.trim() || o.title.toLowerCase().includes(q.toLowerCase()) || (o.cuisine ?? '').toLowerCase().includes(q.toLowerCase()));

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,18,14,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', border: B, borderRadius: 12, width: 'min(440px, 92vw)', maxHeight: '78vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '18px 20px 12px', borderBottom: B }}>
          <div style={{ ...SERIF, fontSize: 18, color: 'var(--fg)', marginBottom: 10 }}>Add {TYPE_LABEL[type].toLowerCase()}</div>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search dishes…" autoFocus
            style={{ width: '100%', padding: '8px 12px', border: B, borderRadius: 8, fontSize: 14, background: 'var(--bg)', color: 'var(--fg)', boxSizing: 'border-box' }} />
        </div>
        <div style={{ overflowY: 'auto', padding: '6px 0' }}>
          {loading ? <div style={{ padding: 20, fontSize: 13, color: 'var(--muted)' }}>Loading…</div>
            : filtered.length === 0 ? <div style={{ padding: 20, fontSize: 13, color: 'var(--muted)' }}>No dishes found.</div>
            : filtered.map(o => (
              <div key={o.id} onClick={() => onPick(o)}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '11px 20px', cursor: 'pointer' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                <span style={{ ...SERIF, fontSize: 15, color: 'var(--fg)' }}>{o.title}</span>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>{[o.cuisine, o.totalTimeMinutes ? `${o.totalTimeMinutes} min` : null].filter(Boolean).join(' · ')}</span>
              </div>
            ))}
        </div>
        <div style={{ padding: '12px 20px', borderTop: B, textAlign: 'right' }}>
          <span onClick={onClose} style={{ fontSize: 13, color: 'var(--muted)', cursor: 'pointer' }}>Cancel</span>
        </div>
      </div>
    </div>
  );
}
