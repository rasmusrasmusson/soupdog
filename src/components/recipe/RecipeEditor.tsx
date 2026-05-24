// src/components/recipe/RecipeEditor.tsx
// Shared recipe editor component — used by both /my/recipes/new and /my/recipes/[id]/edit
// Design mirrors the recipe view page: same structure, edit mode toggled.
'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, GripVertical, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
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

interface StepRow {
  id:                 string;
  stepType:           'human' | 'machine' | 'passive';
  instruction:        string;
  groupLabel:         string;
  durationMinutes:    number;
  temperatureCelsius: number;
}

interface EquipmentOption {
  id:   string;
  name: string;
}

interface IngredientSuggestion {
  id:   string;
  name: string;
}

interface Props {
  // Pre-filled when editing an existing recipe
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
  { value: 'human',   label: 'Human',   hint: 'Active hands-on task' },
  { value: 'machine', label: 'Machine', hint: 'Appliance / oven task' },
  { value: 'passive', label: 'Passive', hint: 'Rest, ferment, chill' },
];
const COMMON_UNITS = ['g', 'kg', 'ml', 'l', 'tsp', 'tbsp', 'cup', 'oz', 'lb', 'clove', 'slice', 'piece', 'pinch'];

function uid() { return Math.random().toString(36).slice(2, 9); }

function emptyIngredient(): IngredientRow {
  return { id: uid(), ingredientId: '', name: '', quantityValue: 0, quantityUnit: 'g', prepNote: '', optional: false };
}

function emptyStep(): StepRow {
  return { id: uid(), stepType: 'human', instruction: '', groupLabel: '', durationMinutes: 0, temperatureCelsius: 0 };
}

// ── Sub-components ────────────────────────────────────────────

function SectionHeader({ label, count }: { label: string; count?: number }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--muted)]">{label}</span>
      {count !== undefined && (
        <span className="font-mono text-[9px] text-[var(--muted)]">({count})</span>
      )}
      <div className="flex-1 h-px bg-[var(--border)]" />
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--muted)] block mb-1">
      {children}
    </span>
  );
}

function Input({ value, onChange, placeholder, className = '' }: {
  value: string; onChange: (v: string) => void; placeholder?: string; className?: string;
}) {
  return (
    <input
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full bg-transparent border border-[var(--border)] px-3 py-2 text-[12px] text-[var(--fg)] placeholder:text-[var(--muted)] outline-none focus:border-[var(--accent)] transition-colors ${className}`}
    />
  );
}

function Textarea({ value, onChange, placeholder, rows = 3 }: {
  value: string; onChange: (v: string) => void; placeholder?: string; rows?: number;
}) {
  return (
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="w-full bg-transparent border border-[var(--border)] px-3 py-2 text-[12px] text-[var(--fg)] placeholder:text-[var(--muted)] outline-none focus:border-[var(--accent)] transition-colors resize-y"
    />
  );
}

function Select({ value, onChange, options }: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="bg-[var(--surface)] border border-[var(--border)] px-3 py-2 text-[12px] text-[var(--fg)] outline-none focus:border-[var(--accent)] transition-colors cursor-pointer"
    >
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

// ── Ingredient autocomplete row ───────────────────────────────

function IngredientRowEditor({
  row, onChange, onRemove,
}: {
  row: IngredientRow;
  onChange: (updated: IngredientRow) => void;
  onRemove: () => void;
}) {
  const [suggestions, setSuggestions] = useState<IngredientSuggestion[]>([]);
  const [showSugg, setShowSugg]       = useState(false);
  const [searching, setSearching]     = useState(false);

  const searchIngredients = useCallback(async (q: string) => {
    if (q.length < 2) { setSuggestions([]); return; }
    setSearching(true);
    try {
      const res = await fetch(`/api/ingredients/search?q=${encodeURIComponent(q)}`);
      if (res.ok) setSuggestions(await res.json());
    } finally { setSearching(false); }
  }, []);

  const handleNameChange = (name: string) => {
    onChange({ ...row, name, ingredientId: '' });
    searchIngredients(name);
    setShowSugg(true);
  };

  const selectSuggestion = (s: IngredientSuggestion) => {
    onChange({ ...row, name: s.name, ingredientId: s.id });
    setSuggestions([]);
    setShowSugg(false);
  };

  return (
    <div className="grid gap-2 py-2 border-b border-[var(--border-subtle)] last:border-b-0"
      style={{ gridTemplateColumns: '1fr 80px 80px 1fr auto' }}>

      {/* Ingredient name with autocomplete */}
      <div className="relative">
        <input
          value={row.name}
          onChange={e => handleNameChange(e.target.value)}
          onFocus={() => row.name.length >= 2 && setShowSugg(true)}
          onBlur={() => setTimeout(() => setShowSugg(false), 150)}
          placeholder="Ingredient name"
          className="w-full bg-transparent border border-[var(--border)] px-2 py-1.5 text-[12px] text-[var(--fg)] placeholder:text-[var(--muted)] outline-none focus:border-[var(--accent)] transition-colors"
        />
        {row.ingredientId && (
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--accent)] text-[10px] font-mono">✓</span>
        )}
        {showSugg && suggestions.length > 0 && (
          <div className="absolute top-full left-0 right-0 z-50 bg-[var(--surface)] border border-[var(--border)] shadow-md max-h-40 overflow-y-auto">
            {searching && (
              <div className="px-3 py-2 text-[11px] text-[var(--muted)]">Searching…</div>
            )}
            {suggestions.map(s => (
              <button key={s.id} onMouseDown={() => selectSuggestion(s)}
                className="w-full text-left px-3 py-2 text-[12px] text-[var(--fg)] hover:bg-[var(--surface-hover)] transition-colors">
                {s.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Quantity */}
      <input
        type="number"
        value={row.quantityValue || ''}
        onChange={e => onChange({ ...row, quantityValue: parseFloat(e.target.value) || 0 })}
        placeholder="Qty"
        min={0}
        step="any"
        className="bg-transparent border border-[var(--border)] px-2 py-1.5 text-[12px] text-[var(--fg)] placeholder:text-[var(--muted)] outline-none focus:border-[var(--accent)] transition-colors text-right"
      />

      {/* Unit */}
      <select
        value={row.quantityUnit}
        onChange={e => onChange({ ...row, quantityUnit: e.target.value })}
        className="bg-[var(--surface)] border border-[var(--border)] px-2 py-1.5 text-[12px] text-[var(--fg)] outline-none focus:border-[var(--accent)] transition-colors cursor-pointer"
      >
        {COMMON_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
      </select>

      {/* Prep note */}
      <input
        value={row.prepNote}
        onChange={e => onChange({ ...row, prepNote: e.target.value })}
        placeholder="Prep note (minced, sliced…)"
        className="bg-transparent border border-[var(--border)] px-2 py-1.5 text-[12px] text-[var(--fg)] placeholder:text-[var(--muted)] outline-none focus:border-[var(--accent)] transition-colors"
      />

      {/* Remove */}
      <button onClick={onRemove}
        className="p-1.5 text-[var(--muted)] hover:text-[var(--error)] transition-colors flex-shrink-0">
        <Trash2 size={13} strokeWidth={1.5} />
      </button>
    </div>
  );
}

// ── Step row editor ───────────────────────────────────────────

function StepRowEditor({
  row, index, onChange, onRemove, onMoveUp, onMoveDown, isFirst, isLast,
}: {
  row: StepRow; index: number;
  onChange: (updated: StepRow) => void;
  onRemove: () => void;
  onMoveUp: () => void; onMoveDown: () => void;
  isFirst: boolean; isLast: boolean;
}) {
  const [expanded, setExpanded] = useState(true);

  const typeColor = {
    human:   'var(--fg)',
    machine: 'var(--accent)',
    passive: 'var(--muted)',
  }[row.stepType];

  return (
    <div className="border border-[var(--border)] mb-2 last:mb-0">
      {/* Header row */}
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
          placeholder="Group (Marinade, Sauce…)"
          className="flex-1 bg-transparent border-none text-[11px] text-[var(--muted)] placeholder:text-[var(--border)] outline-none font-mono"
        />

        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={onMoveUp}  disabled={isFirst}  className="p-1 text-[var(--muted)] hover:text-[var(--fg)] disabled:opacity-30 transition-colors"><ChevronUp  size={12} /></button>
          <button onClick={onMoveDown} disabled={isLast}  className="p-1 text-[var(--muted)] hover:text-[var(--fg)] disabled:opacity-30 transition-colors"><ChevronDown size={12} /></button>
          <button onClick={() => setExpanded(e => !e)}    className="p-1 text-[var(--muted)] hover:text-[var(--fg)] transition-colors"><GripVertical size={12} /></button>
          <button onClick={onRemove}                      className="p-1 text-[var(--muted)] hover:text-[var(--error)] transition-colors"><Trash2 size={12} strokeWidth={1.5} /></button>
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="px-3 pb-3 pt-2 space-y-2">
          <Textarea
            value={row.instruction}
            onChange={v => onChange({ ...row, instruction: v })}
            placeholder="Describe this step…"
            rows={2}
          />
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
        </div>
      )}
    </div>
  );
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
  const [ingredients,       setIngredients]     = useState<IngredientRow[]>(initial?.ingredients ?? [emptyIngredient()]);
  const [steps,             setSteps]           = useState<StepRow[]>(initial?.steps ?? [emptyStep()]);
  const [equipmentOptions,  setEquipmentOptions] = useState<EquipmentOption[]>([]);
  const [equipmentIds,      setEquipmentIds]    = useState<string[]>(initial?.equipmentIds ?? []);
  const [error,             setError]           = useState('');

  // Load equipment options
  useEffect(() => {
    fetch('/api/equipment')
      .then(r => r.json())
      .then(setEquipmentOptions)
      .catch(() => {});
  }, []);

  const handleSubmit = async () => {
    setError('');
    if (!title.trim()) { setError('Recipe title is required.'); return; }
    if (ingredients.filter(i => i.name.trim()).length === 0) { setError('Add at least one ingredient.'); return; }
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

  // Ingredient helpers
  const updateIngredient = (index: number, updated: IngredientRow) =>
    setIngredients(prev => prev.map((r, i) => i === index ? updated : r));
  const removeIngredient = (index: number) =>
    setIngredients(prev => prev.filter((_, i) => i !== index));
  const addIngredient = () =>
    setIngredients(prev => [...prev, emptyIngredient()]);

  // Step helpers
  const updateStep = (index: number, updated: StepRow) =>
    setSteps(prev => prev.map((r, i) => i === index ? updated : r));
  const removeStep = (index: number) =>
    setSteps(prev => prev.filter((_, i) => i !== index));
  const addStep = () =>
    setSteps(prev => [...prev, emptyStep()]);
  const moveStep = (index: number, dir: -1 | 1) =>
    setSteps(prev => {
      const next = [...prev];
      const swap = index + dir;
      if (swap < 0 || swap >= next.length) return prev;
      [next[index], next[swap]] = [next[swap], next[index]];
      return next;
    });

  // Equipment toggle
  const toggleEquipment = (id: string) =>
    setEquipmentIds(prev =>
      prev.includes(id) ? prev.filter(e => e !== id) : [...prev, id]
    );

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-8 py-10 space-y-10">

      {/* ── Title & meta ──────────────────────────────────────── */}
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
            <input
              type="number" min={1} value={servings}
              onChange={e => setServings(parseInt(e.target.value) || 1)}
              className="w-full bg-transparent border border-[var(--border)] px-3 py-2 text-[12px] text-[var(--fg)] outline-none focus:border-[var(--accent)] transition-colors"
            />
          </div>
          <div>
            <FieldLabel>Difficulty</FieldLabel>
            <Select
              value={difficulty}
              onChange={setDifficulty}
              options={DIFFICULTY_OPTIONS.map(d => ({ value: d, label: d.charAt(0).toUpperCase() + d.slice(1) }))}
            />
          </div>
          <div>
            <FieldLabel>Total time (min)</FieldLabel>
            <input
              type="number" min={0} value={totalTimeMinutes || ''}
              onChange={e => setTotalTime(parseInt(e.target.value) || 0)}
              placeholder="0"
              className="w-full bg-transparent border border-[var(--border)] px-3 py-2 text-[12px] text-[var(--fg)] outline-none focus:border-[var(--accent)] transition-colors"
            />
          </div>
          <div>
            <FieldLabel>Active time (min)</FieldLabel>
            <input
              type="number" min={0} value={activeTimeMinutes || ''}
              onChange={e => setActiveTime(parseInt(e.target.value) || 0)}
              placeholder="0"
              className="w-full bg-transparent border border-[var(--border)] px-3 py-2 text-[12px] text-[var(--fg)] outline-none focus:border-[var(--accent)] transition-colors"
            />
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-3 mb-4">
          <div>
            <FieldLabel>Cuisine</FieldLabel>
            <Input value={cuisine} onChange={setCuisine} placeholder="Indian, European, Asian…" />
          </div>
          <div>
            <FieldLabel>Tags (comma-separated)</FieldLabel>
            <Input value={tags} onChange={setTags} placeholder="curry, dinner, spiced" />
          </div>
        </div>

        <div>
          <FieldLabel>Description</FieldLabel>
          <Textarea
            value={description}
            onChange={setDescription}
            placeholder="A short description of the dish and what makes it special…"
            rows={3}
          />
        </div>
      </section>

      {/* ── Ingredients ────────────────────────────────────────── */}
      <section>
        <SectionHeader label="Ingredients" count={ingredients.filter(i => i.name.trim()).length} />

        {/* Column headers */}
        <div className="grid gap-2 px-0 mb-1 font-mono text-[9px] uppercase tracking-wider text-[var(--muted)]"
          style={{ gridTemplateColumns: '1fr 80px 80px 1fr auto' }}>
          <span>Ingredient</span><span className="text-right">Qty</span><span>Unit</span><span>Prep</span><span className="w-8" />
        </div>

        {ingredients.map((row, i) => (
          <IngredientRowEditor
            key={row.id}
            row={row}
            onChange={updated => updateIngredient(i, updated)}
            onRemove={() => removeIngredient(i)}
          />
        ))}

        <button
          onClick={addIngredient}
          className="mt-3 flex items-center gap-2 text-[11px] font-mono text-[var(--muted)] hover:text-[var(--accent)] transition-colors border border-dashed border-[var(--border)] px-3 py-2 w-full justify-center hover:border-[var(--accent)]"
        >
          <Plus size={12} /> Add ingredient
        </button>
      </section>

      {/* ── Steps ──────────────────────────────────────────────── */}
      <section>
        <SectionHeader label="Steps" count={steps.filter(s => s.instruction.trim()).length} />

        {steps.map((row, i) => (
          <StepRowEditor
            key={row.id}
            row={row}
            index={i}
            onChange={updated => updateStep(i, updated)}
            onRemove={() => removeStep(i)}
            onMoveUp={() => moveStep(i, -1)}
            onMoveDown={() => moveStep(i, 1)}
            isFirst={i === 0}
            isLast={i === steps.length - 1}
          />
        ))}

        <button
          onClick={addStep}
          className="mt-3 flex items-center gap-2 text-[11px] font-mono text-[var(--muted)] hover:text-[var(--accent)] transition-colors border border-dashed border-[var(--border)] px-3 py-2 w-full justify-center hover:border-[var(--accent)]"
        >
          <Plus size={12} /> Add step
        </button>
      </section>

      {/* ── Equipment ──────────────────────────────────────────── */}
      {equipmentOptions.length > 0 && (
        <section>
          <SectionHeader label="Equipment" />
          <div className="flex flex-wrap gap-2">
            {equipmentOptions.map(eq => (
              <button
                key={eq.id}
                onClick={() => toggleEquipment(eq.id)}
                className={`text-[11px] font-mono px-3 py-1.5 border transition-colors ${
                  equipmentIds.includes(eq.id)
                    ? 'border-[var(--accent)] bg-[var(--accent-subtle)] text-[var(--accent)]'
                    : 'border-[var(--border)] text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]'
                }`}
              >
                {eq.name}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ── Save ───────────────────────────────────────────────── */}
      <section className="border-t border-[var(--border)] pt-6">
        {error && (
          <div className="mb-4 px-4 py-3 bg-[var(--error-bg)] border border-[var(--error)] text-[var(--error)] text-[12px] font-mono">
            {error}
          </div>
        )}
        <div className="flex items-center gap-4">
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex items-center gap-2 bg-[var(--accent)] text-white px-6 py-2.5 text-[12px] font-mono hover:bg-[var(--accent-mid)] disabled:opacity-60 transition-colors tracking-wide"
          >
            {saving && <Loader2 size={13} className="animate-spin" />}
            {saving ? 'Saving…' : 'Save recipe'}
          </button>
          <span className="text-[11px] text-[var(--muted)] font-mono">
            Saved as draft — publish from My Recipes
          </span>
        </div>
      </section>

    </div>
  );
}
ENDTS
echo "RecipeEditor.tsx written"