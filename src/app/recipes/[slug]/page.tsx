'use client';
import React, { useState, use } from 'react';
import { sampleRecipes } from '@/data/sample-recipes';
import { formatDuration } from '@/lib/utils';
import { Bookmark, Printer } from 'lucide-react';
import type { RecipeStep, RecipeIngredientRef } from '@/types';

function useChecklist(count: number) {
  const [checked, setChecked] = useState<boolean[]>(Array(count).fill(false));
  const toggle = (i: number) => setChecked(p => p.map((v, idx) => idx === i ? !v : v));
  return { checked, toggle };
}

export default function RecipePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const recipe = sampleRecipes.find(r => r.slug === slug);

  const ingChecks  = useChecklist(recipe?.ingredients.length ?? 0);
  const stepChecks = useChecklist(recipe?.steps.length ?? 0);
  const [servings, setServings] = useState(recipe?.servings ?? 4);


  if (!recipe) return <div className="p-8 text-[var(--muted)] font-mono text-[12px]">Recipe not found.</div>;

  // Build ingredient lookup map for step rows
  const ingMap = Object.fromEntries(recipe.ingredients.map(i => [i.ingredientId, i]));

  // Group steps
  const groups: { label: string; steps: (RecipeStep & { globalIndex: number })[] }[] = [];
  recipe.steps.forEach((step, i) => {
    const label = step.group ?? 'General';
    let g = groups.find(g => g.label === label);
    if (!g) { g = { label, steps: [] }; groups.push(g); }
    g.steps.push({ ...step, globalIndex: i });
  });

  return (
    <div className="flex h-full">
      <div className="flex-1 min-w-0 overflow-y-auto">

        {/* ── Title + meta ── */}
        <div className="px-8 pt-6 pb-5 border-b border-[var(--border)]">
          <div className="flex items-start justify-between gap-4 mb-4">
            <h1 className="font-display text-[28px] font-normal leading-tight text-[var(--fg)]">{recipe.title}</h1>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Btn icon={<Bookmark size={11} strokeWidth={1.5} />} label="Bookmark" />
              <Btn icon={<Printer size={11} strokeWidth={1.5} />} label="Print" />
            </div>
          </div>

          {/* Meta strip */}
          <div className="border border-[var(--border)] grid grid-cols-7 text-[11px]">
            {([
              ['RECIPE ID',   recipe.id.toUpperCase()],
              ['YIELD',       `${servings} servings`],
              ['TOTAL TIME',  formatDuration(recipe.totalTimeSeconds)],
              ['ACTIVE TIME', recipe.activeTimeSeconds ? formatDuration(recipe.activeTimeSeconds) : '—'],
              ['DIFFICULTY',  recipe.difficulty],
              ['RATING',      recipe.ratings ? `${recipe.ratings.average.toFixed(1)} / 5` : '—'],
              ['CUISINE',     recipe.cuisine ?? '—'],
            ] as [string,string][]).map(([label, value], i) => (
              <div key={label} className={i < 6 ? 'border-r border-[var(--border)]' : ''}>
                <div className="px-3 py-1.5 bg-[var(--surface-hover)] border-b border-[var(--border)]">
                  <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--muted)]">{label}</span>
                </div>
                <div className="px-3 py-2 font-mono text-[11px] text-[var(--fg)]">{value}</div>
              </div>
            ))}
          </div>

          {recipe.description && (
            <p className="mt-3 text-[12px] text-[var(--muted)] leading-relaxed max-w-2xl">{recipe.description}</p>
          )}
        </div>

        <div className="px-8 py-6 space-y-8">

          {/* ── INGREDIENTS ── */}
          <section>
            <SectionHeader title="Ingredients" meta={`${recipe.ingredients.length} items · ${servings} servings`} />
            <table style={tbl}>
              <thead>
                <tr style={thead}>
                  <Th w={36} />
                  <Th w={32}>#</Th>
                  <Th>Product</Th>
                  <Th w={100} right>Mass</Th>
                  <Th w={100} right>Volume</Th>
                  <Th>Prep / Notes</Th>
                  <Th w={90} center>State</Th>
                </tr>
              </thead>
              <tbody>
                {recipe.ingredients.map((ing, i) => (
                  <tr key={ing.ingredientId} style={{ borderTop: B, opacity: ingChecks.checked[i] ? 0.4 : 1, background: ingChecks.checked[i] ? 'var(--surface-hover)' : undefined }}>
                    <td style={{ ...td, borderRight: B, textAlign: 'center', verticalAlign: 'middle' }}>
                      <Checkbox checked={ingChecks.checked[i]} onChange={() => ingChecks.toggle(i)} />
                    </td>
                    <td style={{ ...td, borderRight: B, fontFamily: MONO, fontSize: 10, color: MUT, textAlign: 'center' }}>{i + 1}</td>
                    <td style={{ ...td, borderRight: B, fontWeight: 500 }}>
                      <a href={`/ingredients/${ing.ingredientSlug}`} style={{ color: 'var(--fg)', textDecoration: 'none' }}
                        className="hover:text-[var(--accent)] transition-colors">{ing.name}</a>
                      {ing.optional && <span style={{ marginLeft: 8, fontSize: 10, color: MUT, fontFamily: MONO }}>(opt)</span>}
                    </td>
                    <td style={{ ...td, borderRight: B, textAlign: 'right', fontFamily: MONO, fontVariantNumeric: 'tabular-nums' }}>
                      {ing.quantity.value}{ing.quantity.unit}
                    </td>
                    <td style={{ ...td, borderRight: B, textAlign: 'right', fontFamily: MONO, color: MUT }}>—</td>
                    <td style={{ ...td, borderRight: B, color: MUT }}>{ing.prep ?? '—'}</td>
                    <td style={{ ...td, textAlign: 'center', fontFamily: MONO, fontSize: 9, textTransform: 'uppercase', color: MUT }}>{ing.state ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {/* ── EQUIPMENT ── */}
          {recipe.equipment && recipe.equipment.length > 0 && (
            <section>
              <SectionHeader title="Equipment" />
              <table style={tbl}>
                <thead>
                  <tr style={thead}>
                    <Th>Tool</Th>
                    <Th w={90} center>Required</Th>
                    <Th>Alternatives</Th>
                  </tr>
                </thead>
                <tbody>
                  {recipe.equipment.map(eq => (
                    <tr key={eq.equipmentId} style={{ borderTop: B }}>
                      <td style={{ ...td, borderRight: B, fontWeight: 500 }}>{eq.name}</td>
                      <td style={{ ...td, borderRight: B, textAlign: 'center', fontFamily: MONO, fontSize: 10, color: MUT }}>{eq.required ? '✓' : '—'}</td>
                      <td style={{ ...td, color: MUT }}>{eq.alternatives?.join(', ') ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {/* ── PROCEDURE — grouped, Modernist columns ── */}
          <section>
            <SectionHeader title="Procedure" meta={`${recipe.steps.length} steps`} />
            <table style={tbl}>
              <thead>
                <tr style={thead}>
                  <Th w={36} />
                  <Th>Product</Th>
                  <Th w={90} right>Mass</Th>
                  <Th w={80} right>Volume</Th>
                  <Th w={140}>Tool</Th>
                  <Th w={100}>Setting</Th>
                  <Th w={80} right>Time</Th>
                  <Th>Instruction</Th>
                </tr>
              </thead>

              {groups.map((group, gi) => (
                <React.Fragment key={group.label}>
                  {/* Group header row */}
                  <tbody>
                    <tr>
                      <td colSpan={8} style={{
                        padding: '7px 14px',
                        background: 'var(--surface-hover)',
                        borderTop: gi === 0 ? B : `2px solid var(--border)`,
                        borderBottom: B,
                        fontFamily: MONO,
                        fontSize: 10,
                        textTransform: 'uppercase',
                        letterSpacing: '0.15em',
                        color: 'var(--fg)',
                        fontWeight: 600,
                      }}>
                        {group.label}
                      </td>
                    </tr>

                    {group.steps.map(step => {
                      const gi = step.globalIndex;
                      const done = stepChecks.checked[gi];
                      // Collect ingredients used in this step
                      const stepIngs = (step.ingredients ?? []).map(id => ingMap[id]).filter(Boolean);
                      const rowCount = Math.max(1, stepIngs.length);

                      return stepIngs.length === 0 ? (
                        // No ingredients — single row
                        <tr key={step.id} style={{ borderTop: B, opacity: done ? 0.4 : 1, background: done ? 'var(--surface-hover)' : undefined, verticalAlign: 'middle' }}>
                          <td style={{ ...td, borderRight: B, textAlign: 'center', verticalAlign: 'middle' }}>
                            <Checkbox checked={done} onChange={() => stepChecks.toggle(gi)} />
                          </td>
                          <td style={{ ...td, borderRight: B, color: MUT, fontFamily: MONO, fontSize: 10 }}>—</td>
                          <td style={{ ...td, borderRight: B, textAlign: 'right', fontFamily: MONO, color: MUT }}>—</td>
                          <td style={{ ...td, borderRight: B, textAlign: 'right', fontFamily: MONO, color: MUT }}>—</td>
                          <td style={{ ...td, borderRight: B, color: MUT, fontSize: 11 }}>{step.tools?.join(', ') || '—'}</td>
                          <td style={{ ...td, borderRight: B, fontFamily: MONO, fontSize: 11, color: step.temperature ? 'var(--fg)' : MUT }}>
                            {step.temperature ? `${step.temperature.value}°${step.temperature.unit === 'celsius' ? 'C' : 'F'}` : '—'}
                          </td>
                          <td style={{ ...td, borderRight: B, textAlign: 'right', fontFamily: MONO, fontSize: 11, color: step.durationSeconds ? 'var(--fg)' : MUT, fontVariantNumeric: 'tabular-nums' }}>
                            {step.durationSeconds ? formatDuration(step.durationSeconds) : '—'}
                          </td>
                          <td style={{ ...td, lineHeight: 1.55 }}>{step.instruction}</td>
                        </tr>
                      ) : (
                        // One row per ingredient used, instruction spans all rows
                        stepIngs.map((ing, rowIdx) => (
                          <tr key={`${step.id}-${rowIdx}`} style={{ borderTop: rowIdx === 0 ? B : `1px dashed var(--border)`, opacity: done ? 0.4 : 1, background: done ? 'var(--surface-hover)' : undefined, verticalAlign: 'middle' }}>
                            {/* Checkbox only on first row */}
                            {rowIdx === 0 && (
                              <td rowSpan={rowCount} style={{ ...td, borderRight: B, textAlign: 'center', verticalAlign: 'middle' }}>
                                <Checkbox checked={done} onChange={() => stepChecks.toggle(gi)} />
                              </td>
                            )}
                            {/* Product */}
                            <td style={{ ...td, borderRight: B, fontWeight: 500 }}>
                              <a href={`/ingredients/${ing.ingredientSlug}`} style={{ color: 'var(--fg)', textDecoration: 'none' }}
                                className="hover:text-[var(--accent)] transition-colors">{ing.name}</a>
                            </td>
                            {/* Mass */}
                            <td style={{ ...td, borderRight: B, textAlign: 'right', fontFamily: MONO, fontVariantNumeric: 'tabular-nums' }}>
                              {ing.quantity.value}{ing.quantity.unit}
                            </td>
                            {/* Volume */}
                            <td style={{ ...td, borderRight: B, textAlign: 'right', fontFamily: MONO, color: MUT }}>—</td>
                            {/* Tool — only first row */}
                            {rowIdx === 0 ? (
                              <td rowSpan={rowCount} style={{ ...td, borderRight: B, color: MUT, fontSize: 11 }}>
                                {step.tools?.join(', ') || '—'}
                              </td>
                            ) : null}
                            {/* Setting — only first row */}
                            {rowIdx === 0 ? (
                              <td rowSpan={rowCount} style={{ ...td, borderRight: B, fontFamily: MONO, fontSize: 11, color: step.temperature ? 'var(--fg)' : MUT }}>
                                {step.temperature ? `${step.temperature.value}°${step.temperature.unit === 'celsius' ? 'C' : 'F'}` : '—'}
                              </td>
                            ) : null}
                            {/* Time — only first row */}
                            {rowIdx === 0 ? (
                              <td rowSpan={rowCount} style={{ ...td, borderRight: B, textAlign: 'right', fontFamily: MONO, fontSize: 11, color: step.durationSeconds ? 'var(--fg)' : MUT, fontVariantNumeric: 'tabular-nums' }}>
                                {step.durationSeconds ? formatDuration(step.durationSeconds) : '—'}
                              </td>
                            ) : null}
                            {/* Instruction — only first row */}
                            {rowIdx === 0 ? (
                              <td rowSpan={rowCount} style={{ ...td, lineHeight: 1.55 }}>
                                {step.instruction}
                              </td>
                            ) : null}
                          </tr>
                        ))
                      );
                    })}
                  </tbody>
                </React.Fragment>
              ))}

              <tfoot>
                <tr style={{ borderTop: `2px solid var(--border)`, background: 'var(--surface-hover)' }}>
                  <td colSpan={7} style={{ ...td, fontFamily: MONO, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.15em', color: MUT }}>Total Time</td>
                  <td style={{ ...td, textAlign: 'right', fontFamily: MONO, fontWeight: 600, color: 'var(--fg)' }}>{formatDuration(recipe.totalTimeSeconds)}</td>
                </tr>
              </tfoot>
            </table>
          </section>

          {/* ── NUTRITION ── */}
          {recipe.nutrition && (
            <section>
              <SectionHeader title="Nutrition" meta="per serving" />
              <table style={tbl}>
                <thead><tr style={thead}><Th>Nutrient</Th><Th w={140} right>Per serving</Th><Th w={140} right>Per 100g</Th></tr></thead>
                <tbody>
                  {([
                    ['Calories', recipe.nutrition.calories, 'kcal'],
                    ['Protein', recipe.nutrition.protein, 'g'],
                    ['Fat', recipe.nutrition.fat, 'g'],
                    ['Carbohydrates', recipe.nutrition.carbohydrates, 'g'],
                    ['Fiber', recipe.nutrition.fiber, 'g'],
                    ['Sodium', recipe.nutrition.sodium, 'mg'],
                  ] as [string, number|undefined, string][]).filter(([,v]) => v != null).map(([label, value, u]) => (
                    <tr key={label} style={{ borderTop: B }}>
                      <td style={{ ...td, borderRight: B }}>{label}</td>
                      <td style={{ ...td, borderRight: B, textAlign: 'right', fontFamily: MONO, fontVariantNumeric: 'tabular-nums' }}>
                        {value} <span style={{ color: MUT }}>{u}</span>
                      </td>
                      <td style={{ ...td, textAlign: 'right', fontFamily: MONO, color: MUT }}>—</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </div>
      </div>

      {/* ── Right panel ── */}
      <aside className="w-48 flex-shrink-0 border-l border-[var(--border)] sticky top-0 h-full overflow-y-auto bg-[var(--surface)] text-[12px]">

        {/* Progress */}
        <PanelSection title="Progress">
          <div className="space-y-2">
            <ProgressBar label="Ingredients" done={ingChecks.checked.filter(Boolean).length} total={recipe.ingredients.length} />
            <ProgressBar label="Steps" done={stepChecks.checked.filter(Boolean).length} total={recipe.steps.length} />
          </div>
        </PanelSection>

        {/* Servings */}
        <PanelSection title="Servings">
          <div className="flex items-center border border-[var(--border)]">
            <button onClick={() => setServings(s => Math.max(1, s-1))} className="w-8 h-8 font-mono text-[var(--muted)] hover:text-[var(--fg)] border-r border-[var(--border)] flex items-center justify-center hover:bg-[var(--surface-hover)] transition-colors">−</button>
            <span className="flex-1 text-center font-mono tabular-nums text-[13px]">{servings}</span>
            <button onClick={() => setServings(s => s+1)} className="w-8 h-8 font-mono text-[var(--muted)] hover:text-[var(--fg)] border-l border-[var(--border)] flex items-center justify-center hover:bg-[var(--surface-hover)] transition-colors">+</button>
          </div>
        </PanelSection>

        {/* Nutrition */}
        {recipe.nutrition && (
          <PanelSection title="Nutrition · per serving">
            <table className="w-full text-[11px]">
              <tbody>
                {([
                  ['Calories', recipe.nutrition.calories, 'kcal'],
                  ['Protein',  recipe.nutrition.protein,  'g'],
                  ['Fat',      recipe.nutrition.fat,      'g'],
                  ['Carbs',    recipe.nutrition.carbohydrates, 'g'],
                  ['Fiber',    recipe.nutrition.fiber,    'g'],
                  ['Sodium',   recipe.nutrition.sodium,   'mg'],
                ] as [string, number|undefined, string][]).filter(([,v]) => v != null).map(([label, value, u]) => (
                  <tr key={label} className="border-b border-[var(--border-subtle)] last:border-0">
                    <td className="py-1.5 text-[var(--muted)]">{label}</td>
                    <td className="py-1.5 text-right font-mono tabular-nums text-[var(--fg)]">
                      {value}<span className="text-[var(--muted)] ml-0.5">{u}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </PanelSection>
        )}

        {/* Recipe info */}
        <PanelSection title="Recipe Information">
          <table className="w-full text-[11px]">
            <tbody>
              {[
                ['Version', `v${recipe.version}`],
                ['Cuisine', recipe.cuisine ?? '—'],
                ['Difficulty', recipe.difficulty],
                ['Updated', new Date(recipe.updatedAt).toLocaleDateString('en-GB', {day:'numeric',month:'short',year:'numeric'})],
              ].map(([k,v]) => (
                <tr key={k} className="border-b border-[var(--border-subtle)] last:border-0">
                  <td className="py-1.5 text-[var(--muted)] font-mono text-[10px]">{k}</td>
                  <td className="py-1.5 text-[var(--fg)] text-right">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-[10px] text-[var(--muted)] leading-relaxed">
            Every change creates a new version.
          </p>
        </PanelSection>
      </aside>
    </div>
  );
}

// ── Style constants ───────────────────────────────────────────
const B   = '1px solid var(--border)';
const MONO = 'var(--font-mono)';
const MUT  = 'var(--muted)';
const tbl: React.CSSProperties = { borderCollapse: 'collapse', border: B, width: '100%', fontSize: 12 };
const thead: React.CSSProperties = { background: 'var(--surface-hover)' };
const td: React.CSSProperties = { padding: '9px 14px', color: 'var(--fg)' };

// ── Shared components ─────────────────────────────────────────
function Th({ children, w, right, center }: { children?: React.ReactNode; w?: number; right?: boolean; center?: boolean }) {
  return (
    <th style={{ padding: '8px 14px', fontFamily: MONO, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.18em', color: MUT, borderRight: B, textAlign: right ? 'right' : center ? 'center' : 'left', width: w, whiteSpace: 'nowrap' }}
      className="last:border-r-0">
      {children}
    </th>
  );
}

function Checkbox({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button onClick={onChange} role="checkbox" aria-checked={checked}
      className="w-4 h-4 border border-[var(--border)] flex items-center justify-center hover:border-[var(--accent)] transition-colors"
      style={{ background: checked ? 'var(--accent)' : 'var(--surface)', flexShrink: 0 }}>
      {checked && <span style={{ color: '#fff', fontSize: 9, lineHeight: 1, fontFamily: MONO }}>✓</span>}
    </button>
  );
}

function Btn({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <button className="flex items-center gap-1.5 border border-[var(--border)] px-3 py-1.5 text-[11px] font-mono text-[var(--fg)] hover:border-[var(--accent)] transition-colors">
      {icon} {label}
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

function ProgressBar({ label, done, total }: { label: string; done: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--muted)]">{label}</span>
        <span className="font-mono text-[10px] text-[var(--muted)]">{done}/{total}</span>
      </div>
      <div className="h-1 bg-[var(--border)] w-full">
        <div className="h-1 bg-[var(--accent)] transition-all duration-300" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function PanelSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-[var(--border)]">
      <div className="px-4 py-2 bg-[var(--surface-hover)] border-b border-[var(--border)]">
        <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--muted)]">{title}</span>
      </div>
      <div className="px-4 py-3">{children}</div>
    </div>
  );
}
