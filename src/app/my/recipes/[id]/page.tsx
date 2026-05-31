'use client';
// src/app/my/recipes/[id]/page.tsx
// Basic edit page — loads recipe into chat+preview UI
// Pencil icon on My Recipes links here. "Advanced editor" links to /my/recipes/[id]/edit

import React, { useState, useRef, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2, AlertTriangle, ArrowLeft, Send, RotateCcw } from 'lucide-react';
import { SoupdogIcon } from '@/components/icons/SoupdogIcon';

const MONO = 'var(--font-mono)';
const B    = '1px solid var(--border)';

type ChatTurn = {
  type: 'answer' | 'modification';
  user: string;
  recipe: any;
  assistantSummary: string;
};

type PendingChange = { recipe: any; summary: string };

function editorToImportJson(data: any): any {
  if (!data) return null;
  const groupMap = new Map<string, { outputName: string; steps: any[] }>();
  const groupOrder: string[] = [];

  for (const step of (data.steps ?? [])) {
    const label = step.groupLabel ?? '__default__';
    if (!groupMap.has(label)) {
      groupMap.set(label, { outputName: label === '__default__' ? '' : label, steps: [] });
      groupOrder.push(label);
    }
    const stepIngNames = (step.stepIngredients ?? [])
      .filter((i: any) => i.name?.trim())
      .map((i: any) => i.name);
    const stepToolNames = (step.stepTools ?? [])
      .filter((t: any) => t.name?.trim())
      .map((t: any) => t.name);
    groupMap.get(label)!.steps.push({
      instruction:        step.instruction ?? '',
      durationMinutes:    step.durationMinutes ?? 0,
      temperatureCelsius: step.temperatureCelsius ?? null,
      taskFamily:         step.taskFamily ?? null,
      stepIngredients:    stepIngNames,
      stepTools:          stepToolNames,
    });
  }

  const allIngNames = new Set<string>();
  const ingredients: any[] = [];
  for (const step of (data.steps ?? [])) {
    for (const ing of (step.stepIngredients ?? [])) {
      const key = ing.name?.toLowerCase().trim();
      if (!key || allIngNames.has(key)) continue;
      allIngNames.add(key);
      ingredients.push({ name: ing.name, quantityValue: ing.quantityValue ?? 0, quantityUnit: ing.quantityUnit ?? 'g', prepNote: ing.prepNote || null, optional: false });
    }
  }
  for (const ing of (data.ingredients ?? [])) {
    const key = ing.name?.toLowerCase().trim();
    if (!key || allIngNames.has(key)) continue;
    allIngNames.add(key);
    ingredients.push({ name: ing.name, quantityValue: ing.quantityValue ?? 0, quantityUnit: ing.quantityUnit ?? 'g', prepNote: ing.prepNote || null, optional: false });
  }

  return {
    _canonicalId: data.canonicalId, _versionId: data.versionId,
    _equipmentIds: data.equipmentIds ?? [], _isPublished: data.isPublished ?? false,
    title: data.title ?? '', description: data.description ?? '', cuisine: data.cuisine ?? null,
    difficulty: data.difficulty ?? 'medium', servings: data.servings ?? 4,
    totalTimeMinutes: data.totalTimeMinutes ?? 0, activeTimeMinutes: data.activeTimeMinutes ?? null,
    tags: data.tags ? data.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : [],
    ingredients, equipment: [],
    groups: groupOrder.map(label => groupMap.get(label)!),
  };
}

export default function BasicEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

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

  // Load recipe
  useEffect(() => {
    fetch(`/api/my/recipes/${id}`)
      .then(r => { if (!r.ok) throw new Error('Not found'); return r.json(); })
      .then(data => {
        setRecipe(editorToImportJson(data));
        setLoading(false);
      })
      .catch(() => { setError('Recipe not found.'); setLoading(false); });
  }, [id]);

  const handleSave = async () => {
    if (!recipe) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/my/recipes/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          canonicalId: recipe._canonicalId, versionId: recipe._versionId,
          title: recipe.title, description: recipe.description, cuisine: recipe.cuisine,
          tags: Array.isArray(recipe.tags) ? recipe.tags.join(', ') : recipe.tags,
          servings: recipe.servings, difficulty: recipe.difficulty,
          totalTimeMinutes: recipe.totalTimeMinutes, activeTimeMinutes: recipe.activeTimeMinutes,
          ingredients: recipe.ingredients ?? [],
          steps: (recipe.groups ?? []).flatMap((g: any) => g.steps.map((s: any) => ({
            ...s, groupLabel: g.outputName || '__default__',
          }))),
          equipmentIds: recipe._equipmentIds ?? [],
          isPublished: recipe._isPublished ?? false,
        }),
      });
      if (!res.ok) throw new Error('Save failed');
      sessionStorage.setItem('soupdog_saved', recipe.title ?? 'Recipe');
      router.push('/my/recipes');
    } catch (err: any) {
      setChatError(err.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleChatSend = async () => {
    if (!chatInput.trim() || chatLoading || !recipe) return;
    const message = chatInput.trim();
    setChatInput('');
    setChatError(null);
    setChatLoading(true);
    setStreamingText('');
    setPending(null);

    try {
      const res = await fetch('/api/recipes/import/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === 'chunk') {
              setStreamingText(t => t + event.text);
            } else if (event.type === 'progress') {
              // modification in progress
            } else if (event.type === 'done') {
              setStreamingText('');
              if (event.responseType === 'answer') {
                setChatHistory(prev => [...prev, { type: 'answer', user: message, recipe, assistantSummary: event.answer }]);
              } else if (event.requiresConfirmation) {
                setPending({ recipe: event.recipe, summary: event.changeSummary });
                setChatHistory(prev => [...prev, { type: 'modification', user: message, recipe: event.recipe, assistantSummary: event.changeSummary }]);
              } else {
                const updated = { ...event.recipe, _canonicalId: recipe._canonicalId, _versionId: recipe._versionId, _equipmentIds: recipe._equipmentIds, _isPublished: recipe._isPublished };
                setRecipe(updated);
                setChatHistory(prev => [...prev, { type: 'modification', user: message, recipe: updated, assistantSummary: event.changeSummary }]);
              }
            } else if (event.type === 'error') {
              throw new Error(event.error);
            }
          } catch { /* skip malformed */ }
        }
      }
    } catch (err: any) {
      setChatError(err.message ?? 'Request failed');
      setStreamingText('');
    } finally {
      setChatLoading(false);
      chatInputRef.current?.focus();
    }
  };

  const handleApply = () => {
    if (!pending) return;
    const updated = { ...pending.recipe, _canonicalId: recipe._canonicalId, _versionId: recipe._versionId, _equipmentIds: recipe._equipmentIds, _isPublished: recipe._isPublished };
    setRecipe(updated);
    setPending(null);
  };

  const handleChatKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleChatSend(); }
  };

  if (loading) return (
    <div className="flex items-center gap-2 text-[var(--muted)] text-[12px] font-mono px-8 py-16">
      <Loader2 size={14} className="animate-spin" /> Loading…
    </div>
  );

  if (error) return (
    <div className="px-8 py-16 text-[12px] font-mono text-[var(--muted)]">{error}</div>
  );

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start' }}>

      {/* Left — Recipe preview */}
      <div style={{ flex: 1, minWidth: 0, maxWidth: 'calc(100% - 300px)', padding: '0 32px 120px' }}>

        {/* Breadcrumb */}
        <div style={{ borderBottom: B, padding: '12px 0', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Link href="/my/recipes" className="flex items-center gap-1.5 text-[11px] font-mono text-[var(--muted)] hover:text-[var(--accent)] transition-colors">
            <ArrowLeft size={12} /> My Recipes
          </Link>
          <span style={{ color: 'var(--border)' }}>/</span>
          <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--fg)' }}>{recipe?.title || 'Edit recipe'}</span>
          <span style={{ marginLeft: 'auto' }}>
            <Link href={`/my/recipes/${id}/edit`}
              style={{ fontFamily: MONO, fontSize: 10, color: 'var(--muted)', textDecoration: 'none' }}
              className="hover:text-[var(--accent)] transition-colors">
              Advanced editor →
            </Link>
          </span>
        </div>

        {/* Editable metadata */}
        {recipe && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
            <input value={recipe.title ?? ''} onChange={e => setRecipe((r: any) => ({ ...r, title: e.target.value }))}
              style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 400, border: 'none', borderBottom: B, background: 'transparent', color: 'var(--fg)', outline: 'none', padding: '4px 0', width: '100%' }} />
            <textarea value={recipe.description ?? ''} onChange={e => setRecipe((r: any) => ({ ...r, description: e.target.value }))}
              rows={2} placeholder="Description…"
              style={{ fontFamily: MONO, fontSize: 11, border: B, background: 'transparent', color: 'var(--fg)', outline: 'none', padding: '6px 10px', resize: 'vertical', lineHeight: 1.5 }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <div style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--muted)', marginBottom: 4 }}>Cuisine</div>
                <input value={recipe.cuisine ?? ''} onChange={e => setRecipe((r: any) => ({ ...r, cuisine: e.target.value }))}
                  placeholder="e.g. Italian" style={{ width: '100%', padding: '6px 10px', border: B, background: 'transparent', color: 'var(--fg)', fontFamily: MONO, fontSize: 11, outline: 'none', boxSizing: 'border-box' as const }} />
              </div>
              <div>
                <div style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--muted)', marginBottom: 4 }}>Difficulty</div>
                <select value={recipe.difficulty ?? 'medium'} onChange={e => setRecipe((r: any) => ({ ...r, difficulty: e.target.value }))}
                  style={{ width: '100%', padding: '6px 10px', border: B, background: 'transparent', color: 'var(--fg)', fontFamily: MONO, fontSize: 11, outline: 'none', boxSizing: 'border-box' as const }}>
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </div>
            </div>
            <div>
              <div style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--muted)', marginBottom: 4 }}>Tags</div>
              <input
                value={Array.isArray(recipe.tags) ? recipe.tags.join(', ') : (recipe.tags ?? '')}
                onChange={e => setRecipe((r: any) => ({ ...r, tags: e.target.value.split(',').map((t: string) => t.trim()).filter(Boolean) }))}
                placeholder="e.g. pasta, quick, weeknight"
                style={{ width: '100%', padding: '6px 10px', border: B, background: 'transparent', color: 'var(--fg)', fontFamily: MONO, fontSize: 11, outline: 'none', boxSizing: 'border-box' as const }} />
            </div>
          </div>
        )}

        {/* Steps preview */}
        {recipe && (
          <div style={{ border: B }}>
            <div style={{ padding: '10px 16px', borderBottom: B, fontFamily: MONO, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'var(--muted)' }}>
              Steps ({(recipe.groups ?? []).reduce((n: number, g: any) => n + (g.steps?.length ?? 0), 0)})
            </div>
            {(recipe.groups ?? []).map((group: any, gi: number) => (
              <div key={gi}>
                {group.outputName && (
                  <div style={{ padding: '6px 16px', background: 'var(--surface-hover)', borderBottom: B, fontFamily: MONO, fontSize: 10, fontWeight: 600, color: 'var(--accent)' }}>
                    {group.outputName}
                  </div>
                )}
                {(group.steps ?? []).map((step: any, si: number) => {
                  const num = (recipe.groups ?? []).slice(0, gi).reduce((n: number, g: any) => n + (g.steps?.length ?? 0), 0) + si + 1;
                  return (
                    <div key={si} style={{ padding: '10px 16px', borderBottom: B, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                        <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--muted)', width: 20, flexShrink: 0 }}>{num}</span>
                        <span style={{ fontFamily: MONO, fontSize: 12, color: 'var(--fg)', flex: 1 }}>{step.instruction}</span>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, paddingLeft: 30 }}>
                        {step.durationMinutes > 0 && <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--muted)' }}>⏱ {step.durationMinutes} min</span>}
                        {step.taskFamily && <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase', border: B, padding: '1px 5px' }}>{step.taskFamily}</span>}
                        {(step.stepIngredients ?? []).map((name: string, ii: number) => (
                          <span key={ii} style={{ fontFamily: MONO, fontSize: 9, color: 'var(--muted)', border: B, padding: '1px 6px', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                            <SoupdogIcon name="ingredients" size={8} /> {name}
                          </span>
                        ))}
                        {(step.stepTools ?? []).length > 0 && (
                          <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--muted)', border: B, padding: '1px 6px', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                            <SoupdogIcon name="tools" size={8} /> {step.stepTools.join(', ')}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Right — Chat panel */}
      <div style={{ width: 300, flexShrink: 0 }}>
        <div style={{ position: 'fixed', top: 0, right: 0, width: 300, height: '100vh', borderLeft: B, background: 'var(--surface)', display: 'flex', flexDirection: 'column', zIndex: 40 }}>

          {/* Header */}
          <div style={{ padding: '12px 16px', borderBottom: B, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <span style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'var(--muted)' }}>
              Edit recipe
            </span>
            {chatHistory.length > 0 && (
              <button onClick={() => { setChatHistory([]); setPending(null); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4, fontFamily: MONO, fontSize: 9 }}>
                <RotateCcw size={10} /> Clear
              </button>
            )}
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {chatHistory.length === 0 && (
              <>
                <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--muted)', lineHeight: 1.6, textAlign: 'center', padding: '12px 0' }}>
                  Ask questions or give instructions
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {['Make it vegetarian', 'Scale to 6 servings', 'Add timing to steps', 'Simplify for beginners', 'What can I substitute?'].map(s => (
                    <button key={s} onClick={() => { setChatInput(s); chatInputRef.current?.focus(); }}
                      style={{ textAlign: 'left', background: 'var(--surface-hover)', border: B, padding: '7px 10px', cursor: 'pointer', fontFamily: MONO, fontSize: 10, color: 'var(--muted)', transition: 'color 0.15s' }}
                      onMouseEnter={e => (e.currentTarget.style.color = 'var(--fg)')}
                      onMouseLeave={e => (e.currentTarget.style.color = 'var(--muted)')}>
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
                  <div style={{ alignSelf: 'flex-end', background: 'var(--accent)', color: '#fff', padding: '5px 9px', maxWidth: '85%', fontFamily: MONO, fontSize: 10, lineHeight: 1.5 }}>
                    {turn.user}
                  </div>
                  {isPending ? (
                    <div style={{ border: '1px solid var(--accent)', background: 'var(--accent-subtle)', padding: '8px 10px', fontFamily: MONO, fontSize: 10 }}>
                      <div style={{ marginBottom: 8 }}>{turn.assistantSummary}</div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={handleApply} style={{ flex: 1, padding: '5px 0', background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: MONO, fontSize: 10 }}>Apply</button>
                        <button onClick={() => setPending(null)} style={{ flex: 1, padding: '5px 0', background: 'none', color: 'var(--muted)', border: B, cursor: 'pointer', fontFamily: MONO, fontSize: 10 }}>Cancel</button>
                      </div>
                    </div>
                  ) : turn.type === 'answer' ? (
                    <div style={{ alignSelf: 'flex-start', background: 'var(--surface-hover)', border: B, padding: '8px 10px', maxWidth: '85%', fontFamily: MONO, fontSize: 10, color: 'var(--fg)', lineHeight: 1.6 }}>
                      {turn.assistantSummary}
                    </div>
                  ) : (
                    <div style={{ alignSelf: 'flex-start', background: 'var(--surface-hover)', border: B, padding: '5px 9px', maxWidth: '85%', fontFamily: MONO, fontSize: 10, color: 'var(--muted)' }}>
                      ✓ {turn.assistantSummary}
                    </div>
                  )}
                </div>
              );
            })}

            {(chatLoading || streamingText) && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {streamingText ? (
                  <div style={{ alignSelf: 'flex-start', background: 'var(--surface-hover)', border: B, padding: '6px 10px', maxWidth: '85%', fontFamily: MONO, fontSize: 10, color: 'var(--fg)', lineHeight: 1.6 }}>
                    {streamingText}<span style={{ opacity: 0.4 }}>▋</span>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: MONO, fontSize: 10, color: 'var(--muted)' }}>
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

          {/* Input */}
          <div style={{ borderTop: B, padding: '10px 12px', flexShrink: 0 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 6 }}>
              <textarea ref={chatInputRef} value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={handleChatKeyDown}
                placeholder="Ask a question or give an instruction…"
                rows={2} disabled={chatLoading || !!pending}
                style={{ flex: 1, padding: '8px 10px', border: B, background: 'var(--bg)', color: 'var(--fg)', fontFamily: MONO, fontSize: 11, outline: 'none', resize: 'none', lineHeight: 1.5, opacity: (chatLoading || !!pending) ? 0.5 : 1 }} />
              <button onClick={handleChatSend}
                disabled={chatLoading || !chatInput.trim() || !!pending}
                style={{ padding: '8px 10px', border: 'none', background: 'var(--accent)', color: '#fff', cursor: (chatLoading || !chatInput.trim() || !!pending) ? 'not-allowed' : 'pointer', opacity: (chatLoading || !chatInput.trim() || !!pending) ? 0.5 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {chatLoading ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
              </button>
            </div>
            <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--muted)', opacity: 0.6 }}>
              Enter to send · Shift+Enter for new line
            </div>
          </div>
        </div>
      </div>

      {/* Save bar */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 300, borderTop: B, background: 'var(--surface)', padding: '10px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 50 }}>
        <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--muted)' }}>
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
