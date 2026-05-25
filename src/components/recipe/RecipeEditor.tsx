// src/components/recipe/RecipeEditor.tsx
// Recipe editor with step-level ingredients, hierarchical picker, and auto-aggregation
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Trash2, ChevronUp, ChevronDown, Loader2, ChevronRight, X } from 'lucide-react';
import type { RecipeFormData } from '@/lib/recipe-actions';

// ── Types ─────────────────────────────────────────────────────

interface IngredientRow {
  id:            string;
  ingredientId:  string;
  name:          string;
  quantityValue: number;
  quantityUnit:  string;
  prepNote:      string;
  optional:      boolean;
}

interface StepIngredient {
  id:            string;
  ingredientId:  string;
  name:          string;
  quantityValue: number;
  quantityUnit:  string;
  prepNote:      string;
}

interface StepRow {
  id:                 string;
  stepType:           'human' | 'machine' | 'passive';
  instruction:        string;
  groupLabel:         string;
  durationMinutes:    number;
  temperatureCelsius: number;
  stepIngredients:    StepIngredient[];
}

interface TaxonomyNode {
  id:        string;
  name:      string;
  parent_id: string | null;
  children?: TaxonomyNode[];
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
    steps:              StepRow[];
    equipmentIds:       string[];
    isPublished:        boolean;
  };
  onSave: (data: RecipeFormData) => Promise<void>;
  saving: boolean;
}

// ── Constants ─────────────────────────────────────────────────

const DIFFICULTY_OPTIONS = ['trivial', 'easy', 'medium', 'hard', 'expert'];
const STEP_TYPES = [
  { value: 'human',   label: 'Human' },
  { value: 'machine', label: 'Machine' },
  { value: 'passive', label: 'Passive' },
];
const COMMON_UNITS = ['g', 'kg', 'ml', 'l', 'tsp', 'tbsp', 'cup', 'oz', 'lb', 'clove', 'slice', 'piece', 'pinch'];

function uid() { return Math.random().toString(36).slice(2, 9); }
function emptyStep(): StepRow {
  return { id: uid(), stepType: 'human', instruction: '', groupLabel: '', durationMinutes: 0, temperatureCelsius: 0, stepIngredients: [] };
}
function emptyStepIngredient(): StepIngredient {
  return { id: uid(), ingredientId: '', name: '', quantityValue: 0, quantityUnit: 'g', prepNote: '' };
}
function emptyIngredientRow(): IngredientRow {
  return { id: uid(), ingredientId: '', name: '', quantityValue: 0, quantityUnit: 'g', prepNote: '', optional: false };
}

// ── Helper components ─────────────────────────────────────────

function SectionHeader({ label, count }: { label: string; count?: number }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--muted)]">{label}</span>
      {count !== undefined && <span className="font-mono text-[9px] text-[var(--muted)]">({count})</span>}
      <div className="flex-1 h-px bg-[var(--border)]" />
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--muted)] block mb-1">{children}</span>;
}

// ── Hierarchical picker ───────────────────────────────────────

function HierarchicalPicker({
  nodes,
  onSelect,
  onClose,
  placeholder,
}: {
  nodes: TaxonomyNode[];
  onSelect: (node: TaxonomyNode) => void;
  onClose: () => void;
  placeholder: string;
}) {
  const [query, setQuery]           = useState('');
  const [expanded, setExpanded]     = useState<Set<string>>(new Set());
  const inputRef                    = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  // Build tree
  const roots = nodes.filter(n => !n.parent_id);
  const childrenOf = (id: string) => nodes.filter(n => n.parent_id === id);
  const hasChildren = (id: string) => nodes.some(n => n.parent_id === id);

  // Flat search results
  const searchResults = query.length >= 2
    ? nodes.filter(n => n.name.toLowerCase().includes(query.toLowerCase()) && !hasChildren(n.id))
    : null;

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  function TreeNode({ node, depth }: { node: TaxonomyNode; depth: number }) {
    const kids = childrenOf(node.id);
    const isParent = kids.length > 0;
    const open = expanded.has(node.id);

    return (
      <div>
        <div
          className="flex items-center gap-1 px-3 py-1.5 hover:bg-[var(--surface-hover)] cursor-pointer transition-colors"
          style={{ paddingLeft: `${12 + depth * 16}px` }}
          onClick={() => isParent ? toggleExpand(node.id) : onSelect(node)}
        >
          {isParent ? (
            <ChevronRight size={10} className={`text-[var(--muted)] transition-transform flex-shrink-0 ${open ? 'rotate-90' : ''}`} />
          ) : (
            <span className="w-[10px] flex-shrink-0" />
          )}
          <span className={`text-[12px] ${isParent ? 'text-[var(--muted)] font-mono text-[10px] uppercase tracking-wider' : 'text-[var(--fg)]'}`}>
            {node.name}
          </span>
        </div>
        {isParent && open && kids.map(kid => <TreeNode key={kid.id} node={kid} depth={depth + 1} />)}
      </div>
    );
  }

  return (
    <div className="absolute top-full left-0 z-50 w-72 bg-[var(--surface)] border border-[var(--border)] shadow-lg">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--border)]">
        <input
          ref={inputRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={placeholder}
          className="flex-1 bg-transparent text-[12px] text-[var(--fg)] placeholder:text-[var(--muted)] outline-none"
        />
        <button onClick={onClose} className="text-[var(--muted)] hover:text-[var(--fg)] transition-colors">
          <X size={12} />
        </button>
      </div>
      <div className="max-h-48 overflow-y-auto">
        {searchResults ? (
          searchResults.length > 0 ? (
            searchResults.map(n => (
              <div key={n.id}
                onClick={() => onSelect(n)}
                className="px-3 py-2 text-[12px] text-[var(--fg)] hover:bg-[var(--surface-hover)] cursor-pointer transition-colors">
                {n.name}
              </div>
            ))
          ) : (
            <div className="px-3 py-3 text-[11px] text-[var(--muted)] text-center">No results — type to create new</div>
          )
        ) : (
          roots.map(n => <TreeNode key={n.id} node={n} depth={0} />)
        )}
      </div>
      {query.length >= 2 && searchResults?.length === 0 && (
        <div
          onClick={() => onSelect({ id: '', name: query, parent_id: null })}
          className="px-3 py-2 text-[12px] text-[var(--accent)] hover:bg-[var(--surface-hover)] cursor-pointer border-t border-[var(--border)] transition-colors">
          + Add &ldquo;{query}&rdquo; as new ingredient
        </div>
      )}
    </div>
  );
}

// ── Step ingredient row ───────────────────────────────────────

function StepIngredientRow({
  row, ingredientTree, onChange, onRemove,
}: {
  row: StepIngredient;
  ingredientTree: TaxonomyNode[];
  onChange: (updated: StepIngredient) => void;
  onRemove: () => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <div className="grid gap-2 py-1.5 items-center"
      style={{ gridTemplateColumns: '1fr 70px 70px 1fr auto' }}>
      <div className="relative">
        <button
          onClick={() => setPickerOpen(v => !v)}
          className={`w-full text-left bg-transparent border px-2 py-1.5 text-[12px] flex items-center justify-between transition-colors ${
            row.name ? 'border-[var(--border)] text-[var(--fg)]' : 'border-dashed border-[var(--border)] text-[var(--muted)]'
          } hover:border-[var(--accent)]`}
        >
          <span>{row.name || 'Select ingredient…'}</span>
          {row.ingredientId && <span className="text-[var(--accent)] text-[10px] font-mono ml-1">✓</span>}
        </button>
        {pickerOpen && (
          <HierarchicalPicker
            nodes={ingredientTree}
            placeholder="Search ingredients…"
            onSelect={node => {
              onChange({ ...row, ingredientId: node.id, name: node.name });
              setPickerOpen(false);
            }}
            onClose={() => setPickerOpen(false)}
          />
        )}
      </div>

      <input
        type="number" min={0} step="any"
        value={row.quantityValue || ''}
        onChange={e => onChange({ ...row, quantityValue: parseFloat(e.target.value) || 0 })}
        placeholder="Qty"
        className="bg-transparent border border-[var(--border)] px-2 py-1.5 text-[12px] text-[var(--fg)] placeholder:text-[var(--muted)] outline-none focus:border-[var(--accent)] transition-colors text-right"
      />

      <select
        value={row.quantityUnit}
        onChange={e => onChange({ ...row, quantityUnit: e.target.value })}
        className="bg-[var(--surface)] border border-[var(--border)] px-1 py-1.5 text-[12px] text-[var(--fg)] outline-none focus:border-[var(--accent)] transition-colors cursor-pointer"
      >
        {COMMON_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
      </select>

      <input
        value={row.prepNote}
        onChange={e => onChange({ ...row, prepNote: e.target.value })}
        placeholder="Prep note (minced, sliced…)"
        className="bg-transparent border border-[var(--border)] px-2 py-1.5 text-[12px] text-[var(--fg)] placeholder:text-[var(--muted)] outline-none focus:border-[var(--accent)] transition-colors"
      />

      <button onClick={onRemove} className="p-1 text-[var(--muted)] hover:text-red-500 transition-colors flex-shrink-0">
        <Trash2 size={12} strokeWidth={1.5} />
      </button>
    </div>
  );
}

// ── Step row editor ───────────────────────────────────────────

function StepRowEditor({
  row, index, ingredientTree, onChange, onRemove, onMoveUp, onMoveDown, isFirst, isLast,
}: {
  row: StepRow; index: number;
  ingredientTree: TaxonomyNode[];
  onChange: (updated: StepRow) => void;
  onRemove: () => void;
  onMoveUp: () => void; onMoveDown: () => void;
  isFirst: boolean; isLast: boolean;
}) {
  const [expanded, setExpanded] = useState(true);

  const typeColor = { human: 'var(--fg)', machine: 'var(--accent)', passive: 'var(--muted)' }[row.stepType];

  const addStepIngredient = () =>
    onChange({ ...row, stepIngredients: [...row.stepIngredients, emptyStepIngredient()] });

  const updateStepIngredient = (i: number, updated: StepIngredient) =>
    onChange({ ...row, stepIngredients: row.stepIngredients.map((s, idx) => idx === i ? updated : s) });

  const removeStepIngredient = (i: number) =>
    onChange({ ...row, stepIngredients: row.stepIngredients.filter((_, idx) => idx !== i) });

  return (
    <div className="border border-[var(--border)] mb-2 last:mb-0">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-[var(--surface)]">
        <span className="font-mono text-[10px] text-[var(--muted)] w-5 text-right flex-shrink-0">{index + 1}</span>

        <select
          value={row.stepType}
          onChange={e => onChange({ ...row, stepType: e.target.value as StepRow['stepType'] })}
          className="font-mono text-[10px] uppercase tracking-wider bg-transparent border-none outline-none cursor-pointer"
          style={{ color: typeColor }}
        >
          {STEP_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>

        <input
          value={row.groupLabel}
          onChange={e => onChange({ ...row, groupLabel: e.target.value })}
          placeholder="Group label (Sauce, Marinade…)"
          className="flex-1 bg-transparent border-none text-[11px] text-[var(--muted)] placeholder:text-[var(--border)] outline-none font-mono uppercase tracking-wider"
        />

        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={onMoveUp}   disabled={isFirst} className="p-1 text-[var(--muted)] hover:text-[var(--fg)] disabled:opacity-30 transition-colors"><ChevronUp  size={12} /></button>
          <button onClick={onMoveDown} disabled={isLast}  className="p-1 text-[var(--muted)] hover:text-[var(--fg)] disabled:opacity-30 transition-colors"><ChevronDown size={12} /></button>
          <button onClick={() => setExpanded(e => !e)} className="p-1 text-[var(--muted)] hover:text-[var(--fg)] transition-colors font-mono text-[10px]">{expanded ? '−' : '+'}</button>
          <button onClick={onRemove} className="p-1 text-[var(--muted)] hover:text-red-500 transition-colors"><Trash2 size={12} strokeWidth={1.5} /></button>
        </div>
      </div>

      {expanded && (
        <div className="px-3 pb-3 pt-2 space-y-3">
          {/* Instruction */}
          <textarea
            value={row.instruction}
            onChange={e => onChange({ ...row, instruction: e.target.value })}
            placeholder="Describe this step…"
            rows={2}
            className="w-full bg-transparent border border-[var(--border)] px-3 py-2 text-[12px] text-[var(--fg)] placeholder:text-[var(--muted)] outline-none focus:border-[var(--accent)] transition-colors resize-y"
          />

          {/* Duration + temperature */}
          <div className="flex gap-3">
            <div>
              <FieldLabel>Duration (min)</FieldLabel>
              <input
                type="number" min={0} value={row.durationMinutes || ''}
                onChange={e => onChange({ ...row, durationMinutes: parseFloat(e.target.value) || 0 })}
                placeholder="0"
                className="w-24 bg-transparent border border-[var(--border)] px-2 py-1.5 text-[12px] text-[var(--fg)] outline-none focus:border-[var(--accent)] transition-colors text-right"
              />
            </div>
            <div>
              <FieldLabel>Temperature (°C)</FieldLabel>
              <input
                type="number" min={0} value={row.temperatureCelsius || ''}
                onChange={e => onChange({ ...row, temperatureCelsius: parseFloat(e.target.value) || 0 })}
                placeholder="—"
                className="w-24 bg-transparent border border-[var(--border)] px-2 py-1.5 text-[12px] text-[var(--fg)] outline-none focus:border-[var(--accent)] transition-colors text-right"
              />
            </div>
          </div>

          {/* Step ingredients */}
          <div>
            <FieldLabel>Ingredients used in this step</FieldLabel>

            {row.stepIngredients.length > 0 && (
              <div className="mb-1 grid gap-2 font-mono text-[9px] uppercase tracking-wider text-[var(--muted)]"
                style={{ gridTemplateColumns: '1fr 70px 70px 1fr auto' }}>
                <span>Ingredient</span><span className="text-right">Qty</span><span>Unit</span><span>Prep</span><span className="w-6" />
              </div>
            )}

            {row.stepIngredients.map((si, i) => (
              <StepIngredientRow
                key={si.id}
                row={si}
                ingredientTree={ingredientTree}
                onChange={updated => updateStepIngredient(i, updated)}
                onRemove={() => removeStepIngredient(i)}
              />
            ))}

            <button
              onClick={addStepIngredient}
              className="mt-1.5 flex items-center gap-1.5 text-[10px] font-mono text-[var(--muted)] hover:text-[var(--accent)] transition-colors"
            >
              <Plus size={10} /> Add ingredient to step
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Equipment picker ──────────────────────────────────────────

function EquipmentPicker({
  equipmentTree, selectedIds, onToggle,
}: {
  equipmentTree: TaxonomyNode[];
  selectedIds: string[];
  onToggle: (id: string, name: string) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selected, setSelected]     = useState<{ id: string; name: string }[]>([]);

  const handleSelect = (node: TaxonomyNode) => {
    if (!selected.find(s => s.id === node.id)) {
      setSelected(prev => [...prev, { id: node.id, name: node.name }]);
      onToggle(node.id, node.name);
    }
    setPickerOpen(false);
  };

  const removeItem = (id: string) => {
    setSelected(prev => prev.filter(s => s.id !== id));
    onToggle(id, '');
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-2">
        {selected.map(s => (
          <span key={s.id}
            className="flex items-center gap-1.5 text-[11px] font-mono px-2.5 py-1 border border-[var(--accent)] bg-[var(--accent-subtle)] text-[var(--accent)]">
            {s.name}
            <button onClick={() => removeItem(s.id)} className="hover:text-red-500 transition-colors">
              <X size={10} />
            </button>
          </span>
        ))}
      </div>
      <div className="relative inline-block">
        <button
          onClick={() => setPickerOpen(v => !v)}
          className="flex items-center gap-2 text-[11px] font-mono text-[var(--muted)] hover:text-[var(--accent)] transition-colors border border-dashed border-[var(--border)] px-3 py-2 hover:border-[var(--accent)]"
        >
          <Plus size={11} /> Add equipment
        </button>
        {pickerOpen && (
          <HierarchicalPicker
            nodes={equipmentTree}
            placeholder="Search equipment…"
            onSelect={handleSelect}
            onClose={() => setPickerOpen(false)}
          />
        )}
      </div>
    </div>
  );
}

// ── Aggregate ingredients from steps ─────────────────────────

function aggregateFromSteps(steps: StepRow[]): IngredientRow[] {
  const map = new Map<string, IngredientRow>();

  for (const step of steps) {
    for (const si of step.stepIngredients) {
      if (!si.name.trim()) continue;
      const key = si.ingredientId || si.name.toLowerCase().trim();
      const existing = map.get(key);
      if (existing) {
        // Sum quantities if same unit
        if (existing.quantityUnit === si.quantityUnit) {
          map.set(key, { ...existing, quantityValue: existing.quantityValue + si.quantityValue });
        }
        // If different units, keep first (user can edit)
      } else {
        map.set(key, {
          id:            si.id,
          ingredientId:  si.ingredientId,
          name:          si.name,
          quantityValue: si.quantityValue,
          quantityUnit:  si.quantityUnit,
          prepNote:      si.prepNote,
          optional:      false,
        });
      }
    }
  }

  return Array.from(map.values());
}

// ── Main editor ───────────────────────────────────────────────

export function RecipeEditor({ initial, onSave, saving }: Props) {
  const [title,             setTitle]           = useState(initial?.title ?? '');
  const [description,       setDescription]     = useState(initial?.description ?? '');
  const [cuisine,           setCuisine]         = useState(initial?.cuisine ?? '');
  const [tags,              setTags]            = useState(initial?.tags ?? '');
  const [servings,          setServings]        = useState(initial?.servings ?? 4);
  const [difficulty,        setDifficulty]      = useState(initial?.difficulty ?? 'medium');
  const [totalTimeMinutes,  setTotalTime]       = useState(initial?.totalTimeMinutes ?? 0);
  const [activeTimeMinutes, setActiveTime]      = useState(initial?.activeTimeMinutes ?? 0);
  const [steps,             setSteps]           = useState<StepRow[]>(initial?.steps ?? [emptyStep()]);
  const [ingredients,       setIngredients]     = useState<IngredientRow[]>(initial?.ingredients ?? []);
  const [equipmentIds,      setEquipmentIds]    = useState<string[]>(initial?.equipmentIds ?? []);
  const [ingredientTree,    setIngredientTree]  = useState<TaxonomyNode[]>([]);
  const [equipmentTree,     setEquipmentTree]   = useState<TaxonomyNode[]>([]);
  const [error,             setError]           = useState('');

  // Load taxonomies
  useEffect(() => {
    fetch('/api/ingredients/tree')
      .then(r => r.ok ? r.json() : [])
      .then(setIngredientTree)
      .catch(() => {});
    fetch('/api/equipment/tree')
      .then(r => r.ok ? r.json() : [])
      .then(setEquipmentTree)
      .catch(() => {});
  }, []);

  // Auto-aggregate ingredients from steps
  useEffect(() => {
    const aggregated = aggregateFromSteps(steps);
    setIngredients(prev => {
      // Keep manual-only rows (those not in any step) and merge with aggregated
      const stepKeys = new Set(
        steps.flatMap(s => s.stepIngredients.map(si => si.ingredientId || si.name.toLowerCase().trim()))
      );
      const manualOnly = prev.filter(r => {
        const key = r.ingredientId || r.name.toLowerCase().trim();
        return !stepKeys.has(key);
      });
      return [...aggregated, ...manualOnly];
    });
  }, [steps]);

  const handleSubmit = async () => {
    setError('');
    if (!title.trim()) { setError('Recipe title is required.'); return; }
    if (steps.filter(s => s.instruction.trim()).length === 0) { setError('Add at least one step.'); return; }

    try {
      await onSave({
        title, description, cuisine, tags, servings, difficulty,
        totalTimeMinutes, activeTimeMinutes,
        ingredients: ingredients.filter(i => i.name.trim()),
        steps: steps.filter(s => s.instruction.trim()),
        equipmentIds: equipmentIds.filter(Boolean),
      });
    } catch (e: any) {
      setError(e?.message ?? 'Something went wrong. Please try again.');
    }
  };

  // Step helpers
  const updateStep   = (i: number, updated: StepRow) => setSteps(prev => prev.map((r, idx) => idx === i ? updated : r));
  const removeStep   = (i: number) => setSteps(prev => prev.filter((_, idx) => idx !== i));
  const addStep      = () => setSteps(prev => [...prev, emptyStep()]);
  const moveStep     = (i: number, dir: -1 | 1) => setSteps(prev => {
    const next = [...prev]; const swap = i + dir;
    if (swap < 0 || swap >= next.length) return prev;
    [next[i], next[swap]] = [next[swap], next[i]]; return next;
  });

  // Ingredient list helpers (for manual edits)
  const updateIngredient = (i: number, updated: IngredientRow) =>
    setIngredients(prev => prev.map((r, idx) => idx === i ? updated : r));
  const removeIngredient = (i: number) =>
    setIngredients(prev => prev.filter((_, idx) => idx !== i));
  const addManualIngredient = () =>
    setIngredients(prev => [...prev, emptyIngredientRow()]);

  // Equipment
  const toggleEquipment = (id: string, name: string) =>
    setEquipmentIds(prev => prev.includes(id) ? prev.filter(e => e !== id) : [...prev, id]);

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-8 py-10 space-y-10">

      {/* ── Title & meta ── */}
      <section>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Recipe title"
          className="w-full bg-transparent border-none outline-none font-display text-[28px] md:text-[36px] font-light text-[var(--fg)] placeholder:text-[var(--border)] mb-4"
        />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div>
            <FieldLabel>Servings</FieldLabel>
            <input type="number" min={1} value={servings}
              onChange={e => setServings(parseInt(e.target.value) || 1)}
              className="w-full bg-transparent border border-[var(--border)] px-3 py-2 text-[12px] text-[var(--fg)] outline-none focus:border-[var(--accent)] transition-colors"
            />
          </div>
          <div>
            <FieldLabel>Difficulty</FieldLabel>
            <select value={difficulty} onChange={e => setDifficulty(e.target.value)}
              className="w-full bg-[var(--surface)] border border-[var(--border)] px-3 py-2 text-[12px] text-[var(--fg)] outline-none focus:border-[var(--accent)] transition-colors cursor-pointer">
              {DIFFICULTY_OPTIONS.map(d => <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>)}
            </select>
          </div>
          <div>
            <FieldLabel>Total time (min)</FieldLabel>
            <input type="number" min={0} value={totalTimeMinutes || ''}
              onChange={e => setTotalTime(parseInt(e.target.value) || 0)}
              placeholder="0"
              className="w-full bg-transparent border border-[var(--border)] px-3 py-2 text-[12px] text-[var(--fg)] outline-none focus:border-[var(--accent)] transition-colors"
            />
          </div>
          <div>
            <FieldLabel>Active time (min)</FieldLabel>
            <input type="number" min={0} value={activeTimeMinutes || ''}
              onChange={e => setActiveTime(parseInt(e.target.value) || 0)}
              placeholder="0"
              className="w-full bg-transparent border border-[var(--border)] px-3 py-2 text-[12px] text-[var(--fg)] outline-none focus:border-[var(--accent)] transition-colors"
            />
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-3 mb-4">
          <div>
            <FieldLabel>Cuisine</FieldLabel>
            <input value={cuisine} onChange={e => setCuisine(e.target.value)} placeholder="Indian, European, Asian…"
              className="w-full bg-transparent border border-[var(--border)] px-3 py-2 text-[12px] text-[var(--fg)] placeholder:text-[var(--muted)] outline-none focus:border-[var(--accent)] transition-colors"
            />
          </div>
          <div>
            <FieldLabel>Tags (comma-separated)</FieldLabel>
            <input value={tags} onChange={e => setTags(e.target.value)} placeholder="curry, dinner, spiced"
              className="w-full bg-transparent border border-[var(--border)] px-3 py-2 text-[12px] text-[var(--fg)] placeholder:text-[var(--muted)] outline-none focus:border-[var(--accent)] transition-colors"
            />
          </div>
        </div>

        <div>
          <FieldLabel>Description</FieldLabel>
          <textarea value={description} onChange={e => setDescription(e.target.value)}
            placeholder="A short description of the dish…" rows={3}
            className="w-full bg-transparent border border-[var(--border)] px-3 py-2 text-[12px] text-[var(--fg)] placeholder:text-[var(--muted)] outline-none focus:border-[var(--accent)] transition-colors resize-y"
          />
        </div>
      </section>

      {/* ── Steps (with per-step ingredients) ── */}
      <section>
        <SectionHeader label="Steps" count={steps.filter(s => s.instruction.trim()).length} />

        {steps.map((row, i) => (
          <StepRowEditor
            key={row.id}
            row={row}
            index={i}
            ingredientTree={ingredientTree}
            onChange={updated => updateStep(i, updated)}
            onRemove={() => removeStep(i)}
            onMoveUp={() => moveStep(i, -1)}
            onMoveDown={() => moveStep(i, 1)}
            isFirst={i === 0}
            isLast={i === steps.length - 1}
          />
        ))}

        <button onClick={addStep}
          className="mt-3 flex items-center gap-2 text-[11px] font-mono text-[var(--muted)] hover:text-[var(--accent)] transition-colors border border-dashed border-[var(--border)] px-3 py-2 w-full justify-center hover:border-[var(--accent)]">
          <Plus size={12} /> Add step
        </button>
      </section>

      {/* ── Ingredient list (auto-aggregated, editable) ── */}
      <section>
        <div className="flex items-center gap-3 mb-2">
          <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--muted)]">Ingredient list</span>
          <span className="font-mono text-[9px] text-[var(--muted)]">({ingredients.filter(i => i.name.trim()).length})</span>
          <div className="flex-1 h-px bg-[var(--border)]" />
          <span className="font-mono text-[9px] text-[var(--muted)] italic">auto-aggregated from steps · editable</span>
        </div>

        {ingredients.length > 0 && (
          <div className="mb-1 grid gap-2 font-mono text-[9px] uppercase tracking-wider text-[var(--muted)]"
            style={{ gridTemplateColumns: '1fr 70px 70px 1fr auto' }}>
            <span>Ingredient</span><span className="text-right">Qty</span><span>Unit</span><span>Prep</span><span className="w-6" />
          </div>
        )}

        {ingredients.map((row, i) => (
          <div key={row.id} className="grid gap-2 py-1.5 border-b border-[var(--border-subtle)] last:border-0 items-center"
            style={{ gridTemplateColumns: '1fr 70px 70px 1fr auto' }}>
            <span className="text-[12px] text-[var(--fg)] px-2 py-1.5 border border-transparent">
              {row.name}
              {row.ingredientId && <span className="ml-1 text-[var(--accent)] text-[10px] font-mono">✓</span>}
            </span>
            <input type="number" min={0} step="any" value={row.quantityValue || ''}
              onChange={e => updateIngredient(i, { ...row, quantityValue: parseFloat(e.target.value) || 0 })}
              className="bg-transparent border border-[var(--border)] px-2 py-1.5 text-[12px] text-[var(--fg)] outline-none focus:border-[var(--accent)] transition-colors text-right"
            />
            <select value={row.quantityUnit} onChange={e => updateIngredient(i, { ...row, quantityUnit: e.target.value })}
              className="bg-[var(--surface)] border border-[var(--border)] px-1 py-1.5 text-[12px] text-[var(--fg)] outline-none focus:border-[var(--accent)] transition-colors cursor-pointer">
              {COMMON_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
            <input value={row.prepNote} onChange={e => updateIngredient(i, { ...row, prepNote: e.target.value })}
              placeholder="Prep note…"
              className="bg-transparent border border-[var(--border)] px-2 py-1.5 text-[12px] text-[var(--fg)] placeholder:text-[var(--muted)] outline-none focus:border-[var(--accent)] transition-colors"
            />
            <button onClick={() => removeIngredient(i)} className="p-1 text-[var(--muted)] hover:text-red-500 transition-colors flex-shrink-0">
              <Trash2 size={12} strokeWidth={1.5} />
            </button>
          </div>
        ))}

        <button onClick={addManualIngredient}
          className="mt-3 flex items-center gap-2 text-[11px] font-mono text-[var(--muted)] hover:text-[var(--accent)] transition-colors border border-dashed border-[var(--border)] px-3 py-2 hover:border-[var(--accent)]">
          <Plus size={12} /> Add ingredient manually
        </button>
      </section>

      {/* ── Equipment ── */}
      <section>
        <SectionHeader label="Equipment" />
        <EquipmentPicker
          equipmentTree={equipmentTree}
          selectedIds={equipmentIds}
          onToggle={toggleEquipment}
        />
      </section>

      {/* ── Save ── */}
      <section className="border-t border-[var(--border)] pt-6">
        {error && (
          <div className="mb-4 px-4 py-3 border border-red-300 text-red-600 text-[12px] font-mono bg-red-50">
            {error}
          </div>
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
