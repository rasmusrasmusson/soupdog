// src/components/recipe/RecipeDisplay.tsx
//
// Shared recipe presentation — the single source of truth for how a recipe LOOKS.
// Rendered identically by:
//   - the saved recipe page (/recipes/[slug]) — interactive (cooking checkboxes)
//   - the Add-recipe preview (/my/recipes/import) — non-interactive (review before save)
//
// The recipe READS the same `Recipe` shape in both cases, whether it came from saved
// DB rows (mapNewSchemaRecipe) or an in-memory decomposition DAG (dagToRecipe).
//
// Interactivity (step/ingredient/tool checkboxes, servings) is OPTIONAL: pass the
// `interactive` prop with checklist state + handlers and the page owns that state
// (so its sidebar progress bars can read it). Omit it and the component renders a
// clean, static presentation — exactly what the preview needs.
//
// Page-specific chrome (bookmark, print, right sidebar, mobile sticky bar, nutrition)
// stays in the PAGE, wrapping this component — it is intentionally NOT here.

import React, { useState } from 'react';
import { formatDuration } from '@/lib/utils';
import { Zap } from 'lucide-react';
import type { RecipeStep, RecipeIngredientRef, Recipe } from '@/types';
import { APPLIANCES } from '@/lib/appliances';
import { calculateRecipeTiming } from '@/lib/recipe-timing';
import { TaskDetailModal } from '@/components/techniques/TaskDetailModal';
import { ToolDetailModal } from '@/components/recipe/ToolDetailModal';
import { useLocale } from '@/lib/locale-context';

const B    = '1px solid var(--border)';
const MONO = 'var(--font-mono)';
const MUT  = 'var(--muted)';

// Tool names are stored as slugs ("frying-pan", "large-pot"). Humanize for display:
// hyphens → spaces. Lowercase is kept (matches the calm cookbook tone). Used at every
// point a raw slug becomes visible text (the [tool] fill, the per-step tool cell, and
// the recipe-level tool list) so the page never shows a hyphenated slug.
function humanizeTool(name: string | undefined | null): string {
  return (name ?? '').replace(/-/g, ' ').trim();
}

// Quantity units that are QUALIFIERS, not measures: the phrase IS the amount, there's
// no number. Stored in the unit field with value 0 ("Salt · to taste"). We show the
// qualifier in the Qty column and blank the Unit column (per product decision), instead
// of a meaningless "0 g".
const QUALIFIER_UNITS = new Set(['to taste', 'as needed', 'to serve', 'for garnish', 'for serving']);

// Resolve how an ingredient's amount should DISPLAY: { qty, unit } as strings.
// - qualifier unit ("to taste") → qty = the qualifier, unit = '' (the phrase is the amount)
// - real unit but value 0/null  → qty = '—', unit = '' (honest "no amount", not "0 g")
// - normal                      → qty = the number, unit = the unit
function fmtAmount(value: number | null | undefined, unit: string | null | undefined): { qty: string; unit: string } {
  const u = (unit ?? '').trim();
  if (QUALIFIER_UNITS.has(u.toLowerCase())) return { qty: u, unit: '' };
  if (value == null || value === 0) return { qty: '—', unit: '' };
  const qty = value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return { qty, unit: u };
}

// A prep qualifier is REDUNDANT when every word of it already appears in the ingredient
// name — e.g. ingredient "ripe tomatoes" + prep "ripe" → "ripe tomatoes, ripe". The
// decomposition legitimately emits "ripe" as a prep (rule 2b lists it as a valid non-
// transformation qualifier), but if the catalogue name already carries the word, showing
// it twice reads wrong. Suppress at display time; keep genuinely additive preps.
function prepIsRedundant(name: string | undefined | null, prep: string | undefined | null): boolean {
  const p = (prep ?? '').trim().toLowerCase();
  if (!p) return false;
  const nameWords = new Set((name ?? '').toLowerCase().split(/[\s,]+/).filter(Boolean));
  const prepWords = p.split(/[\s,]+/).filter(Boolean);
  return prepWords.length > 0 && prepWords.every(w => nameWords.has(w));
}

// Resolve the prep to DISPLAY: the stored prep unless it's redundant with the name.
function displayPrep(name: string | undefined | null, prep: string | undefined | null): string {
  return prepIsRedundant(name, prep) ? '' : (prep ?? '').trim();
}

// Capitalization standard:
//  • In the ingredient LIST / qty table an ingredient is a LABEL → capitalize first
//    letter ("ripe tomatoes" → "Ripe tomatoes").
//  • Inside an instruction SENTENCE an ingredient is mid-sentence → lowercase first
//    letter ("Add Red onion" → "Add red onion").
// Only the FIRST character is touched (not the whole string), so genuine proper-noun
// casing inside a name is preserved ("Greek yogurt" stays "Greek yogurt" as a label;
// mid-sentence it becomes "greek yogurt", which reads fine and avoids proper-noun
// detection rabbit-holes).
function capitalizeLabel(s: string | undefined | null): string {
  const t = (s ?? '').trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}
function lowerInSentence(s: string | undefined | null): string {
  const t = (s ?? '').trim();
  return t ? t.charAt(0).toLowerCase() + t.slice(1) : t;
}

// ── Optional interactivity contract ──
// When present, the OWNER (the page) holds the checklist/servings state so other
// page chrome (sidebar progress) can read it. When absent, nothing is interactive.
export interface RecipeDisplayInteractive {
  ingChecks:  { checked: boolean[]; toggle: (i: number) => void };
  stepChecks: { checked: boolean[]; toggle: (i: number) => void };
  servings:   number;
}

export interface RecipeDisplayProps {
  recipe: Recipe;
  interactive?: RecipeDisplayInteractive;
  /** Link ingredient names to their pages (true on the public view; off in preview). */
  linkIngredients?: boolean;
  /** Show the hero image at the top. Off when the page renders its own hero (e.g. the public recipe view's intro region). Default true. */
  showHero?: boolean;
}

// ── small presentational helpers (moved here from the view page) ──
function Th({ children, w, right, center }: { children?: React.ReactNode; w?: number; right?: boolean; center?: boolean }) {
  return <th style={{ padding: '8px 14px', fontFamily: MONO, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.18em', color: MUT, borderRight: B, textAlign: right ? 'right' : center ? 'center' : 'left', width: w, whiteSpace: 'nowrap' }} className="last:border-r-0">{children}</th>;
}

function Checkbox({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button onClick={onChange} role="checkbox" aria-checked={checked}
      className="w-4 h-4 border border-[var(--border)] flex items-center justify-center hover:border-[var(--accent)] transition-colors flex-shrink-0"
      style={{ background: checked ? 'var(--accent)' : 'var(--surface)' }}>
      {checked && <span style={{ color: '#fff', fontSize: 9, lineHeight: 1, fontFamily: MONO }}>✓</span>}
    </button>
  );
}

function SectionHeader({ title, meta }: { title: string; meta?: string }) {
  return (
    <div className="flex items-center gap-3 mb-2">
      <span className="font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--muted)]">{title}</span>
      <div className="flex-1 h-px bg-[var(--border)]" />
      {meta && <span className="font-mono text-[9px] text-[var(--muted)]">{meta}</span>}
    </div>
  );
}

function ToolCell({ settings, onOpenTool }: { settings: any; onOpenTool?: (slug: string) => void }) {
  if (!settings) return <span style={{ color: MUT }}>—</span>;

  if (settings.applianceId) {
    const appliance = APPLIANCES.find((a: any) => a.id === settings.applianceId);
    const mode = appliance?.modes.find((m: any) => m.id === settings.applianceModeId);
    if (appliance && mode) {
      const parts: string[] = [];
      for (const ctrl of mode.controls) {
        const val = settings.settings?.[ctrl.id];
        if (val == null) continue;
        if (ctrl.type === 'toggle') { if (val) parts.push(ctrl.label); }
        else parts.push(`${val}${ctrl.unit ?? ''}`);
      }
      return (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginBottom: 1 }}>
            <Zap size={8} style={{ color: 'var(--accent)', flexShrink: 0 }} />
            <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--accent)', fontWeight: 600 }}>{appliance.model}</span>
          </div>
          <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--fg)', display: 'block' }}>{mode.label}</span>
          {parts.length > 0 && <span style={{ fontFamily: MONO, fontSize: 9, color: MUT, display: 'block' }}>{parts.join(' · ')}</span>}
        </div>
      );
    }
  }

  if (Array.isArray(settings.stepTools) && settings.stepTools.length > 0) {
    const tool = settings.stepTools[0];
    const slug = (tool.name ?? '').trim();
    const label = capitalizeLabel(humanizeTool(slug));
    const hasSettings = tool.applianceModeId || (tool.applianceSettings && Object.keys(tool.applianceSettings).length > 0);
    return (
      <div>
        {onOpenTool && slug
          ? <button type="button" onClick={() => onOpenTool(slug)}
              style={{ fontSize: 12, color: 'var(--fg)', fontWeight: 500, border: 'none', background: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}
              className="hover:text-[var(--accent)] transition-colors">{label}</button>
          : <span style={{ fontSize: 12, color: 'var(--fg)', fontWeight: 500 }}>{label}</span>}
        {hasSettings && tool.applianceModeId && (
          <span style={{ fontFamily: MONO, fontSize: 9, color: MUT, display: 'block' }}>
            {Object.entries(tool.applianceSettings ?? {}).map(([, v]) => `${v}`).join(' · ')}
          </span>
        )}
        {settings.stepTools.length > 1 && (
          <span style={{ fontFamily: MONO, fontSize: 9, color: MUT, display: 'block' }}>
            +{settings.stepTools.length - 1} more
          </span>
        )}
      </div>
    );
  }

  return <span style={{ color: MUT }}>—</span>;
}

// Renders a step's instruction with any end-state / human-timing note appended as a
// muted suffix ("Fry — until crispy"). `notes` carries observable completion phrases
// ("until crispy") and human time ranges ("about 8-10 minutes") that don't fit the
// numeric Time column. Duration (PT#M) lives in the Time column, not here.
// Compose the step line. If the task has a display_template, fill its [ingredient]
// and [tool] tags from this step's own ingredient and tool. [tool] is only filled
// when the task is single_tool (so it's unambiguous) and a tool is present; an
// unfillable [tool] (and its trailing "to the"/"in the" preposition) is stripped so
// the line still reads cleanly. With no template, show the curated task name; with
// no task at all, fall back to the stored instruction. Ingredients/quantities are
// also shown separately by each layout, so the template usually names without qty.
// Layer 2: join consumed-intermediate names into a readable, "the"-prefixed phrase.
// ["softened onion","tomato sauce"] → "the softened onion and tomato sauce".
// One "the" governs the whole list (cook-speak), Oxford-free "a, b and c".
function joinIntermediates(names: string[]): string {
  const xs = names.map(n => n.trim()).filter(Boolean);
  if (xs.length === 0) return '';
  let body: string;
  if (xs.length === 1) body = xs[0];
  else if (xs.length === 2) body = `${xs[0]} and ${xs[1]}`;
  else body = `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
  return `the ${body}`;
}

function composeStepLine(
  taskName: string | undefined,
  template: string | undefined,
  singleTool: boolean,
  ingredientName: string | undefined,
  toolName: string | undefined,
  instruction: string,
  intermediates?: string[],   // ← Layer 2: upstream intermediates this step consumes
): string {
  // Resolve what fills [ingredient]: the step's OWN ingredient first (keeps its
  // quantity, no article — "Add 60 g butter"); else the consumed intermediates,
  // joined and "the"-prefixed ("Add the diced onion and hot oil"). A step with an
  // own ingredient AND incoming intermediates uses the own ingredient — the
  // intermediates are already in the vessel, so re-naming them would be redundant.
  const intermediatePhrase = (!ingredientName && intermediates && intermediates.length)
    ? joinIntermediates(intermediates)
    : '';
  // Own ingredient is mid-sentence here ("Add red onion …") → lowercase first letter.
  // The intermediate phrase already begins with a lowercase "the …".
  const fill = (ingredientName ? lowerInSentence(ingredientName) : '') || intermediatePhrase || '';

  const tmpl = (template ?? '').trim();
  if (tmpl) {
    let out = tmpl;
    // [ingredient] → own ingredient, else intermediate phrase, else strip the tag
    if (fill) out = out.replace(/\[ingredient\]/gi, fill);
    else out = out.replace(/\s*\[ingredient\]/gi, '');
    // [tool] → only when single_tool and a tool is known; else strip the tag plus
    // a leading preposition ("to the [tool]", "in the [tool]") so it reads cleanly
    if (singleTool && toolName) out = out.replace(/\[tool\]/gi, humanizeTool(toolName));
    else out = out.replace(/\s*(?:to|in|on|into|with)?\s*(?:the\s+)?\[tool\]/gi, '');
    out = out.replace(/\s{2,}/g, ' ').trim();
    if (out) return out;
  }
  // No template: curated verb, with the intermediate phrase appended if we have one
  // (so a bare "Toss" still becomes "Toss the drained spaghetti and garlic oil").
  const verb = (taskName ?? '').trim();
  if (verb && intermediatePhrase) return `${verb} ${intermediatePhrase}`;
  return verb || instruction;
}

function StepLine({ taskName, template, singleTool, ingredientName, toolName, instruction, notes, taskId, onOpenTask, intermediates }: {
  taskName?: string; template?: string; singleTool?: boolean;
  ingredientName?: string; toolName?: string;
  instruction: string; notes?: string; taskId?: string; onOpenTask?: (id: string) => void;
  intermediates?: string[];
}) {
  return (
    <>
      {composeStepLine(taskName, template, !!singleTool, ingredientName, toolName, instruction, intermediates)}
      {notes && <span style={{ color: MUT }}> → {notes}</span>}
      {taskId && onOpenTask && (
        <button
          type="button"
          onClick={() => onOpenTask(taskId)}
          title="How to do this"
          aria-label="How to do this"
          style={{
            marginLeft: 6, padding: 0, border: 'none', background: 'none', cursor: 'pointer',
            fontFamily: MONO, fontSize: 11, lineHeight: 1, color: 'var(--muted)',
            verticalAlign: 'baseline', transition: 'color 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--muted)')}
        >
          ⓘ
        </button>
      )}
    </>
  );
}

export function RecipeDisplay({ recipe, interactive, linkIngredients = false, showHero = true }: RecipeDisplayProps) {
  const { locale } = useLocale();
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [openToolSlug, setOpenToolSlug] = useState<string | null>(null);
  const tbl: React.CSSProperties   = { borderCollapse: 'collapse', border: B, width: '100%', fontSize: 12 };
  const thead: React.CSSProperties = { background: 'var(--surface-hover)' };
  const td: React.CSSProperties    = { padding: '9px 14px', color: 'var(--fg)', verticalAlign: 'middle' };

  const isOn = !!interactive;
  const ingChecked  = (i: number) => isOn ? interactive!.ingChecks.checked[i]  : false;
  const stepChecked = (i: number) => isOn ? interactive!.stepChecks.checked[i] : false;
  const servings    = interactive?.servings ?? recipe.servings;

  // step → ingredients map (ingredients carry their stepId)
  const stepIngMap = React.useMemo(() => {
    const map: Record<string, RecipeIngredientRef[]> = {};
    for (const ing of recipe.ingredients) {
      if (!ing.stepId) continue;
      (map[ing.stepId] ??= []).push(ing);
    }
    return map;
  }, [recipe.ingredients]);

  // deduped ingredient list for the Ingredients table
  const displayIngredients = React.useMemo(() => {
    const seen = new Set<string>();
    return recipe.ingredients.filter(ing => {
      const key = ing.ingredientId || ing.name;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [recipe.ingredients]);

  // derived recipe-level tool list (tools live per-step in applianceSettings)
  const derivedTools: string[] = React.useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    const add = (t?: string) => {
      const name = humanizeTool(t);
      if (!name) return;
      const key = name.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key); out.push(name);
    };
    (recipe.equipment ?? []).forEach((e: any) => add(e.name));
    recipe.steps.forEach(s => {
      const set = s.applianceSettings as { applianceId?: string; stepTools?: { name?: string }[] } | undefined;
      if (set?.applianceId) {
        const appliance = APPLIANCES.find(a => a.id === set.applianceId);
        add(appliance?.name ?? appliance?.model);
      }
      (set?.stepTools ?? []).forEach(t => add(t?.name));
      (s.tools ?? []).forEach(add);
    });
    return out;
  }, [recipe.equipment, recipe.steps]);

  // group steps by group_label, keeping a global index for checklist alignment
  const groups: { label: string; steps: (RecipeStep & { globalIndex: number })[] }[] = [];
  recipe.steps.forEach((step, i) => {
    const label = step.group?.trim() || '';
    let g = groups.find(g => g.label === label);
    if (!g) { g = { label, steps: [] }; groups.push(g); }
    g.steps.push({ ...step, globalIndex: i });
  });

  const timing = calculateRecipeTiming(recipe.steps);
  const displayTotalSeconds = recipe.totalTimeSeconds > 0 ? recipe.totalTimeSeconds : timing.totalSeconds;

  return (
    <div className="px-4 md:px-8 py-6 space-y-8">

      {/* ── Hero image (optional) ── */}
      {showHero && recipe.heroImageUrl && (
        <div className="border border-[var(--border)] overflow-hidden">
          <img src={recipe.heroImageUrl} alt={recipe.title}
            style={{ display: 'block', width: '100%', maxHeight: 360, objectFit: 'cover' }} />
        </div>
      )}

      {/* ── Ingredients ── */}
      <section>
        <SectionHeader title="Ingredients" meta={`${displayIngredients.length} items · ${servings} servings`} />

        {/* mobile */}
        <div className="md:hidden border border-[var(--border)] divide-y divide-[var(--border)]">
          {displayIngredients.map((ing, i) => (
            <div key={ing.ingredientId + i} className="flex items-center gap-3 px-3 py-2.5"
              style={{ opacity: ingChecked(i) ? 0.4 : 1, background: ingChecked(i) ? 'var(--surface-hover)' : undefined }}>
              {isOn && <Checkbox checked={ingChecked(i)} onChange={() => interactive!.ingChecks.toggle(i)} />}
              <span style={{ fontFamily: MONO, fontSize: 10, color: MUT, width: 20, textAlign: 'right', flexShrink: 0 }}>{i + 1}</span>
              <span style={{ fontWeight: 500, fontSize: 13, flex: 1, minWidth: 0 }}>{capitalizeLabel(ing.name)}</span>
              <span style={{ fontFamily: MONO, fontSize: 12, color: 'var(--fg)', flexShrink: 0 }}>{(() => { const a = fmtAmount(ing.quantity.value, ing.quantity.unit); return <>{a.qty}{a.unit && <span style={{ fontSize: 10, color: MUT, marginLeft: 2 }}>{a.unit}</span>}</>; })()}</span>
              {displayPrep(ing.name, ing.prep) && <span style={{ fontFamily: MONO, fontSize: 10, color: MUT, flexShrink: 0, maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayPrep(ing.name, ing.prep)}</span>}
            </div>
          ))}
        </div>

        {/* desktop */}
        <div className="hidden md:block overflow-x-auto">
          <table style={{ ...tbl, minWidth: 480 }}>
            <thead>
              <tr style={thead}>
                {isOn && <Th w={36} />}<Th w={32}>#</Th><Th>Product</Th>
                <Th w={90} right>Quantity</Th><Th w={70}>Unit</Th>
                <Th>Notes</Th><Th w={80} center>State</Th>
              </tr>
            </thead>
            <tbody>
              {displayIngredients.map((ing, i) => (
                <tr key={ing.ingredientId + i} style={{ borderTop: B, opacity: ingChecked(i) ? 0.4 : 1, background: ingChecked(i) ? 'var(--surface-hover)' : undefined }}>
                  {isOn && <td style={{ ...td, borderRight: B, textAlign: 'center' }}><Checkbox checked={ingChecked(i)} onChange={() => interactive!.ingChecks.toggle(i)} /></td>}
                  <td style={{ ...td, borderRight: B, fontFamily: MONO, fontSize: 10, color: MUT, textAlign: 'center' }}>{i + 1}</td>
                  <td style={{ ...td, borderRight: B, fontWeight: 500 }}>
                    {linkIngredients && ing.ingredientSlug
                      ? <a href={`/ingredients/${ing.ingredientSlug}`} style={{ color: 'var(--fg)', textDecoration: 'none' }} className="hover:text-[var(--accent)] transition-colors">{capitalizeLabel(ing.name)}</a>
                      : <span style={{ color: 'var(--fg)' }}>{capitalizeLabel(ing.name)}</span>}
                    {ing.optional && <span style={{ marginLeft: 8, fontSize: 10, color: MUT, fontFamily: MONO }}>(opt)</span>}
                  </td>
                  <td style={{ ...td, borderRight: B, textAlign: 'right', fontFamily: MONO, fontVariantNumeric: 'tabular-nums' }}>{fmtAmount(ing.quantity.value, ing.quantity.unit).qty}</td>
                  <td style={{ ...td, borderRight: B, fontFamily: MONO, fontSize: 11, color: MUT }}>{fmtAmount(ing.quantity.value, ing.quantity.unit).unit}</td>
                  <td style={{ ...td, borderRight: B, color: MUT }}>{displayPrep(ing.name, ing.prep) || '—'}</td>
                  <td style={{ ...td, textAlign: 'center', fontFamily: MONO, fontSize: 9, textTransform: 'uppercase', color: MUT }}>{ing.state ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Tools ── */}
      {derivedTools.length > 0 && (
        <section>
          <SectionHeader title="Tools" meta={`${derivedTools.length} items`} />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 10px', marginTop: 4 }}>
            {derivedTools.map((t) => (
              <span key={t} style={{ fontSize: 13, color: 'var(--fg)', border: B, borderRadius: 6, padding: '4px 10px', background: 'var(--surface)' }}>
                {capitalizeLabel(t)}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* ── Procedure ── */}
      <section>
        <SectionHeader title="Procedure" meta={`${recipe.steps.length} steps`} />

        {/* mobile */}
        <div className="md:hidden border border-[var(--border)] divide-y divide-[var(--border)]">
          {groups.map((group, gi) => (
            <React.Fragment key={group.label || gi}>
              {(group.label || groups.length > 1) && (
                <div style={{ padding: '6px 12px', background: 'var(--surface-hover)', fontFamily: MONO, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--fg)', fontWeight: 600, borderTop: gi > 0 ? `2px solid var(--border)` : undefined, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>{group.label || `Group ${gi + 1}`}</span>
                  {timing.groupSeconds[group.label] > 0 && (
                    <span style={{ fontWeight: 400, color: MUT }}>{formatDuration(timing.groupSeconds[group.label])}</span>
                  )}
                </div>
              )}
              {group.steps.map(step => {
                const gIdx = step.globalIndex;
                const done = stepChecked(gIdx);
                const stepIngs = stepIngMap[step.id] ?? [];
                return (
                  <div key={step.id} style={{ padding: '10px 12px', opacity: done ? 0.4 : 1, background: done ? 'var(--surface-hover)' : undefined }}>
                    <div className="flex items-start gap-3">
                      {isOn && <Checkbox checked={done} onChange={() => interactive!.stepChecks.toggle(gIdx)} />}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--fg)', margin: 0 }}><StepLine taskName={step.taskName} template={step.taskTemplate} singleTool={step.taskSingleTool} ingredientName={stepIngs[0]?.name} toolName={(step.applianceSettings as any)?.stepTools?.[0]?.name} instruction={step.instruction} notes={step.notes} taskId={step.taskId} onOpenTask={setOpenTaskId} intermediates={step.consumedIntermediates} /></p>
                        {stepIngs.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {stepIngs.map((ing: RecipeIngredientRef) => (
                              <span key={`${step.id}-${ing.ingredientId}`}
                                style={{ fontFamily: MONO, fontSize: 10, padding: '2px 8px', borderRadius: 3, border: B, background: 'var(--surface)', color: 'var(--fg)' }}>
                                {(() => { const a = fmtAmount(ing.quantity.value, ing.quantity.unit); return `${capitalizeLabel(ing.name)} · ${a.qty}${a.unit ? ' ' + a.unit : ''}`; })()}
                              </span>
                            ))}
                          </div>
                        )}
                        {step.applianceSettings && (
                          <div className="mt-1.5 text-[11px]" style={{ color: MUT }}>
                            <ToolCell settings={step.applianceSettings} onOpenTool={setOpenToolSlug} />
                          </div>
                        )}
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {step.durationSeconds ? <span style={{ fontFamily: MONO, fontSize: 10, color: MUT }}>⏱ {formatDuration(step.durationSeconds)}</span> : null}
                          {step.temperature && <span style={{ fontFamily: MONO, fontSize: 10, color: MUT }}>{step.temperature.value}°{step.temperature.unit === 'celsius' ? 'C' : 'F'}</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </React.Fragment>
          ))}
          <div style={{ padding: '8px 12px', background: 'var(--surface-hover)', display: 'flex', justifyContent: 'space-between', borderTop: '2px solid var(--border)' }}>
            <span style={{ fontFamily: MONO, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.15em', color: MUT }}>Total Time</span>
            <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 600, color: 'var(--fg)' }}>{displayTotalSeconds > 0 ? formatDuration(displayTotalSeconds) : '—'}</span>
          </div>
        </div>

        {/* desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table style={{ ...tbl, minWidth: 640 }}>
            <thead>
              <tr style={thead}>
                {isOn && <Th w={36} />}<Th>Product</Th><Th w={80} right>Quantity</Th>
                <Th w={50}>Unit</Th><Th w={160}>Tool / Setting</Th>
                <Th w={70} right>Time</Th><Th>Instruction</Th>
              </tr>
            </thead>
            {groups.map((group, gi) => {
              const colSpan = isOn ? 7 : 6;
              return (
                <React.Fragment key={group.label || gi}>
                  <tbody>
                    {(group.label || groups.length > 1) && (
                      <tr>
                        <td colSpan={colSpan} style={{ padding: '7px 14px', background: 'var(--surface-hover)', borderTop: gi === 0 ? B : `2px solid var(--border)`, borderBottom: B, fontFamily: MONO, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--fg)', fontWeight: 600 }}>
                          <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span>{group.label || `Group ${gi + 1}`}</span>
                            {timing.groupSeconds[group.label] > 0 && (
                              <span style={{ fontWeight: 400, color: MUT, textTransform: 'none', letterSpacing: 0 }}>{formatDuration(timing.groupSeconds[group.label])}</span>
                            )}
                          </span>
                        </td>
                      </tr>
                    )}
                    {group.steps.map(step => {
                      const gIdx = step.globalIndex;
                      const done = stepChecked(gIdx);
                      const stepIngs = stepIngMap[step.id] ?? [];
                      const rowCount = Math.max(1, stepIngs.length);

                      return stepIngs.length === 0 ? (
                        <tr key={step.id} style={{ borderTop: B, opacity: done ? 0.4 : 1, background: done ? 'var(--surface-hover)' : undefined, verticalAlign: 'middle' }}>
                          {isOn && <td style={{ ...td, borderRight: B, textAlign: 'center', verticalAlign: 'middle' }}><Checkbox checked={done} onChange={() => interactive!.stepChecks.toggle(gIdx)} /></td>}
                          <td style={{ ...td, borderRight: B, color: MUT, fontFamily: MONO, fontSize: 10 }}>—</td>
                          <td style={{ ...td, borderRight: B, textAlign: 'right', fontFamily: MONO, color: MUT }}>—</td>
                          <td style={{ ...td, borderRight: B, fontFamily: MONO, fontSize: 11, color: MUT }}>—</td>
                          <td style={{ ...td, borderRight: B, fontSize: 11 }}><ToolCell settings={step.applianceSettings} onOpenTool={setOpenToolSlug} /></td>
                          <td style={{ ...td, borderRight: B, textAlign: 'right', fontFamily: MONO, fontSize: 11, fontVariantNumeric: 'tabular-nums', color: step.durationSeconds ? 'var(--fg)' : MUT }}>{step.durationSeconds ? formatDuration(step.durationSeconds) : '—'}</td>
                          <td style={{ ...td, lineHeight: 1.55 }}><StepLine taskName={step.taskName} template={step.taskTemplate} singleTool={step.taskSingleTool} ingredientName={stepIngs[0]?.name} toolName={(step.applianceSettings as any)?.stepTools?.[0]?.name} instruction={step.instruction} notes={step.notes} taskId={step.taskId} onOpenTask={setOpenTaskId} intermediates={step.consumedIntermediates} /></td>
                        </tr>
                      ) : (
                        stepIngs.map((ing: RecipeIngredientRef, rowIdx: number) => (
                          <tr key={`${step.id}-${rowIdx}`} style={{ borderTop: rowIdx === 0 ? B : `1px dashed var(--border)`, opacity: done ? 0.4 : 1, background: done ? 'var(--surface-hover)' : undefined, verticalAlign: 'middle' }}>
                            {isOn && rowIdx === 0 && <td rowSpan={rowCount} style={{ ...td, borderRight: B, textAlign: 'center', verticalAlign: 'middle' }}><Checkbox checked={done} onChange={() => interactive!.stepChecks.toggle(gIdx)} /></td>}
                            <td style={{ ...td, borderRight: B, fontWeight: 500 }}>
                              {linkIngredients && ing.ingredientSlug
                                ? <a href={`/ingredients/${ing.ingredientSlug}`} style={{ color: 'var(--fg)', textDecoration: 'none' }} className="hover:text-[var(--accent)] transition-colors">{capitalizeLabel(ing.name)}</a>
                                : <span style={{ color: 'var(--fg)' }}>{capitalizeLabel(ing.name)}</span>}
                            </td>
                            <td style={{ ...td, borderRight: B, textAlign: 'right', fontFamily: MONO, fontVariantNumeric: 'tabular-nums' }}>{fmtAmount(ing.quantity.value, ing.quantity.unit).qty}</td>
                            <td style={{ ...td, borderRight: B, fontFamily: MONO, fontSize: 11, color: MUT }}>{fmtAmount(ing.quantity.value, ing.quantity.unit).unit}</td>
                            {rowIdx === 0 && <td rowSpan={rowCount} style={{ ...td, borderRight: B, fontSize: 11, verticalAlign: 'middle' }}><ToolCell settings={step.applianceSettings} onOpenTool={setOpenToolSlug} /></td>}
                            {rowIdx === 0 && <td rowSpan={rowCount} style={{ ...td, borderRight: B, textAlign: 'right', fontFamily: MONO, fontSize: 11, fontVariantNumeric: 'tabular-nums', color: step.durationSeconds ? 'var(--fg)' : MUT, verticalAlign: 'middle' }}>{step.durationSeconds ? formatDuration(step.durationSeconds) : '—'}</td>}
                            {rowIdx === 0 && <td rowSpan={rowCount} style={{ ...td, lineHeight: 1.55, verticalAlign: 'middle' }}><StepLine taskName={step.taskName} template={step.taskTemplate} singleTool={step.taskSingleTool} ingredientName={stepIngs[0]?.name} toolName={(step.applianceSettings as any)?.stepTools?.[0]?.name} instruction={step.instruction} notes={step.notes} taskId={step.taskId} onOpenTask={setOpenTaskId} intermediates={step.consumedIntermediates} /></td>}
                          </tr>
                        ))
                      );
                    })}
                  </tbody>
                </React.Fragment>
              );
            })}
            <tfoot>
              <tr style={{ borderTop: `2px solid var(--border)`, background: 'var(--surface-hover)' }}>
                <td colSpan={isOn ? 6 : 5} style={{ ...td, fontFamily: MONO, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.15em', color: MUT }}>Total Time</td>
                <td style={{ ...td, textAlign: 'right', fontFamily: MONO, fontWeight: 600, color: 'var(--fg)' }}>{displayTotalSeconds > 0 ? formatDuration(displayTotalSeconds) : '—'}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {openTaskId && (
        <TaskDetailModal taskId={openTaskId} locale={locale} onClose={() => setOpenTaskId(null)} />
      )}
      {openToolSlug && (
        <ToolDetailModal slug={openToolSlug} onClose={() => setOpenToolSlug(null)} />
      )}
    </div>
  );
}
