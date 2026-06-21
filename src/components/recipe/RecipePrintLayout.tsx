// src/components/recipe/RecipePrintLayout.tsx
// A DEDICATED, print-only cookbook layout for a dish recipe — NOT the web DOM with
// chrome hidden, but a purpose-built page designed for paper (the "editorial +
// technical" look from the spec; think Modernist Cuisine at Home).
//
// Rendered alongside the normal web view but shown ONLY when printing (the wrapper
// carries .print-only; the web view carries .screen-only — see globals.css). This
// keeps the screen experience untouched while giving print a real design.
//
// Design choices that solve the cookbook brief:
//   • Header: title + one-line description + a compact ICON OVERVIEW strip
//     (yield · total · active · difficulty · cuisine) instead of a boxy table.
//   • Body: two columns — ingredients as a clean list (left), method as numbered
//     FLOWING BLOCKS grouped by section (right). NO tables → no fragmented rows.
//   • Every step block is break-inside:avoid → a step never splits across a page.
//   • Footer: small Soupdog dog+wordmark, centred (running foot).
//   • QR at the END (modest) — scanning back to the site isn't the main use.
//
// Built as a reusable primitive: technique/ingredient pages and multi-recipe
// booklets can reuse the same header/column/footer pieces later.

'use client';

import { QRCodeSVG } from 'qrcode.react';
import { formatDuration } from '@/lib/utils';
import { APPLIANCES } from '@/lib/appliances';
import type { Recipe, RecipeStep } from '@/types';

const SERIF = { fontFamily: "var(--font-serif, 'IBM Plex Serif', Georgia, serif)" } as const;
const SANS = { fontFamily: "var(--font-body, 'IBM Plex Sans', system-ui, sans-serif)" } as const;
const MONO = { fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)" } as const;

// Tiny inline icons (stroke, currentColor) for the overview strip — kept local so
// print doesn't depend on the screen icon set.
function Icon({ d, size = 13 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      {d.split('|').map((p, i) => <path key={i} d={p} />)}
    </svg>
  );
}
const ICONS = {
  yield: 'M3 11h18|M3 11a9 9 0 0 1 18 0|M12 4v-1|M6 20h12',     // pot/serving
  total: 'M12 7v5l3 2|M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',    // clock
  active: 'M13 2 3 14h7l-1 8 10-12h-7l1-8z',                     // bolt (hands-on)
  difficulty: 'M12 2 2 7l10 5 10-5-10-5z|M2 17l10 5 10-5|M2 12l10 5 10-5', // layers
  cuisine: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z|M3 12h18|M12 3a15 15 0 0 1 0 18|M12 3a15 15 0 0 0 0 18', // globe
};

function OverviewItem({ icon, label, value }: { icon: keyof typeof ICONS; label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: '#222' }}>
      <span style={{ color: '#7a8a7f' }}><Icon d={ICONS[icon]} /></span>
      <span style={{ ...MONO, fontSize: 8.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#999' }}>{label}</span>
      <span style={{ ...SANS, fontSize: 11.5, color: '#111', fontWeight: 500 }}>{value}</span>
    </div>
  );
}

// Quantity units that are QUALIFIERS, not measures (mirrors RecipeDisplay): the phrase
// IS the amount, value 0. Show the qualifier, not "0 g".
const QUALIFIER_UNITS = new Set(['to taste', 'as needed', 'to serve', 'for garnish', 'for serving']);

function fmtQty(value: number | null | undefined, unit: string | null | undefined): string {
  const u = (unit ?? '').trim();
  if (QUALIFIER_UNITS.has(u.toLowerCase())) return u;        // "to taste"
  if (value == null || value === 0) return '';                // no honest amount → show nothing
  const n = Number.isInteger(value) ? value : Math.round(value * 100) / 100;
  return u ? `${n} ${u}` : `${n}`;
}

// A prep qualifier is REDUNDANT when every word already appears in the ingredient name
// (mirrors RecipeDisplay — keep identical). "ripe tomatoes" + "ripe" → suppress.
function prepIsRedundant(name: string | undefined | null, prep: string | undefined | null): boolean {
  const p = (prep ?? '').trim().toLowerCase();
  if (!p) return false;
  const nameWords = new Set((name ?? '').toLowerCase().split(/[\s,]+/).filter(Boolean));
  const prepWords = p.split(/[\s,]+/).filter(Boolean);
  return prepWords.length > 0 && prepWords.every(w => nameWords.has(w));
}
function displayPrep(name: string | undefined | null, prep: string | undefined | null): string {
  return prepIsRedundant(name, prep) ? '' : (prep ?? '').trim();
}

// Temperature unit → short symbol ("celsius" → "C", "fahrenheit" → "F").
function fmtTemp(t?: { value: number; unit: string }): string | null {
  if (!t || t.value == null) return null;
  const u = (t.unit || '').toLowerCase();
  const sym = u.startsWith('c') ? 'C' : u.startsWith('f') ? 'F' : (t.unit || '');
  return `${t.value}°${sym}`;
}

// Tool/appliance names used in a step. Mirrors the web ToolCell data model:
// tools live in applianceSettings — an appliance (applianceId → APPLIANCES name)
// and/or a stepTools[] array of { name }. (step.tools is not populated by the
// page mapper, which is why the print Tools list was empty before.)
// Tool names are stored as slugs ("frying-pan"). Humanize for display: hyphens →
// spaces, lowercase kept (mirrors RecipeDisplay.humanizeTool — keep them identical).
function humanizeTool(name: string | undefined | null): string {
  return (name ?? '').replace(/-/g, ' ').trim();
}

function stepToolNames(step: RecipeStep): string[] {
  const out: string[] = [];
  const s = (step as { applianceSettings?: {
    applianceId?: string;
    stepTools?: { name?: string }[];
  } }).applianceSettings;
  if (s?.applianceId) {
    const appliance = APPLIANCES.find((a: { id: string; model?: string; name?: string }) => a.id === s.applianceId);
    const name = appliance?.name ?? appliance?.model;
    if (name) out.push(humanizeTool(name));
  }
  (s?.stepTools ?? []).forEach(t => { if (t?.name) out.push(humanizeTool(t.name)); });
  // Fallback to step.tools if it ever gets populated.
  (step.tools ?? []).forEach(t => { if (t) out.push(humanizeTool(t)); });
  return out;
}

// Compose the step line from the curated task template (mirrors the web RecipeDisplay
// composeStepLine): fill [ingredient]/[tool] from the step, [tool] only when single_tool
// + a tool is present; strip an unfillable [tool] with its preposition. Falls back to the
// curated task name, then the stored instruction. Keeps print identical to the web view.
// Layer 2 (mirrors RecipeDisplay): join consumed-intermediate names into a readable,
// "the"-prefixed phrase. ["softened onion","tomato sauce"] → "the softened onion and
// tomato sauce". Keeps print identical to the web view.
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
  taskName: string | undefined, template: string | undefined, singleTool: boolean,
  ingredientName: string | undefined, toolName: string | undefined, instruction: string,
  intermediates?: string[],
): string {
  const intermediatePhrase = (!ingredientName && intermediates && intermediates.length)
    ? joinIntermediates(intermediates)
    : '';
  const fill = ingredientName || intermediatePhrase || '';

  const tmpl = (template ?? '').trim();
  if (tmpl) {
    let out = tmpl;
    if (fill) out = out.replace(/\[ingredient\]/gi, fill);
    else out = out.replace(/\s*\[ingredient\]/gi, '');
    if (singleTool && toolName) out = out.replace(/\[tool\]/gi, humanizeTool(toolName));
    else out = out.replace(/\s*(?:to|in|on|into|with)?\s*(?:the\s+)?\[tool\]/gi, '');
    out = out.replace(/\s{2,}/g, ' ').trim();
    if (out) return out;
  }
  const verb = (taskName ?? '').trim();
  if (verb && intermediatePhrase) return `${verb} ${intermediatePhrase}`;
  return verb || instruction;
}

// Group steps by their section label (same logic as the web view).
function groupSteps(steps: RecipeStep[]) {
  const groups: { label: string; steps: (RecipeStep & { idx: number })[] }[] = [];
  let n = 0;
  for (const s of steps) {
    const label = s.group?.trim() || '';
    let g = groups.find(g => g.label === label);
    if (!g) { g = { label, steps: [] }; groups.push(g); }
    n += 1;
    g.steps.push({ ...s, idx: n });
  }
  return groups;
}

export function RecipePrintLayout({ recipe, url }: { recipe: Recipe; url?: string }) {
  // Map step → its ingredients via each ingredient's stepId (same as the web
  // RecipeDisplay). The mapper links ingredients to steps this way, NOT via a
  // step.ingredients id-array — so building from s.ingredients would come up empty.
  const ingsByStepId = new Map<string, Recipe['ingredients']>();
  for (const ing of recipe.ingredients) {
    const sid = (ing as { stepId?: string }).stepId;
    if (!sid) continue;
    const arr = ingsByStepId.get(sid) ?? [];
    arr.push(ing);
    ingsByStepId.set(sid, arr);
  }
  const groups = groupSteps(recipe.steps);
  const showGroupTitles = groups.length > 1 || (groups[0]?.label ?? '') !== '';

  // Unique tools across all steps (mise-en-place list). Combine the recipe's
  // equipment list with per-step tools/appliances. Dedupe case-insensitively,
  // preserve first-seen order.
  const tools: string[] = (() => {
    const seen = new Set<string>();
    const out: string[] = [];
    const add = (t?: string) => {
      const name = humanizeTool(t);
      if (!name) return;
      const key = name.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key); out.push(name);
    };
    (recipe.equipment ?? []).forEach(e => add((e as { name?: string }).name));
    recipe.steps.forEach(s => stepToolNames(s).forEach(add));
    return out;
  })();

  return (
    <div className="print-only recipe-print" style={{ ...SANS, color: '#111', background: '#fff' }}>
      {/* ── Header ─────────────────────────────────────────────── */}
      <div style={{ borderBottom: '2px solid #1a1a1a', paddingBottom: 12, marginBottom: 16 }}>
        <div style={{ ...MONO, fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: '#7a8a7f', marginBottom: 6 }}>
          {recipe.cuisine ? `${recipe.cuisine} · Recipe` : 'Recipe'}
        </div>
        <h1 style={{ ...SERIF, fontSize: 30, lineHeight: 1.1, color: '#111', margin: 0, fontWeight: 400 }}>
          {recipe.title}
        </h1>
        {recipe.description ? (
          <p style={{ ...SERIF, fontStyle: 'italic', fontSize: 12.5, color: '#555', margin: '8px 0 0', maxWidth: '46em', lineHeight: 1.5 }}>
            {recipe.description}
          </p>
        ) : null}

        {/* Icon overview strip */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 22px', marginTop: 12 }}>
          <OverviewItem icon="yield" label="Serves" value={`${recipe.servings}`} />
          <OverviewItem icon="total" label="Total" value={formatDuration(recipe.totalTimeSeconds)} />
          {recipe.activeTimeSeconds ? <OverviewItem icon="active" label="Active" value={formatDuration(recipe.activeTimeSeconds)} /> : null}
          <OverviewItem icon="difficulty" label="Level" value={recipe.difficulty} />
        </div>
      </div>

      {/* ── Body: single column (read the lists first, then cook) ── */}
      <div className="recipe-print-body">
        {/* Ingredients */}
        <div>
          <h2 style={{ ...MONO, fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#7a8a7f', marginBottom: 8, breakAfter: 'avoid' }}>
            Ingredients
          </h2>
          <ul className="recipe-print-twocol-list" style={{ listStyle: 'none', margin: '0 0 18px', padding: 0 }}>
            {recipe.ingredients.map((ing) => (
              <li key={ing.ingredientId} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '5px 0', borderBottom: '1px solid #eee', breakInside: 'avoid' }}>
                <span style={{ ...SANS, fontSize: 11.5, color: '#111' }}>
                  {ing.name}{ing.optional ? <span style={{ color: '#999', fontStyle: 'italic' }}> (optional)</span> : null}
                  {displayPrep(ing.name, ing.prep) ? <span style={{ color: '#888' }}>, {displayPrep(ing.name, ing.prep)}</span> : null}
                </span>
                <span style={{ ...MONO, fontSize: 10.5, color: '#444', whiteSpace: 'nowrap' }}>
                  {fmtQty(ing.quantity.value, ing.quantity.unit)}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Tools / equipment — mise-en-place: get everything out before cooking. */}
        {tools.length > 0 ? (
          <div style={{ breakInside: 'avoid', marginBottom: 18 }}>
            <h2 style={{ ...MONO, fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#7a8a7f', marginBottom: 8, breakAfter: 'avoid' }}>
              Tools
            </h2>
            <div style={{ ...SANS, fontSize: 11.5, color: '#222', lineHeight: 1.7 }}>
              {tools.join('  ·  ')}
            </div>
          </div>
        ) : null}

        {/* Method as flowing numbered blocks */}
        <div className="recipe-print-method">
          <h2 style={{ ...MONO, fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#7a8a7f', marginBottom: 8, breakAfter: 'avoid' }}>
            Method
          </h2>
          {groups.map((g, gi) => (
            <section key={gi} style={{ marginBottom: 10 }}>
              {showGroupTitles && (
                <h3 style={{ ...SERIF, fontSize: 14, color: '#2e4638', margin: '8px 0 6px', breakAfter: 'avoid' }}>
                  {g.label || `Part ${gi + 1}`}
                </h3>
              )}
              {g.steps.map((s) => {
                const stepIngs = (ingsByStepId.get(s.id) ?? []) as Recipe['ingredients'];
                const meta = [
                  fmtTemp(s.temperature),
                  s.durationSeconds ? formatDuration(s.durationSeconds) : null,
                  (() => { const t = stepToolNames(s); return t.length ? t.join(', ') : null; })(),
                ].filter(Boolean);
                return (
                  <div key={s.id} style={{ display: 'flex', gap: 10, padding: '7px 0', breakInside: 'avoid' }}>
                    <span style={{ ...MONO, fontSize: 12, color: '#b08a3e', fontWeight: 500, flexShrink: 0, width: 18, textAlign: 'right' }}>{s.idx}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ ...SANS, fontSize: 12, lineHeight: 1.55, color: '#111' }}>{composeStepLine((s as any).taskName, (s as any).taskTemplate, !!(s as any).taskSingleTool, stepIngs[0]?.name, stepToolNames(s)[0], s.instruction, (s as any).consumedIntermediates)}</div>
                      {(meta.length > 0 || stepIngs.length > 0) && (
                        <div style={{ ...MONO, fontSize: 9, color: '#999', marginTop: 3, display: 'flex', flexWrap: 'wrap', gap: '2px 12px' }}>
                          {meta.map((m, i) => <span key={`m${i}`}>{m}</span>)}
                          {stepIngs.map((ing, i) => (
                            <span key={`i${i}`} style={{ color: '#888' }}>{ing.name}{(() => { const s = fmtQty(ing.quantity?.value, ing.quantity?.unit); return s ? ` · ${s}` : ''; })()}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </section>
          ))}
        </div>
      </div>

      {/* ── Nutrition (compact) ────────────────────────────────── */}
      {recipe.nutrition && (recipe.nutrition.calories ?? 0) > 0 ? (
        <section style={{ marginTop: 16, paddingTop: 10, borderTop: '1px solid #ddd', breakInside: 'avoid' }}>
          <h2 style={{ ...MONO, fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#7a8a7f', marginBottom: 6 }}>
            Nutrition <span style={{ color: '#bbb', textTransform: 'none', letterSpacing: 0 }}>· per serving</span>
          </h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 20px', ...SANS, fontSize: 11, color: '#333' }}>
            {([
              ['Calories', recipe.nutrition.calories != null ? `${Math.round(recipe.nutrition.calories)} kcal` : null],
              ['Protein', recipe.nutrition.protein != null ? `${recipe.nutrition.protein} g` : null],
              ['Fat', recipe.nutrition.fat != null ? `${recipe.nutrition.fat} g` : null],
              ['Carbs', recipe.nutrition.carbohydrates != null ? `${recipe.nutrition.carbohydrates} g` : null],
            ] as [string, string | null][]).filter(([, v]) => v).map(([k, v]) => (
              <span key={k}><span style={{ color: '#999' }}>{k}</span> {v}</span>
            ))}
          </div>
        </section>
      ) : null}

      {/* ── Footer: centred Soupdog logo + QR (scan to open online) ──
         NOTE: this is an in-flow content footer at the END of the recipe. The
         URL + date strip the browser prints at the very bottom of each page is
         the BROWSER'S own header/footer (not ours) — it can't be removed via CSS;
         users untick "Headers and footers" in the print dialog to hide it. */}
      <div style={{ marginTop: 26, paddingTop: 14, borderTop: '1px solid #1a1a1a', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/wordmark.svg" alt="Soupdog" style={{ height: 20, width: 'auto', opacity: 0.9 }} />
        {url ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
            <QRCodeSVG value={url} size={56} level="M" includeMargin={false} />
            <span style={{ ...MONO, fontSize: 8, letterSpacing: '0.14em', color: '#aaa' }}>SCAN TO OPEN ONLINE</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
