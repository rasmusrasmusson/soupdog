// src/app/my/recipes/[id]/edit/page.tsx
'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2, Send, AlertTriangle, RotateCcw } from 'lucide-react';
import { RecipeEditor } from '@/components/recipe/RecipeEditor';
import { ConceptBinder } from '@/components/knowledge/ConceptBinder';
import type { RecipeFormData } from '@/lib/recipe-actions';

const MONO = 'var(--font-mono)';
const MUT  = 'var(--muted)';
const B    = '1px solid var(--border)';

function uid() { return Math.random().toString(36).slice(2, 9); }

const FAMILY_MAP = new Map<string, any>([
  ['cut',          { id: '31132714-14a6-4f36-984a-308683d059bb', name: 'Brunoise',     family: 'cut',          task_type: 'human'   }],
  ['finish',       { id: 'a9574682-9da1-4da8-a130-fe6ac78d7b06', name: 'Deglaze',     family: 'finish',       task_type: 'human'   }],
  ['heat_dry',     { id: '4a6f0b2d-7679-4b03-8983-1ad41ccb5e2b', name: 'Bake',        family: 'heat_dry',     task_type: 'machine' }],
  ['heat_machine', { id: '3c2ec27b-2c93-4363-a322-a5180c21af72', name: 'Combi steam', family: 'heat_machine', task_type: 'machine' }],
  ['heat_wet',     { id: '2f600f22-57f9-4d86-abbd-f06146a50626', name: 'Blanch',      family: 'heat_wet',     task_type: 'human'   }],
  ['mix',          { id: 'cdc58767-e42a-4206-9c27-2c82e3fdc395', name: 'Beat',        family: 'mix',          task_type: 'human'   }],
  ['move',         { id: '45b0f2b6-7897-4b28-91a8-03f5a43dbc10', name: 'Add',         family: 'move',         task_type: 'human'   }],
  ['passive',      { id: '193d41a3-521c-41c0-88f5-e44a48005d2e', name: 'Brine',       family: 'passive',      task_type: 'passive' }],
  ['prepare',      { id: '24a9b746-e572-41e2-b601-cdfad7850c33', name: 'Measure',     family: 'prepare',      task_type: 'human'   }],
]);

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
    groupMap.get(label)!.steps.push({
      instruction:        step.instruction ?? '',
      durationMinutes:    step.durationMinutes ?? 0,
      temperatureCelsius: step.temperatureCelsius ?? null,
      taskFamily:         step.taskFamily ?? null,
      stepIngredients:    (step.stepIngredients ?? []).filter((i: any) => i.name?.trim()).map((i: any) => i.name),
      stepTools:          (step.stepTools ?? []).filter((t: any) => t.name?.trim()).map((t: any) => t.name),
    });
  }

  // Build ingredients from all step ingredients (with quantities)
  const allIngNames = new Set<string>();
  const ingredients: any[] = [];
  for (const step of (data.steps ?? [])) {
    for (const ing of (step.stepIngredients ?? [])) {
      const key = ing.name?.toLowerCase().trim();
      if (!key || allIngNames.has(key)) continue;
      allIngNames.add(key);
      ingredients.push({
        name: ing.name,
        quantityValue: ing.quantityValue ?? 0,
        quantityUnit: ing.quantityUnit ?? 'g',
        prepNote: ing.prepNote || null,
        optional: ing.optional ?? false,
      });
    }
  }
  for (const ing of (data.ingredients ?? [])) {
    const key = ing.name?.toLowerCase().trim();
    if (!key || allIngNames.has(key)) continue;
    allIngNames.add(key);
    ingredients.push({
      name: ing.name,
      quantityValue: ing.quantityValue ?? 0,
      quantityUnit: ing.quantityUnit ?? 'g',
      prepNote: ing.prepNote || null,
      optional: ing.optional ?? false,
    });
  }

  return {
    title: data.title ?? '', description: data.description ?? '', cuisine: data.cuisine ?? null,
    difficulty: data.difficulty ?? 'medium', servings: data.servings ?? 4,
    totalTimeMinutes: data.totalTimeMinutes ?? 0, activeTimeMinutes: data.activeTimeMinutes ?? null,
    tags: data.tags ? data.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : [],
    ingredients, equipment: [],
    groups: groupOrder.map(label => groupMap.get(label)!),
  };
}

function importToInitial(imp: any): any {
  if (!imp) return undefined;
  const allIngredients = imp.ingredients ?? [];
  const usedInSteps = new Set<string>();
  const assignedToStep = new Set<string>();
  const SHORT_LABELS: Record<string, string> = {
    'stock pot': 'Pot', 'large pot': 'Pot', 'saucepan': 'Pan', 'frying pan': 'Pan',
    'saute pan': 'Pan', 'pan': 'Pan', 'pot': 'Pot', "chef's knife": 'Knife', 'knife': 'Knife',
    'wok': 'Wok', 'blender': 'Blender', 'stand mixer': 'Mixer', 'food processor': 'Processor',
    'oven': 'Oven', 'microwave': 'Microwave', 'mixing bowl': 'Bowl', 'bowl': 'Bowl',
    'whisk': 'Whisk', 'spatula': 'Spatula', 'colander': 'Colander', 'grater': 'Grater',
    'cheese grater': 'Grater', 'chopping board': 'Board', 'cutting board': 'Board',
  };

  const steps = (imp.groups ?? []).flatMap((group: any) => {
    const toolInstanceMap = new Map<string, any>();
    const toolInstances: any[] = [];
    for (const step of (group.steps ?? [])) {
      for (const toolName of (step.stepTools ?? [])) {
        const key = toolName.toLowerCase().trim();
        if (!toolInstanceMap.has(key)) {
          const base = SHORT_LABELS[key] ?? toolName;
          const count = toolInstances.filter(t => (SHORT_LABELS[t.name.toLowerCase()] ?? t.name) === base).length;
          const inst = { instanceId: uid(), equipmentId: '', name: toolName, label: `${base} #${count + 1}`, colorIndex: toolInstances.length % 8 };
          toolInstanceMap.set(key, inst);
          toolInstances.push(inst);
        }
      }
    }
    return (group.steps ?? []).map((step: any, si: number) => {
      const stepIngs = (step.stepIngredients ?? [])
        .filter((name: string) => name?.toString().trim())
        .map((name: string) => {
          const nameStr = name.toString().trim();
          usedInSteps.add(nameStr.toLowerCase());
          const match = allIngredients.find((i: any) => i.name.toLowerCase().trim() === nameStr.toLowerCase());
          return { id: uid(), ingredientId: '', name: nameStr, quantityValue: match?.quantityValue ?? 0, quantityUnit: match?.quantityUnit ?? 'g', prepNote: match?.prepNote ?? '' };
        });
      const matchedTask = FAMILY_MAP.get(step.taskFamily ?? '');
      const stepTools = (step.stepTools ?? []).map((toolName: string) => {
        const inst = toolInstanceMap.get(toolName.toLowerCase().trim());
        return { id: uid(), instanceId: inst?.instanceId, equipmentId: '', name: toolName };
      });
      return {
        id: uid(), instruction: step.instruction ?? '', durationMinutes: step.durationMinutes ?? 0,
        temperatureCelsius: step.temperatureCelsius ?? 0,
        taskFamily: matchedTask?.family ?? step.taskFamily ?? undefined,
        taskId: matchedTask?.id ?? undefined, taskName: matchedTask?.name ?? undefined,
        taskType: matchedTask?.task_type ?? undefined,
        groupLabel: group.outputName || '__default__',
        groupToolInstances: si === 0 ? toolInstances : undefined,
        stepIngredients: stepIngs, stepTools,
      };
    });
  });

  const ingredients = allIngredients
    .filter((ing: any) => !usedInSteps.has(ing.name.toLowerCase().trim()))
    .map((ing: any) => ({ ingredientId: '', ingredientSlug: '', name: ing.name, quantityValue: ing.quantityValue ?? 0, quantityUnit: ing.quantityUnit ?? 'g', prepNote: ing.prepNote ?? '', optional: ing.optional ?? false }));

  return {
    canonicalId: imp._canonicalId ?? '', versionId: imp._versionId ?? '',
    title: imp.title ?? '', description: imp.description ?? '', cuisine: imp.cuisine ?? '',
    tags: Array.isArray(imp.tags) ? imp.tags.join(', ') : (imp.tags ?? ''),
    servings: imp.servings ?? 4, difficulty: imp.difficulty ?? 'medium',
    totalTimeMinutes: imp.totalTimeMinutes ?? 0, activeTimeMinutes: imp.activeTimeMinutes ?? 0,
    ingredients, steps, equipmentIds: imp._equipmentIds ?? [], isPublished: imp._isPublished ?? false,
  };
}

interface ChatTurn { type: 'answer' | 'modification'; user: string; recipe: any; assistantSummary: string; }
interface PendingChange { recipe: any; summary: string; }

export default function EditRecipePage() {
  const params = useParams();
  const router = useRouter();
  const id     = params.id as string;

  const [loading,       setLoading]       = useState(true);
  const [saving,        setSaving]        = useState(false);
  const [error,         setError]         = useState('');
  const [importJson,    setImportJson]    = useState<any>(null);
  const [editorKey,     setEditorKey]     = useState(0);
  const [editorInitial, setEditorInitial] = useState<any>(null);

  const [chatHistory, setChatHistory] = useState<ChatTurn[]>([]);
  const [chatInput,   setChatInput]   = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError,   setChatError]   = useState<string|null>(null);
  const [pending,     setPending]     = useState<PendingChange|null>(null);

  const chatEndRef   = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatHistory, chatLoading, pending]);

  useEffect(() => {
    fetch(`/api/my/recipes/${id}`)
      .then(r => { if (!r.ok) throw new Error('Not found'); return r.json(); })
      .then(data => {
        // Build importJson for the chat system
        const imp = editorToImportJson(data);
        imp._canonicalId = data.canonicalId; imp._versionId = data.versionId;
        imp._equipmentIds = data.equipmentIds ?? []; imp._isPublished = data.isPublished ?? false;
        setImportJson(imp);
        // Pass API data directly to RecipeEditor — it already has the right format
        // stepIngredients are objects {id, ingredientId, name, quantityValue, quantityUnit, prepNote}
        setEditorInitial({
          canonicalId:       data.canonicalId,
          versionId:         data.versionId,
          title:             data.title ?? '',
          description:       data.description ?? '',
          cuisine:           data.cuisine ?? '',
          tags:              data.tags ?? '',
          servings:          data.servings ?? 4,
          difficulty:        data.difficulty ?? 'medium',
          totalTimeMinutes:  data.totalTimeMinutes ?? 0,
          activeTimeMinutes: data.activeTimeMinutes ?? 0,
          ingredients:       data.ingredients ?? [],
          steps:             data.steps ?? [],
          equipmentIds:      data.equipmentIds ?? [],
          isPublished:       data.isPublished ?? false,
        });
        setLoading(false);
      })
      .catch(() => { setError('Recipe not found or you do not have permission to edit it.'); setLoading(false); });
  }, [id]);

  const handleSave = async (data: RecipeFormData) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/my/recipes/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error ?? 'Failed to save'); }
      router.push('/my/recipes');
    } finally { setSaving(false); }
  };

  const [streamingText, setStreamingText] = useState('');

  const handleChatSend = async () => {
    if (!chatInput.trim() || chatLoading || !importJson) return;
    const message = chatInput.trim();
    setChatInput(''); setChatError(null); setChatLoading(true); setPending(null);
    setStreamingText('');

    try {
      const res = await fetch('/api/recipes/import/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipe: importJson, message, history: chatHistory }),
      });

      if (!res.ok) throw new Error('Request failed');

      const reader  = res.body!.getReader();
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
              // modification in progress — spinner stays
            } else if (event.type === 'done') {
              setStreamingText('');
              if (event.responseType === 'answer') {
                setChatHistory(prev => [...prev, { type: 'answer', user: message, recipe: importJson, assistantSummary: event.answer }]);
              } else {
                const updated = event.recipe;
                updated._canonicalId = importJson._canonicalId; updated._versionId = importJson._versionId;
                updated._equipmentIds = importJson._equipmentIds; updated._isPublished = importJson._isPublished;
                setChatHistory(prev => [...prev, { type: 'modification', user: message, recipe: updated, assistantSummary: event.changeSummary }]);
                if (event.requiresConfirmation) {
                  setPending({ recipe: updated, summary: event.changeSummary });
                } else {
                  setImportJson(updated);
                  setEditorInitial(importToInitial(updated));
                  setEditorKey(k => k + 1);
                }
              }
            } else if (event.type === 'error') {
              throw new Error(event.error);
            }
          } catch (parseErr) { /* skip malformed events */ }
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
    setImportJson(pending.recipe);
    setEditorInitial(importToInitial(pending.recipe));
    setEditorKey(k => k + 1);
    setPending(null);
  };

  const handleCancel = () => {
    setChatHistory(prev => prev.slice(0, -1));
    setPending(null);
  };

  const handleChatKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleChatSend(); }
  };

  return (
    <div>
      {/* Breadcrumb */}
      <div className="border-b border-[var(--border)] px-4 md:px-8 py-3 flex items-center gap-3">
        <Link href="/my/recipes" className="flex items-center gap-1.5 text-[11px] font-mono text-[var(--muted)] hover:text-[var(--accent)] transition-colors">
          <ArrowLeft size={12} /> My Recipes
        </Link>
        <span className="text-[var(--border)]">/</span>
        <span className="text-[11px] font-mono text-[var(--fg)]">
          {loading ? '…' : editorInitial?.title ?? 'Edit recipe'}
        </span>
        {chatHistory.length > 0 && (
          <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--accent)', background: 'var(--accent-subtle)',
            padding: '2px 7px', border: '1px solid var(--accent)', marginLeft: 4 }}>
            {chatHistory.length} edit{chatHistory.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-[var(--muted)] text-[12px] font-mono px-8 py-16">
          <Loader2 size={14} className="animate-spin" /> Loading…
        </div>
      ) : error ? (
        <div className="px-8 py-16 text-[var(--error)] text-[12px] font-mono">{error}</div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'flex-start' }}>

          {/* Left — Recipe editor. Chat is position:fixed (out of flow); reserve
              its 300px via paddingRight and give the chat slot width:0 below.
              No max-width cap — the editor fills the available space. */}
          <div style={{ flex: 1, minWidth: 0, paddingRight: 300 }}>
            <div style={{ width: '100%' }}>
            <RecipeEditor key={editorKey} initial={editorInitial} onSave={handleSave} saving={saving} fillWidth />

            {/* Concepts (global name bindings) for this recipe */}
            {(editorInitial?.canonicalId || id) && (
              <div style={{ padding: '0 32px 80px' }}>
                <div style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.18em', color: MUT, marginBottom: 10 }}>
                  Concepts — names this is known by
                </div>
                <ConceptBinder entityType="recipe" entityId={(editorInitial?.canonicalId || id) as string} />
              </div>
            )}
            </div>
          </div>

          {/* Right — Chat panel (fixed; slot is zero-width since it's out of flow) */}
          <div style={{ width: 0, flexShrink: 0 }}>
            <div style={{ position: 'fixed', top: 0, right: 0, width: 300, height: '100vh', borderLeft: B, background: 'var(--surface)', display: 'flex', flexDirection: 'column', zIndex: 40 }}>

            <div style={{ padding: '12px 16px', borderBottom: B, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <span style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'var(--muted)' }}>
                Edit recipe
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {chatHistory.length > 0 && (
                  <button onClick={() => { setChatHistory([]); setPending(null); }}
                    title="Clear history"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4, fontFamily: MONO, fontSize: 9 }}>
                    <RotateCcw size={10} /> Clear
                  </button>
                )}
              </div>
            </div>

            {/* Messages area */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>

              {/* Suggestion chips */}
              {chatHistory.length === 0 && (
                <>
                  <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--muted)', lineHeight: 1.6, textAlign: 'center', padding: '12px 0' }}>
                    Ask questions or give instructions — <em>'What can I substitute?'</em> or <em>'Make it vegetarian'</em>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {['Make it vegetarian', 'Scale to 6 servings', 'Break down steps further', 'Add timing to steps', 'Simplify for beginners'].map(s => (
                      <button key={s} onClick={() => { setChatInput(s); chatInputRef.current?.focus(); }}
                        style={{ textAlign: 'left', background: 'var(--surface-hover)', border: B, padding: '7px 10px',
                          cursor: 'pointer', fontFamily: MONO, fontSize: 10, color: 'var(--muted)', transition: 'color 0.15s' }}
                        onMouseEnter={e => (e.currentTarget.style.color = 'var(--fg)')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'var(--muted)')}>
                        {s}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {/* Conversation */}
              {chatHistory.map((turn, i) => {
                const isPending = pending && i === chatHistory.length - 1;
                return (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ alignSelf: 'flex-end', background: 'var(--accent)', color: '#fff',
                      padding: '5px 9px', maxWidth: '85%', fontFamily: MONO, fontSize: 10, lineHeight: 1.5 }}>
                      {turn.user}
                    </div>
                    {isPending ? (
                      <div style={{ border: '1px solid var(--accent)', background: 'var(--accent-subtle)',
                        padding: '8px 10px', fontFamily: MONO, fontSize: 10, lineHeight: 1.5 }}>
                        <div style={{ color: 'var(--fg)', marginBottom: 8 }}>{turn.assistantSummary}</div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={handleApply}
                            style={{ flex: 1, padding: '5px 0', background: 'var(--accent)', color: '#fff',
                              border: 'none', cursor: 'pointer', fontFamily: MONO, fontSize: 10 }}>
                            Apply
                          </button>
                          <button onClick={handleCancel}
                            style={{ flex: 1, padding: '5px 0', background: 'none', color: 'var(--muted)',
                              border: B, cursor: 'pointer', fontFamily: MONO, fontSize: 10 }}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : turn.type === 'answer' ? (
                      <div style={{ alignSelf: 'flex-start', background: 'var(--surface-hover)', border: B,
                        padding: '8px 10px', maxWidth: '85%', fontFamily: MONO, fontSize: 10,
                        color: 'var(--fg)', lineHeight: 1.6 }}>
                        {turn.assistantSummary}
                      </div>
                    ) : (
                      <div style={{ alignSelf: 'flex-start', background: 'var(--surface-hover)', border: B,
                        padding: '5px 9px', maxWidth: '85%', fontFamily: MONO, fontSize: 10,
                        color: 'var(--muted)', lineHeight: 1.5 }}>
                        ✓ {turn.assistantSummary}
                      </div>
                    )}
                  </div>
                );
              })}

              {(chatLoading || streamingText) && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {streamingText ? (
                    <div style={{ alignSelf: 'flex-start', background: 'var(--surface-hover)', border: B,
                      padding: '6px 10px', maxWidth: '85%', fontFamily: MONO, fontSize: 10,
                      color: 'var(--fg)', lineHeight: 1.6 }}>
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px',
                  border: '1px solid #b45309', background: '#fef3c7', fontFamily: MONO, fontSize: 10, color: '#92400e' }}>
                  <AlertTriangle size={10} />{chatError}
                </div>
              )}

              <div ref={chatEndRef} />
            </div>

            {/* Input — pinned to bottom of sidebar */}
            <div style={{ borderTop: B, padding: '10px 12px', flexShrink: 0 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 6 }}>
                <textarea ref={chatInputRef} value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={handleChatKeyDown}
                  placeholder="Ask a question or give an instruction…"
                  rows={2} disabled={chatLoading || !!pending}
                  style={{ flex: 1, padding: '8px 10px', border: B, background: 'var(--bg)',
                    color: 'var(--fg)', fontFamily: MONO, fontSize: 11, outline: 'none',
                    resize: 'none', lineHeight: 1.5, opacity: (chatLoading || !!pending) ? 0.5 : 1 }} />
                <button onClick={handleChatSend}
                  disabled={chatLoading || !chatInput.trim() || !!pending}
                  style={{ padding: '8px 10px', border: 'none', background: 'var(--accent)', color: '#fff',
                    cursor: (chatLoading || !chatInput.trim() || !!pending) ? 'not-allowed' : 'pointer',
                    opacity: (chatLoading || !chatInput.trim() || !!pending) ? 0.5 : 1,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {chatLoading ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                </button>
              </div>
              <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--muted)', opacity: 0.6 }}>
                Enter to send · Shift+Enter for new line
              </div>
            </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
