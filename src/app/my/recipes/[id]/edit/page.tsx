// src/app/my/recipes/[id]/edit/page.tsx
'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2, Sparkles, Send, AlertTriangle, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react';
import { RecipeEditor } from '@/components/recipe/RecipeEditor';
import type { RecipeFormData } from '@/lib/recipe-actions';

const MONO = 'var(--font-mono)';
const B    = '1px solid var(--border)';

function uid() { return Math.random().toString(36).slice(2, 9); }

// familyMap — hardcoded task IDs matching the import page
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

// Convert editor's `initial` format → import-style JSON for the chat API
function editorToImportJson(data: any): any {
  if (!data) return null;

  // Rebuild groups from steps (steps have groupLabel)
  const groupMap = new Map<string, { outputName: string; steps: any[] }>();
  const groupOrder: string[] = [];

  for (const step of (data.steps ?? [])) {
    const label = step.groupLabel ?? '__default__';
    if (!groupMap.has(label)) {
      groupMap.set(label, { outputName: label === '__default__' ? '' : label, steps: [] });
      groupOrder.push(label);
    }
    const group = groupMap.get(label)!;

    // Reconstruct stepIngredients names from stepIngredients array
    const stepIngredientNames = (step.stepIngredients ?? [])
      .filter((i: any) => i.name?.trim())
      .map((i: any) => i.name);

    // Reconstruct stepTools names
    const stepToolNames = (step.stepTools ?? [])
      .filter((t: any) => t.name?.trim())
      .map((t: any) => t.name);

    group.steps.push({
      instruction:        step.instruction ?? '',
      durationMinutes:    step.durationMinutes ?? 0,
      temperatureCelsius: step.temperatureCelsius ?? null,
      taskFamily:         step.taskFamily ?? null,
      stepIngredients:    stepIngredientNames,
      stepTools:          stepToolNames,
    });
  }

  // Aggregate all ingredients (from steps + top-level)
  const allIngNames = new Set<string>();
  const ingredients: any[] = [];

  for (const step of (data.steps ?? [])) {
    for (const ing of (step.stepIngredients ?? [])) {
      const key = ing.name?.toLowerCase().trim();
      if (!key || allIngNames.has(key)) continue;
      allIngNames.add(key);
      ingredients.push({
        name:          ing.name,
        quantityValue: ing.quantityValue ?? 0,
        quantityUnit:  ing.quantityUnit ?? 'g',
        prepNote:      ing.prepNote || null,
        optional:      ing.optional ?? false,
      });
    }
  }
  for (const ing of (data.ingredients ?? [])) {
    const key = ing.name?.toLowerCase().trim();
    if (!key || allIngNames.has(key)) continue;
    allIngNames.add(key);
    ingredients.push({
      name:          ing.name,
      quantityValue: ing.quantityValue ?? 0,
      quantityUnit:  ing.quantityUnit ?? 'g',
      prepNote:      ing.prepNote || null,
      optional:      ing.optional ?? false,
    });
  }

  return {
    title:             data.title ?? '',
    description:       data.description ?? '',
    cuisine:           data.cuisine ?? null,
    difficulty:        data.difficulty ?? 'medium',
    servings:          data.servings ?? 4,
    totalTimeMinutes:  data.totalTimeMinutes ?? 0,
    activeTimeMinutes: data.activeTimeMinutes ?? null,
    tags:              data.tags ? data.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : [],
    ingredients,
    equipment:         [],
    groups:            groupOrder.map(label => groupMap.get(label)!),
  };
}

// Convert import-style JSON → editor `initial` format (mirrors new/page.tsx importToInitial)
function importToInitial(imp: any): any {
  if (!imp) return undefined;

  const allIngredients = imp.ingredients ?? [];
  const usedInSteps    = new Set<string>();
  const assignedToStep = new Set<string>();

  const SHORT_LABELS: Record<string, string> = {
    'stock pot': 'Pot', 'large pot': 'Pot', 'saucepan': 'Pan',
    'frying pan': 'Pan', 'saute pan': 'Pan', 'pan': 'Pan', 'pot': 'Pot',
    "chef's knife": 'Knife', 'knife': 'Knife', 'wok': 'Wok',
    'blender': 'Blender', 'stand mixer': 'Mixer', 'food processor': 'Processor',
    'oven': 'Oven', 'microwave': 'Microwave',
    'mixing bowl': 'Bowl', 'bowl': 'Bowl',
    'whisk': 'Whisk', 'spatula': 'Spatula',
    'colander': 'Colander', 'grater': 'Grater', 'cheese grater': 'Grater',
    'chopping board': 'Board', 'cutting board': 'Board',
  };

  const steps = (imp.groups ?? []).flatMap((group: any) => {
    const toolInstanceMap = new Map<string, any>();
    const toolInstances: any[] = [];

    for (const step of (group.steps ?? [])) {
      for (const toolName of (step.stepTools ?? [])) {
        const key = toolName.toLowerCase().trim();
        if (!toolInstanceMap.has(key)) {
          const base  = SHORT_LABELS[key] ?? toolName;
          const count = toolInstances.filter(t =>
            (SHORT_LABELS[t.name.toLowerCase()] ?? t.name) === base
          ).length;
          const inst = {
            instanceId:  uid(),
            equipmentId: '',
            name:        toolName,
            label:       `${base} #${count + 1}`,
            colorIndex:  toolInstances.length % 8,
          };
          toolInstanceMap.set(key, inst);
          toolInstances.push(inst);
        }
      }
    }

    return (group.steps ?? []).map((step: any, si: number) => {
      const stepIngs = (step.stepIngredients ?? [])
        .filter((name: string) => {
          const key = name.toLowerCase().trim();
          if (assignedToStep.has(key)) return false;
          assignedToStep.add(key);
          return true;
        })
        .map((name: string) => {
          usedInSteps.add(name.toLowerCase().trim());
          const match = allIngredients.find((i: any) =>
            i.name.toLowerCase().trim() === name.toLowerCase().trim()
          );
          return {
            id:            uid(),
            ingredientId:  '',
            name,
            quantityValue: match?.quantityValue ?? 0,
            quantityUnit:  match?.quantityUnit ?? 'g',
            prepNote:      match?.prepNote ?? '',
          };
        });

      const matchedTask = FAMILY_MAP.get(step.taskFamily ?? '');

      const stepTools = (step.stepTools ?? []).map((toolName: string) => {
        const inst = toolInstanceMap.get(toolName.toLowerCase().trim());
        return {
          id:          uid(),
          instanceId:  inst?.instanceId,
          equipmentId: '',
          name:        toolName,
        };
      });

      return {
        id:                 uid(),
        instruction:        step.instruction ?? '',
        durationMinutes:    step.durationMinutes ?? 0,
        temperatureCelsius: step.temperatureCelsius ?? 0,
        taskFamily:         matchedTask?.family ?? step.taskFamily ?? undefined,
        taskId:             matchedTask?.id ?? undefined,
        taskName:           matchedTask?.name ?? undefined,
        taskType:           matchedTask?.task_type ?? undefined,
        groupLabel:         group.outputName || '__default__',
        groupToolInstances: si === 0 ? toolInstances : undefined,
        stepIngredients:    stepIngs,
        stepTools,
      };
    });
  });

  const ingredients = allIngredients
    .filter((ing: any) => !usedInSteps.has(ing.name.toLowerCase().trim()))
    .map((ing: any) => ({
      ingredientId:   '',
      ingredientSlug: '',
      name:           ing.name,
      quantityValue:  ing.quantityValue ?? 0,
      quantityUnit:   ing.quantityUnit ?? 'g',
      prepNote:       ing.prepNote ?? '',
      optional:       ing.optional ?? false,
    }));

  return {
    canonicalId:       imp._canonicalId ?? '',
    versionId:         imp._versionId   ?? '',
    title:             imp.title ?? '',
    description:       imp.description ?? '',
    cuisine:           imp.cuisine ?? '',
    tags:              Array.isArray(imp.tags) ? imp.tags.join(', ') : (imp.tags ?? ''),
    servings:          imp.servings ?? 4,
    difficulty:        imp.difficulty ?? 'medium',
    totalTimeMinutes:  imp.totalTimeMinutes ?? 0,
    activeTimeMinutes: imp.activeTimeMinutes ?? 0,
    ingredients,
    steps,
    equipmentIds:      imp._equipmentIds ?? [],
    isPublished:       imp._isPublished  ?? false,
  };
}

interface ChatTurn { type: 'answer' | 'modification';
  user: string;
  recipe: any;
  assistantSummary: string;
}

export default function EditRecipePage() {
  const params = useParams();
  const router = useRouter();
  const id     = params.id as string;

  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState('');

  // We keep TWO representations:
  // 1. `importJson` — import-style JSON (used for chat API, source of truth for AI edits)
  // 2. `editorKey` — bump to force RecipeEditor remount with new initial
  const [importJson,  setImportJson]  = useState<any>(null);
  const [editorKey,   setEditorKey]   = useState(0);
  const [editorInitial, setEditorInitial] = useState<any>(null);

  // Chat state
  const [chatOpen,    setChatOpen]    = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatTurn[]>([]);
  const [chatInput,   setChatInput]   = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError,   setChatError]   = useState<string|null>(null);

  const chatEndRef   = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, chatLoading]);

  // Load recipe
  useEffect(() => {
    fetch(`/api/my/recipes/${id}`)
      .then(r => {
        if (!r.ok) throw new Error('Not found');
        return r.json();
      })
      .then(data => {
        // Build import JSON from editor initial data, preserving IDs for save
        const imp = editorToImportJson(data);
        imp._canonicalId  = data.canonicalId;
        imp._versionId    = data.versionId;
        imp._equipmentIds = data.equipmentIds ?? [];
        imp._isPublished  = data.isPublished ?? false;

        setImportJson(imp);
        setEditorInitial(data);  // use original shape for first mount
        setLoading(false);
      })
      .catch(() => {
        setError('Recipe not found or you do not have permission to edit it.');
        setLoading(false);
      });
  }, [id]);

  const handleSave = async (data: RecipeFormData) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/my/recipes/${id}`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? 'Failed to save');
      }
      router.push('/my/recipes');
    } finally {
      setSaving(false);
    }
  };

  const handleChatSend = async () => {
    if (!chatInput.trim() || chatLoading || !importJson) return;

    const message = chatInput.trim();
    setChatInput('');
    setChatError(null);
    setChatLoading(true);

    try {
      const res = await fetch('/api/recipes/import/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          recipe:  importJson,
          message,
          history: chatHistory,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Request failed');

      const updated = data.recipe;

      // Preserve internal IDs so save still works
      updated._canonicalId  = importJson._canonicalId;
      updated._versionId    = importJson._versionId;
      updated._equipmentIds = importJson._equipmentIds;
      updated._isPublished  = importJson._isPublished;

      // Count changes for summary
      const prevSteps = (importJson.groups ?? []).reduce((n: number, g: any) => n + (g.steps?.length ?? 0), 0);
      const newSteps  = (updated.groups  ?? []).reduce((n: number, g: any) => n + (g.steps?.length ?? 0), 0);
      const prevIngs  = importJson.ingredients?.length ?? 0;
      const newIngs   = updated.ingredients?.length ?? 0;
      const changes: string[] = [];
      if (updated.title !== importJson.title) changes.push(`renamed to "${updated.title}"`);
      if (newIngs  !== prevIngs)  changes.push(`${Math.abs(newIngs  - prevIngs)}  ingredient${Math.abs(newIngs - prevIngs) !== 1 ? 's' : ''} ${newIngs > prevIngs ? 'added' : 'removed'}`);
      if (newSteps !== prevSteps) changes.push(`${Math.abs(newSteps - prevSteps)} step${Math.abs(newSteps - prevSteps) !== 1 ? 's' : ''} ${newSteps > prevSteps ? 'added' : 'removed'}`);
      if (changes.length === 0) changes.push('recipe updated');

      setChatHistory(prev => [...prev, { type: 'modification', user: message, recipe: updated, assistantSummary: changes.join(', ') }]);
      setImportJson(updated);

      // Convert to editor initial and remount the editor
      const newInitial = importToInitial(updated);
      setEditorInitial(newInitial);
      setEditorKey(k => k + 1);

    } catch (err: any) {
      setChatError(err.message ?? 'Request failed');
    } finally {
      setChatLoading(false);
      chatInputRef.current?.focus();
    }
  };

  const handleChatKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleChatSend();
    }
  };

  const stepCount = (importJson?.groups ?? []).reduce((n: number, g: any) => n + (g.steps?.length ?? 0), 0);

  return (
    <div>
      {/* Breadcrumb */}
      <div className="border-b border-[var(--border)] px-4 md:px-8 py-3 flex items-center gap-3">
        <Link href="/my/recipes"
          className="flex items-center gap-1.5 text-[11px] font-mono text-[var(--muted)] hover:text-[var(--accent)] transition-colors">
          <ArrowLeft size={12} /> My Recipes
        </Link>
        <span className="text-[var(--border)]">/</span>
        <span className="text-[11px] font-mono text-[var(--fg)]">
          {loading ? '…' : editorInitial?.title ?? 'Edit recipe'}
        </span>
        {chatHistory.length > 0 && (
          <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--accent)',
            background: 'var(--accent-subtle)', padding: '2px 7px',
            border: '1px solid var(--accent)', marginLeft: 4 }}>
            {chatHistory.length} AI edit{chatHistory.length !== 1 ? 's' : ''}
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
        <div style={{ display: 'flex', flexDirection: 'column' }}>

          {/* AI Chat panel — collapsible, sits above the editor */}
          <div style={{ borderBottom: B, background: 'var(--surface)' }}>

            {/* Chat toggle header */}
            <button
              onClick={() => setChatOpen(o => !o)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 24px', background: 'none', border: 'none',
                cursor: 'pointer', textAlign: 'left',
              }}>
              <Sparkles size={13} style={{ color: 'var(--accent)', flexShrink: 0 }} />
              <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 600,
                textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--fg)' }}>
                Refine with AI
              </span>
              {chatHistory.length > 0 && (
                <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--accent)',
                  background: 'var(--accent-subtle)', padding: '1px 6px',
                  border: '1px solid var(--accent)' }}>
                  {chatHistory.length} edit{chatHistory.length !== 1 ? 's' : ''}
                </span>
              )}
              <span style={{ marginLeft: 'auto', color: 'var(--muted)' }}>
                {chatOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </span>
            </button>

            {/* Chat body */}
            {chatOpen && (
              <div style={{ padding: '0 24px 16px', maxWidth: 760 }}>

                {/* Conversation */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8,
                  marginBottom: 12, maxHeight: 280, overflowY: 'auto' }}>

                  {chatHistory.length === 0 && !chatLoading && (
                    <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--muted)',
                      padding: '8px 0', lineHeight: 1.6 }}>
                      Describe a change and Claude will update the recipe and reload the editor.
                    </div>
                  )}

                  {/* Suggestion chips */}
                  {chatHistory.length === 0 && !chatLoading && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 4 }}>
                      {[
                        'Make it vegetarian',
                        'Scale to 6 servings',
                        'Break down steps further',
                        'Add timing to each step',
                        'Simplify for beginners',
                      ].map(s => (
                        <button key={s}
                          onClick={() => { setChatInput(s); setChatOpen(true); chatInputRef.current?.focus(); }}
                          style={{ background: 'var(--surface-hover)', border: B,
                            padding: '5px 10px', cursor: 'pointer',
                            fontFamily: MONO, fontSize: 10, color: 'var(--muted)',
                            transition: 'color 0.15s' }}
                          onMouseEnter={e => (e.currentTarget.style.color = 'var(--fg)')}
                          onMouseLeave={e => (e.currentTarget.style.color = 'var(--muted)')}>
                          {s}
                        </button>
                      ))}
                    </div>
                  )}

                  {chatHistory.map((turn, i) => (
                    <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      <div style={{ alignSelf: 'flex-end', background: 'var(--accent)',
                        color: '#fff', padding: '6px 10px', maxWidth: '75%',
                        fontFamily: MONO, fontSize: 10, lineHeight: 1.5 }}>
                        {turn.user}
                      </div>
                      <div style={{ alignSelf: 'flex-start', background: 'var(--surface-hover)',
                        border: B, padding: '6px 10px', maxWidth: '75%',
                        fontFamily: MONO, fontSize: 10, color: 'var(--muted)', lineHeight: 1.5 }}>
                        ✓ {turn.assistantSummary} — editor reloaded
                      </div>
                    </div>
                  ))}

                  {chatLoading && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8,
                      fontFamily: MONO, fontSize: 10, color: 'var(--muted)' }}>
                      <Loader2 size={11} className="animate-spin" />
                      Updating recipe…
                    </div>
                  )}

                  {chatError && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6,
                      padding: '6px 10px', border: '1px solid #b45309',
                      background: '#fef3c7', fontFamily: MONO, fontSize: 10, color: '#92400e' }}>
                      <AlertTriangle size={10} />
                      {chatError}
                    </div>
                  )}

                  <div ref={chatEndRef} />
                </div>

                {/* Input row */}
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                  <textarea
                    ref={chatInputRef}
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    onKeyDown={handleChatKeyDown}
                    placeholder="Ask Claude to modify the recipe…"
                    rows={2}
                    disabled={chatLoading}
                    style={{
                      flex: 1, padding: '8px 10px', border: B,
                      background: 'var(--bg)', color: 'var(--fg)',
                      fontFamily: MONO, fontSize: 11, outline: 'none',
                      resize: 'none', lineHeight: 1.5,
                      opacity: chatLoading ? 0.5 : 1,
                    }}
                  />
                  <button
                    onClick={handleChatSend}
                    disabled={chatLoading || !chatInput.trim()}
                    style={{
                      padding: '8px 12px', border: 'none',
                      background: 'var(--accent)', color: '#fff',
                      cursor: chatLoading || !chatInput.trim() ? 'not-allowed' : 'pointer',
                      opacity: chatLoading || !chatInput.trim() ? 0.5 : 1,
                      display: 'flex', alignItems: 'center', gap: 6,
                      fontFamily: MONO, fontSize: 11, flexShrink: 0,
                    }}>
                    {chatLoading
                      ? <Loader2 size={12} className="animate-spin" />
                      : <><Send size={12} /> Send</>
                    }
                  </button>
                  {chatHistory.length > 0 && (
                    <button
                      onClick={() => setChatHistory([])}
                      title="Clear chat history"
                      style={{ padding: '8px 10px', border: B, background: 'none',
                        cursor: 'pointer', color: 'var(--muted)',
                        display: 'flex', alignItems: 'center' }}>
                      <RotateCcw size={12} />
                    </button>
                  )}
                </div>
                <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--muted)',
                  marginTop: 5, opacity: 0.7 }}>
                  Ask questions or give instructions · Enter to send
                </div>
              </div>
            )}
          </div>

          {/* Recipe editor */}
          <RecipeEditor
            key={editorKey}
            initial={editorInitial}
            onSave={handleSave}
            saving={saving}
          />
        </div>
      )}
    </div>
  );
}
