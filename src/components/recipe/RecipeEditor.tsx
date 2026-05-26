// src/components/recipe/RecipeEditor.tsx
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Trash2, ChevronUp, ChevronDown, Loader2, ChevronRight, X, GripVertical } from 'lucide-react';
import type { RecipeFormData } from '@/lib/recipe-actions';

// ── Types ─────────────────────────────────────────────────────

interface TaxonomyNode {
  id:        string;
  name:      string;
  parent_id: string | null;
}

interface StepIngredient {
  id:            string;
  ingredientId:  string;
  name:          string;
  quantityValue: number;
  quantityUnit:  string;
  prepNote:      string;
}

interface StepTool {
  id:          string;
  equipmentId: string;
  name:        string;
}

interface Step {
  id:                 string;
  instruction:        string;
  durationMinutes:    number;
  temperatureCelsius: number;
  stepIngredients:    StepIngredient[];
  stepTools:          StepTool[];
}

interface Group {
  id:              string;
  outputName:      string;    // what this group produces
  outputIngId:     string;    // linked ingredient id if matched
  steps:           Step[];
  collapsed:       boolean;
}

interface IngredientRow {
  id:            string;
  ingredientId:  string;
  name:          string;
  quantityValue: number;
  quantityUnit:  string;
  prepNote:      string;
  optional:      boolean;
}

interface Props {
  initial?: {
    canonicalId:        string;
    versionId:          string;
    title:              string;
    description:        string;
    cuisine:            string;
    tags:               string;
    servings:           number;
    difficulty:         string;
    totalTimeMinutes:   number;
    activeTimeMinutes:  number;
    ingredients:        IngredientRow[];
    steps:              any[];
    equipmentIds:       string[];
    isPublished:        boolean;
  };
  onSave: (data: RecipeFormData) => Promise<void>;
  saving: boolean;
}

// ── Constants ─────────────────────────────────────────────────

const DIFFICULTY_OPTIONS = ['trivial', 'easy', 'medium', 'hard', 'expert'];
const COMMON_UNITS = ['g', 'kg', 'ml', 'l', 'tsp', 'tbsp', 'cup', 'oz', 'lb', 'clove', 'slice', 'piece', 'pinch'];

function uid() { return Math.random().toString(36).slice(2, 9); }

function emptyStep(): Step {
  return { id: uid(), instruction: '', durationMinutes: 0, temperatureCelsius: 0, stepIngredients: [], stepTools: [] };
}

function emptyGroup(name = ''): Group {
  return { id: uid(), outputName: name, outputIngId: '', steps: [emptyStep()], collapsed: false };
}

function emptyStepIngredient(): StepIngredient {
  return { id: uid(), ingredientId: '', name: '', quantityValue: 0, quantityUnit: 'g', prepNote: '' };
}

function emptyStepTool(): StepTool {
  return { id: uid(), equipmentId: '', name: '' };
}

// ── Field label ───────────────────────────────────────────────

function FL({ children }: { children: React.ReactNode }) {
  return <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--muted)] block mb-1">{children}</span>;
}

// ── Hierarchical picker ───────────────────────────────────────

function HierarchicalPicker({
  nodes, onSelect, onClose, placeholder, extraSection,
}: {
  nodes: TaxonomyNode[];
  onSelect: (node: TaxonomyNode) => void;
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

  const searchResults = query.length >= 2
    ? nodes.filter(n => n.name.toLowerCase().includes(query.toLowerCase()))
    : null;

  const toggleExpand = (id: string) => setExpanded(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  function TreeNode({ node, depth }: { node: TaxonomyNode; depth: number }) {
    const kids   = childrenOf(node.id);
    const isParent = kids.length > 0;
    const open   = expanded.has(node.id);
    return (
      <div>
        <div className="flex items-center gap-1 hover:bg-[var(--surface-hover)] cursor-pointer transition-colors"
          style={{ paddingLeft: `${12 + depth * 16}px`, paddingTop: 6, paddingBottom: 6, paddingRight: 12 }}
          onClick={() => isParent ? toggleExpand(node.id) : onSelect(node)}>
          {isParent
            ? <ChevronRight size={10} className={`text-[var(--muted)] flex-shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} />
            : <span className="w-[10px] flex-shrink-0" />}
          <span className={isParent
            ? 'font-mono text-[10px] uppercase tracking-wider text-[var(--muted)]'
            : 'text-[12px] text-[var(--fg)]'}>
            {node.name}
          </span>
        </div>
        {isParent && open && kids.map(k => <TreeNode key={k.id} node={k} depth={depth + 1} />)}
      </div>
    );
  }

  return (
    <div className="absolute top-full left-0 z-50 w-72 bg-[var(--surface)] border border-[var(--border)] shadow-lg">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--border)]">
        <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)}
          placeholder={placeholder}
          className="flex-1 bg-transparent text-[12px] text-[var(--fg)] placeholder:text-[var(--muted)] outline-none" />
        <button onClick={onClose} className="text-[var(--muted)] hover:text-[var(--fg)]"><X size={12} /></button>
      </div>
      <div className="max-h-52 overflow-y-auto">
        {/* Extra section (e.g. "From this recipe") */}
        {extraSection && extraSection.items.length > 0 && !query && (
          <div>
            <div className="px-3 py-1.5 font-mono text-[9px] uppercase tracking-widest text-[var(--accent)] bg-[var(--surface-hover)]">
              {extraSection.label}
            </div>
            {extraSection.items.map(item => (
              <div key={item.id} onClick={() => onSelect({ id: item.id, name: item.name, parent_id: null })}
                className="px-5 py-2 text-[12px] text-[var(--fg)] hover:bg-[var(--surface-hover)] cursor-pointer">
                {item.name}
              </div>
            ))}
            <div className="h-px bg-[var(--border)] mx-3 my-1" />
          </div>
        )}

        {searchResults ? (
          searchResults.length > 0
            ? searchResults.map(n => (
                <div key={n.id} onClick={() => onSelect(n)}
                  className="px-3 py-2 text-[12px] text-[var(--fg)] hover:bg-[var(--surface-hover)] cursor-pointer">
                  {n.name}
                </div>
              ))
            : <div className="px-3 py-3 text-[11px] text-[var(--muted)] text-center">No results</div>
        ) : (
          roots.map(n => <TreeNode key={n.id} node={n} depth={0} />)
        )}
      </div>
      {query.length >= 2 && (searchResults?.length === 0 || true) && (
        <div onClick={() => onSelect({ id: '', name: query, parent_id: null })}
          className="px-3 py-2 text-[12px] text-[var(--accent)] hover:bg-[var(--surface-hover)] cursor-pointer border-t border-[var(--border)]">
          + Add &ldquo;{query}&rdquo;
        </div>
      )}
    </div>
  );
}

// ── Picker button ─────────────────────────────────────────────

function PickerButton({
  value, placeholder, onSelect, nodes, extraSection, className = '',
}: {
  value: string;
  placeholder: string;
  onSelect: (node: TaxonomyNode) => void;
  nodes: TaxonomyNode[];
  extraSection?: { label: string; items: { id: string; name: string }[] };
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`relative ${className}`}>
      <button onClick={() => setOpen(v => !v)}
        className={`w-full text-left px-2 py-1.5 text-[12px] border transition-colors flex items-center justify-between ${
          value ? 'border-[var(--border)] text-[var(--fg)]' : 'border-dashed border-[var(--border)] text-[var(--muted)]'
        } hover:border-[var(--accent)] bg-transparent`}>
        <span>{value || placeholder}</span>
        {value && <span className="text-[var(--accent)] text-[10px] ml-1">✓</span>}
      </button>
      {open && (
        <HierarchicalPicker nodes={nodes} placeholder={`Search ${placeholder.toLowerCase()}…`}
          extraSection={extraSection}
          onSelect={n => { onSelect(n); setOpen(false); }}
          onClose={() => setOpen(false)} />
      )}
    </div>
  );
}

// ── Step ingredient row ───────────────────────────────────────

function StepIngRow({ row, ingredientTree, fromRecipe, onChange, onRemove }: {
  row: StepIngredient;
  ingredientTree: TaxonomyNode[];
  fromRecipe: { id: string; name: string }[];
  onChange: (v: StepIngredient) => void;
  onRemove: () => void;
}) {
  return (
    <div className="grid gap-1.5 items-center py-1" style={{ gridTemplateColumns: '1fr 64px 64px 1fr auto' }}>
      <PickerButton value={row.name} placeholder="Ingredient…"
        nodes={ingredientTree}
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

// ── Step tool row ─────────────────────────────────────────────

function StepToolRow({ row, equipmentTree, onChange, onRemove }: {
  row: StepTool;
  equipmentTree: TaxonomyNode[];
  onChange: (v: StepTool) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-2 py-1">
      <PickerButton value={row.name} placeholder="Tool / Equipment…"
        nodes={equipmentTree}
        onSelect={n => onChange({ ...row, equipmentId: n.id, name: n.name })}
        className="flex-1" />
      <button onClick={onRemove} className="p-1 text-[var(--muted)] hover:text-red-500 transition-colors flex-shrink-0">
        <Trash2 size={11} strokeWidth={1.5} />
      </button>
    </div>
  );
}

// ── Step editor ───────────────────────────────────────────────

function StepEditor({ step, index, ingredientTree, equipmentTree, fromRecipe, isFirst, isLast,
  onChange, onRemove, onMoveUp, onMoveDown }: {
  step: Step; index: number;
  ingredientTree: TaxonomyNode[];
  equipmentTree: TaxonomyNode[];
  fromRecipe: { id: string; name: string }[];
  isFirst: boolean; isLast: boolean;
  onChange: (s: Step) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const addIng  = () => onChange({ ...step, stepIngredients: [...step.stepIngredients, emptyStepIngredient()] });
  const addTool = () => onChange({ ...step, stepTools: [...step.stepTools, emptyStepTool()] });

  const updateIng  = (i: number, v: StepIngredient) => onChange({ ...step, stepIngredients: step.stepIngredients.map((r, idx) => idx === i ? v : r) });
  const removeIng  = (i: number) => onChange({ ...step, stepIngredients: step.stepIngredients.filter((_, idx) => idx !== i) });
  const updateTool = (i: number, v: StepTool) => onChange({ ...step, stepTools: step.stepTools.map((r, idx) => idx === i ? v : r) });
  const removeTool = (i: number) => onChange({ ...step, stepTools: step.stepTools.filter((_, idx) => idx !== i) });

  return (
    <div className="border border-[var(--border)] mb-2 last:mb-0">
      {/* Step header */}
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
        {/* Instruction */}
        <textarea value={step.instruction}
          onChange={e => onChange({ ...step, instruction: e.target.value })}
          placeholder="Describe this step…" rows={2}
          className="w-full bg-transparent border border-[var(--border)] px-3 py-2 text-[12px] text-[var(--fg)] placeholder:text-[var(--muted)] outline-none focus:border-[var(--accent)] transition-colors resize-y" />

        {/* Duration + temperature */}
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

        {/* Ingredients + Tools side by side */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
          {/* Ingredients */}
          <div>
            <FL>Ingredients</FL>
            {step.stepIngredients.length > 0 && (
              <div className="mb-1 grid gap-1.5 font-mono text-[9px] uppercase tracking-wider text-[var(--muted)]"
                style={{ gridTemplateColumns: '1fr 64px 64px 1fr auto' }}>
                <span>Name</span><span className="text-right">Qty</span><span>Unit</span><span>Prep</span><span className="w-5" />
              </div>
            )}
            {step.stepIngredients.map((si, i) => (
              <StepIngRow key={si.id} row={si}
                ingredientTree={ingredientTree}
                fromRecipe={fromRecipe}
                onChange={v => updateIng(i, v)}
                onRemove={() => removeIng(i)} />
            ))}
            <button onClick={addIng}
              className="mt-1 flex items-center gap-1 text-[10px] font-mono text-[var(--muted)] hover:text-[var(--accent)] transition-colors">
              <Plus size={10} /> Add ingredient
            </button>
          </div>

          {/* Tools */}
          <div>
            <FL>Tools</FL>
            {step.stepTools.map((st, i) => (
              <StepToolRow key={st.id} row={st} equipmentTree={equipmentTree}
                onChange={v => updateTool(i, v)}
                onRemove={() => removeTool(i)} />
            ))}
            <button onClick={addTool}
              className="mt-1 flex items-center gap-1 text-[10px] font-mono text-[var(--muted)] hover:text-[var(--accent)] transition-colors">
              <Plus size={10} /> Add tool
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Group editor ──────────────────────────────────────────────

function GroupEditor({ group, groupIndex, totalGroups, ingredientTree, equipmentTree,
  groupOutputs, onChange, onRemove, onMoveUp, onMoveDown }: {
  group: Group;
  groupIndex: number;
  totalGroups: number;
  ingredientTree: TaxonomyNode[];
  equipmentTree: TaxonomyNode[];
  groupOutputs: { id: string; name: string }[];   // outputs from EARLIER groups
  onChange: (g: Group) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const isFirst = groupIndex === 0;
  const isLast  = groupIndex === totalGroups - 1;
  const showGroupName = totalGroups > 1;

  const addStep = () => onChange({ ...group, steps: [...group.steps, emptyStep()] });

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
      {/* Group header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-[var(--surface)] border-b border-[var(--border)]">
        <GripVertical size={13} className="text-[var(--border)] flex-shrink-0" />

        {showGroupName ? (
          <div className="flex-1 relative">
            <PickerButton
              value={group.outputName}
              placeholder="Group output (e.g. Vegetable broth)…"
              nodes={ingredientTree}
              onSelect={n => onChange({ ...group, outputName: n.name, outputIngId: n.id })}
              className="w-full" />
          </div>
        ) : (
          <span className="flex-1 font-mono text-[11px] text-[var(--muted)] uppercase tracking-wider">Steps</span>
        )}

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

      {/* Steps */}
      {!group.collapsed && (
        <div className="p-4">
          {group.steps.map((step, i) => (
            <StepEditor key={step.id} step={step} index={i}
              ingredientTree={ingredientTree}
              equipmentTree={equipmentTree}
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

// ── Aggregate top-level ingredient list ───────────────────────

function aggregateIngredients(groups: Group[]): IngredientRow[] {
  const map = new Map<string, IngredientRow>();
  // Collect group output names so we can exclude them
  const groupOutputKeys = new Set(
    groups.filter(g => g.outputName.trim()).map(g => (g.outputIngId || g.outputName.toLowerCase().trim()))
  );

  for (const group of groups) {
    for (const step of group.steps) {
      for (const si of step.stepIngredients) {
        if (!si.name.trim()) continue;
        const key = si.ingredientId || si.name.toLowerCase().trim();
        if (groupOutputKeys.has(key)) continue; // skip produced items
        const existing = map.get(key);
        if (existing && existing.quantityUnit === si.quantityUnit) {
          map.set(key, { ...existing, quantityValue: existing.quantityValue + si.quantityValue });
        } else if (!existing) {
          map.set(key, { id: si.id, ingredientId: si.ingredientId, name: si.name,
            quantityValue: si.quantityValue, quantityUnit: si.quantityUnit,
            prepNote: si.prepNote, optional: false });
        }
      }
    }
  }
  return Array.from(map.values());
}

// ── Convert initial data to groups ────────────────────────────

function initialToGroups(title: string, initial?: Props['initial']): Group[] {
  if (!initial?.steps?.length) return [emptyGroup(title)];

  // Group steps by groupLabel
  const groupMap = new Map<string, Step[]>();
  for (const s of initial.steps) {
    const label = s.groupLabel || '__default__';
    if (!groupMap.has(label)) groupMap.set(label, []);
    groupMap.get(label)!.push({
      id:                 s.id || uid(),
      instruction:        s.instruction || '',
      durationMinutes:    s.durationMinutes || 0,
      temperatureCelsius: s.temperatureCelsius || 0,
      stepIngredients:    (s.stepIngredients || []).map((si: any) => ({ ...si, id: si.id || uid() })),
      stepTools:          (s.stepTools || []).map((st: any) => ({ ...st, id: st.id || uid() })),
    });
  }

  const groups: Group[] = [];
  groupMap.forEach((steps, label) => {
    groups.push({
      id:          uid(),
      outputName:  label === '__default__' ? '' : label,
      outputIngId: '',
      steps,
      collapsed:   false,
    });
  });

  return groups.length > 0 ? groups : [emptyGroup(title)];
}

// ── Main editor ───────────────────────────────────────────────

export function RecipeEditor({ initial, onSave, saving }: Props) {
  const [title,            setTitle]           = useState(initial?.title ?? '');
  const [description,      setDescription]     = useState(initial?.description ?? '');
  const [cuisine,          setCuisine]         = useState(initial?.cuisine ?? '');
  const [tags,             setTags]            = useState(initial?.tags ?? '');
  const [servings,         setServings]        = useState(initial?.servings ?? 4);
  const [difficulty,       setDifficulty]      = useState(initial?.difficulty ?? 'medium');
  const [totalTimeMinutes, setTotalTime]       = useState(initial?.totalTimeMinutes ?? 0);
  const [activeTimeMinutes,setActiveTime]      = useState(initial?.activeTimeMinutes ?? 0);
  const [groups,           setGroups]          = useState<Group[]>(() => initialToGroups(initial?.title ?? '', initial));
  const [ingredients,      setIngredients]     = useState<IngredientRow[]>(initial?.ingredients ?? []);
  const [ingredientTree,   setIngredientTree]  = useState<TaxonomyNode[]>([]);
  const [equipmentTree,    setEquipmentTree]   = useState<TaxonomyNode[]>([]);
  const [error,            setError]           = useState('');

  // Load taxonomy
  useEffect(() => {
    fetch('/api/ingredients/tree').then(r => r.ok ? r.json() : []).then(setIngredientTree).catch(() => {});
    fetch('/api/equipment/tree').then(r => r.ok ? r.json() : []).then(setEquipmentTree).catch(() => {});
  }, []);

  // Auto-aggregate ingredient list from steps
  useEffect(() => {
    setIngredients(prev => {
      const aggregated = aggregateIngredients(groups);
      const aggregatedKeys = new Set(aggregated.map(r => r.ingredientId || r.name.toLowerCase().trim()));
      const manualOnly = prev.filter(r => {
        const key = r.ingredientId || r.name.toLowerCase().trim();
        return !aggregatedKeys.has(key);
      });
      return [...aggregated, ...manualOnly];
    });
  }, [groups]);

  // Update first group name when title changes (if only one group and it matches old title)
  useEffect(() => {
    if (groups.length === 1) {
      setGroups(prev => prev.map((g, i) => i === 0 ? { ...g, outputName: title } : g));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title]);

  const handleSubmit = async () => {
    setError('');
    if (!title.trim()) { setError('Recipe title is required.'); return; }
    const allSteps = groups.flatMap(g => g.steps);
    if (allSteps.filter(s => s.instruction.trim()).length === 0) { setError('Add at least one step.'); return; }

    try {
      // Flatten groups → steps with groupLabel
      const steps = groups.flatMap(g =>
        g.steps
          .filter(s => s.instruction.trim())
          .map(s => ({
            stepType:           'human',
            instruction:        s.instruction,
            groupLabel:         groups.length > 1 ? (g.outputName || '') : '',
            durationMinutes:    s.durationMinutes,
            temperatureCelsius: s.temperatureCelsius,
            stepIngredients:    s.stepIngredients.filter(si => si.name.trim()),
            stepTools:          s.stepTools.filter(st => st.name.trim()),
          }))
      );

      // Collect equipment IDs from all step tools
      const equipmentIds = [...new Set(
        groups.flatMap(g => g.steps.flatMap(s => s.stepTools.map(t => t.equipmentId).filter(Boolean)))
      )];

      await onSave({
        title, description, cuisine, tags, servings, difficulty,
        totalTimeMinutes, activeTimeMinutes,
        ingredients: ingredients.filter(i => i.name.trim()),
        steps,
        equipmentIds,
      });
    } catch (e: any) {
      setError(e?.message ?? 'Something went wrong.');
    }
  };

  // Group helpers
  const updateGroup = (i: number, g: Group) => setGroups(prev => prev.map((r, idx) => idx === i ? g : r));
  const removeGroup = (i: number) => setGroups(prev => prev.filter((_, idx) => idx !== i));
  const addGroup    = () => setGroups(prev => [...prev, emptyGroup('')]);
  const moveGroup   = (i: number, dir: -1 | 1) => setGroups(prev => {
    const next = [...prev]; const swap = i + dir;
    if (swap < 0 || swap >= next.length) return prev;
    [next[i], next[swap]] = [next[swap], next[i]]; return next;
  });

  // Manual ingredient helpers
  const updateIng = (i: number, v: IngredientRow) => setIngredients(prev => prev.map((r, idx) => idx === i ? v : r));
  const removeIng = (i: number) => setIngredients(prev => prev.filter((_, idx) => idx !== i));
  const addManualIng = () => setIngredients(prev => [...prev, {
    id: uid(), ingredientId: '', name: '', quantityValue: 0, quantityUnit: 'g', prepNote: '', optional: false,
  }]);

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-8 py-10 space-y-10">

      {/* ── Meta ── */}
      <section>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Recipe title"
          className="w-full bg-transparent border-none outline-none font-display text-[28px] md:text-[36px] font-light text-[var(--fg)] placeholder:text-[var(--border)] mb-4" />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div>
            <FL>Servings</FL>
            <input type="number" min={1} value={servings} onChange={e => setServings(parseInt(e.target.value) || 1)}
              className="w-full bg-transparent border border-[var(--border)] px-3 py-2 text-[12px] text-[var(--fg)] outline-none focus:border-[var(--accent)] transition-colors" />
          </div>
          <div>
            <FL>Difficulty</FL>
            <select value={difficulty} onChange={e => setDifficulty(e.target.value)}
              className="w-full bg-[var(--surface)] border border-[var(--border)] px-3 py-2 text-[12px] text-[var(--fg)] outline-none focus:border-[var(--accent)] cursor-pointer">
              {DIFFICULTY_OPTIONS.map(d => <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>)}
            </select>
          </div>
          <div>
            <FL>Total time (min)</FL>
            <input type="number" min={0} value={totalTimeMinutes || ''} onChange={e => setTotalTime(parseInt(e.target.value) || 0)}
              placeholder="0"
              className="w-full bg-transparent border border-[var(--border)] px-3 py-2 text-[12px] text-[var(--fg)] outline-none focus:border-[var(--accent)] transition-colors" />
          </div>
          <div>
            <FL>Active time (min)</FL>
            <input type="number" min={0} value={activeTimeMinutes || ''} onChange={e => setActiveTime(parseInt(e.target.value) || 0)}
              placeholder="0"
              className="w-full bg-transparent border border-[var(--border)] px-3 py-2 text-[12px] text-[var(--fg)] outline-none focus:border-[var(--accent)] transition-colors" />
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-3 mb-4">
          <div>
            <FL>Cuisine</FL>
            <input value={cuisine} onChange={e => setCuisine(e.target.value)} placeholder="Indian, European…"
              className="w-full bg-transparent border border-[var(--border)] px-3 py-2 text-[12px] text-[var(--fg)] placeholder:text-[var(--muted)] outline-none focus:border-[var(--accent)] transition-colors" />
          </div>
          <div>
            <FL>Tags (comma-separated)</FL>
            <input value={tags} onChange={e => setTags(e.target.value)} placeholder="curry, dinner, spiced"
              className="w-full bg-transparent border border-[var(--border)] px-3 py-2 text-[12px] text-[var(--fg)] placeholder:text-[var(--muted)] outline-none focus:border-[var(--accent)] transition-colors" />
          </div>
        </div>

        <div>
          <FL>Description</FL>
          <textarea value={description} onChange={e => setDescription(e.target.value)}
            placeholder="A short description of the dish…" rows={3}
            className="w-full bg-transparent border border-[var(--border)] px-3 py-2 text-[12px] text-[var(--fg)] placeholder:text-[var(--muted)] outline-none focus:border-[var(--accent)] transition-colors resize-y" />
        </div>
      </section>

      {/* ── Groups + Steps ── */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--muted)]">
            {groups.length > 1 ? 'Groups & Steps' : 'Steps'}
          </span>
          <div className="flex-1 h-px bg-[var(--border)]" />
        </div>

        {groups.map((group, gi) => (
          <GroupEditor key={group.id}
            group={group}
            groupIndex={gi}
            totalGroups={groups.length}
            ingredientTree={ingredientTree}
            equipmentTree={equipmentTree}
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

      {/* ── Ingredient list (auto-aggregated) ── */}
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

        <button onClick={addManualIng}
          className="mt-2 flex items-center gap-1.5 text-[11px] font-mono text-[var(--muted)] hover:text-[var(--accent)] transition-colors">
          <Plus size={11} /> Add ingredient manually
        </button>
      </section>

      {/* ── Save ── */}
      <section className="border-t border-[var(--border)] pt-6">
        {error && (
          <div className="mb-4 px-4 py-3 border border-red-300 text-red-600 text-[12px] font-mono bg-red-50">{error}</div>
        )}
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
