// src/components/recipe/RecipeEditor.tsx
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, Trash2, ChevronUp, ChevronDown, Loader2, ChevronRight,
         X, GripVertical, Zap, Search, BookOpen, PenLine,
         UtensilsCrossed, Pipette, Flame, Droplets, Microwave,
         Soup, Hourglass, Scale, ChefHat, Leaf, Wrench } from 'lucide-react';
import type { RecipeFormData } from '@/lib/recipe-actions';
import { APPLIANCES, type ApplianceDefinition, type CookingMode, type Control } from '@/lib/appliances';

// ── Types ─────────────────────────────────────────────────────

interface TaxonomyNode {
  id: string; name: string; parent_id: string | null;
  slug?: string; connected?: boolean; category?: string;
  capability_schema?: { modes: CapabilityMode[] } | null;
}

interface CapabilityControl {
  id: string; label: string; type: string;
  min?: number; max?: number; unit?: string;
  options?: string[]; required: boolean; defaultValue?: string | number;
  hint?: string;
}

interface CapabilityMode {
  id: string; label: string; hint?: string;
  controls: CapabilityControl[];
}

interface TaskResult {
  id: string; slug: string; name: string;
  family: string; category: string; task_type: string;
  description?: string;
  typical_duration_min_seconds?: number;
  typical_duration_max_seconds?: number;
  difficulty?: string;
  suggested_tool_slugs?: string[];
  show_temperature?: boolean;
  duration_label?: string;
  yield_factor?: number;
  status?: string;
}

interface TaskTreeNode {
  family: string; categories: string[]; types: string[];
}

interface StepIngredient {
  id: string; ingredientId: string; name: string;
  quantityValue: number; quantityUnit: string; prepNote: string;
}

// Tool instance — a specific physical tool in use during this recipe
// e.g. "Pot #1 · The curry pot", "Knife #1"
interface ToolInstance {
  instanceId:   string;   // unique within recipe
  equipmentId:  string;   // links to equipment table
  name:         string;   // equipment type name e.g. "Stock pot"
  label:        string;   // auto-generated e.g. "Pot #1"
  customName?:  string;   // optional user label e.g. "The curry pot"
  applianceId?: string;
  // display
  colorIndex:   number;   // 0-7, maps to a color palette
}

interface StepTool {
  id: string;
  instanceId?:     string;   // references ToolInstance.instanceId (preferred)
  equipmentId:     string;   // fallback when no instance
  name:            string;
  applianceId?:    string;
  applianceModeId?: string;
  applianceSettings?: Record<string, string | number>;
}

interface Step {
  id: string;
  taskId?: string; taskName?: string; taskType?: 'human' | 'machine' | 'passive';
  taskFamily?: string;
  showTemperature?: boolean;
  durationLabel?: string;
  instruction: string;
  durationMinutes: number; temperatureCelsius: number;
  stepIngredients: StepIngredient[];
  stepTools: StepTool[];
}

interface Group {
  id: string; outputName: string; outputIngId: string;
  outputQuantityValue?: number;
  outputQuantityUnit?: string;
  toolInstances: ToolInstance[];   // registry of tools in use in this group
  steps: Step[]; collapsed: boolean;
}

interface GroupOutput {
  id: string; name: string;
  quantityValue?: number; quantityUnit?: string;
  remaining?: number;  // pre-calculated available quantity for this usage point
}

// ── Balance calculation ────────────────────────────────────────
// For each group output, calculate how much is available at each
// subsequent usage point, accounting for prior consumptions.

interface BalanceEntry {
  groupId:      string;  // which consumer group
  consumed:     number;
  remaining:    number;
  overBudget:   boolean;
}

interface OutputBalance {
  produced:   number;
  unit:       string;
  entries:    BalanceEntry[];
  totalUsed:  number;
  hasError:   boolean;
}

function calculateBalances(groups: Group[]): Map<string, OutputBalance> {
  const result = new Map<string, OutputBalance>();

  for (let gi = 0; gi < groups.length; gi++) {
    const producer = groups[gi];
    if (!producer.outputName.trim()) continue;
    const produced = producer.outputQuantityValue ?? 0;
    const unit     = producer.outputQuantityUnit ?? 'g';
    const key      = producer.outputIngId || producer.outputName.toLowerCase().trim();

    const entries: BalanceEntry[] = [];
    let remaining = produced;
    let hasError  = false;

    // Look through all later groups for consumption of this output
    for (let ci = gi + 1; ci < groups.length; ci++) {
      const consumer = groups[ci];
      let consumed = 0;

      // Sum all step ingredients in this group that reference the output
      for (const step of consumer.steps) {
        for (const si of step.stepIngredients) {
          const siKey = si.ingredientId || si.name.toLowerCase().trim();
          if (siKey === key || si.name.toLowerCase().trim() === producer.outputName.toLowerCase().trim()) {
            consumed += si.quantityValue ?? 0;
          }
        }
      }

      if (consumed > 0) {
        remaining -= consumed;
        const overBudget = remaining < -0.001; // small float tolerance
        if (overBudget) hasError = true;
        entries.push({ groupId: consumer.id, consumed, remaining, overBudget });
      }
    }

    result.set(key, { produced, unit, entries, totalUsed: produced - remaining, hasError });
  }

  return result;
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

// Family display labels
const FAMILY_LABELS: Record<string, string> = {
  cut:          'Cut & Prepare',
  move:         'Move & Transfer',
  heat_dry:     'Cook — Dry Heat',
  heat_wet:     'Cook — Wet Heat',
  heat_machine: 'Cook — Appliance',
  mix:          'Mix & Combine',
  passive:      'Passive Process',
  prepare:      'Measure & Clean',
  finish:       'Finish & Serve',
};

const FAMILY_ICONS: Record<string, React.ElementType> = {
  cut:          UtensilsCrossed, // knife work — chop, slice, dice, mince, peel
  move:         Pipette,         // pour, transfer, strain, drain
  heat_dry:     Flame,           // roast, sear, fry, grill, toast
  heat_wet:     Soup,            // boil, simmer, steam, poach, blanch
  heat_machine: Microwave,       // oven, microwave, sous vide, appliance
  mix:          Droplets,        // stir, whisk, fold, knead, emulsify
  passive:      Hourglass,       // rest, marinate, ferment, proof, chill
  prepare:      Scale,           // measure, weigh, season, wash, preheat
  finish:       ChefHat,         // plate, garnish, serve, dress
};

const FAMILY_ORDER = ['cut','move','heat_dry','heat_wet','heat_machine','mix','passive','prepare','finish'];

function uid() { return Math.random().toString(36).slice(2, 9); }
function emptyStep(): Step {
  return { id: uid(), instruction: '', durationMinutes: 0, temperatureCelsius: 0, stepIngredients: [], stepTools: [] };
}
function emptyGroup(name = ''): Group {
  return { id: uid(), outputName: name, outputIngId: '', toolInstances: [], steps: [emptyStep()], collapsed: false };
}
function emptyStepIngredient(): StepIngredient {
  return { id: uid(), ingredientId: '', name: '', quantityValue: 0, quantityUnit: 'g', prepNote: '' };
}
function emptyStepTool(): StepTool { return { id: uid(), equipmentId: '', name: '' }; }

// Tool instance color palette — muted, Soupdog-appropriate
const INSTANCE_COLORS = [
  '#2e4638', // dark olive (accent)
  '#5b6e8a', // slate blue
  '#8a5b3c', // warm brown
  '#4a7c6f', // teal
  '#7c4a6e', // muted purple
  '#6e7c4a', // moss
  '#8a3c3c', // muted red
  '#3c5e8a', // navy
];

function instanceDisplayName(inst: ToolInstance): string {
  if (inst.customName) {
    // "Pot #1 · The curry pot" not "Pot # The curry pot"
    return `${inst.label} · ${inst.customName}`;
  }
  return inst.label;
}

function generateInstanceLabel(
  equipmentName: string,
  existing: ToolInstance[]
): string {
  const SHORT_LABELS: Record<string, string> = {
    'stock pot': 'Pot', 'saucepan': 'Pan', 'frying pan': 'Pan',
    'saute pan': 'Pan', 'cast iron pan': 'Pan', 'wok': 'Wok',
    'grill pan': 'Grill pan', 'roasting tin': 'Tin',
    "chef's knife": 'Knife', 'santoku knife': 'Knife',
    'paring knife': 'Knife', 'boning knife': 'Knife',
    'blender': 'Blender', 'immersion blender': 'Blender',
    'stand mixer': 'Mixer', 'food processor': 'Processor',
    'conventional oven': 'Oven', 'convection oven': 'Oven',
    'steam oven': 'Oven', 'combi steam oven': 'Oven',
    'microwave': 'Microwave', 'sous vide circulator': 'Sous vide',
    'chopping board': 'Board', 'mixing bowls': 'Bowl',
    'whisk': 'Whisk', 'spatula': 'Spatula', 'colander': 'Colander',
    'kitchen scale': 'Scale', 'probe thermometer': 'Thermometer',
  };
  const base  = SHORT_LABELS[equipmentName.toLowerCase()] ?? equipmentName;
  const count = existing.filter(t =>
    (SHORT_LABELS[t.name.toLowerCase()] ?? t.name) === base
  ).length;
  // Only add #N if there's more than one, or if this is already #2+
  return count === 0 ? `${base} #1` : `${base} #${count + 1}`;
}

function FL({ children }: { children: React.ReactNode }) {
  return <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--muted)] block mb-1">{children}</span>;
}

// Module-level cache so custom tasks saved in one step are immediately
// available in search results in all other steps within the same session.
const _personalTaskCache: TaskResult[] = [];

async function savePersonalTask(name: string): Promise<TaskResult> {
  // Check cache first (avoid duplicate saves if user clicks twice)
  const cached = _personalTaskCache.find(t => t.name.toLowerCase() === name.toLowerCase());
  if (cached) return cached;

  const fallback: TaskResult = {
    id: `custom-${uid()}`,
    slug: `custom-${name.toLowerCase().replace(/\s+/g, '-')}`,
    name, family: 'custom', category: 'custom',
    task_type: 'human', description: '', status: 'personal',
  };

  try {
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, family: 'custom', category: 'custom', task_type: 'human' }),
    });
    const d = await res.json();
    if (d.task?.id) {
      const saved: TaskResult = { ...fallback, id: d.task.id, slug: d.task.slug ?? fallback.slug };
      _personalTaskCache.push(saved);
      return saved;
    }
  } catch {}

  _personalTaskCache.push(fallback);
  return fallback;
}


// Shows search + family tiles. Collapses to a "change" link after selection.

function TaskPickerInline({ selected, equipmentTree, onSelect, onFreeText }: {
  selected: boolean;
  equipmentTree: TaxonomyNode[];
  onSelect: (task: TaskResult) => void;
  onFreeText: () => void;
}) {
  const [open, setOpen]           = useState(!selected);
  const [query, setQuery]         = useState('');
  const [results, setResults]     = useState<TaskResult[]>([]);
  const [tree, setTree]           = useState<TaskTreeNode[]>([]);
  const [personalTasks, setPersonalTasks] = useState<TaskResult[]>([]);
  const [selectedFamily, setFam]  = useState<string | null>(null);
  const [loading, setLoading]     = useState(false);
  const [savingTask, setSavingTask] = useState(false);
  const inputRef                  = useRef<HTMLInputElement>(null);
  const debounceRef               = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    fetch('/api/tasks')
      .then(r => r.json())
      .then(d => {
        setTree(d.tree ?? []);
        // Also load personal tasks so they appear without needing to search
        const personal = (d.tasks ?? []).filter((t: TaskResult) => t.status === 'personal');
        // Merge with in-session cache
        const allIds = new Set(personal.map((t: TaskResult) => t.id));
        const cacheOnly = _personalTaskCache.filter(t => !allIds.has(t.id));
        setPersonalTasks([...personal, ...cacheOnly]);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!open) return;
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (query.length < 2) { setResults([]); return; }
    setLoading(true);
    debounceRef.current = setTimeout(() => {
      fetch(`/api/tasks?q=${encodeURIComponent(query)}`)
        .then(r => r.json())
        .then(d => {
          const dbTasks: TaskResult[] = d.tasks ?? [];
          const dbIds = new Set(dbTasks.map((t: TaskResult) => t.id));
          const cacheHits = _personalTaskCache.filter(
            t => !dbIds.has(t.id) && t.name.toLowerCase().includes(query.toLowerCase())
          );
          setResults([...dbTasks, ...cacheHits]);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    }, 250);
  }, [query]);

  useEffect(() => {
    if (!selectedFamily || query.length >= 2) return;
    setLoading(true);
    fetch(`/api/tasks?family=${selectedFamily}`)
      .then(r => r.json())
      .then(d => { setResults(d.tasks ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [selectedFamily, query]);

  const handleSelect = (task: TaskResult) => {
    // If this is a personal task not yet in the list, add it
    if (task.status === 'personal') {
      setPersonalTasks(prev => prev.some(t => t.id === task.id) ? prev : [...prev, task]);
    }
    onSelect(task);
    setOpen(false);
    setQuery('');
    setResults([]);
    setFam(null);
  };

  const orderedTree = FAMILY_ORDER
    .map(f => tree.find(t => t.family === f))
    .filter(Boolean) as TaskTreeNode[];

  const isSearching = query.length >= 2;
  const showResults = isSearching || selectedFamily !== null;

  // Collapsed — badge handles reopening, nothing to render here
  if (selected && !open) return null;

  return (
    <div style={{
      border: '1px solid var(--border)',
      background: 'var(--surface)',
    }}>
      {/* Search bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '7px 10px',
        borderBottom: (showResults || !isSearching) ? '1px solid var(--border)' : 'none',
      }}>
        <Search size={11} style={{ color: 'var(--muted)', flexShrink: 0 }} />
        <input
          ref={inputRef}
          value={query}
          onChange={e => { setQuery(e.target.value); setFam(null); }}
          placeholder="Search tasks…"
          style={{
            flex: 1, background: 'transparent', border: 'none', outline: 'none',
            fontSize: 12, color: 'var(--fg)',
          }}
        />
        {loading && <Loader2 size={11} style={{ color: 'var(--muted)' }} className="animate-spin" />}
        {selected && (
          <button onClick={() => setOpen(false)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>
            <X size={11} style={{ color: 'var(--muted)' }} />
          </button>
        )}
      </div>

      {/* My tasks — personal tasks shown above family tiles */}
      {!isSearching && !selectedFamily && personalTasks.length > 0 && (
        <div style={{ borderBottom: '1px solid var(--border)' }}>
          <div style={{ padding: '5px 10px 3px', fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted)' }}>
            My tasks
          </div>
          {personalTasks.map(task => (
            <button key={task.id}
              onClick={() => handleSelect(task)}
              style={{
                width: '100%', textAlign: 'left', padding: '5px 10px',
                background: 'none', border: 'none', cursor: 'pointer',
                borderBottom: '1px solid var(--border-subtle)',
                display: 'flex', alignItems: 'center', gap: 8,
              }}
              className="hover:bg-[var(--accent-subtle)]"
            >
              <span style={{ fontSize: 11, color: 'var(--fg)', flex: 1 }}>{task.name}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--accent)', border: '1px solid var(--accent)', padding: '1px 5px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>mine</span>
            </button>
          ))}
        </div>
      )}

      {/* Family tiles */}
      {!isSearching && !selectedFamily && (
        <div style={{ padding: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 5 }}>
            {orderedTree.map(node => (
              <button key={node.family}
                onClick={() => setFam(node.family)}
                style={{
                  padding: '8px 4px', border: '1px solid var(--border)',
                  background: 'var(--surface)', cursor: 'pointer', textAlign: 'center',
                  transition: 'all 0.15s',
                }}
                className="hover:border-[var(--accent)] hover:bg-[var(--accent-subtle)]"
              >
                {(() => { const Icon = FAMILY_ICONS[node.family]; return Icon ? <Icon size={14} style={{ color: 'var(--muted)', margin: '0 auto 4px' }} /> : null; })()}
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: 9,
                  textTransform: 'uppercase', letterSpacing: '0.08em',
                  color: 'var(--fg)', lineHeight: 1.4, display: 'block',
                }}>
                  {FAMILY_LABELS[node.family] ?? node.family}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Back button */}
      {selectedFamily && !isSearching && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '5px 10px', borderBottom: '1px solid var(--border)',
          background: 'var(--surface-hover)',
        }}>
          <button onClick={() => { setFam(null); setResults([]); }}
            style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
            ← Back
          </button>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            {FAMILY_LABELS[selectedFamily] ?? selectedFamily}
          </span>
        </div>
      )}

      {/* Results */}
      {showResults && (
        <div style={{ maxHeight: 220, overflowY: 'auto' }}>
          {results.length === 0 && !loading && (
            <div>
              <div style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)' }}>
                No tasks found.
              </div>
              {query.length >= 2 && (
                <button
                  onClick={async () => {
                    if (savingTask) return;
                    setSavingTask(true);
                    const task = await savePersonalTask(query);
                    setSavingTask(false);
                    handleSelect(task);
                  }}
                  disabled={savingTask}
                  style={{
                    width: '100%', textAlign: 'left', padding: '8px 12px',
                    background: 'none', border: 'none', cursor: 'pointer',
                    borderTop: '1px solid var(--border)',
                  }}
                  className="hover:bg-[var(--accent-subtle)]"
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--accent)', fontWeight: 600 }}>+ Add</span>
                    <span style={{ fontSize: 12, color: 'var(--fg)', fontStyle: 'italic' }}>"{query}"</span>
                    <span style={{
                      marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 9,
                      color: 'var(--muted)', border: '1px solid var(--border)',
                      padding: '1px 5px', textTransform: 'uppercase', letterSpacing: '0.08em',
                    }}>new</span>
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', marginTop: 2 }}>
                    Saved to your personal library
                  </div>
                </button>
              )}
            </div>
          )}
          {results.map(task => (
            <button key={task.id}
              onClick={() => handleSelect(task)}
              style={{
                width: '100%', textAlign: 'left', padding: '7px 12px',
                background: 'none', border: 'none', cursor: 'pointer',
                borderBottom: '1px solid var(--border-subtle)', transition: 'background 0.1s',
              }}
              className="hover:bg-[var(--surface-hover)]"
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--fg)', flex: 1 }}>
                  {task.name}
                </span>
                {(task as any).status === 'personal' && (
                  <span style={{
                    fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)',
                    border: '1px solid var(--border)', padding: '1px 5px',
                    textTransform: 'uppercase', letterSpacing: '0.08em', flexShrink: 0,
                  }}>mine</span>
                )}
              </div>
              {task.description && (
                <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>
                  {task.description.slice(0, 75)}
                </div>
              )}
            </button>
          ))}
          {/* Add custom task option at bottom when searching and no exact match */}
          {isSearching && results.length > 0 && !results.some(t => t.name.toLowerCase() === query.toLowerCase()) && (
            <button
              onClick={async () => {
                if (savingTask) return;
                setSavingTask(true);
                const task = await savePersonalTask(query);
                setSavingTask(false);
                handleSelect(task);
              }}
              disabled={savingTask}
              style={{
                width: '100%', textAlign: 'left', padding: '7px 12px',
                background: 'none', border: 'none', cursor: 'pointer',
                borderTop: '1px solid var(--border)',
              }}
              className="hover:bg-[var(--accent-subtle)]"
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--accent)', fontWeight: 600 }}>+ Add</span>
                <span style={{ fontSize: 12, color: 'var(--fg)', fontStyle: 'italic' }}>"{query}"</span>
                <span style={{
                  marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 9,
                  color: 'var(--muted)', border: '1px solid var(--border)',
                  padding: '1px 5px', textTransform: 'uppercase', letterSpacing: '0.08em',
                }}>new</span>
              </div>
            </button>
          )}
        </div>
      )}

    </div>
  );
}

// ── Task Picker (full-screen dropdown, kept for future use) ───
function TaskPicker({ onSelect, onClose, onFreeText }: {
  onSelect: (task: TaskResult) => void;
  onClose: () => void;
  onFreeText: () => void;
}) {
  const [query, setQuery]           = useState('');
  const [results, setResults]       = useState<TaskResult[]>([]);
  const [tree, setTree]             = useState<TaskTreeNode[]>([]);
  const [selectedFamily, setFamily] = useState<string | null>(null);
  const [loading, setLoading]       = useState(false);
  const inputRef                    = useRef<HTMLInputElement>(null);
  const debounceRef                 = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Load tree on mount
  useEffect(() => {
    inputRef.current?.focus();
    fetch('/api/tasks')
      .then(r => r.json())
      .then(d => setTree(d.tree ?? []))
      .catch(() => {});
  }, []);

  // Search as you type
  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (query.length < 2) { setResults([]); return; }
    setLoading(true);
    debounceRef.current = setTimeout(() => {
      fetch(`/api/tasks?q=${encodeURIComponent(query)}`)
        .then(r => r.json())
        .then(d => {
          const dbTasks: TaskResult[] = d.tasks ?? [];
          const dbIds = new Set(dbTasks.map((t: TaskResult) => t.id));
          const cacheHits = _personalTaskCache.filter(
            t => !dbIds.has(t.id) && t.name.toLowerCase().includes(query.toLowerCase())
          );
          setResults([...dbTasks, ...cacheHits]);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    }, 250);
  }, [query]);

  // Load tasks for selected family
  useEffect(() => {
    if (!selectedFamily || query.length >= 2) return;
    setLoading(true);
    fetch(`/api/tasks?family=${selectedFamily}`)
      .then(r => r.json())
      .then(d => { setResults(d.tasks ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [selectedFamily, query]);

  const orderedTree = FAMILY_ORDER
    .map(f => tree.find(t => t.family === f))
    .filter(Boolean) as TaskTreeNode[];

  const isSearching = query.length >= 2;
  const showResults = isSearching || selectedFamily !== null;

  return (
    <div style={{
      position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderTop: 'none', maxHeight: 400, overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Search bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 12px', borderBottom: '1px solid var(--border)',
      }}>
        <Search size={12} style={{ color: 'var(--muted)', flexShrink: 0 }} />
        <input
          ref={inputRef}
          value={query}
          onChange={e => { setQuery(e.target.value); setFamily(null); }}
          placeholder="Search tasks… or browse below"
          style={{
            flex: 1, background: 'transparent', border: 'none', outline: 'none',
            fontSize: 12, color: 'var(--fg)',
          }}
        />
        {loading && <Loader2 size={11} style={{ color: 'var(--muted)' }} className="animate-spin" />}
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>
          <X size={12} style={{ color: 'var(--muted)' }} />
        </button>
      </div>

      <div style={{ overflow: 'auto', flex: 1 }}>
        {/* Family tiles — shown when not searching */}
        {!isSearching && !selectedFamily && (
          <div style={{ padding: 10 }}>
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6,
            }}>
              {orderedTree.map(node => (
                <button key={node.family}
                  onClick={() => setFamily(node.family)}
                  style={{
                    padding: '8px 6px', border: '1px solid var(--border)',
                    background: 'var(--surface)', cursor: 'pointer',
                    textAlign: 'center', transition: 'border-color 0.15s',
                  }}
                  className="hover:border-[var(--accent)] hover:bg-[var(--accent-subtle)]"
                >
                  {(() => { const Icon = FAMILY_ICONS[node.family]; return Icon ? <Icon size={14} style={{ color: 'var(--muted)', margin: '0 auto 4px' }} /> : null; })()}
                  <span style={{
                    fontFamily: 'var(--font-mono)', fontSize: 9,
                    textTransform: 'uppercase', letterSpacing: '0.1em',
                    color: 'var(--fg)', display: 'block', lineHeight: 1.4,
                  }}>
                    {FAMILY_LABELS[node.family] ?? node.family}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Back button when family selected */}
        {selectedFamily && !isSearching && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 12px', borderBottom: '1px solid var(--border)',
            background: 'var(--surface-hover)',
          }}>
            <button onClick={() => { setFamily(null); setResults([]); }}
              style={{
                fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)',
                background: 'none', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 4,
              }}>
              ← All families
            </button>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)' }}>·</span>
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600,
              color: 'var(--fg)', textTransform: 'uppercase', letterSpacing: '0.1em',
            }}>
              {FAMILY_LABELS[selectedFamily] ?? selectedFamily}
            </span>
          </div>
        )}

        {/* Task results */}
        {showResults && (
          <div>
            {results.length === 0 && !loading && (
              <div style={{
                padding: '12px 16px', fontFamily: 'var(--font-mono)',
                fontSize: 11, color: 'var(--muted)',
              }}>
                No tasks found.
              </div>
            )}
            {results.map(task => (
              <button key={task.id}
                onClick={() => onSelect(task)}
                style={{
                  width: '100%', textAlign: 'left', padding: '8px 14px',
                  background: 'none', border: 'none', cursor: 'pointer',
                  borderBottom: '1px solid var(--border-subtle)',
                  transition: 'background 0.1s',
                }}
                className="hover:bg-[var(--surface-hover)]"
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--fg)', flex: 1 }}>
                    {task.name}
                  </span>
                  <span style={{
                    fontFamily: 'var(--font-mono)', fontSize: 9,
                    textTransform: 'uppercase', letterSpacing: '0.1em',
                    color: task.task_type === 'machine' ? 'var(--accent)' : 'var(--muted)',
                    border: '1px solid',
                    borderColor: task.task_type === 'machine' ? 'var(--accent)' : 'var(--border)',
                    padding: '1px 5px', flexShrink: 0,
                  }}>
                    {task.task_type}
                  </span>
                </div>
                {task.description && (
                  <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>
                    {task.description.slice(0, 80)}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Footer — free text option */}
      <div style={{ borderTop: '1px solid var(--border)', padding: '8px 12px' }}>
        <button onClick={onFreeText}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'none', border: 'none', cursor: 'pointer',
            fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)',
          }}
          className="hover:text-[var(--fg)]"
        >
          <PenLine size={11} /> Write a custom step instead
        </button>
      </div>
    </div>
  );
}

// ── Step mode badge ───────────────────────────────────────────
function StepModeBadge({ taskName, taskFamily, onClear, onEdit }: {
  taskName: string; taskFamily?: string; onClear: () => void; onEdit: () => void;
}) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 0,
      border: '1px solid var(--border)',
      background: 'var(--surface-hover)',
    }}>
      <button
        onClick={onEdit}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '3px 8px 3px 6px',
          background: 'none', border: 'none', cursor: 'pointer',
        }}
        className="hover:bg-[var(--accent-subtle)] transition-colors"
        title="Change task"
      >
        <BookOpen size={9} style={{ color: 'var(--muted)' }} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, color: 'var(--fg)' }}>
          {taskName}
        </span>
        {taskFamily && (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)' }}>
            · {FAMILY_LABELS[taskFamily] ?? taskFamily}
          </span>
        )}
      </button>
      <button
        onClick={onClear}
        style={{ background: 'none', border: 'none', borderLeft: '1px solid var(--border)', cursor: 'pointer', padding: '3px 5px' }}
        title="Remove task"
        className="hover:bg-red-50 transition-colors"
      >
        <X size={9} style={{ color: 'var(--muted)' }} />
      </button>
    </div>
  );
}

// ── Appliance panel (unchanged from original) ─────────────────

function AppliancePanel({ tool, onChange }: { tool: StepTool; onChange: (t: StepTool) => void }) {
  const appliance = APPLIANCES.find(a => a.id === tool.applianceId);
  const mode      = appliance?.modes.find(m => m.id === tool.applianceModeId);
  if (!appliance) return null;

  const setMode = (modeId: string) => onChange({ ...tool, applianceModeId: modeId, applianceSettings: {} });
  const setSetting = (controlId: string, value: string | number) =>
    onChange({ ...tool, applianceSettings: { ...tool.applianceSettings, [controlId]: value } });

  const renderControl = (ctrl: Control) => {
    const val = tool.applianceSettings?.[ctrl.id];
    if (ctrl.type === 'select') return (
      <select value={String(val ?? ctrl.defaultValue ?? '')} onChange={e => setSetting(ctrl.id, e.target.value)}
        className="bg-[var(--surface)] border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--fg)] outline-none focus:border-[var(--accent)] w-full">
        {ctrl.options?.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    );
    if (ctrl.type === 'toggle') return (
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={Boolean(val ?? ctrl.defaultValue)}
          onChange={e => setSetting(ctrl.id, e.target.checked ? 1 : 0)}
          className="accent-[var(--accent)]" />
        <span className="font-mono text-[10px] text-[var(--muted)]">{ctrl.hint ?? ctrl.label}</span>
      </label>
    );
    return (
      <input type="number" min={ctrl.min} max={ctrl.max}
        value={String(val ?? ctrl.defaultValue ?? '')}
        onChange={e => setSetting(ctrl.id, parseFloat(e.target.value) || 0)}
        className="w-24 bg-transparent border border-[var(--border)] px-2 py-1 text-[11px] text-right text-[var(--fg)] outline-none focus:border-[var(--accent)] transition-colors" />
    );
  };

  return (
    <div style={{ marginTop: 8, border: '1px solid var(--accent)', padding: 10, background: 'var(--accent-subtle)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <Zap size={10} style={{ color: 'var(--accent)' }} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          {appliance.model}
        </span>
      </div>
      <div style={{ marginBottom: 8 }}>
        <FL>Mode</FL>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {appliance.modes.map(m => (
            <button key={m.id} onClick={() => setMode(m.id)}
              style={{
                fontFamily: 'var(--font-mono)', fontSize: 10, padding: '3px 8px',
                border: `1px solid ${tool.applianceModeId === m.id ? 'var(--accent)' : 'var(--border)'}`,
                background: tool.applianceModeId === m.id ? 'var(--accent)' : 'var(--surface)',
                color: tool.applianceModeId === m.id ? '#fff' : 'var(--fg)',
                cursor: 'pointer', transition: 'all 0.15s',
              }}>
              {m.label}
            </button>
          ))}
        </div>
      </div>
      {mode && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          {mode.controls.map(ctrl => (
            <div key={ctrl.id}>
              <FL>{ctrl.label}{ctrl.unit ? ` (${ctrl.unit})` : ''}</FL>
              {renderControl(ctrl)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Hierarchical picker (for ingredients/equipment) ───────────

function HierarchicalPicker({ nodes, onSelect, onClose, placeholder, extraSection }: {
  nodes: TaxonomyNode[];
  onSelect: (n: TaxonomyNode) => void;
  onClose: () => void;
  placeholder: string;
  extraSection?: { label: string; items: GroupOutput[] };
}) {
  const [query, setQuery]       = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const inputRef                = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const roots      = nodes.filter(n => !n.parent_id);
  const childrenOf = (id: string) => nodes.filter(n => n.parent_id === id);
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
    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, background: 'var(--surface)', border: '1px solid var(--border)', borderTop: 'none', maxHeight: 300, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
        <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)} placeholder={placeholder}
          style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 12, color: 'var(--fg)' }} />
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}><X size={12} style={{ color: 'var(--muted)' }} /></button>
      </div>
      <div style={{ overflow: 'auto', flex: 1 }}>
        {extraSection && !query && extraSection.items.length > 0 && (
          <>
            <div style={{ padding: '6px 12px 3px', fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--accent)', fontWeight: 600 }}>{extraSection.label}</div>
            {extraSection.items.map(item => (
              <div key={item.id} className="hover:bg-[var(--surface-hover)] cursor-pointer"
                style={{ padding: '6px 12px 6px 22px', fontSize: 12, color: 'var(--fg)' }}
                onClick={() => onSelect({ id: item.id, name: item.name, parent_id: null })}>
                {item.name}
              </div>
            ))}
            <div style={{ height: 1, background: 'var(--border)', margin: '4px 12px' }} />
          </>
        )}
        {(search ?? roots).map(n => <Node key={n.id} node={n} depth={0} />)}
      </div>
    </div>
  );
}

function PickerBtn({ value, placeholder, nodes, onSelect, className, extraSection }: {
  value: string; placeholder: string; nodes: TaxonomyNode[];
  onSelect: (n: TaxonomyNode) => void; className?: string;
  extraSection?: { label: string; items: GroupOutput[] };
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`relative ${className ?? ''}`}>
      <button onClick={() => setOpen(o => !o)} style={{ width: '100%', textAlign: 'left', background: 'var(--surface)', border: '1px solid var(--border)', padding: '6px 10px', fontSize: 12, color: value ? 'var(--fg)' : 'var(--muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <span className="truncate">{value || placeholder}</span>
        {value && <span className="text-[var(--accent)] text-[10px] flex-shrink-0">✓</span>}
      </button>
      {open && <HierarchicalPicker nodes={nodes} onSelect={n => { onSelect(n); setOpen(false); }} onClose={() => setOpen(false)} placeholder={`Search ${placeholder.toLowerCase()}…`} extraSection={extraSection} />}
    </div>
  );
}

// ── Step ingredient row ───────────────────────────────────────

function StepIngRow({ row, ingredientTree, fromRecipe, onChange, onRemove, overBudget }: {
  row: StepIngredient; ingredientTree: TaxonomyNode[]; fromRecipe: GroupOutput[];
  onChange: (r: StepIngredient) => void; onRemove: () => void;
  overBudget?: boolean;
}) {
  const [query,    setQuery]    = useState(row.name);
  const [showDrop, setShowDrop] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setQuery(row.name); }, [row.name]);

  const filtered = query.length >= 1
    ? ingredientTree.filter(n => n.name.toLowerCase().includes(query.toLowerCase())).slice(0, 8)
    : [];

  const fromRecipeFiltered = fromRecipe.filter(go =>
    !query || go.name.toLowerCase().includes(query.toLowerCase())
  );

  const handleSelect = (id: string, name: string, qty?: number, unit?: string) => {
    setQuery(name);
    setShowDrop(false);
    onChange({
      ...row,
      ingredientId:  id,
      name,
      quantityValue: qty ?? row.quantityValue,
      quantityUnit:  unit ?? row.quantityUnit,
    });
  };

  const handleFreeText = (name: string) => {
    setQuery(name);
    setShowDrop(false);
    onChange({ ...row, ingredientId: '', name });
  };

  return (
    <div className="grid gap-1.5 mb-1.5" style={{ gridTemplateColumns: '1fr 64px 64px 1fr auto' }}>
      {/* Ingredient name — free text with autocomplete */}
      <div style={{ position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
          <input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); setShowDrop(true); }}
            onFocus={() => setShowDrop(query.length >= 1)}
            onBlur={() => {
              setTimeout(() => {
                setShowDrop(false);
                if (query !== row.name) onChange({ ...row, ingredientId: '', name: query });
              }, 150);
            }}
            placeholder="Ingredient…"
            style={{
              width: '100%', background: 'var(--surface)',
              border: `1px solid ${overBudget ? 'rgb(220,38,38)' : 'var(--border)'}`,
              padding: '6px 28px 6px 10px', fontSize: 12,
              color: 'var(--fg)', outline: 'none',
            }}
            className="focus:border-[var(--accent)] transition-colors"
          />
          {row.ingredientId && (
            <span style={{ position: 'absolute', right: 8, color: 'var(--accent)', fontSize: 10, pointerEvents: 'none' }}>✓</span>
          )}
        </div>
        {showDrop && (filtered.length > 0 || fromRecipeFiltered.length > 0 || query.length >= 1) && (
          <div style={{
            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 60,
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderTop: 'none', maxHeight: 200, overflowY: 'auto',
          }}>
            {/* From this recipe */}
            {fromRecipeFiltered.length > 0 && (
              <>
                <div style={{ padding: '4px 10px', fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--accent)', background: 'var(--surface-hover)' }}>
                  From this recipe
                </div>
                {fromRecipeFiltered.map(go => (
                  <div key={go.id} onMouseDown={() => handleSelect(go.id, go.name, go.quantityValue, go.quantityUnit)}
                    style={{ padding: '6px 12px', fontSize: 12, color: 'var(--fg)', cursor: 'pointer', borderBottom: '1px solid var(--border-subtle)' }}
                    className="hover:bg-[var(--surface-hover)]">
                    {go.name}
                    {go.quantityValue ? <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', marginLeft: 8 }}>{go.quantityValue} {go.quantityUnit}</span> : null}
                  </div>
                ))}
              </>
            )}
            {/* DB matches */}
            {filtered.map(n => (
              <div key={n.id} onMouseDown={() => handleSelect(n.id, n.name)}
                style={{ padding: '6px 12px', fontSize: 12, color: 'var(--fg)', cursor: 'pointer', borderBottom: '1px solid var(--border-subtle)' }}
                className="hover:bg-[var(--surface-hover)]">
                {n.name}
              </div>
            ))}
            {/* Add new if not exact match */}
            {query.length >= 2 && !filtered.some(n => n.name.toLowerCase() === query.toLowerCase()) && !fromRecipeFiltered.some(go => go.name.toLowerCase() === query.toLowerCase()) && (
              <div onMouseDown={() => handleFreeText(query)}
                style={{ padding: '6px 12px', fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--accent)', cursor: 'pointer', borderTop: '1px solid var(--border)' }}
                className="hover:bg-[var(--accent-subtle)]">
                + Add "{query}"
              </div>
            )}
          </div>
        )}
      </div>
      <input type="text" inputMode="decimal"
        defaultValue={row.quantityValue === 0 ? '' : String(row.quantityValue)}
        key={row.id + '-qty'}
        placeholder="0"
        onFocus={e => { if (e.target.value === '0') e.target.value = ''; }}
        onChange={e => { const v = e.target.value; if (v === '' || v === '.' || /^\d*\.?\d*$/.test(v)) { /* allow while typing */ } else e.target.value = e.target.value.slice(0,-1); }}
        onBlur={e => { const v = parseFloat(e.target.value); onChange({ ...row, quantityValue: isNaN(v) ? 0 : v }); e.target.value = isNaN(v) || v === 0 ? '' : String(v); }}
        className="bg-transparent border border-[var(--border)] px-2 py-1.5 text-[12px] text-right text-[var(--fg)] outline-none focus:border-[var(--accent)] transition-colors" />
      <select value={row.quantityUnit} onChange={e => onChange({ ...row, quantityUnit: e.target.value })}
        className="bg-[var(--surface)] border border-[var(--border)] px-1 py-1.5 text-[12px] text-[var(--fg)] outline-none focus:border-[var(--accent)] cursor-pointer">
        {COMMON_UNITS.map(u => <option key={u}>{u}</option>)}
      </select>
      <input value={row.prepNote} onChange={e => onChange({ ...row, prepNote: e.target.value })} placeholder="Prep note…"
        className="bg-transparent border border-[var(--border)] px-2 py-1.5 text-[12px] text-[var(--fg)] placeholder:text-[var(--muted)] outline-none focus:border-[var(--accent)] transition-colors" />
      <button onClick={onRemove} className="p-1.5 text-[var(--muted)] hover:text-red-500 flex-shrink-0"><Trash2 size={11} strokeWidth={1.5} /></button>
    </div>
  );
}

// ── Generic capability panel (for non-Panasonic equipment) ────

function GenericCapabilityPanel({ tool, schema, onChange }: {
  tool: StepTool;
  schema: { modes: CapabilityMode[] };
  onChange: (t: StepTool) => void;
}) {
  const modes = schema.modes;
  const activeMode = modes.find(m => m.id === tool.applianceModeId) ?? modes[0];

  const setMode = (modeId: string) =>
    onChange({ ...tool, applianceModeId: modeId, applianceSettings: {} });

  const setSetting = (controlId: string, value: string | number) =>
    onChange({ ...tool, applianceSettings: { ...tool.applianceSettings, [controlId]: value } });

  useEffect(() => {
    if (!tool.applianceModeId && modes.length > 0) setMode(modes[0].id);
  }, []);

  const renderControl = (ctrl: CapabilityControl) => {
    const val = tool.applianceSettings?.[ctrl.id];
    if (ctrl.type === 'select') return (
      <select value={String(val ?? ctrl.defaultValue ?? '')}
        onChange={e => setSetting(ctrl.id, e.target.value)}
        className="bg-[var(--surface)] border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--fg)] outline-none focus:border-[var(--accent)] w-full">
        {ctrl.options?.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    );
    if (ctrl.type === 'toggle') return (
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox"
          checked={Boolean(val ?? ctrl.defaultValue)}
          onChange={e => setSetting(ctrl.id, e.target.checked ? 1 : 0)}
          className="accent-[var(--accent)]" />
        <span className="font-mono text-[10px] text-[var(--muted)]">{ctrl.hint ?? ctrl.label}</span>
      </label>
    );
    return (
      <input type="number" min={ctrl.min} max={ctrl.max}
        value={String(val ?? ctrl.defaultValue ?? '')}
        onChange={e => setSetting(ctrl.id, parseFloat(e.target.value) || 0)}
        className="w-24 bg-transparent border border-[var(--border)] px-2 py-1 text-[11px] text-right text-[var(--fg)] outline-none focus:border-[var(--accent)] transition-colors" />
    );
  };

  return (
    <div style={{ marginTop: 8, border: '1px solid var(--border)', padding: 10, background: 'var(--surface-hover)' }}>
      {modes.length > 1 && (
        <div style={{ marginBottom: 10 }}>
          <FL>Method</FL>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {modes.map(m => (
              <button key={m.id} onClick={() => setMode(m.id)}
                style={{
                  fontFamily: 'var(--font-mono)', fontSize: 10, padding: '3px 8px',
                  border: `1px solid ${activeMode?.id === m.id ? 'var(--accent)' : 'var(--border)'}`,
                  background: activeMode?.id === m.id ? 'var(--accent)' : 'var(--surface)',
                  color: activeMode?.id === m.id ? '#fff' : 'var(--fg)',
                  cursor: 'pointer', transition: 'all 0.15s',
                }}>
                {m.label}
              </button>
            ))}
          </div>
          {activeMode?.hint && (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>
              {activeMode.hint}
            </div>
          )}
        </div>
      )}
      {activeMode && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          {activeMode.controls.map(ctrl => (
            <div key={ctrl.id}>
              <FL>{ctrl.label}{ctrl.unit ? ` (${ctrl.unit})` : ''}</FL>
              {renderControl(ctrl)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Tool instance picker ──────────────────────────────────────
// Shows active tool instances at top, full equipment tree below.

function ToolInstancePicker({ instances, equipmentTree, currentName, onSelectInstance, onSelectNew, onClose }: {
  instances:        ToolInstance[];
  equipmentTree:    TaxonomyNode[];
  currentName:      string;
  onSelectInstance: (inst: ToolInstance) => void;
  onSelectNew:      (node: TaxonomyNode) => void;
  onClose:          () => void;
}) {
  const [query, setQuery]     = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const inputRef              = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const roots      = equipmentTree.filter(n => !n.parent_id);
  const childrenOf = (id: string) => equipmentTree.filter(n => n.parent_id === id);
  const search     = query.length >= 2
    ? equipmentTree.filter(n => n.name.toLowerCase().includes(query.toLowerCase()))
    : null;

  function EquipNode({ node, depth }: { node: TaxonomyNode; depth: number }) {
    const kids = childrenOf(node.id);
    const isP  = kids.length > 0;
    const open = expanded.has(node.id);
    return (
      <div>
        <div
          className="flex items-center gap-1 hover:bg-[var(--surface-hover)] cursor-pointer"
          style={{ paddingLeft: 12 + depth * 16, paddingTop: 6, paddingBottom: 6, paddingRight: 12 }}
          onClick={() => isP
            ? setExpanded(p => { const n = new Set(p); n.has(node.id) ? n.delete(node.id) : n.add(node.id); return n; })
            : onSelectNew(node)
          }
        >
          {isP
            ? <ChevronRight size={10} className={`text-[var(--muted)] flex-shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} />
            : <span className="w-[10px]" />
          }
          <span className={isP
            ? 'font-mono text-[10px] uppercase tracking-wider text-[var(--muted)]'
            : 'text-[12px] text-[var(--fg)]'
          }>
            {node.name}
          </span>
        </div>
        {isP && open && kids.map(k => <EquipNode key={k.id} node={k} depth={depth + 1} />)}
      </div>
    );
  }

  return (
    <div style={{
      position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 60,
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderTop: 'none', maxHeight: 320, overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Search */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderBottom: '1px solid var(--border)' }}>
        <Search size={11} style={{ color: 'var(--muted)', flexShrink: 0 }} />
        <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)}
          placeholder="Search tool / equipment…"
          style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 12, color: 'var(--fg)' }} />
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
          <X size={11} style={{ color: 'var(--muted)' }} />
        </button>
      </div>

      <div style={{ overflowY: 'auto', flex: 1 }}>
        {/* In use in this group */}
        {!query && instances.length > 0 && (
          <>
            <div style={{ padding: '5px 12px 3px', fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--accent)', background: 'var(--surface-hover)' }}>
              In use in this group
            </div>
            {instances.map(inst => (
              <div key={inst.instanceId}
                onClick={() => onSelectInstance(inst)}
                className="hover:bg-[var(--surface-hover)] cursor-pointer"
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderBottom: '1px solid var(--border-subtle)' }}
              >
                {/* Color dot */}
                <span style={{
                  width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                  background: INSTANCE_COLORS[inst.colorIndex % INSTANCE_COLORS.length],
                }} />
                <span style={{ fontSize: 12, color: 'var(--fg)', flex: 1 }}>
                  {instanceDisplayName(inst)}
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)' }}>
                  {inst.name}
                </span>
              </div>
            ))}
            <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
            <div style={{ padding: '4px 12px 3px', fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--muted)' }}>
              Add new tool
            </div>
          </>
        )}

        {/* Equipment tree or search results */}
        {(search ?? roots).map(n => <EquipNode key={n.id} node={n} depth={0} />)}
      </div>
    </div>
  );
}

// ── Step tool row ─────────────────────────────────────────────

function StepToolRow({ tool, equipmentTree, groupInstances, onAddInstance, onChange, onRemove, suggestedSlugs }: {
  tool: StepTool; equipmentTree: TaxonomyNode[];
  groupInstances:  ToolInstance[];
  onAddInstance:   (inst: ToolInstance) => void;
  onChange: (t: StepTool) => void; onRemove: () => void;
  suggestedSlugs?: string[];
}) {
  const [open, setOpen] = useState(!tool.name);

  // Find the instance this tool is linked to
  const linkedInstance = tool.instanceId
    ? groupInstances.find(i => i.instanceId === tool.instanceId)
    : undefined;

  // Match connected Panasonic by slug or id
  const connectedAppliance = APPLIANCES.find(a =>
    a.id === tool.applianceId ||
    a.id === tool.equipmentId ||
    (tool.name && a.model.toLowerCase() === tool.name.toLowerCase())
  );

  // Find equipment node from tree for capability_schema
  const equipNode = equipmentTree.find(n =>
    n.id === tool.equipmentId ||
    n.slug === tool.equipmentId ||
    (tool.name && n.name.toLowerCase() === tool.name.toLowerCase())
  );
  const COOKING_FAMILIES = new Set(['heat_dry','heat_wet','heat_machine','passive']);
  const taskNeedsCapability = !taskFamily || COOKING_FAMILIES.has(taskFamily);
  const hasCapability = !connectedAppliance &&
    taskNeedsCapability &&
    (equipNode?.capability_schema?.modes?.length ?? 0) > 0;

  const handleSelectInstance = (inst: ToolInstance) => {
    const matchedAppliance = APPLIANCES.find(a => a.id === inst.applianceId);
    onChange({
      ...tool,
      instanceId:    inst.instanceId,
      equipmentId:   inst.equipmentId,
      name:          inst.name,
      applianceId:   inst.applianceId,
      applianceModeId: undefined,
      applianceSettings: {},
    });
    setOpen(false);
  };

  const handleSelectNew = (node: TaxonomyNode) => {
    const matchedAppliance = APPLIANCES.find(a =>
      a.id === node.slug ||
      a.model.toLowerCase().includes(node.name.toLowerCase()) ||
      node.name.toLowerCase().includes(a.model.toLowerCase())
    );
    // Create new tool instance
    const newInstance: ToolInstance = {
      instanceId:  uid(),
      equipmentId: node.id,
      name:        node.name,
      label:       generateInstanceLabel(node.name, groupInstances),
      colorIndex:  groupInstances.length % INSTANCE_COLORS.length,
      applianceId: matchedAppliance?.id,
    };
    onAddInstance(newInstance);
    onChange({
      ...tool,
      instanceId:    newInstance.instanceId,
      equipmentId:   node.id,
      name:          node.name,
      applianceId:   matchedAppliance?.id,
      applianceModeId: undefined,
      applianceSettings: {},
    });
    setOpen(false);
  };

  const instanceColor = linkedInstance
    ? INSTANCE_COLORS[linkedInstance.colorIndex % INSTANCE_COLORS.length]
    : undefined;

  const displayName = linkedInstance
    ? instanceDisplayName(linkedInstance)
    : tool.name;

  return (
    <div className="mb-2">
      <div className="flex items-center gap-1.5">
        {/* Color dot for linked instance */}
        {instanceColor && (
          <span style={{
            width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
            background: instanceColor,
          }} />
        )}
        <div className="flex-1 relative">
          <button
            onClick={() => setOpen(o => !o)}
            style={{
              width: '100%', textAlign: 'left', background: 'var(--surface)',
              border: '1px solid var(--border)', padding: '6px 10px',
              fontSize: 12, color: displayName ? 'var(--fg)' : 'var(--muted)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6,
            }}
          >
            <span className="truncate">{displayName || 'Tool / equipment…'}</span>
            {linkedInstance && (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', flexShrink: 0 }}>
                {linkedInstance.name}
              </span>
            )}
            {tool.name && !linkedInstance && (
              <span style={{ color: 'var(--accent)', fontSize: 10, flexShrink: 0 }}>✓</span>
            )}
          </button>
          {open && (
            <ToolInstancePicker
              instances={groupInstances}
              equipmentTree={equipmentTree}
              currentName={tool.name}
              onSelectInstance={handleSelectInstance}
              onSelectNew={handleSelectNew}
              onClose={() => setOpen(false)}
            />
          )}
        </div>
        <button onClick={onRemove}
          className="p-1.5 text-[var(--muted)] hover:text-red-500 flex-shrink-0">
          <Trash2 size={11} strokeWidth={1.5} />
        </button>
      </div>
      {connectedAppliance && tool.name && (
        <AppliancePanel tool={tool} onChange={onChange} />
      )}
      {hasCapability && tool.name && (
        <GenericCapabilityPanel
          tool={tool}
          schema={equipNode!.capability_schema!}
          onChange={onChange}
        />
      )}
    </div>
  );
}

// ── Step Editor ───────────────────────────────────────────────

function StepEditor({ step, index, ingredientTree, equipmentTree, fromRecipe, isFirst, isLast, overBudgetKeys, groupInstances, onAddInstance, onChange, onRemove, onMoveUp, onMoveDown }: {
  step: Step; index: number;
  ingredientTree: TaxonomyNode[]; equipmentTree: TaxonomyNode[];
  fromRecipe: GroupOutput[]; isFirst: boolean; isLast: boolean;
  overBudgetKeys?: Set<string>;
  groupInstances:  ToolInstance[];
  onAddInstance:   (inst: ToolInstance) => void;
  onChange: (s: Step) => void; onRemove: () => void; onMoveUp: () => void; onMoveDown: () => void;
}) {
  const hasTask        = !!step.taskId;
  const isMachine      = step.taskType === 'machine';
  const isPassive      = step.taskType === 'passive';
  const showTemp       = step.showTemperature ?? false;
  const durationLabel  = step.durationLabel ?? 'Duration (min)';
  const noteRef        = useRef<HTMLTextAreaElement>(null);

  // Ingredients already added in this step — for duplicate prevention
  const usedIngredientKeys = new Set(
    step.stepIngredients
      .filter(si => si.name.trim())
      .map(si => si.ingredientId || si.name.toLowerCase().trim())
  );

  // Filter ingredient tree to exclude already-used ingredients in this step
  const filteredIngTree = ingredientTree.filter(n => {
    const key = n.id || n.name.toLowerCase().trim();
    return !usedIngredientKeys.has(key);
  });

  const addIng     = () => onChange({ ...step, stepIngredients: [...step.stepIngredients, emptyStepIngredient()] });
  const addTool    = () => onChange({ ...step, stepTools: [...step.stepTools, emptyStepTool()] });
  const updateIng  = (i: number, v: StepIngredient) => onChange({ ...step, stepIngredients: step.stepIngredients.map((r, idx) => idx === i ? v : r) });
  const removeIng  = (i: number) => onChange({ ...step, stepIngredients: step.stepIngredients.filter((_, idx) => idx !== i) });
  const updateTool = (i: number, v: StepTool) => onChange({ ...step, stepTools: step.stepTools.map((r, idx) => idx === i ? v : r) });
  const removeTool = (i: number) => onChange({ ...step, stepTools: step.stepTools.filter((_, idx) => idx !== i) });

  const selectTask = (task: TaskResult) => {
    const suggestedTools: StepTool[] = [];
    if (task.suggested_tool_slugs?.length) {
      for (const slug of task.suggested_tool_slugs) {
        const node = equipmentTree.find(n => n.slug === slug);
        if (node) {
          const alreadyAdded = step.stepTools.some(t => t.equipmentId === node.id || t.name === node.name);
          if (!alreadyAdded) {
            const matchedAppliance = APPLIANCES.find(a =>
              a.id === node.slug || a.model.toLowerCase().includes(node.name.toLowerCase())
            );
            // Check if instance already exists in group
            const existingInst = groupInstances.find(i => i.name === node.name);
            let instanceId: string;
            if (existingInst) {
              instanceId = existingInst.instanceId;
            } else {
              const newInst: ToolInstance = {
                instanceId:  uid(),
                equipmentId: node.id,
                name:        node.name,
                label:       generateInstanceLabel(node.name, groupInstances),
                colorIndex:  groupInstances.length % INSTANCE_COLORS.length,
                applianceId: matchedAppliance?.id,
              };
              onAddInstance(newInst);
              instanceId = newInst.instanceId;
            }
            suggestedTools.push({
              id: uid(), instanceId, equipmentId: node.id, name: node.name,
              applianceId: matchedAppliance?.id,
            });
          }
        }
      }
    }

    onChange({
      ...step,
      taskId:          task.id,
      taskName:        task.name,
      taskType:        task.task_type as 'human' | 'machine' | 'passive',
      taskFamily:      task.family,
      showTemperature: task.show_temperature ?? false,
      durationLabel:   task.duration_label ?? undefined,
      instruction:     step.instruction || '',
      durationMinutes: step.durationMinutes ||
        (task.typical_duration_min_seconds
          ? Math.round(task.typical_duration_min_seconds / 60) : 0),
      stepTools: [...step.stepTools, ...suggestedTools],
      ...(task.suggested_tool_slugs?.length ? { suggestedToolSlugs: task.suggested_tool_slugs } : {}),
      ...(task.yield_factor != null ? { yieldFactor: task.yield_factor } : {}),
    });
  };

  const clearTask = () => onChange({
    ...step,
    taskId: undefined, taskName: undefined, taskType: undefined,
    taskFamily: undefined, showTemperature: undefined, durationLabel: undefined,
  });

  const hasOverBudget = overBudgetKeys && step.stepIngredients.some(si => {
    const key = si.ingredientId || si.name.toLowerCase().trim();
    return overBudgetKeys.has(key);
  });

  return (
    <div className="border mb-2 last:mb-0" style={{
      borderColor: hasOverBudget ? 'rgb(220,38,38)' : 'var(--border)',
    }}>
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

      <div className="p-3 space-y-4">

        {/* ── 1. INGREDIENTS ──────────────────────────────── */}
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
              ingredientTree={filteredIngTree}
              fromRecipe={fromRecipe}
              overBudget={overBudgetKeys?.has(si.ingredientId || si.name.toLowerCase().trim())}
              onChange={v => updateIng(i, v)} onRemove={() => removeIng(i)} />
          ))}
          {step.stepIngredients.length === 0 && (
          <button onClick={addIng} className="mt-2 flex items-center gap-2 px-3 py-1.5 text-[11px] font-mono text-[var(--muted)] border border-dashed border-[var(--border)] hover:border-[var(--accent)] hover:text-[var(--accent)] hover:bg-[var(--accent-subtle)] transition-all">
            <Leaf size={11} /> Add ingredient
          </button>
          )}
        </div>

        {/* ── 2. STEP / TASK ──────────────────────────────── */}
        <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 12 }}>
          <FL>Task</FL>

          {hasTask && step.taskName ? (
            /* Task selected: badge + note on same row */
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <div style={{ flexShrink: 0, paddingTop: 1 }}>
                <StepModeBadge
                  taskName={step.taskName}
                  taskFamily={step.taskFamily}
                  onClear={clearTask}
                  onEdit={clearTask}
                />
              </div>
              <textarea
                ref={noteRef}
                value={step.instruction}
                onChange={e => onChange({ ...step, instruction: e.target.value })}
                placeholder="Note (optional)"
                rows={1}
                className="flex-1 bg-transparent border border-[var(--border)] px-3 py-1.5 text-[12px] text-[var(--fg)] placeholder:text-[var(--muted)] outline-none focus:border-[var(--accent)] transition-colors resize-none"
                style={{ minHeight: 30 }}
              />
            </div>
          ) : (
            /* No task: just the picker */
            <TaskPickerInline
              selected={false}
              equipmentTree={equipmentTree}
              onSelect={selectTask}
              onFreeText={() => {
                setTimeout(() => noteRef.current?.focus(), 50);
              }}
            />
          )}
        </div>

        {/* ── 3. TOOLS ────────────────────────────────────── */}
        <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 12 }}>
          <FL>
            Tools{step.stepTools.length > 0 && hasTask ? ' · auto-suggested' : ''}
          </FL>
          {step.stepTools.map((st, i) => (
            <StepToolRow key={st.id} tool={st} equipmentTree={equipmentTree}
              groupInstances={groupInstances}
              onAddInstance={onAddInstance}
              suggestedSlugs={step.taskId ? (step as any).suggestedToolSlugs : undefined}
              taskFamily={step.taskFamily}
              onChange={v => updateTool(i, v)} onRemove={() => removeTool(i)} />
          ))}
          {step.stepTools.length >= 2 && (
            <div style={{
              marginTop: 6, padding: '5px 10px',
              background: 'var(--surface-hover)', border: '1px solid var(--border)',
              fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)',
            }}>
              💡 Multiple tools? If they are used at different times, add a separate step for each.
            </div>
          )}
          <button onClick={addTool} className="mt-2 flex items-center gap-2 px-3 py-1.5 text-[11px] font-mono text-[var(--muted)] border border-dashed border-[var(--border)] hover:border-[var(--accent)] hover:text-[var(--accent)] hover:bg-[var(--accent-subtle)] transition-all">
            <Wrench size={11} /> Add tool
          </button>
        </div>

        {/* ── 4. DURATION + TEMPERATURE ───────────────────── */}
        {/* Hide these when the tool's capability schema already defines time/temperature */}
        {(() => {
          const toolsWithSchema = step.stepTools.filter(t => {
            const node = equipmentTree.find(n =>
              n.id === t.equipmentId ||
              n.slug === t.equipmentId ||
              (t.name && n.name.toLowerCase() === t.name.toLowerCase())
            );
            return (node?.capability_schema?.modes?.length ?? 0) > 0;
          });
          const hasConnected = step.stepTools.some(t => t.applianceId);
          const schemaCoversTime = toolsWithSchema.length > 0 || hasConnected;
          const schemaCoversTemp = schemaCoversTime; // if schema covers time, assume it covers temp too

          const showDuration = !schemaCoversTime || isPassive || (!hasTask && !schemaCoversTime);
          const showTempField = (!hasTask || showTemp) && !schemaCoversTemp;

          if (!showDuration && !showTempField) return null;

          return (
            <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 12 }}>
              <div className="flex gap-3 flex-wrap">
                {showDuration && (
                  <div>
                    <FL>{durationLabel}</FL>
                    <input type="number" min={0} value={step.durationMinutes || ''} placeholder="0"
                      onChange={e => onChange({ ...step, durationMinutes: parseFloat(e.target.value) || 0 })}
                      className="w-20 bg-transparent border border-[var(--border)] px-2 py-1.5 text-[12px] text-right text-[var(--fg)] outline-none focus:border-[var(--accent)] transition-colors" />
                  </div>
                )}
                {showTempField && (
                  <div>
                    <FL>Temperature (°C)</FL>
                    <input type="number" min={0} value={step.temperatureCelsius || ''} placeholder="—"
                      onChange={e => onChange({ ...step, temperatureCelsius: parseFloat(e.target.value) || 0 })}
                      className="w-20 bg-transparent border border-[var(--border)] px-2 py-1.5 text-[12px] text-right text-[var(--fg)] outline-none focus:border-[var(--accent)] transition-colors" />
                  </div>
                )}
              </div>
            </div>
          );
        })()}

      </div>
    </div>
  );
}

// ── Group yield auto-calculation ─────────────────────────────
// Converts all step ingredients to grams, applies task yield factors,
// returns estimated output weight in grams.

function calculateGroupYield(
  steps: Step[],
  ingredientTree: TaxonomyNode[]
): number {
  const UNIT_TO_G: Record<string, number> = {
    g: 1, kg: 1000, oz: 28.35, lb: 453.59,
    ml: 1, l: 1000, tsp: 5, tbsp: 15, cup: 240,
    fl_oz: 29.57, piece: 100, clove: 5, slice: 30, pinch: 0.36,
  };

  let totalGrams = 0;

  for (const step of steps) {
    const yieldFactor = (step as any).yieldFactor ?? 1.0;

    for (const si of step.stepIngredients) {
      if (!si.quantityValue || !si.name.trim()) continue;
      const unit = si.quantityUnit.toLowerCase();

      // Find density from ingredient tree
      const node = ingredientTree.find(n =>
        n.id === si.ingredientId || n.name.toLowerCase() === si.name.toLowerCase()
      );
      const density = (node as any)?.density_g_per_ml ?? 1.0;

      let grams = 0;
      if (unit === 'g') grams = si.quantityValue;
      else if (unit === 'kg') grams = si.quantityValue * 1000;
      else if (unit === 'ml') grams = si.quantityValue * density;
      else if (unit === 'l')  grams = si.quantityValue * density * 1000;
      else {
        const factor = UNIT_TO_G[unit];
        grams = factor ? si.quantityValue * factor : si.quantityValue * 50; // unknown unit fallback
      }

      totalGrams += grams * yieldFactor;
    }
  }

  return Math.round(totalGrams);
}

// ── Balance tracker ───────────────────────────────────────────
// Shows how a group output is consumed across subsequent groups

function BalanceTracker({ balance, groupNames }: {
  balance: OutputBalance;
  groupNames: Map<string, string>;
}) {
  const MONO = 'var(--font-mono)';
  const MUT  = 'var(--muted)';
  if (!balance.produced || balance.entries.length === 0) return null;

  return (
    <div style={{
      marginTop: 6, padding: '6px 10px',
      background: balance.hasError ? 'rgba(220,38,38,0.05)' : 'var(--surface-hover)',
      border: `1px solid ${balance.hasError ? 'rgba(220,38,38,0.3)' : 'var(--border)'}`,
      fontSize: 11,
    }}>
      <div style={{ fontFamily: MONO, fontSize: 9, color: MUT, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
        Output usage
      </div>
      {/* Produced row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
        <span style={{ fontFamily: MONO, fontSize: 10, color: MUT }}>Produced</span>
        <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--fg)', fontWeight: 600 }}>
          {balance.produced} {balance.unit}
        </span>
      </div>
      {/* Consumption rows */}
      {balance.entries.map((entry, i) => {
        const name = groupNames.get(entry.groupId) ?? `Group ${i + 2}`;
        return (
          <div key={entry.groupId} style={{
            display: 'flex', justifyContent: 'space-between',
            padding: '2px 0', borderTop: '1px solid var(--border-subtle)',
          }}>
            <span style={{ fontFamily: MONO, fontSize: 10, color: MUT }}>
              → {name} uses {entry.consumed} {balance.unit}
            </span>
            <span style={{
              fontFamily: MONO, fontSize: 10, fontWeight: 500,
              color: entry.overBudget ? 'rgb(220,38,38)' : entry.remaining === 0 ? MUT : 'var(--fg)',
            }}>
              {entry.overBudget ? '⚠ ' : ''}{entry.remaining < 0 ? '' : ''}{Math.abs(entry.remaining).toFixed(1)} {balance.unit} {entry.overBudget ? 'over' : 'left'}
            </span>
          </div>
        );
      })}
      {balance.hasError && (
        <div style={{
          marginTop: 6, padding: '4px 8px',
          background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.3)',
          fontFamily: MONO, fontSize: 10, color: 'rgb(220,38,38)',
        }}>
          ⚠ Total consumption exceeds what was produced. Reduce usage in highlighted groups or increase the output quantity.
        </div>
      )}
    </div>
  );
}

// ── Group name input — free text + optional ingredient picker ─

function GroupNameInput({ value, placeholder, nodes, onChange, onSelect }: {
  value: string; placeholder: string; nodes: TaxonomyNode[];
  onChange: (name: string) => void;
  onSelect: (n: TaxonomyNode) => void;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const [query, setQuery]           = useState(value);
  const inputRef                    = useRef<HTMLInputElement>(null);

  // Keep local query in sync when value changes externally
  useEffect(() => { setQuery(value); }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    onChange(e.target.value);
    setShowPicker(e.target.value.length >= 1);
  };

  const handleSelect = (n: TaxonomyNode) => {
    setQuery(n.name);
    onSelect(n);
    setShowPicker(false);
  };

  // Filter nodes by query
  const filtered = query.length >= 1
    ? nodes.filter(n => n.name.toLowerCase().includes(query.toLowerCase())).slice(0, 8)
    : [];

  return (
    <div style={{ position: 'relative' }}>
      <input
        ref={inputRef}
        value={query}
        onChange={handleChange}
        onFocus={() => query.length >= 1 && setShowPicker(true)}
        onBlur={() => setTimeout(() => setShowPicker(false), 150)}
        placeholder={placeholder}
        style={{
          width: '100%', background: 'var(--surface)',
          border: '1px solid var(--border)', padding: '6px 10px',
          fontSize: 12, color: 'var(--fg)', outline: 'none',
        }}
        className="focus:border-[var(--accent)] transition-colors"
      />
      {showPicker && filtered.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderTop: 'none', maxHeight: 200, overflowY: 'auto',
        }}>
          {filtered.map(n => (
            <div key={n.id}
              onMouseDown={() => handleSelect(n)}
              style={{
                padding: '7px 12px', fontSize: 12, color: 'var(--fg)',
                cursor: 'pointer', borderBottom: '1px solid var(--border-subtle)',
              }}
              className="hover:bg-[var(--surface-hover)]"
            >
              {n.name}
            </div>
          ))}
          {/* Always allow keeping the typed value */}
          {!filtered.some(n => n.name.toLowerCase() === query.toLowerCase()) && (
            <div
              onMouseDown={() => { onChange(query); setShowPicker(false); }}
              style={{
                padding: '7px 12px',
                color: 'var(--accent)', cursor: 'pointer',
                fontFamily: 'var(--font-mono)', fontSize: 11,
                borderTop: '1px solid var(--border)',
              }}
              className="hover:bg-[var(--accent-subtle)]"
            >
              + Use "{query}"
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Group editor ──────────────────────────────────────────────

function GroupEditor({ group, groupIndex, totalGroups, ingredientTree, equipmentTree,
  groupOutputs, balance, groupNames, onChange, onRemove, onMoveUp, onMoveDown }: {
  group: Group; groupIndex: number; totalGroups: number;
  ingredientTree: TaxonomyNode[]; equipmentTree: TaxonomyNode[];
  groupOutputs: GroupOutput[];
  balance?: OutputBalance;
  groupNames: Map<string, string>;
  onChange: (g: Group) => void; onRemove: () => void; onMoveUp: () => void; onMoveDown: () => void;
}) {
  const isFirst = groupIndex === 0;
  const isLast  = groupIndex === totalGroups - 1;

  // Track whether user has manually edited the yield
  const [yieldUserEdited, setYieldUserEdited] = useState(
    !!(group.outputQuantityValue && group.outputQuantityValue > 0)
  );

  const addStep    = () => onChange({ ...group, steps: [...group.steps, emptyStep()] });

  // updateStep also accepts optional new tool instances to add atomically
  const updateStep = (i: number, s: Step, newInstances?: ToolInstance[]) => {
    const updatedInstances = newInstances
      ? [
          ...group.toolInstances,
          ...newInstances.filter(ni => !group.toolInstances.find(ei => ei.instanceId === ni.instanceId))
        ]
      : group.toolInstances;

    const newGroup = {
      ...group,
      toolInstances: updatedInstances,
      steps: group.steps.map((r, idx) => idx === i ? s : r),
    };
    if (!yieldUserEdited && group.outputName.trim()) {
      const calcYield = calculateGroupYield(newGroup.steps, ingredientTree);
      if (calcYield > 0) {
        onChange({ ...newGroup, outputQuantityValue: calcYield, outputQuantityUnit: newGroup.outputQuantityUnit ?? 'g' });
        return;
      }
    }
    onChange(newGroup);
  };
  const removeStep = (i: number) => onChange({ ...group, steps: group.steps.filter((_, idx) => idx !== i) });
  const moveStep   = (i: number, dir: -1 | 1) => {
    const next = [...group.steps]; const swap = i + dir;
    if (swap < 0 || swap >= next.length) return;
    [next[i], next[swap]] = [next[swap], next[i]];
    onChange({ ...group, steps: next });
  };

  // Collect new instances to add — merged into the next updateStep call
  const pendingInstancesRef = useRef<ToolInstance[]>([]);

  const addToolInstance = (inst: ToolInstance) => {
    // Collect pending — will be merged on next updateStep
    if (!group.toolInstances.find(i => i.instanceId === inst.instanceId) &&
        !pendingInstancesRef.current.find(i => i.instanceId === inst.instanceId)) {
      pendingInstancesRef.current = [...pendingInstancesRef.current, inst];
    }
  };

  // Update a tool instance's custom name
  const updateInstanceName = (instanceId: string, customName: string) => {
    onChange({
      ...group,
      toolInstances: group.toolInstances.map(i =>
        i.instanceId === instanceId ? { ...i, customName: customName || undefined } : i
      ),
    });
  };

  return (
    <div className="border mb-4 last:mb-0" style={{
      borderColor: balance?.hasError ? 'rgba(220,38,38,0.5)' : 'var(--border)',
    }}>
      <div className="flex items-center gap-3 px-4 py-3 bg-[var(--surface)] border-b border-[var(--border)]">
        <GripVertical size={13} className="text-[var(--border)] flex-shrink-0" />
        <div className="flex-1 relative">
          <GroupNameInput
            value={group.outputName}
            placeholder={totalGroups === 1 ? 'Group / output name (optional)…' : 'Group output (e.g. Chopped almonds and walnuts)…'}
            nodes={ingredientTree}
            onChange={name => onChange({ ...group, outputName: name, outputIngId: '' })}
            onSelect={n => onChange({ ...group, outputName: n.name, outputIngId: n.id })}
          />
          {/* Output quantity — shown when group has a name */}
          {group.outputName.trim() && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
              <FL>Yield</FL>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <input
                  type="number" min={0} step="any"
                  value={group.outputQuantityValue || ''}
                  placeholder="auto"
                  onChange={e => {
                    setYieldUserEdited(true);
                    onChange({ ...group, outputQuantityValue: parseFloat(e.target.value) || 0 });
                  }}
                  style={{
                    width: 72, background: 'transparent',
                    border: '1px solid var(--border)', padding: '4px 8px',
                    fontSize: 11, textAlign: 'right', color: 'var(--fg)', outline: 'none',
                  }}
                />
                <select
                  value={group.outputQuantityUnit ?? 'g'}
                  onChange={e => onChange({ ...group, outputQuantityUnit: e.target.value })}
                  style={{
                    background: 'var(--surface)', border: '1px solid var(--border)',
                    padding: '4px 4px', fontSize: 11, color: 'var(--fg)', outline: 'none', cursor: 'pointer',
                  }}
                >
                  {['g','kg','ml','l','tsp','tbsp','cup','piece','portion'].map(u => (
                    <option key={u}>{u}</option>
                  ))}
                </select>
                {yieldUserEdited ? (
                  <button
                    onClick={() => {
                      const calc = calculateGroupYield(group.steps, ingredientTree);
                      if (calc > 0) {
                        onChange({ ...group, outputQuantityValue: calc, outputQuantityUnit: 'g' });
                        setYieldUserEdited(false);
                      }
                    }}
                    style={{
                      fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--accent)',
                      background: 'none', border: '1px solid var(--accent)',
                      padding: '2px 6px', cursor: 'pointer',
                    }}
                    title="Recalculate from ingredients"
                  >
                    ⟳ recalc
                  </button>
                ) : (
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)' }}>
                    auto · edit to override
                  </span>
                )}
              </div>
            </div>
          )}
          {/* Balance tracker */}
          {balance && group.outputName.trim() && (
            <BalanceTracker balance={balance} groupNames={groupNames} />
          )}
          {/* Tool instances panel — editable names */}
          {group.toolInstances.length > 0 && (
            <div style={{ marginTop: 8, borderTop: '1px solid var(--border-subtle)', paddingTop: 8 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--muted)', marginBottom: 6 }}>
                Tools in use
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {group.toolInstances.map(inst => (
                  <div key={inst.instanceId} style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '3px 8px 3px 6px',
                    border: '1px solid var(--border)',
                    background: 'var(--surface)',
                  }}>
                    <span style={{
                      width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                      background: INSTANCE_COLORS[inst.colorIndex % INSTANCE_COLORS.length],
                    }} />
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', flexShrink: 0 }}>
                      {inst.label}
                    </span>
                    <input
                      value={inst.customName ?? ''}
                      onChange={e => updateInstanceName(inst.instanceId, e.target.value)}
                      placeholder="Name it…"
                      style={{
                        background: 'transparent', border: 'none', outline: 'none',
                        fontSize: 11, color: 'var(--fg)', width: 100,
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
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
          {group.steps.map((step, i) => {
            // Build set of ingredient keys that are over-budget in this group
            const overBudgetKeys = new Set<string>();
            if (balance?.hasError) {
              for (const entry of balance.entries) {
                if (entry.groupId === group.id && entry.overBudget) {
                  // Mark all ingredients in this step that reference the output
                  for (const si of step.stepIngredients) {
                    const key = si.ingredientId || si.name.toLowerCase().trim();
                    const outputKey = groupOutputs.find(go =>
                      go.id === si.ingredientId || go.name.toLowerCase() === si.name.toLowerCase()
                    );
                    if (outputKey) overBudgetKeys.add(key);
                  }
                }
              }
            }
            return (
              <StepEditor key={step.id} step={step} index={i}
                ingredientTree={ingredientTree} equipmentTree={equipmentTree}
                fromRecipe={groupOutputs}
                overBudgetKeys={overBudgetKeys.size > 0 ? overBudgetKeys : undefined}
                groupInstances={[...group.toolInstances, ...pendingInstancesRef.current]}
                onAddInstance={addToolInstance}
                isFirst={i === 0} isLast={i === group.steps.length - 1}
                onChange={s => {
                  const pending = [...pendingInstancesRef.current];
                  pendingInstancesRef.current = [];
                  updateStep(i, s, pending);
                }}
                onRemove={() => removeStep(i)}
                onMoveUp={() => moveStep(i, -1)}
                onMoveDown={() => moveStep(i, 1)} />
            );
          })}
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
        if (!si.name.trim() || !si.quantityValue) continue;
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
  gmap.forEach((steps, label) => groups.push({ id: uid(), outputName: label === '__default__' ? '' : label, outputIngId: '', toolInstances: [], steps, collapsed: false }));
  return groups.length > 0 ? groups : [emptyGroup(title)];
}

// ── Main editor ───────────────────────────────────────────────

export function RecipeEditor({ initial, onSave, saving }: Props) {
  const [title,            setTitle]       = useState(initial?.title ?? '');
  const [description,      setDescription] = useState(initial?.description ?? '');
  const [cuisine,          setCuisine]     = useState(initial?.cuisine ?? '');
  const [tags,             setTags]        = useState(initial?.tags ?? '');
  const [servings,         setServings]    = useState(initial?.servings ?? 4);
  const [difficulty,       setDifficulty]  = useState(initial?.difficulty ?? 'medium');
  const [totalTimeMinutes, setTotalTime]   = useState(initial?.totalTimeMinutes ?? 0);
  const [activeTimeMinutes,setActiveTime]  = useState(initial?.activeTimeMinutes ?? 0);
  const [groups,           setGroups]      = useState<Group[]>(() => initialToGroups(initial?.title ?? '', initial));
  // Separate manual ingredients (user-added outside steps) from auto-aggregated
  const [manualIngredients, setManualIngredients] = useState<IngredientRow[]>(() => {
    // On init, any initial ingredients that aren't in steps are manual
    const stepKeys = new Set(
      (initial?.steps ?? []).flatMap((s: any) =>
        (s.stepIngredients ?? []).map((si: any) => si.ingredientId || si.name?.toLowerCase().trim())
      ).filter(Boolean)
    );
    return (initial?.ingredients ?? []).filter((r: any) =>
      !stepKeys.has(r.ingredientId || r.name?.toLowerCase().trim())
    );
  });

  // Derive the full ingredient list from groups + manual entries
  const aggregatedIngredients = aggregateIngredients(groups);
  const aggKeys = new Set(aggregatedIngredients.map(r => r.ingredientId || r.name.toLowerCase().trim()));
  const ingredients = [
    ...aggregatedIngredients,
    ...manualIngredients.filter(r => !aggKeys.has(r.ingredientId || r.name.toLowerCase().trim())),
  ];
  const [ingredientTree,   setIngTree]     = useState<TaxonomyNode[]>([]);
  const [equipmentTree,    setEqTree]      = useState<TaxonomyNode[]>([]);
  const [error,            setError]       = useState('');

  useEffect(() => {
    fetch('/api/ingredients/tree').then(r => r.ok ? r.json() : []).then(setIngTree).catch(() => {});
    fetch('/api/equipment/tree').then(r => r.ok ? r.json() : []).then(setEqTree).catch(() => {});
  }, []);

  // (ingredient list is now derived directly from groups — no useEffect needed)

  const handleSubmit = async () => {
    setError('');
    if (!title.trim()) { setError('Recipe title is required.'); return; }
    const allSteps = groups.flatMap(g => g.steps);
    const hasContent = allSteps.some(s => s.instruction.trim() || s.taskId);
    if (!hasContent) { setError('Add at least one step.'); return; }

    // Check for balance errors
    const balances = calculateBalances(groups);
    const hasBalanceError = [...balances.values()].some(b => b.hasError);
    if (hasBalanceError) {
      setError('One or more group outputs are over budget — a later step uses more than was produced. Check the yield trackers and fix before saving.');
      return;
    }
    try {
      const steps = groups.flatMap(g =>
        g.steps
          .filter(s => s.instruction.trim() || s.taskId)
          .map(s => ({
            stepType:    s.taskType ?? 'human',
            taskId:      s.taskId,
            taskName:    s.taskName,
            taskFamily:  s.taskFamily,
            instruction: s.instruction,
            groupLabel:  groups.length > 1 ? (g.outputName || '') : '',
            groupOutputQuantityValue: g.outputQuantityValue,
            groupOutputQuantityUnit:  g.outputQuantityUnit,
            durationMinutes:    s.durationMinutes,
            temperatureCelsius: s.temperatureCelsius,
            stepIngredients: s.stepIngredients.filter(si => si.name.trim()),
            stepTools:       s.stepTools.filter(st => st.name.trim()),
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
  const updateIng    = (i: number, v: IngredientRow) => {
    // If it's in the aggregated list, it can't be edited here (it's derived)
    // If it's manual, update it
    const aggCount = aggregatedIngredients.length;
    if (i >= aggCount) {
      const manualIdx = i - aggCount;
      setManualIngredients(prev => prev.map((r, idx) => idx === manualIdx ? v : r));
    }
    // Aggregated rows are edited by changing the step ingredient directly
  };
  const removeIng    = (i: number) => {
    const aggCount = aggregatedIngredients.length;
    if (i >= aggCount) {
      const manualIdx = i - aggCount;
      setManualIngredients(prev => prev.filter((_, idx) => idx !== manualIdx));
    }
  };
  const addManualIng = () => setManualIngredients(prev => [
    ...prev,
    { id: uid(), ingredientId: '', name: '', quantityValue: 0, quantityUnit: 'g', prepNote: '', optional: false }
  ]);

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

      {/* Groups & Steps */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--muted)]">{groups.length > 1 ? 'Groups & Steps' : 'Steps'}</span>
          <div className="flex-1 h-px bg-[var(--border)]" />
        </div>
        {(() => {
          const balances    = calculateBalances(groups);
          const groupNamesM = new Map(groups.map(g => [g.id, g.outputName || `Group ${groups.indexOf(g) + 1}`]));
          return groups.map((group, gi) => {
            // Build groupOutputs with remaining quantity for each prior output
            const priorOutputs: GroupOutput[] = groups.slice(0, gi)
              .filter(g => g.outputName.trim())
              .map(g => {
                const key      = g.outputIngId || g.outputName.toLowerCase().trim();
                const bal      = balances.get(key);
                // Find remaining just before this group consumes
                let remaining  = g.outputQuantityValue ?? 0;
                if (bal) {
                  // Find the entry just before current group gi
                  const prevEntries = bal.entries.filter(e => {
                    const consumerIdx = groups.findIndex(gr => gr.id === e.groupId);
                    return consumerIdx < gi;
                  });
                  if (prevEntries.length > 0) {
                    remaining = prevEntries[prevEntries.length - 1].remaining;
                  }
                }
                return {
                  id:            g.outputIngId || g.outputName,
                  name:          g.outputName,
                  quantityValue: remaining > 0 ? remaining : (g.outputQuantityValue ?? 0),
                  quantityUnit:  g.outputQuantityUnit,
                };
              });

            const key      = group.outputIngId || group.outputName.toLowerCase().trim();
            const balance  = group.outputName.trim() ? balances.get(key) : undefined;

            return (
              <GroupEditor key={group.id} group={group} groupIndex={gi} totalGroups={groups.length}
                ingredientTree={ingredientTree} equipmentTree={equipmentTree}
                groupOutputs={priorOutputs}
                balance={balance}
                groupNames={groupNamesM}
                onChange={g => updateGroup(gi, g)}
                onRemove={() => removeGroup(gi)}
                onMoveUp={() => moveGroup(gi, -1)}
                onMoveDown={() => moveGroup(gi, 1)} />
            );
          });
        })()}
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
            <input type="text" inputMode="decimal" value={row.quantityValue === 0 ? '' : String(row.quantityValue)}
              onChange={e => { const v = e.target.value; if (v === '' || /^\d*\.?\d*$/.test(v)) updateIng(i, { ...row, quantityValue: parseFloat(v) || 0 }); }}
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
        <button onClick={addManualIng} className="mt-2 flex items-center gap-2 px-3 py-1.5 text-[11px] font-mono text-[var(--muted)] border border-dashed border-[var(--border)] hover:border-[var(--accent)] hover:text-[var(--accent)] hover:bg-[var(--accent-subtle)] transition-all">
          <Leaf size={11} /> Add ingredient manually
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
