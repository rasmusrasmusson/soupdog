'use client';
// src/app/my/recipes/[id]/page.tsx
// Basic edit page — WYSIWYG recipe view + chat panel for editing

import React, { useState, useRef, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2, AlertTriangle, ArrowLeft, Send, RotateCcw } from 'lucide-react';
import { SoupdogIcon } from '@/components/icons/SoupdogIcon';

const MONO = 'var(--font-mono)';
const B    = '1px solid var(--border)';
const MUT  = 'var(--muted)';

function formatDuration(minutes: number) {
  if (!minutes || minutes <= 0) return '—';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return m > 0 ? `${h} hr ${m} min` : `${h} hr`;
}

type ChatTurn = { type: 'answer'|'modification'; user: string; recipe: any; assistantSummary: string };
type PendingChange = { recipe: any; summary: string };

function editorToImportJson(data: any): any {
  if (!data) return null;
  const groupMap = new Map<string, { outputName: string; steps: any[] }>();
  const groupOrder: string[] = [];
  for (const step of (data.steps ?? [])) {
    const label = step.groupLabel ?? '__default__';
    if (!groupMap.has(label)) { groupMap.set(label, { outputName: label === '__default__' ? '' : label, steps: [] }); groupOrder.push(label); }
    groupMap.get(label)!.steps.push({
      instruction: step.instruction ?? '', durationMinutes: step.durationMinutes ?? 0,
      temperatureCelsius: step.temperatureCelsius ?? null, taskFamily: step.taskFamily ?? null,
      stepIngredients: (step.stepIngredients ?? []).filter((i: any) => i.name?.trim()).map((i: any) => ({ name: i.name, quantityValue: i.quantityValue ?? 0, quantityUnit: i.quantityUnit ?? '' })),
      stepTools: (step.stepTools ?? []).filter((t: any) => t.name?.trim()).map((t: any) => t.name),
    });
  }
  const allIngNames = new Set<string>();
  const ingredients: any[] = [];
  for (const step of (data.steps ?? [])) {
    for (const ing of (step.stepIngredients ?? [])) {
      const key = ing.name?.toLowerCase().trim(); if (!key || allIngNames.has(key)) continue;
      allIngNames.add(key); ingredients.push({ name: ing.name, quantityValue: ing.quantityValue ?? 0, quantityUnit: ing.quantityUnit ?? 'g', prepNote: ing.prepNote || null, optional: false });
    }
  }
  for (const ing of (data.ingredients ?? [])) {
    const key = ing.name?.toLowerCase().trim(); if (!key || allIngNames.has(key)) continue;
    allIngNames.add(key); ingredients.push({ name: ing.name, quantityValue: ing.quantityValue ?? 0, quantityUnit: ing.quantityUnit ?? 'g', prepNote: ing.prepNote || null, optional: false });
  }
  return {
    _canonicalId: data.canonicalId, _versionId: data.versionId,
    _equipmentIds: data.equipmentIds ?? [], _isPublished: data.isPublished ?? false,
    title: data.title ?? '', description: data.description ?? '', cuisine: data.cuisine ?? null,
    difficulty: data.difficulty ?? 'medium', servings: data.servings ?? 4,
    totalTimeMinutes: data.totalTimeMinutes ?? 0, activeTimeMinutes: data.activeTimeMinutes ?? null,
    tags: data.tags ? data.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : [],
    ingredients, groups: groupOrder.map(label => groupMap.get(label)!),
  };
}

// ── Inline WYSIWYG recipe renderer ─────────────────────────────────────────
function RecipeWYSIWYG({ recipe, onChange }: { recipe: any; onChange: (r: any) => void }) {
  const tbl: React.CSSProperties = { borderCollapse: 'collapse', border: B, width: '100%', fontSize: 12 };
  const thead: React.CSSProperties = { background: 'var(--surface-hover)' };
  const td: React.CSSProperties = { padding: '9px 14px', color: 'var(--fg)', verticalAlign: 'middle' };
  const th = (w?: number, right?: boolean, center?: boolean): React.CSSProperties => ({
    padding: '7px 14px', fontFamily: MONO, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.15em',
    color: MUT, textAlign: right ? 'right' : center ? 'center' : 'left', width: w, borderRight: B,
  });

  // Collect all ingredients across steps for summary table
  const allIngs: any[] = [];
  const seen = new Set<string>();
  for (const group of (recipe.groups ?? [])) {
    for (const step of (group.steps ?? [])) {
      for (const ing of (step.stepIngredients ?? [])) {
        const key = ing.name?.toLowerCase?.().trim() ?? ing.toLowerCase?.().trim() ?? '';
        if (!key || seen.has(key)) continue;
        seen.add(key);
        const fromIng = recipe.ingredients?.find((i: any) => i.name?.toLowerCase().trim() === key);
        allIngs.push({ name: ing.name ?? ing, quantityValue: fromIng?.quantityValue ?? ing.quantityValue ?? 0, quantityUnit: fromIng?.quantityUnit ?? ing.quantityUnit ?? '' });
      }
    }
  }

  return (
    <div>
      {/* Title */}
      <div style={{ padding: '20px 0 16px', borderBottom: B, marginBottom: 24 }}>
        <input
          value={recipe.title ?? ''}
          onChange={e => onChange({ ...recipe, title: e.target.value })}
          style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 400, border: 'none', background: 'transparent', color: 'var(--fg)', outline: 'none', width: '100%', padding: 0 }}
          placeholder="Recipe title…"
        />
        {recipe.description && (
          <p style={{ marginTop: 8, fontFamily: MONO, fontSize: 11, color: MUT, lineHeight: 1.6 }}>{recipe.description}</p>
        )}
      </div>

      {/* Meta grid — editable */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', border: B, marginBottom: 24 }}>
        {/* Servings */}
        <div style={{ borderRight: B }}>
          <div style={{ padding: '6px 12px 4px', background: 'var(--surface-hover)', borderBottom: B, fontFamily: MONO, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.18em', color: MUT }}>Servings</div>
          <input type="number" min={1} value={recipe.servings ?? 4} onChange={e => onChange({ ...recipe, servings: parseInt(e.target.value) || 1 })}
            style={{ width: '100%', padding: '8px 12px', fontFamily: MONO, fontSize: 11, color: 'var(--fg)', border: 'none', background: 'transparent', outline: 'none', boxSizing: 'border-box' as const }} />
        </div>
        {/* Total time — read only */}
        <div style={{ borderRight: B }}>
          <div style={{ padding: '6px 12px 4px', background: 'var(--surface-hover)', borderBottom: B, fontFamily: MONO, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.18em', color: MUT }}>Total time</div>
          <div style={{ padding: '8px 12px', fontFamily: MONO, fontSize: 11, color: 'var(--fg)' }}>{formatDuration(recipe.totalTimeMinutes ?? 0)}</div>
        </div>
        {/* Difficulty */}
        <div style={{ borderRight: B }}>
          <div style={{ padding: '6px 12px 4px', background: 'var(--surface-hover)', borderBottom: B, fontFamily: MONO, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.18em', color: MUT }}>Difficulty</div>
          <select value={recipe.difficulty ?? 'medium'} onChange={e => onChange({ ...recipe, difficulty: e.target.value })}
            style={{ width: '100%', padding: '8px 12px', fontFamily: MONO, fontSize: 11, color: 'var(--fg)', border: 'none', background: 'transparent', outline: 'none', cursor: 'pointer' }}>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </div>
        {/* Cuisine */}
        <div>
          <div style={{ padding: '6px 12px 4px', background: 'var(--surface-hover)', borderBottom: B, fontFamily: MONO, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.18em', color: MUT }}>Cuisine</div>
          <input value={recipe.cuisine ?? ''} onChange={e => onChange({ ...recipe, cuisine: e.target.value })}
            placeholder="e.g. Indian"
            style={{ width: '100%', padding: '8px 12px', fontFamily: MONO, fontSize: 11, color: 'var(--fg)', border: 'none', background: 'transparent', outline: 'none', boxSizing: 'border-box' as const }} />
        </div>
      </div>

      {/* Ingredients table */}
      {allIngs.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.18em', color: MUT, marginBottom: 8 }}>
            Ingredients · {allIngs.length} items
          </div>
          <table style={tbl}>
            <thead>
              <tr style={thead}>
                <th style={th()}>#</th>
                <th style={{ ...th(), borderRight: B }}>Ingredient</th>
                <th style={{ ...th(80), textAlign: 'right', borderRight: B }}>Qty</th>
                <th style={{ ...th(70), borderRight: undefined }}>Unit</th>
              </tr>
            </thead>
            <tbody>
              {allIngs.map((ing, i) => (
                <tr key={i} style={{ borderTop: B }}>
                  <td style={{ ...td, borderRight: B, fontFamily: MONO, fontSize: 10, color: MUT, width: 36, textAlign: 'center' }}>{i + 1}</td>
                  <td style={{ ...td, borderRight: B, fontWeight: 500 }}>{ing.name}</td>
                  <td style={{ ...td, borderRight: B, textAlign: 'right', fontFamily: MONO }}>{ing.quantityValue > 0 ? ing.quantityValue : '—'}</td>
                  <td style={{ ...td, fontFamily: MONO, fontSize: 11, color: MUT }}>{ing.quantityUnit || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Steps table */}
      <div>
        <div style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.18em', color: MUT, marginBottom: 8 }}>
          Steps · {(recipe.groups ?? []).reduce((n: number, g: any) => n + (g.steps?.length ?? 0), 0)} steps
        </div>
        <table style={tbl}>
          <thead>
            <tr style={thead}>
              <th style={th(36)}>#</th>
              <th style={{ ...th(), borderRight: B }}>Ingredient</th>
              <th style={{ ...th(70), textAlign: 'right', borderRight: B }}>Qty</th>
              <th style={{ ...th(60), borderRight: B }}>Unit</th>
              <th style={{ ...th(120), borderRight: B }}>Tool</th>
              <th style={{ ...th(70), textAlign: 'right', borderRight: B }}>Time</th>
              <th style={{ ...th(), borderRight: undefined }}>Instruction</th>
            </tr>
          </thead>
          {(recipe.groups ?? []).map((group: any, gi: number) => {
            const offset = (recipe.groups ?? []).slice(0, gi).reduce((n: number, g: any) => n + (g.steps?.length ?? 0), 0);
            return (
              <React.Fragment key={gi}>
                {(group.outputName || (recipe.groups ?? []).length > 1) && (
                  <tbody>
                    <tr>
                      <td colSpan={7} style={{ padding: '7px 14px', background: 'var(--surface-hover)', borderTop: gi === 0 ? B : `2px solid var(--border)`, borderBottom: B, fontFamily: MONO, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--fg)', fontWeight: 600 }}>
                        {group.outputName || `Group ${gi + 1}`}
                      </td>
                    </tr>
                  </tbody>
                )}
                <tbody>
                  {(group.steps ?? []).map((step: any, si: number) => {
                    const stepNum = offset + si + 1;
                    const ings = step.stepIngredients ?? [];
                    const tools = (step.stepTools ?? []).join(', ');
                    const rowCount = Math.max(1, ings.length);
                    return ings.length === 0 ? (
                      <tr key={si} style={{ borderTop: B, verticalAlign: 'top' }}>
                        <td style={{ ...td, borderRight: B, fontFamily: MONO, fontSize: 10, color: MUT, textAlign: 'center' }}>{stepNum}</td>
                        <td style={{ ...td, borderRight: B, color: MUT, fontFamily: MONO, fontSize: 10 }}>—</td>
                        <td style={{ ...td, borderRight: B, textAlign: 'right', fontFamily: MONO, color: MUT }}>—</td>
                        <td style={{ ...td, borderRight: B, fontFamily: MONO, fontSize: 11, color: MUT }}>—</td>
                        <td style={{ ...td, borderRight: B, fontFamily: MONO, fontSize: 10, color: MUT }}>{tools || '—'}</td>
                        <td style={{ ...td, borderRight: B, textAlign: 'right', fontFamily: MONO, fontSize: 11, color: step.durationMinutes ? 'var(--fg)' : MUT }}>{step.durationMinutes > 0 ? formatDuration(step.durationMinutes) : '—'}</td>
                        <td style={{ ...td, lineHeight: 1.55 }}>{step.instruction}</td>
                      </tr>
                    ) : (
                      ings.map((ing: any, rowIdx: number) => {
                        const ingName = typeof ing === 'string' ? ing : ing.name;
                        const ingQty  = typeof ing === 'string' ? 0 : (ing.quantityValue ?? 0);
                        const ingUnit = typeof ing === 'string' ? '' : (ing.quantityUnit ?? '');
                        return (
                          <tr key={`${si}-${rowIdx}`} style={{ borderTop: rowIdx === 0 ? B : '1px dashed var(--border)', verticalAlign: rowIdx === 0 ? 'top' : 'middle' }}>
                            {rowIdx === 0 && <td rowSpan={rowCount} style={{ ...td, borderRight: B, fontFamily: MONO, fontSize: 10, color: MUT, textAlign: 'center', verticalAlign: 'middle' }}>{stepNum}</td>}
                            <td style={{ ...td, borderRight: B, fontWeight: 500 }}>{ingName}</td>
                            <td style={{ ...td, borderRight: B, textAlign: 'right', fontFamily: MONO }}>{ingQty > 0 ? ingQty : '—'}</td>
                            <td style={{ ...td, borderRight: B, fontFamily: MONO, fontSize: 11, color: MUT }}>{ingUnit || '—'}</td>
                            {rowIdx === 0 && <td rowSpan={rowCount} style={{ ...td, borderRight: B, fontFamily: MONO, fontSize: 10, color: MUT, verticalAlign: 'top' }}>{tools || '—'}</td>}
                            {rowIdx === 0 && <td rowSpan={rowCount} style={{ ...td, borderRight: B, textAlign: 'right', fontFamily: MONO, fontSize: 11, color: step.durationMinutes ? 'var(--fg)' : MUT, verticalAlign: 'top' }}>{step.durationMinutes > 0 ? formatDuration(step.durationMinutes) : '—'}</td>}
                            {rowIdx === 0 && <td rowSpan={rowCount} style={{ ...td, lineHeight: 1.55, verticalAlign: 'top' }}>{step.instruction}</td>}
                          </tr>
                        );
                      })
                    );
                  })}
                </tbody>
              </React.Fragment>
            );
          })}
          <tfoot>
            <tr style={{ borderTop: `2px solid var(--border)`, background: 'var(--surface-hover)' }}>
              <td colSpan={6} style={{ ...td, fontFamily: MONO, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.15em', color: MUT }}>Total Time</td>
              <td style={{ ...td, textAlign: 'right', fontFamily: MONO, fontWeight: 600, color: 'var(--fg)' }}>{formatDuration(recipe.totalTimeMinutes ?? 0)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ── Main page ───────────────────────────────────────────────────────────────
export default function BasicEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router  = useRouter();

  const [recipe,      setRecipe]      = useState<any>(null);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string|null>(null);
  const [saving,      setSaving]      = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatTurn[]>([]);
  const [chatInput,   setChatInput]   = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError,   setChatError]   = useState<string|null>(null);
  const [streamingText, setStreamingText] = useState('');
  const [pending,     setPending]     = useState<PendingChange|null>(null);

  const chatEndRef   = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatHistory, chatLoading]);

  useEffect(() => {
    fetch(`/api/my/recipes/${id}`)
      .then(r => { if (!r.ok) throw new Error('Not found'); return r.json(); })
      .then(data => { setRecipe(editorToImportJson(data)); setLoading(false); })
      .catch(() => { setError('Recipe not found.'); setLoading(false); });
  }, [id]);

  const handleSave = async () => {
    if (!recipe) return;
    setSaving(true);
    try {
      // Flatten groups into steps for the API
      const flatSteps = (recipe.groups ?? []).flatMap((g: any) =>
        (g.steps ?? []).map((s: any) => ({
          instruction:        s.instruction ?? '',
          durationMinutes:    s.durationMinutes ?? 0,
          temperatureCelsius: s.temperatureCelsius ?? 0,
          taskFamily:         s.taskFamily ?? null,
          taskId:             s.taskId ?? null,
          taskName:           s.taskName ?? null,
          taskType:           s.taskType ?? 'human',
          groupLabel:         g.outputName || '__default__',
          stepIngredients:    (s.stepIngredients ?? []).map((i: any) =>
            typeof i === 'string' ? { name: i, quantityValue: 0, quantityUnit: 'g', prepNote: '' }
            : { name: i.name, quantityValue: i.quantityValue ?? 0, quantityUnit: i.quantityUnit ?? 'g', prepNote: i.prepNote ?? '' }
          ),
          stepTools: (s.stepTools ?? []).map((t: any) =>
            typeof t === 'string' ? { name: t, instanceId: '', equipmentId: '' } : t
          ),
        }))
      );

      const res = await fetch(`/api/my/recipes/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          canonicalId:       recipe._canonicalId,
          versionId:         recipe._versionId,
          title:             recipe.title,
          description:       recipe.description,
          cuisine:           recipe.cuisine,
          tags:              Array.isArray(recipe.tags) ? recipe.tags.join(', ') : (recipe.tags ?? ''),
          servings:          recipe.servings,
          difficulty:        recipe.difficulty,
          totalTimeMinutes:  recipe.totalTimeMinutes ?? 0,
          activeTimeMinutes: recipe.activeTimeMinutes ?? 0,
          steps:             flatSteps,
          ingredients:       recipe.ingredients ?? [],
          equipmentIds:      recipe._equipmentIds ?? [],
          isPublished:       recipe._isPublished ?? false,
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error ?? 'Save failed');
      sessionStorage.setItem('soupdog_saved', recipe.title ?? 'Recipe');
      router.push('/my/recipes');
    } catch (err: any) { setChatError(err.message ?? 'Save failed'); }
    finally { setSaving(false); }
  };

  const handleChatSend = async () => {
    if (!chatInput.trim() || chatLoading || !recipe) return;
    const message = chatInput.trim();
    setChatInput(''); setChatError(null); setChatLoading(true); setStreamingText(''); setPending(null);
    try {
      const res = await fetch('/api/recipes/import/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipe, message, history: chatHistory }),
      });
      if (!res.ok) throw new Error('Request failed');
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n'); buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === 'chunk') { setStreamingText(t => t + event.text); }
            else if (event.type === 'done') {
              setStreamingText('');
              const meta = { _canonicalId: recipe._canonicalId, _versionId: recipe._versionId, _equipmentIds: recipe._equipmentIds, _isPublished: recipe._isPublished };
              if (event.responseType === 'answer') {
                setChatHistory(prev => [...prev, { type: 'answer', user: message, recipe, assistantSummary: event.answer }]);
              } else if (event.requiresConfirmation) {
                setPending({ recipe: { ...event.recipe, ...meta }, summary: event.changeSummary });
                setChatHistory(prev => [...prev, { type: 'modification', user: message, recipe: event.recipe, assistantSummary: event.changeSummary }]);
              } else {
                const updated = { ...event.recipe, ...meta };
                setRecipe(updated);
                setChatHistory(prev => [...prev, { type: 'modification', user: message, recipe: updated, assistantSummary: event.changeSummary }]);
              }
            } else if (event.type === 'error') { throw new Error(event.error); }
          } catch { /* skip */ }
        }
      }
    } catch (err: any) { setChatError(err.message ?? 'Request failed'); setStreamingText(''); }
    finally { setChatLoading(false); chatInputRef.current?.focus(); }
  };

  const handleChatKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleChatSend(); }
  };

  if (loading) return <div className="flex items-center gap-2 text-[var(--muted)] text-[12px] font-mono px-8 py-16"><Loader2 size={14} className="animate-spin" /> Loading…</div>;
  if (error)   return <div className="px-8 py-16 text-[12px] font-mono text-[var(--muted)]">{error}</div>;

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start' }}>

      {/* Left — WYSIWYG recipe */}
      <div style={{ flex: 1, minWidth: 0, maxWidth: 'calc(100% - 300px)', padding: '0 32px 120px' }}>

        {/* Breadcrumb */}
        <div style={{ borderBottom: B, padding: '12px 0', marginBottom: 28, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Link href="/my/recipes" className="flex items-center gap-1.5 text-[11px] font-mono text-[var(--muted)] hover:text-[var(--accent)] transition-colors">
            <ArrowLeft size={12} /> My Recipes
          </Link>
          <span style={{ color: 'var(--border)' }}>/</span>
          <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--fg)' }}>{recipe?.title || 'Edit recipe'}</span>
          <span style={{ fontFamily: MONO, fontSize: 9, padding: '2px 7px', background: recipe?._isPublished ? 'var(--accent-subtle)' : '#fef3c7', color: recipe?._isPublished ? 'var(--accent)' : '#92400e', border: `1px solid ${recipe?._isPublished ? 'var(--accent)' : '#f59e0b'}` }}>
            {recipe?._isPublished ? 'Published' : 'Draft'} · editing
          </span>
          <span style={{ marginLeft: 'auto' }}>
            <Link href={`/my/recipes/${id}/edit`}
              style={{ fontFamily: MONO, fontSize: 10, color: MUT, textDecoration: 'none' }}
              className="hover:text-[var(--accent)] transition-colors">
              Advanced editor →
            </Link>
          </span>
        </div>

        {recipe && <RecipeWYSIWYG recipe={recipe} onChange={setRecipe} />}
      </div>

      {/* Right — Chat panel */}
      <div style={{ width: 300, flexShrink: 0 }}>
        <div style={{ position: 'fixed', top: 0, right: 0, width: 300, height: '100vh', borderLeft: B, background: 'var(--surface)', display: 'flex', flexDirection: 'column', zIndex: 40 }}>

          <div style={{ padding: '12px 16px', borderBottom: B, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <span style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.18em', color: MUT }}>Edit recipe</span>
            {chatHistory.length > 0 && (
              <button onClick={() => { setChatHistory([]); setPending(null); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: MUT, display: 'flex', alignItems: 'center', gap: 4, fontFamily: MONO, fontSize: 9 }}>
                <RotateCcw size={10} /> Clear
              </button>
            )}
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {chatHistory.length === 0 && (
              <>
                <div style={{ fontFamily: MONO, fontSize: 10, color: MUT, lineHeight: 1.7, padding: '8px 0 12px' }}>
                  The recipe updates live as you make changes. You can edit the title, cuisine, difficulty and servings directly, or use chat to adjust anything.
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {['Make it vegetarian', 'Scale to 6 servings', 'Add timing to steps', 'Simplify for beginners', 'What can I substitute?'].map(s => (
                    <button key={s} onClick={() => { setChatInput(s); chatInputRef.current?.focus(); }}
                      style={{ textAlign: 'left', background: 'var(--surface-hover)', border: B, padding: '7px 10px', cursor: 'pointer', fontFamily: MONO, fontSize: 10, color: MUT }}
                      onMouseEnter={e => (e.currentTarget.style.color = 'var(--fg)')}
                      onMouseLeave={e => (e.currentTarget.style.color = MUT)}>
                      {s}
                    </button>
                  ))}
                </div>
              </>
            )}

            {chatHistory.map((turn, i) => {
              const isPending = pending && i === chatHistory.length - 1;
              return (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ alignSelf: 'flex-end', background: 'var(--accent)', color: '#fff', padding: '5px 9px', maxWidth: '85%', fontFamily: MONO, fontSize: 10, lineHeight: 1.5 }}>{turn.user}</div>
                  {isPending ? (
                    <div style={{ border: '1px solid var(--accent)', background: 'var(--accent-subtle)', padding: '8px 10px', fontFamily: MONO, fontSize: 10 }}>
                      <div style={{ marginBottom: 8 }}>{turn.assistantSummary}</div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => { if (pending) { setRecipe(pending.recipe); setPending(null); } }} style={{ flex: 1, padding: '5px 0', background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: MONO, fontSize: 10 }}>Apply</button>
                        <button onClick={() => setPending(null)} style={{ flex: 1, padding: '5px 0', background: 'none', color: MUT, border: B, cursor: 'pointer', fontFamily: MONO, fontSize: 10 }}>Cancel</button>
                      </div>
                    </div>
                  ) : turn.type === 'answer' ? (
                    <div style={{ alignSelf: 'flex-start', background: 'var(--surface-hover)', border: B, padding: '8px 10px', maxWidth: '85%', fontFamily: MONO, fontSize: 10, color: 'var(--fg)', lineHeight: 1.6 }}>{turn.assistantSummary}</div>
                  ) : (
                    <div style={{ alignSelf: 'flex-start', background: 'var(--surface-hover)', border: B, padding: '5px 9px', maxWidth: '85%', fontFamily: MONO, fontSize: 10, color: MUT }}>✓ {turn.assistantSummary}</div>
                  )}
                </div>
              );
            })}

            {(chatLoading || streamingText) && (
              <div>
                {streamingText ? (
                  <div style={{ alignSelf: 'flex-start', background: 'var(--surface-hover)', border: B, padding: '6px 10px', fontFamily: MONO, fontSize: 10, color: 'var(--fg)', lineHeight: 1.6 }}>
                    {streamingText}<span style={{ opacity: 0.4 }}>▋</span>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: MONO, fontSize: 10, color: MUT }}>
                    <Loader2 size={11} className="animate-spin" /> Thinking…
                  </div>
                )}
              </div>
            )}

            {chatError && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', border: '1px solid #b45309', background: '#fef3c7', fontFamily: MONO, fontSize: 10, color: '#92400e' }}>
                <AlertTriangle size={10} />{chatError}
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <div style={{ borderTop: B, padding: '10px 12px', flexShrink: 0 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 5 }}>
              <textarea ref={chatInputRef} value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={handleChatKeyDown}
                placeholder="Ask a question or give an instruction…" rows={2} disabled={chatLoading || !!pending}
                style={{ flex: 1, padding: '8px 10px', border: B, background: 'var(--bg)', color: 'var(--fg)', fontFamily: MONO, fontSize: 11, outline: 'none', resize: 'none', lineHeight: 1.5, opacity: (chatLoading || !!pending) ? 0.5 : 1 }} />
              <button onClick={handleChatSend} disabled={chatLoading || !chatInput.trim() || !!pending}
                style={{ padding: '8px 10px', border: 'none', background: 'var(--accent)', color: '#fff', cursor: (chatLoading || !chatInput.trim() || !!pending) ? 'not-allowed' : 'pointer', opacity: (chatLoading || !chatInput.trim() || !!pending) ? 0.5 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {chatLoading ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
              </button>
            </div>
            <div style={{ fontFamily: MONO, fontSize: 9, color: MUT, opacity: 0.6 }}>Enter to send · Shift+Enter for new line</div>
          </div>
        </div>
      </div>

      {/* Save bar */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 300, borderTop: B, background: 'var(--surface)', padding: '10px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 50 }}>
        <span style={{ fontFamily: MONO, fontSize: 10, color: MUT }}>
          {recipe?._isPublished ? 'Published' : 'Saved as draft — publish from My Recipes'}
        </span>
        <button onClick={handleSave} disabled={saving}
          style={{ padding: '8px 20px', border: 'none', background: 'var(--accent)', color: '#fff', fontFamily: MONO, fontSize: 11, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: 7 }}>
          {saving ? <><Loader2 size={12} className="animate-spin" /> Saving…</> : 'Save recipe'}
        </button>
      </div>
    </div>
  );
}
