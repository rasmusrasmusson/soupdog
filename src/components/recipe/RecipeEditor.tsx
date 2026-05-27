// src/components/recipe/RecipeEditor.tsx
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, Trash2, ChevronUp, ChevronDown, Loader2, ChevronRight,
         X, GripVertical, Zap, Search, BookOpen, PenLine } from 'lucide-react';
import type { RecipeFormData } from '@/lib/recipe-actions';
import { APPLIANCES, type ApplianceDefinition, type CookingMode, type Control } from '@/lib/appliances';

// ── Types ─────────────────────────────────────────────────────

interface TaxonomyNode { id: string; name: string; parent_id: string | null; }

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
}

interface TaskTreeNode {
  family: string; categories: string[]; types: string[];
}

interface StepIngredient {
  id: string; ingredientId: string; name: string;
  quantityValue: number; quantityUnit: string; prepNote: string;
}

interface StepTool {
  id: string; equipmentId: string; name: string;
  applianceId?: string; applianceModeId?: string;
  applianceSettings?: Record<string, string | number>;
}

interface Step {
  id: string;
  taskId?: string; taskName?: string; taskType?: 'human' | 'machine' | 'passive';
  showTemperature?: boolean;
  durationLabel?: string;
  instruction: string;
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

const FAMILY_ORDER = ['cut','move','heat_dry','heat_wet','heat_machine','mix','passive','prepare','finish'];

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
function emptyStepTool(): StepTool { return { id: uid(), equipmentId: '', name: '' }; }

function FL({ children }: { children: React.ReactNode }) {
  return <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--muted)] block mb-1">{children}</span>;
}

// ── Task Picker Inline — always visible in step ───────────────
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
  const [selectedFamily, setFam]  = useState<string | null>(null);
  const [loading, setLoading]     = useState(false);
  const inputRef                  = useRef<HTMLInputElement>(null);
  const debounceRef               = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    fetch('/api/tasks')
      .then(r => r.json())
      .then(d => setTree(d.tree ?? []))
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
        .then(d => { setResults(d.tasks ?? []); setLoading(false); })
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

  // Collapsed state — show "change step" link
  if (selected && !open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)',
          background: 'none', border: 'none', cursor: 'pointer', padding: 0,
          display: 'flex', alignItems: 'center', gap: 4,
        }}
        className="hover:text-[var(--accent)]"
      >
        <Search size={9} /> Change step
      </button>
    );
  }

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
          placeholder="Search steps…"
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

      {/* Family tiles */}
      {!isSearching && !selectedFamily && (
        <div style={{ padding: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 5 }}>
            {orderedTree.map(node => (
              <button key={node.family}
                onClick={() => setFam(node.family)}
                style={{
                  padding: '6px 4px', border: '1px solid var(--border)',
                  background: 'var(--surface)', cursor: 'pointer', textAlign: 'center',
                  transition: 'all 0.15s',
                }}
                className="hover:border-[var(--accent)] hover:bg-[var(--accent-subtle)]"
              >
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
            <div style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)' }}>
              No steps found.
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
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: 9,
                  textTransform: 'uppercase', letterSpacing: '0.08em',
                  color: task.task_type === 'machine' ? 'var(--accent)' : 'var(--muted)',
                  border: '1px solid', flexShrink: 0, padding: '1px 5px',
                  borderColor: task.task_type === 'machine' ? 'var(--accent)' : 'var(--border)',
                }}>
                  {task.task_type}
                </span>
              </div>
              {task.description && (
                <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>
                  {task.description.slice(0, 75)}
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Footer */}
      <div style={{
        borderTop: showResults ? '1px solid var(--border)' : 'none',
        padding: '6px 10px',
      }}>
        <button onClick={onFreeText}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            background: 'none', border: 'none', cursor: 'pointer',
            fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)',
          }}
          className="hover:text-[var(--fg)]"
        >
          <PenLine size={10} /> Write a custom step
        </button>
      </div>
    </div>
  );
}

// ── Task Picker (full-screen dropdown, kept for future use) ───
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
        .then(d => { setResults(d.tasks ?? []); setLoading(false); })
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
function StepModeBadge({ taskType, taskName, onClear }: {
  taskType: string; taskName: string; onClear: () => void;
}) {
  const isM = taskType === 'machine';
  const isP = taskType === 'passive';
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '3px 8px 3px 6px',
      border: `1px solid ${isM ? 'var(--accent)' : 'var(--border)'}`,
      background: isM ? 'var(--accent-subtle)' : 'var(--surface-hover)',
      marginBottom: 8,
    }}>
      {isM ? <Zap size={9} style={{ color: 'var(--accent)' }} /> : <BookOpen size={9} style={{ color: 'var(--muted)' }} />}
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600,
        color: isM ? 'var(--accent)' : 'var(--fg)',
      }}>
        {taskName}
      </span>
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: 9,
        color: isM ? 'var(--accent)' : 'var(--muted)',
        textTransform: 'uppercase', letterSpacing: '0.1em',
      }}>
        · {taskType}
      </span>
      <button onClick={onClear}
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 1 }}>
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
  extraSection?: { label: string; items: { id: string; name: string }[] };
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
  extraSection?: { label: string; items: { id: string; name: string }[] };
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

function StepIngRow({ row, ingredientTree, fromRecipe, onChange, onRemove }: {
  row: StepIngredient; ingredientTree: TaxonomyNode[]; fromRecipe: { id: string; name: string }[];
  onChange: (r: StepIngredient) => void; onRemove: () => void;
}) {
  return (
    <div className="grid gap-1.5 mb-1.5" style={{ gridTemplateColumns: '1fr 64px 64px 1fr auto' }}>
      <PickerBtn value={row.name} placeholder="Ingredient…" nodes={ingredientTree}
        onSelect={n => onChange({ ...row, ingredientId: n.id, name: n.name })}
        extraSection={fromRecipe.length > 0 ? { label: 'From this recipe', items: fromRecipe } : undefined} />
      <input type="number" min={0} step="any" value={row.quantityValue || ''} placeholder="0"
        onChange={e => onChange({ ...row, quantityValue: parseFloat(e.target.value) || 0 })}
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

// ── Step tool row ─────────────────────────────────────────────

function StepToolRow({ tool, equipmentTree, onChange, onRemove }: {
  tool: StepTool; equipmentTree: TaxonomyNode[];
  onChange: (t: StepTool) => void; onRemove: () => void;
}) {
  const appliance = APPLIANCES.find(a => a.name.toLowerCase().includes(tool.name.toLowerCase()) || a.model.toLowerCase().includes(tool.name.toLowerCase()) || a.id === tool.applianceId);

  const handleSelect = (n: TaxonomyNode) => {
    const matchedAppliance = APPLIANCES.find(a => a.name.toLowerCase().includes(n.name.toLowerCase()) || a.model.toLowerCase().includes(n.name.toLowerCase()));
    onChange({ ...tool, equipmentId: n.id, name: n.name, applianceId: matchedAppliance?.id, applianceModeId: matchedAppliance ? tool.applianceModeId : undefined, applianceSettings: matchedAppliance ? tool.applianceSettings : undefined });
  };

  return (
    <div className="mb-2">
      <div className="flex items-center gap-1.5">
        <div className="flex-1">
          <PickerBtn value={tool.name} placeholder="Tool / equipment…" nodes={equipmentTree} onSelect={handleSelect} />
        </div>
        <button onClick={onRemove} className="p-1.5 text-[var(--muted)] hover:text-red-500 flex-shrink-0"><Trash2 size={11} strokeWidth={1.5} /></button>
      </div>
      {appliance && tool.name && <AppliancePanel tool={tool} onChange={onChange} />}
    </div>
  );
}

// ── Step Editor ───────────────────────────────────────────────

function StepEditor({ step, index, ingredientTree, equipmentTree, fromRecipe, isFirst, isLast, onChange, onRemove, onMoveUp, onMoveDown }: {
  step: Step; index: number;
  ingredientTree: TaxonomyNode[]; equipmentTree: TaxonomyNode[];
  fromRecipe: { id: string; name: string }[]; isFirst: boolean; isLast: boolean;
  onChange: (s: Step) => void; onRemove: () => void; onMoveUp: () => void; onMoveDown: () => void;
}) {
  const hasTask        = !!step.taskId;
  const isMachine      = step.taskType === 'machine';
  const isPassive      = step.taskType === 'passive';
  const showTemp       = step.showTemperature ?? false;
  const durationLabel  = step.durationLabel ?? 'Duration (min)';

  const addIng     = () => onChange({ ...step, stepIngredients: [...step.stepIngredients, emptyStepIngredient()] });
  const addTool    = () => onChange({ ...step, stepTools: [...step.stepTools, emptyStepTool()] });
  const updateIng  = (i: number, v: StepIngredient) => onChange({ ...step, stepIngredients: step.stepIngredients.map((r, idx) => idx === i ? v : r) });
  const removeIng  = (i: number) => onChange({ ...step, stepIngredients: step.stepIngredients.filter((_, idx) => idx !== i) });
  const updateTool = (i: number, v: StepTool) => onChange({ ...step, stepTools: step.stepTools.map((r, idx) => idx === i ? v : r) });
  const removeTool = (i: number) => onChange({ ...step, stepTools: step.stepTools.filter((_, idx) => idx !== i) });

  const selectTask = (task: TaskResult) => {
    // Auto-suggest tools based on task
    const suggestedTools: StepTool[] = [];
    if (task.suggested_tool_slugs?.length) {
      for (const slug of task.suggested_tool_slugs) {
        // Find matching node in equipment tree by slug-like name match
        const node = equipmentTree.find(n =>
          n.name.toLowerCase().replace(/[^a-z0-9]/g, '-').includes(slug.replace(/-/g, '')) ||
          slug.includes(n.name.toLowerCase().replace(/[^a-z0-9]/g, ''))
        );
        if (node) {
          // Only add if not already present
          const alreadyAdded = step.stepTools.some(t => t.equipmentId === node.id);
          if (!alreadyAdded) {
            const matchedAppliance = APPLIANCES.find(a =>
              a.name.toLowerCase().includes(node.name.toLowerCase()) ||
              a.model.toLowerCase().includes(node.name.toLowerCase())
            );
            suggestedTools.push({
              id: uid(), equipmentId: node.id, name: node.name,
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
      showTemperature: task.show_temperature ?? false,
      durationLabel:   task.duration_label ?? undefined,
      instruction:     step.instruction || '',
      durationMinutes: step.durationMinutes ||
        (task.typical_duration_min_seconds ? Math.round(task.typical_duration_min_seconds / 60) : 0),
      stepTools: [...step.stepTools, ...suggestedTools],
    });
  };

  const clearTask = () => onChange({
    ...step,
    taskId: undefined, taskName: undefined, taskType: undefined,
    showTemperature: undefined, durationLabel: undefined,
  });

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
            <StepIngRow key={si.id} row={si} ingredientTree={ingredientTree} fromRecipe={fromRecipe}
              onChange={v => updateIng(i, v)} onRemove={() => removeIng(i)} />
          ))}
          <button onClick={addIng} className="mt-1 flex items-center gap-1 text-[10px] font-mono text-[var(--muted)] hover:text-[var(--accent)] transition-colors">
            <Plus size={10} /> Add ingredient
          </button>
        </div>

        {/* ── 2. STEP / TASK ──────────────────────────────── */}
        <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 12 }}>
          <FL>Step</FL>

          {/* Task badge — shown after selection */}
          {hasTask && step.taskName && step.taskType && (
            <div style={{ marginBottom: 8 }}>
              <StepModeBadge
                taskType={step.taskType}
                taskName={step.taskName}
                onClear={clearTask}
              />
            </div>
          )}

          {/* Task search — always visible when no task selected, collapsible after */}
          <TaskPickerInline
            selected={hasTask}
            equipmentTree={equipmentTree}
            onSelect={selectTask}
            onFreeText={() => {}}
          />

          {/* Recipe note — shown after task selected or as primary for custom */}
          <textarea
            value={step.instruction}
            onChange={e => onChange({ ...step, instruction: e.target.value })}
            placeholder={hasTask
              ? `Recipe note for "${step.taskName}"… (optional)`
              : 'Describe this step…'
            }
            rows={hasTask ? 1 : 2}
            className="w-full bg-transparent border border-[var(--border)] px-3 py-2 text-[12px] text-[var(--fg)] placeholder:text-[var(--muted)] outline-none focus:border-[var(--accent)] transition-colors resize-y mt-2"
          />
        </div>

        {/* ── 3. TOOLS ────────────────────────────────────── */}
        <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 12 }}>
          <FL>
            Tools
            {step.stepTools.some(t => !t.name) ? '' : step.stepTools.length > 0 && hasTask
              ? ' · auto-suggested'
              : ''}
          </FL>
          {step.stepTools.map((st, i) => (
            <StepToolRow key={st.id} tool={st} equipmentTree={equipmentTree}
              onChange={v => updateTool(i, v)} onRemove={() => removeTool(i)} />
          ))}
          <button onClick={addTool} className="mt-1 flex items-center gap-1 text-[10px] font-mono text-[var(--muted)] hover:text-[var(--accent)] transition-colors">
            <Plus size={10} /> Add tool
          </button>
        </div>

        {/* ── 4. DURATION + TEMPERATURE ───────────────────── */}
        <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 12 }}>
          <div className="flex gap-3 flex-wrap">
            <div>
              <FL>{durationLabel}</FL>
              <input type="number" min={0} value={step.durationMinutes || ''} placeholder="0"
                onChange={e => onChange({ ...step, durationMinutes: parseFloat(e.target.value) || 0 })}
                className="w-20 bg-transparent border border-[var(--border)] px-2 py-1.5 text-[12px] text-right text-[var(--fg)] outline-none focus:border-[var(--accent)] transition-colors" />
            </div>
            {/* Only show temperature when relevant to the task */}
            {(!hasTask || showTemp) && (
              <div>
                <FL>Temperature (°C)</FL>
                <input type="number" min={0} value={step.temperatureCelsius || ''} placeholder="—"
                  onChange={e => onChange({ ...step, temperatureCelsius: parseFloat(e.target.value) || 0 })}
                  className="w-20 bg-transparent border border-[var(--border)] px-2 py-1.5 text-[12px] text-right text-[var(--fg)] outline-none focus:border-[var(--accent)] transition-colors" />
              </div>
            )}
          </div>
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
  const [title,            setTitle]       = useState(initial?.title ?? '');
  const [description,      setDescription] = useState(initial?.description ?? '');
  const [cuisine,          setCuisine]     = useState(initial?.cuisine ?? '');
  const [tags,             setTags]        = useState(initial?.tags ?? '');
  const [servings,         setServings]    = useState(initial?.servings ?? 4);
  const [difficulty,       setDifficulty]  = useState(initial?.difficulty ?? 'medium');
  const [totalTimeMinutes, setTotalTime]   = useState(initial?.totalTimeMinutes ?? 0);
  const [activeTimeMinutes,setActiveTime]  = useState(initial?.activeTimeMinutes ?? 0);
  const [groups,           setGroups]      = useState<Group[]>(() => initialToGroups(initial?.title ?? '', initial));
  const [ingredients,      setIngredients] = useState<IngredientRow[]>(initial?.ingredients ?? []);
  const [ingredientTree,   setIngTree]     = useState<TaxonomyNode[]>([]);
  const [equipmentTree,    setEqTree]      = useState<TaxonomyNode[]>([]);
  const [error,            setError]       = useState('');

  useEffect(() => {
    fetch('/api/ingredients/tree').then(r => r.ok ? r.json() : []).then(setIngTree).catch(() => {});
    fetch('/api/equipment/tree').then(r => r.ok ? r.json() : []).then(setEqTree).catch(() => {});
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
    const hasContent = allSteps.some(s => s.instruction.trim() || s.taskId);
    if (!hasContent) { setError('Add at least one step.'); return; }
    try {
      const steps = groups.flatMap(g =>
        g.steps
          .filter(s => s.instruction.trim() || s.taskId)
          .map(s => ({
            stepType:    s.taskType ?? 'human',
            taskId:      s.taskId,
            instruction: s.instruction,
            groupLabel:  groups.length > 1 ? (g.outputName || '') : '',
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

      {/* Groups & Steps */}
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
