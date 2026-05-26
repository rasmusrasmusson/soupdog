// src/components/recipe/RecipeEditor.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, ChevronUp, ChevronDown, Loader2, ChevronRight, X, GripVertical, Zap } from 'lucide-react';
import type { RecipeFormData } from '@/lib/recipe-actions';
import { APPLIANCES, type ApplianceDefinition, type CookingMode, type Control } from '@/lib/appliances';

// ── Types ─────────────────────────────────────────────────────

interface TaxonomyNode { id: string; name: string; parent_id: string | null; }

interface StepIngredient {
  id: string; ingredientId: string; name: string;
  quantityValue: number; quantityUnit: string; prepNote: string;
}

interface StepTool {
  id: string; equipmentId: string; name: string;
  // Connected appliance fields
  applianceId?: string;
  applianceModeId?: string;
  applianceSettings?: Record<string, string | number>;
}

interface Step {
  id: string; instruction: string;
  durationMinutes: number; temperatureCelsius: number;
  stepIngredients: StepIngredient[];
  stepTools: StepTool[];
}

interface Group {
  id: string; outputName: string; outputIngId: string;
  steps: Step[]; collapsed: boolean;
}

interface IngredientRow {
  id: string; ingredientId: string; name: string;
  quantityValue: number; quantityUnit: string; prepNote: string; optional: boolean;
}

interface Props {
  initial?: {
    canonicalId: string; versionId: string; title: string; description: string;
    cuisine: string; tags: string; servings: number; difficulty: string;
    totalTimeMinutes: number; activeTimeMinutes: number;
    ingredients: IngredientRow[]; steps: any[]; equipmentIds: string[]; isPublished: boolean;
  };
  onSave: (data: RecipeFormData) => Promise<void>;
  saving: boolean;
}

const DIFFICULTY_OPTIONS = ['trivial', 'easy', 'medium', 'hard', 'expert'];
const COMMON_UNITS = ['g', 'kg', 'ml', 'l', 'tsp', 'tbsp', 'cup', 'oz', 'lb', 'clove', 'slice', 'piece', 'pinch'];

function uid() { return Math.random().toString(36).slice(2, 9); }
function emptyStep(): Step { return { id: uid(), instruction: '', durationMinutes: 0, temperatureCelsius: 0, stepIngredients: [], stepTools: [] }; }
function emptyGroup(name = ''): Group { return { id: uid(), outputName: name, outputIngId: '', steps: [emptyStep()], collapsed: false }; }
function emptyStepIngredient(): StepIngredient { return { id: uid(), ingredientId: '', name: '', quantityValue: 0, quantityUnit: 'g', prepNote: '' }; }
function emptyStepTool(): StepTool { return { id: uid(), equipmentId: '', name: '' }; }

function FL({ children }: { children: React.ReactNode }) {
  return <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--muted)] block mb-1">{children}</span>;
}

// ── Hierarchical picker ───────────────────────────────────────

function HierarchicalPicker({ nodes, onSelect, onClose, placeholder, extraSection }: {
  nodes: TaxonomyNode[];
  onSelect: (n: TaxonomyNode) => void;
  onClose: () => void;
  placeholder: string;
  extraSection?: { label: string; items: { id: string; name: string }[] };
}) {
  const [query, setQuery]       = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const inputRef                = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const roots      = nodes.filter(n => !n.parent_id);
  const childrenOf = (id: string) => nodes.filter(n => n.parent_id === id);
  const hasKids    = (id: string) => nodes.some(n => n.parent_id === id);
  const search     = query.length >= 2 ? nodes.filter(n => n.name.toLowerCase().includes(query.toLowerCase())) : null;

  function Node({ node, depth }: { node: TaxonomyNode; depth: number }) {
    const kids = childrenOf(node.id);
    const isP  = kids.length > 0;
    const open = expanded.has(node.id);
    return (
      <div>
        <div className="flex items-center gap-1 hover:bg-[var(--surface-hover)] cursor-pointer"
          style={{ paddingLeft: 12 + depth * 16, paddingTop: 6, paddingBottom: 6, paddingRight: 12 }}
          onClick={() => isP ? setExpanded(p => { const n = new Set(p); n.has(node.id) ? n.delete(node.id) : n.add(node.id); return n; }) : onSelect(node)}>
          {isP ? <ChevronRight size={10} className={`text-[var(--muted)] flex-shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} /> : <span className="w-[10px]" />}
          <span className={isP ? 'font-mono text-[10px] uppercase tracking-wider text-[var(--muted)]' : 'text-[12px] text-[var(--fg)]'}>{node.name}</span>
        </div>
        {isP && open && kids.map(k => <Node key={k.id} node={k} depth={depth + 1} />)}
      </div>
    );
  }

  return (
    <div className="absolute top-full left-0 z-50 w-72 bg-[var(--surface)] border border-[var(--border)] shadow-lg">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--border)]">
        <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)} placeholder={placeholder}
          className="flex-1 bg-transparent text-[12px] text-[var(--fg)] placeholder:text-[var(--muted)] outline-none" />
        <button onClick={onClose}><X size={12} className="text-[var(--muted)]" /></button>
      </div>
      <div className="max-h-52 overflow-y-auto">
        {extraSection && extraSection.items.length > 0 && !query && (
          <div>
            <div className="px-3 py-1.5 font-mono text-[9px] uppercase tracking-widest text-[var(--accent)] bg-[var(--surface-hover)]">{extraSection.label}</div>
            {extraSection.items.map(i => (
              <div key={i.id} onClick={() => onSelect({ id: i.id, name: i.name, parent_id: null })}
                className="px-5 py-2 text-[12px] text-[var(--fg)] hover:bg-[var(--surface-hover)] cursor-pointer">{i.name}</div>
            ))}
            <div className="h-px bg-[var(--border)] mx-3 my-1" />
          </div>
        )}
        {search
          ? search.length > 0
            ? search.map(n => <div key={n.id} onClick={() => onSelect(n)} className="px-3 py-2 text-[12px] text-[var(--fg)] hover:bg-[var(--surface-hover)] cursor-pointer">{n.name}</div>)
            : <div className="px-3 py-3 text-[11px] text-[var(--muted)] text-center">No results</div>
          : roots.map(n => <Node key={n.id} node={n} depth={0} />)
        }
      </div>
      {query.length >= 2 && (
        <div onClick={() => onSelect({ id: '', name: query, parent_id: null })}
          className="px-3 py-2 text-[12px] text-[var(--accent)] hover:bg-[var(--surface-hover)] cursor-pointer border-t border-[var(--border)]">
          + Add &ldquo;{query}&rdquo;
        </div>
      )}
    </div>
  );
}

function PickerBtn({ value, placeholder, onSelect, nodes, extraSection, className = '' }: {
  value: string; placeholder: string; onSelect: (n: TaxonomyNode) => void;
  nodes: TaxonomyNode[]; extraSection?: { label: string; items: { id: string; name: string }[] }; className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`relative ${className}`}>
      <button onClick={() => setOpen(v => !v)}
        className={`w-full text-left px-2 py-1.5 text-[12px] border transition-colors flex items-center justify-between bg-transparent ${value ? 'border-[var(--border)] text-[var(--fg)]' : 'border-dashed border-[var(--border)] text-[var(--muted)]'} hover:border-[var(--accent)]`}>
        <span className="truncate">{value || placeholder}</span>
        {value && <span className="text-[var(--accent)] text-[10px] ml-1 flex-shrink-0">✓</span>}
      </button>
      {open && <HierarchicalPicker nodes={nodes} placeholder={`Search…`} extraSection={extraSection} onSelect={n => { onSelect(n); setOpen(false); }} onClose={() => setOpen(false)} />}
    </div>
  );
}

// ── Connected appliance controls ──────────────────────────────

function ApplianceControl({ control, value, onChange }: {
  control: Control; value: string | number; onChange: (v: string | number) => void;
}) {
  return (
    <div>
      <FL>{control.label}{control.unit ? ` (${control.unit})` : ''}</FL>
      {control.type === 'select' && (
        <select value={value} onChange={e => onChange(e.target.value)}
          className="w-full bg-[var(--surface)] border border-[var(--border)] px-2 py-1.5 text-[12px] text-[var(--fg)] outline-none focus:border-[var(--accent)] cursor-pointer">
          {control.options?.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      )}
      {(control.type === 'temperature' || control.type === 'power_w' || control.type === 'time_minutes') && (
        <div className="flex items-center gap-2">
          <input type="number" min={control.min} max={control.max} value={value}
            onChange={e => onChange(parseFloat(e.target.value) || 0)}
            className="w-full bg-transparent border border-[var(--border)] px-2 py-1.5 text-[12px] text-right text-[var(--fg)] outline-none focus:border-[var(--accent)] transition-colors" />
          {control.unit && <span className="text-[11px] text-[var(--muted)] font-mono flex-shrink-0">{control.unit}</span>}
        </div>
      )}
      {control.type === 'toggle' && (
        <button onClick={() => onChange(value ? 0 : 1)}
          className={`px-3 py-1.5 text-[11px] font-mono border transition-colors ${value ? 'border-[var(--accent)] text-[var(--accent)] bg-[var(--accent-subtle)]' : 'border-[var(--border)] text-[var(--muted)]'}`}>
          {value ? 'On' : 'Off'}
        </button>
      )}
      {control.hint && <p className="mt-1 text-[10px] text-[var(--muted)] font-mono">{control.hint}</p>}
    </div>
  );
}

function AppliancePanel({ tool, onChange }: { tool: StepTool; onChange: (t: StepTool) => void }) {
  const appliance = APPLIANCES.find(a => a.id === tool.applianceId);
  const mode      = appliance?.modes.find(m => m.id === tool.applianceModeId);

  if (!appliance) {
    return (
      <div className="mt-2 p-3 border border-[var(--border)] bg-[var(--surface)]">
        <FL>Connected Appliance</FL>
        <select value="" onChange={e => onChange({ ...tool, applianceId: e.target.value, applianceModeId: '', applianceSettings: {} })}
          className="w-full bg-[var(--surface)] border border-[var(--border)] px-2 py-1.5 text-[12px] text-[var(--fg)] outline-none focus:border-[var(--accent)] cursor-pointer">
          <option value="">Select appliance…</option>
          {APPLIANCES.map(a => (
            <option key={a.id} value={a.id}>{a.brand} {a.model} — {a.name}</option>
          ))}
        </select>
      </div>
    );
  }

  const settings = tool.applianceSettings ?? {};

  return (
    <div className="mt-2 border border-[var(--accent)] bg-[var(--surface)] p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Zap size={11} className="text-[var(--accent)]" />
            <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--accent)]">Connected</span>
            <span className="font-mono text-[10px] text-[var(--muted)]">·</span>
            <span className="font-mono text-[10px] text-[var(--muted)]">{appliance.brand} {appliance.model}</span>
          </div>
          <p className="text-[11px] text-[var(--muted)] mt-0.5">{appliance.name}</p>
        </div>
        <button onClick={() => onChange({ ...tool, applianceId: undefined, applianceModeId: undefined, applianceSettings: undefined })}
          className="text-[var(--muted)] hover:text-[var(--fg)]"><X size={12} /></button>
      </div>

      {/* Mode selector */}
      <div>
        <FL>Cooking Mode</FL>
        <select value={tool.applianceModeId ?? ''} onChange={e => {
          const newMode = appliance.modes.find(m => m.id === e.target.value);
          const defaults: Record<string, string | number> = {};
          newMode?.controls.forEach(c => { if (c.defaultValue !== undefined) defaults[c.id] = c.defaultValue; });
          onChange({ ...tool, applianceModeId: e.target.value, applianceSettings: defaults });
        }}
          className="w-full bg-[var(--surface)] border border-[var(--border)] px-2 py-1.5 text-[12px] text-[var(--fg)] outline-none focus:border-[var(--accent)] cursor-pointer">
          <option value="">Select mode…</option>
          {appliance.modes.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
        {mode?.hint && <p className="mt-1 text-[10px] text-[var(--muted)] font-mono">{mode.hint}</p>}
      </div>

      {/* Mode controls */}
      {mode && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {mode.controls.map(control => (
            <ApplianceControl key={control.id} control={control}
              value={settings[control.id] ?? control.defaultValue ?? ''}
              onChange={v => onChange({ ...tool, applianceSettings: { ...settings, [control.id]: v } })} />
          ))}
        </div>
      )}

      {/* Instruction area for the step when using connected tool */}
      <div>
        <FL>Additional notes (optional)</FL>
        <textarea rows={2} placeholder="Any additional notes for this appliance step…"
          className="w-full bg-transparent border border-[var(--border)] px-2 py-1.5 text-[12px] text-[var(--fg)] placeholder:text-[var(--muted)] outline-none focus:border-[var(--accent)] resize-y" />
      </div>
    </div>
  );
}

// ── Step tool row ─────────────────────────────────────────────

function StepToolRow({ tool, equipmentTree, onChange, onRemove }: {
  tool: StepTool; equipmentTree: TaxonomyNode[];
  onChange: (t: StepTool) => void; onRemove: () => void;
}) {
  const isConnected = !!tool.applianceId || APPLIANCES.some(a => a.name === tool.name || a.model === tool.name);

  return (
    <div className="mb-2">
      <div className="flex items-center gap-2">
        <PickerBtn value={tool.name} placeholder="Tool / Equipment…"
          nodes={[
            ...equipmentTree,
            ...APPLIANCES.map(a => ({ id: a.id, name: `${a.model} — ${a.name}`, parent_id: null }))
          ]}
          onSelect={n => {
            const appliance = APPLIANCES.find(a => a.id === n.id);
            onChange({ ...tool, equipmentId: n.id, name: n.name, applianceId: appliance?.id });
          }}
          className="flex-1" />
        {tool.name && !tool.applianceId && APPLIANCES.find(a => a.name.includes(tool.name) || a.model.includes(tool.name)) && (
          <button onClick={() => {
            const a = APPLIANCES.find(app => app.name.includes(tool.name) || app.model.includes(tool.name));
            if (a) onChange({ ...tool, applianceId: a.id });
          }} className="flex items-center gap-1 px-2 py-1.5 text-[10px] font-mono text-[var(--accent)] border border-[var(--accent)] hover:bg-[var(--accent-subtle)] transition-colors flex-shrink-0">
            <Zap size={10} /> Connect
          </button>
        )}
        {tool.applianceId && (
          <span className="flex items-center gap-1 text-[10px] font-mono text-[var(--accent)] flex-shrink-0">
            <Zap size={10} /> Connected
          </span>
        )}
        <button onClick={onRemove} className="p-1 text-[var(--muted)] hover:text-red-500 flex-shrink-0">
          <Trash2 size={11} strokeWidth={1.5} />
        </button>
      </div>
      {tool.applianceId && <AppliancePanel tool={tool} onChange={onChange} />}
    </div>
  );
}

// ── Step ingredient row ───────────────────────────────────────

function StepIngRow({ row, ingredientTree, fromRecipe, onChange, onRemove }: {
  row: StepIngredient; ingredientTree: TaxonomyNode[];
  fromRecipe: { id: string; name: string }[];
  onChange: (v: StepIngredient) => void; onRemove: () => void;
}) {
  return (
    <div className="grid gap-1.5 items-center py-1" style={{ gridTemplateColumns: '1fr 64px 64px 1fr auto' }}>
      <PickerBtn value={row.name} placeholder="Ingredient…" nodes={ingredientTree}
        extraSection={fromRecipe.length > 0 ? { label: 'From this recipe', items: fromRecipe } : undefined}
        onSelect={n => onChange({ ...row, ingredientId: n.id, name: n.name })} />
      <input type="number" min={0} step="any" value={row.quantityValue || ''}
        onChange={e => onChange({ ...row, quantityValue: parseFloat(e.target.value) || 0 })}
        placeholder="Qty"
        className="bg-transparent border border-[var(--border)] px-2 py-1.5 text-[12px] text-right text-[var(--fg)] placeholder:text-[var(--muted)] outline-none focus:border-[var(--accent)] transition-colors" />
      <select value={row.quantityUnit} onChange={e => onChange({ ...row, quantityUnit: e.target.value })}
        className="bg-[var(--surface)] border border-[var(--border)] px-1 py-1.5 text-[12px] text-[var(--fg)] outline-none focus:border-[var(--accent)] cursor-pointer">
        {COMMON_UNITS.map(u => <option key={u}>{u}</option>)}
      </select>
      <input value={row.prepNote} onChange={e => onChange({ ...row, prepNote: e.target.value })}
        placeholder="Prep note…"
        className="bg-transparent border border-[var(--border)] px-2 py-1.5 text-[12px] text-[var(--fg)] placeholder:text-[var(--muted)] outline-none focus:border-[var(--accent)] transition-colors" />
      <button onClick={onRemove} className="p-1 text-[var(--muted)] hover:text-red-500 transition-colors">
        <Trash2 size={11} strokeWidth={1.5} />
      </button>
    </div>
  );
}

// ── Step editor ───────────────────────────────────────────────

function StepEditor({ step, index, ingredientTree, equipmentTree, fromRecipe, isFirst, isLast,
  onChange, onRemove, onMoveUp, onMoveDown }: {
  step: Step; index: number; ingredientTree: TaxonomyNode[]; equipmentTree: TaxonomyNode[];
  fromRecipe: { id: string; name: string }[]; isFirst: boolean; isLast: boolean;
  onChange: (s: Step) => void; onRemove: () => void; onMoveUp: () => void; onMoveDown: () => void;
}) {
  const addIng  = () => onChange({ ...step, stepIngredients: [...step.stepIngredients, emptyStepIngredient()] });
  const addTool = () => onChange({ ...step, stepTools: [...step.stepTools, emptyStepTool()] });
  const updateIng  = (i: number, v: StepIngredient) => onChange({ ...step, stepIngredients: step.stepIngredients.map((r, idx) => idx === i ? v : r) });
  const removeIng  = (i: number) => onChange({ ...step, stepIngredients: step.stepIngredients.filter((_, idx) => idx !== i) });
  const updateTool = (i: number, v: StepTool) => onChange({ ...step, stepTools: step.stepTools.map((r, idx) => idx === i ? v : r) });
  const removeTool = (i: number) => onChange({ ...step, stepTools: step.stepTools.filter((_, idx) => idx !== i) });

  return (
    <div className="border border-[var(--border)] mb-2 last:mb-0">
      <div className="flex items-center gap-2 px-3 py-1.5 bg-[var(--surface-hover)] border-b border-[var(--border)]">
        <span className="font-mono text-[10px] text-[var(--muted)] w-4 flex-shrink-0">{index + 1}</span>
        <span className="font-mono text-[10px] text-[var(--muted)] flex-1">Step</span>
        <div className="flex items-center gap-0.5">
          <button onClick={onMoveUp}   disabled={isFirst} className="p-1 text-[var(--muted)] hover:text-[var(--fg)] disabled:opacity-30"><ChevronUp  size={11} /></button>
          <button onClick={onMoveDown} disabled={isLast}  className="p-1 text-[var(--muted)] hover:text-[var(--fg)] disabled:opacity-30"><ChevronDown size={11} /></button>
          <button onClick={onRemove} className="p-1 text-[var(--muted)] hover:text-red-500"><Trash2 size={11} strokeWidth={1.5} /></button>
        </div>
      </div>

      <div className="p-3 space-y-3">
        <textarea value={step.instruction} onChange={e => onChange({ ...step, instruction: e.target.value })}
          placeholder="Describe this step…" rows={2}
          className="w-full bg-transparent border border-[var(--border)] px-3 py-2 text-[12px] text-[var(--fg)] placeholder:text-[var(--muted)] outline-none focus:border-[var(--accent)] transition-colors resize-y" />

        <div className="flex gap-3">
          <div>
            <FL>Duration (min)</FL>
            <input type="number" min={0} value={step.durationMinutes || ''}
              onChange={e => onChange({ ...step, durationMinutes: parseFloat(e.target.value) || 0 })}
              placeholder="0"
              className="w-20 bg-transparent border border-[var(--border)] px-2 py-1.5 text-[12px] text-right text-[var(--fg)] outline-none focus:border-[var(--accent)] transition-colors" />
          </div>
          <div>
            <FL>Temperature (°C)</FL>
            <input type="number" min={0} value={step.temperatureCelsius || ''}
              onChange={e => onChange({ ...step, temperatureCelsius: parseFloat(e.target.value) || 0 })}
              placeholder="—"
              className="w-20 bg-transparent border border-[var(--border)] px-2 py-1.5 text-[12px] text-right text-[var(--fg)] outline-none focus:border-[var(--accent)] transition-colors" />
          </div>
        </div>

        {/* Ingredients */}
        <div>
          <FL>Ingredients used in this step</FL>
          {step.stepIngredients.length > 0 && (
            <div className="mb-1 grid gap-1.5 font-mono text-[9px] uppercase tracking-wider text-[var(--muted)]"
              style={{ gridTemplateColumns: '1fr 64px 64px 1fr auto' }}>
              <span>Name</span><span className="text-right">Qty</span><span>Unit</span><span>Prep</span><span className="w-5" />
            </div>
          )}
          {step.stepIngredients.map((si, i) => (
            <StepIngRow key={si.id} row={si} ingredientTree={ingredientTree} fromRecipe={fromRecipe}
              onChange={v => updateIng(i, v)} onRemove={() => removeIng(i)} />
          ))}
          <button onClick={addIng} className="mt-1 flex items-center gap-1 text-[10px] font-mono text-[var(--muted)] hover:text-[var(--accent)] transition-colors">
            <Plus size={10} /> Add ingredient
          </button>
        </div>

        {/* Tools — separate row below ingredients */}
        <div className="border-t border-[var(--border-subtle)] pt-3">
          <FL>Tools used in this step</FL>
          {step.stepTools.map((st, i) => (
            <StepToolRow key={st.id} tool={st} equipmentTree={equipmentTree}
              onChange={v => updateTool(i, v)} onRemove={() => removeTool(i)} />
          ))}
          <button onClick={addTool} className="mt-1 flex items-center gap-1 text-[10px] font-mono text-[var(--muted)] hover:text-[var(--accent)] transition-colors">
            <Plus size={10} /> Add tool
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Group editor ──────────────────────────────────────────────

function GroupEditor({ group, groupIndex, totalGroups, ingredientTree, equipmentTree,
  groupOutputs, onChange, onRemove, onMoveUp, onMoveDown }: {
  group: Group; groupIndex: number; totalGroups: number;
  ingredientTree: TaxonomyNode[]; equipmentTree: TaxonomyNode[];
  groupOutputs: { id: string; name: string }[];
  onChange: (g: Group) => void; onRemove: () => void; onMoveUp: () => void; onMoveDown: () => void;
}) {
  const isFirst = groupIndex === 0;
  const isLast  = groupIndex === totalGroups - 1;

  const addStep    = () => onChange({ ...group, steps: [...group.steps, emptyStep()] });
  const updateStep = (i: number, s: Step) => onChange({ ...group, steps: group.steps.map((r, idx) => idx === i ? s : r) });
  const removeStep = (i: number) => onChange({ ...group, steps: group.steps.filter((_, idx) => idx !== i) });
  const moveStep   = (i: number, dir: -1 | 1) => {
    const next = [...group.steps]; const swap = i + dir;
    if (swap < 0 || swap >= next.length) return;
    [next[i], next[swap]] = [next[swap], next[i]];
    onChange({ ...group, steps: next });
  };

  return (
    <div className="border border-[var(--border)] mb-4 last:mb-0">
      {/* Group header — always shown */}
      <div className="flex items-center gap-3 px-4 py-3 bg-[var(--surface)] border-b border-[var(--border)]">
        <GripVertical size={13} className="text-[var(--border)] flex-shrink-0" />

        <div className="flex-1 relative">
          <PickerBtn
            value={group.outputName}
            placeholder={totalGroups === 1 ? 'Group / output name (optional)…' : 'Group output (e.g. Vegetable broth)…'}
            nodes={ingredientTree}
            onSelect={n => onChange({ ...group, outputName: n.name, outputIngId: n.id })}
            className="w-full" />
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={onMoveUp}   disabled={isFirst} className="p-1 text-[var(--muted)] hover:text-[var(--fg)] disabled:opacity-30"><ChevronUp  size={12} /></button>
          <button onClick={onMoveDown} disabled={isLast}  className="p-1 text-[var(--muted)] hover:text-[var(--fg)] disabled:opacity-30"><ChevronDown size={12} /></button>
          <button onClick={() => onChange({ ...group, collapsed: !group.collapsed })}
            className="p-1 text-[var(--muted)] hover:text-[var(--fg)] font-mono text-[11px] w-5 text-center">
            {group.collapsed ? '+' : '−'}
          </button>
          {totalGroups > 1 && (
            <button onClick={onRemove} className="p-1 text-[var(--muted)] hover:text-red-500"><Trash2 size={12} strokeWidth={1.5} /></button>
          )}
        </div>
      </div>

      {!group.collapsed && (
        <div className="p-4">
          {group.steps.map((step, i) => (
            <StepEditor key={step.id} step={step} index={i}
              ingredientTree={ingredientTree} equipmentTree={equipmentTree}
              fromRecipe={groupOutputs}
              isFirst={i === 0} isLast={i === group.steps.length - 1}
              onChange={s => updateStep(i, s)}
              onRemove={() => removeStep(i)}
              onMoveUp={() => moveStep(i, -1)}
              onMoveDown={() => moveStep(i, 1)} />
          ))}
          <button onClick={addStep}
            className="mt-3 flex items-center gap-2 text-[11px] font-mono text-[var(--muted)] hover:text-[var(--accent)] transition-colors border border-dashed border-[var(--border)] px-3 py-2 w-full justify-center hover:border-[var(--accent)]">
            <Plus size={11} /> Add step
          </button>
        </div>
      )}
    </div>
  );
}

// ── Aggregate ingredients ─────────────────────────────────────

function aggregateIngredients(groups: Group[]): IngredientRow[] {
  const map = new Map<string, IngredientRow>();
  const outputKeys = new Set(groups.filter(g => g.outputName.trim()).map(g => g.outputIngId || g.outputName.toLowerCase().trim()));
  for (const g of groups) {
    for (const s of g.steps) {
      for (const si of s.stepIngredients) {
        if (!si.name.trim()) continue;
        const key = si.ingredientId || si.name.toLowerCase().trim();
        if (outputKeys.has(key)) continue;
        const ex = map.get(key);
        if (ex && ex.quantityUnit === si.quantityUnit) {
          map.set(key, { ...ex, quantityValue: ex.quantityValue + si.quantityValue });
        } else if (!ex) {
          map.set(key, { id: si.id, ingredientId: si.ingredientId, name: si.name, quantityValue: si.quantityValue, quantityUnit: si.quantityUnit, prepNote: si.prepNote, optional: false });
        }
      }
    }
  }
  return Array.from(map.values());
}

function initialToGroups(title: string, initial?: Props['initial']): Group[] {
  if (!initial?.steps?.length) return [emptyGroup(title)];
  const gmap = new Map<string, Step[]>();
  for (const s of initial.steps) {
    const label = s.groupLabel || '__default__';
    if (!gmap.has(label)) gmap.set(label, []);
    gmap.get(label)!.push({
      id: s.id || uid(), instruction: s.instruction || '',
      durationMinutes: s.durationMinutes || 0, temperatureCelsius: s.temperatureCelsius || 0,
      stepIngredients: (s.stepIngredients || []).map((si: any) => ({ ...si, id: si.id || uid() })),
      stepTools: (s.stepTools || []).map((st: any) => ({ ...st, id: st.id || uid() })),
    });
  }
  const groups: Group[] = [];
  gmap.forEach((steps, label) => groups.push({ id: uid(), outputName: label === '__default__' ? '' : label, outputIngId: '', steps, collapsed: false }));
  return groups.length > 0 ? groups : [emptyGroup(title)];
}

// ── Main editor ───────────────────────────────────────────────

export function RecipeEditor({ initial, onSave, saving }: Props) {
  const [title,            setTitle]          = useState(initial?.title ?? '');
  const [description,      setDescription]    = useState(initial?.description ?? '');
  const [cuisine,          setCuisine]        = useState(initial?.cuisine ?? '');
  const [tags,             setTags]           = useState(initial?.tags ?? '');
  const [servings,         setServings]       = useState(initial?.servings ?? 4);
  const [difficulty,       setDifficulty]     = useState(initial?.difficulty ?? 'medium');
  const [totalTimeMinutes, setTotalTime]      = useState(initial?.totalTimeMinutes ?? 0);
  const [activeTimeMinutes,setActiveTime]     = useState(initial?.activeTimeMinutes ?? 0);
  const [groups,           setGroups]         = useState<Group[]>(() => initialToGroups(initial?.title ?? '', initial));
  const [ingredients,      setIngredients]    = useState<IngredientRow[]>(initial?.ingredients ?? []);
  const [ingredientTree,   setIngredientTree] = useState<TaxonomyNode[]>([]);
  const [equipmentTree,    setEquipmentTree]  = useState<TaxonomyNode[]>([]);
  const [error,            setError]          = useState('');

  useEffect(() => {
    fetch('/api/ingredients/tree').then(r => r.ok ? r.json() : []).then(setIngredientTree).catch(() => {});
    fetch('/api/equipment/tree').then(r => r.ok ? r.json() : []).then(setEquipmentTree).catch(() => {});
  }, []);

  useEffect(() => {
    setIngredients(prev => {
      const agg = aggregateIngredients(groups);
      const aggKeys = new Set(agg.map(r => r.ingredientId || r.name.toLowerCase().trim()));
      const manual = prev.filter(r => !aggKeys.has(r.ingredientId || r.name.toLowerCase().trim()));
      return [...agg, ...manual];
    });
  }, [groups]);

  const handleSubmit = async () => {
    setError('');
    if (!title.trim()) { setError('Recipe title is required.'); return; }
    const allSteps = groups.flatMap(g => g.steps);
    if (!allSteps.some(s => s.instruction.trim())) { setError('Add at least one step.'); return; }
    try {
      const steps = groups.flatMap(g =>
        g.steps.filter(s => s.instruction.trim()).map(s => ({
          stepType: 'human', instruction: s.instruction,
          groupLabel: groups.length > 1 ? (g.outputName || '') : '',
          durationMinutes: s.durationMinutes, temperatureCelsius: s.temperatureCelsius,
          stepIngredients: s.stepIngredients.filter(si => si.name.trim()),
          stepTools: s.stepTools.filter(st => st.name.trim()),
        }))
      );
      const equipmentIds = [...new Set(groups.flatMap(g => g.steps.flatMap(s => s.stepTools.map(t => t.equipmentId).filter(Boolean))))];
      await onSave({ title, description, cuisine, tags, servings, difficulty, totalTimeMinutes, activeTimeMinutes, ingredients: ingredients.filter(i => i.name.trim()), steps, equipmentIds });
    } catch (e: any) { setError(e?.message ?? 'Something went wrong.'); }
  };

  const updateGroup = (i: number, g: Group) => setGroups(prev => prev.map((r, idx) => idx === i ? g : r));
  const removeGroup = (i: number) => setGroups(prev => prev.filter((_, idx) => idx !== i));
  const addGroup    = () => setGroups(prev => [...prev, emptyGroup('')]);
  const moveGroup   = (i: number, dir: -1 | 1) => setGroups(prev => {
    const next = [...prev]; const swap = i + dir;
    if (swap < 0 || swap >= next.length) return prev;
    [next[i], next[swap]] = [next[swap], next[i]]; return next;
  });
  const updateIng    = (i: number, v: IngredientRow) => setIngredients(prev => prev.map((r, idx) => idx === i ? v : r));
  const removeIng    = (i: number) => setIngredients(prev => prev.filter((_, idx) => idx !== i));
  const addManualIng = () => setIngredients(prev => [...prev, { id: uid(), ingredientId: '', name: '', quantityValue: 0, quantityUnit: 'g', prepNote: '', optional: false }]);

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-8 py-10 space-y-10">

      {/* Meta */}
      <section>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Recipe title"
          className="w-full bg-transparent border-none outline-none font-display text-[28px] md:text-[36px] font-light text-[var(--fg)] placeholder:text-[var(--border)] mb-4" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div><FL>Servings</FL>
            <input type="number" min={1} value={servings} onChange={e => setServings(parseInt(e.target.value) || 1)}
              className="w-full bg-transparent border border-[var(--border)] px-3 py-2 text-[12px] text-[var(--fg)] outline-none focus:border-[var(--accent)] transition-colors" />
          </div>
          <div><FL>Difficulty</FL>
            <select value={difficulty} onChange={e => setDifficulty(e.target.value)}
              className="w-full bg-[var(--surface)] border border-[var(--border)] px-3 py-2 text-[12px] text-[var(--fg)] outline-none focus:border-[var(--accent)] cursor-pointer">
              {DIFFICULTY_OPTIONS.map(d => <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>)}
            </select>
          </div>
          <div><FL>Total time (min)</FL>
            <input type="number" min={0} value={totalTimeMinutes || ''} onChange={e => setTotalTime(parseInt(e.target.value) || 0)} placeholder="0"
              className="w-full bg-transparent border border-[var(--border)] px-3 py-2 text-[12px] text-[var(--fg)] outline-none focus:border-[var(--accent)] transition-colors" />
          </div>
          <div><FL>Active time (min)</FL>
            <input type="number" min={0} value={activeTimeMinutes || ''} onChange={e => setActiveTime(parseInt(e.target.value) || 0)} placeholder="0"
              className="w-full bg-transparent border border-[var(--border)] px-3 py-2 text-[12px] text-[var(--fg)] outline-none focus:border-[var(--accent)] transition-colors" />
          </div>
        </div>
        <div className="grid md:grid-cols-2 gap-3 mb-4">
          <div><FL>Cuisine</FL>
            <input value={cuisine} onChange={e => setCuisine(e.target.value)} placeholder="Indian, European…"
              className="w-full bg-transparent border border-[var(--border)] px-3 py-2 text-[12px] text-[var(--fg)] placeholder:text-[var(--muted)] outline-none focus:border-[var(--accent)] transition-colors" />
          </div>
          <div><FL>Tags (comma-separated)</FL>
            <input value={tags} onChange={e => setTags(e.target.value)} placeholder="curry, dinner, spiced"
              className="w-full bg-transparent border border-[var(--border)] px-3 py-2 text-[12px] text-[var(--fg)] placeholder:text-[var(--muted)] outline-none focus:border-[var(--accent)] transition-colors" />
          </div>
        </div>
        <div><FL>Description</FL>
          <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="A short description…" rows={3}
            className="w-full bg-transparent border border-[var(--border)] px-3 py-2 text-[12px] text-[var(--fg)] placeholder:text-[var(--muted)] outline-none focus:border-[var(--accent)] transition-colors resize-y" />
        </div>
      </section>

      {/* Groups */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--muted)]">{groups.length > 1 ? 'Groups & Steps' : 'Steps'}</span>
          <div className="flex-1 h-px bg-[var(--border)]" />
        </div>
        {groups.map((group, gi) => (
          <GroupEditor key={group.id} group={group} groupIndex={gi} totalGroups={groups.length}
            ingredientTree={ingredientTree} equipmentTree={equipmentTree}
            groupOutputs={groups.slice(0, gi).filter(g => g.outputName.trim()).map(g => ({ id: g.outputIngId || g.outputName, name: g.outputName }))}
            onChange={g => updateGroup(gi, g)}
            onRemove={() => removeGroup(gi)}
            onMoveUp={() => moveGroup(gi, -1)}
            onMoveDown={() => moveGroup(gi, 1)} />
        ))}
        <button onClick={addGroup}
          className="mt-2 flex items-center gap-2 text-[11px] font-mono text-[var(--muted)] hover:text-[var(--accent)] transition-colors border border-dashed border-[var(--border)] px-3 py-2 w-full justify-center hover:border-[var(--accent)]">
          <Plus size={11} /> Add group
        </button>
      </section>

      {/* Ingredient list */}
      <section>
        <div className="flex items-center gap-3 mb-2">
          <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--muted)]">Ingredient list</span>
          <span className="font-mono text-[9px] text-[var(--muted)]">({ingredients.filter(i => i.name.trim()).length})</span>
          <div className="flex-1 h-px bg-[var(--border)]" />
          <span className="font-mono text-[9px] text-[var(--muted)] italic">auto-aggregated · editable</span>
        </div>
        {ingredients.length > 0 && (
          <div className="mb-1 grid gap-2 font-mono text-[9px] uppercase tracking-wider text-[var(--muted)]"
            style={{ gridTemplateColumns: '1fr 70px 70px 1fr auto' }}>
            <span>Ingredient</span><span className="text-right">Qty</span><span>Unit</span><span>Prep</span><span className="w-5" />
          </div>
        )}
        {ingredients.map((row, i) => (
          <div key={row.id} className="grid gap-2 py-1.5 border-b border-[var(--border-subtle)] last:border-0 items-center"
            style={{ gridTemplateColumns: '1fr 70px 70px 1fr auto' }}>
            <span className="text-[12px] text-[var(--fg)] px-2 py-1">
              {row.name}{row.ingredientId && <span className="ml-1 text-[var(--accent)] text-[10px]">✓</span>}
            </span>
            <input type="number" min={0} step="any" value={row.quantityValue || ''}
              onChange={e => updateIng(i, { ...row, quantityValue: parseFloat(e.target.value) || 0 })}
              className="bg-transparent border border-[var(--border)] px-2 py-1.5 text-[12px] text-right text-[var(--fg)] outline-none focus:border-[var(--accent)] transition-colors" />
            <select value={row.quantityUnit} onChange={e => updateIng(i, { ...row, quantityUnit: e.target.value })}
              className="bg-[var(--surface)] border border-[var(--border)] px-1 py-1.5 text-[12px] text-[var(--fg)] outline-none focus:border-[var(--accent)] cursor-pointer">
              {COMMON_UNITS.map(u => <option key={u}>{u}</option>)}
            </select>
            <input value={row.prepNote} onChange={e => updateIng(i, { ...row, prepNote: e.target.value })}
              placeholder="Prep note…"
              className="bg-transparent border border-[var(--border)] px-2 py-1.5 text-[12px] text-[var(--fg)] placeholder:text-[var(--muted)] outline-none focus:border-[var(--accent)] transition-colors" />
            <button onClick={() => removeIng(i)} className="p-1 text-[var(--muted)] hover:text-red-500 flex-shrink-0">
              <Trash2 size={11} strokeWidth={1.5} />
            </button>
          </div>
        ))}
        <button onClick={addManualIng} className="mt-2 flex items-center gap-1.5 text-[11px] font-mono text-[var(--muted)] hover:text-[var(--accent)] transition-colors">
          <Plus size={11} /> Add ingredient manually
        </button>
      </section>

      {/* Save */}
      <section className="border-t border-[var(--border)] pt-6">
        {error && <div className="mb-4 px-4 py-3 border border-red-300 text-red-600 text-[12px] font-mono bg-red-50">{error}</div>}
        <div className="flex items-center gap-4">
          <button onClick={handleSubmit} disabled={saving}
            className="flex items-center gap-2 bg-[var(--accent)] text-white px-6 py-2.5 text-[12px] font-mono hover:opacity-90 disabled:opacity-60 transition-opacity tracking-wide">
            {saving && <Loader2 size={13} className="animate-spin" />}
            {saving ? 'Saving…' : 'Save recipe'}
          </button>
          <span className="text-[11px] text-[var(--muted)] font-mono">Saved as draft — publish from My Recipes</span>
        </div>
      </section>
    </div>
  );
}
