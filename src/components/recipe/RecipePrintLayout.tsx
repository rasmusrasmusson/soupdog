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

function fmtQty(value: number, unit: string): string {
  if (!value && value !== 0) return '';
  const n = Number.isInteger(value) ? value : Math.round(value * 100) / 100;
  return unit ? `${n} ${unit}` : `${n}`;
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
  const ingById = new Map(recipe.ingredients.map(i => [i.ingredientId, i]));
  const groups = groupSteps(recipe.steps);
  const showGroupTitles = groups.length > 1 || (groups[0]?.label ?? '') !== '';

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

      {/* ── Body: two columns ──────────────────────────────────── */}
      <div className="recipe-print-cols">
        {/* Left: ingredients */}
        <div className="recipe-print-ingredients">
          <h2 style={{ ...MONO, fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#7a8a7f', marginBottom: 8, breakAfter: 'avoid' }}>
            Ingredients
          </h2>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {recipe.ingredients.map((ing) => (
              <li key={ing.ingredientId} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '5px 0', borderBottom: '1px solid #eee', breakInside: 'avoid' }}>
                <span style={{ ...SANS, fontSize: 11.5, color: '#111' }}>
                  {ing.name}{ing.optional ? <span style={{ color: '#999', fontStyle: 'italic' }}> (optional)</span> : null}
                  {ing.prep ? <span style={{ color: '#888' }}>, {ing.prep}</span> : null}
                </span>
                <span style={{ ...MONO, fontSize: 10.5, color: '#444', whiteSpace: 'nowrap' }}>
                  {fmtQty(ing.quantity.value, ing.quantity.unit)}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Right: method as flowing numbered blocks */}
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
                const stepIngs = (s.ingredients ?? [])
                  .map(id => ingById.get(id)).filter(Boolean) as Recipe['ingredients'];
                const meta = [
                  s.temperature ? `${s.temperature.value}°${s.temperature.unit || 'C'}` : null,
                  s.durationSeconds ? formatDuration(s.durationSeconds) : null,
                  (s.tools && s.tools.length) ? s.tools.join(', ') : null,
                ].filter(Boolean);
                return (
                  <div key={s.id} style={{ display: 'flex', gap: 10, padding: '7px 0', breakInside: 'avoid' }}>
                    <span style={{ ...MONO, fontSize: 12, color: '#b08a3e', fontWeight: 500, flexShrink: 0, width: 18, textAlign: 'right' }}>{s.idx}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ ...SANS, fontSize: 12, lineHeight: 1.55, color: '#111' }}>{s.instruction}</div>
                      {(meta.length > 0 || stepIngs.length > 0) && (
                        <div style={{ ...MONO, fontSize: 9, color: '#999', marginTop: 3, display: 'flex', flexWrap: 'wrap', gap: '2px 12px' }}>
                          {meta.map((m, i) => <span key={`m${i}`}>{m}</span>)}
                          {stepIngs.map((ing, i) => (
                            <span key={`i${i}`} style={{ color: '#888' }}>{ing.name}{ing.quantity?.value ? ` · ${fmtQty(ing.quantity.value, ing.quantity.unit)}` : ''}</span>
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

      {/* ── Tail: QR (modest, at the end) + footer logo ────────── */}
      <div style={{ marginTop: 22, paddingTop: 12, borderTop: '1px solid #1a1a1a', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/wordmark.svg" alt="Soupdog" style={{ height: 18, width: 'auto', opacity: 0.85 }} />
        {url ? (
          <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ ...MONO, fontSize: 8, letterSpacing: '0.1em', color: '#aaa', maxWidth: 90, textAlign: 'right' }}>SCAN TO OPEN ONLINE</span>
            <QRCodeSVG value={url} size={48} level="M" includeMargin={false} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
