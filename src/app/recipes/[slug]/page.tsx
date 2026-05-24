'use client';
import React, { useState, use } from 'react';
import { formatDuration } from '@/lib/utils';
import { Bookmark } from 'lucide-react';
import type { RecipeStep, RecipeIngredientRef, Recipe } from '@/types';

function useChecklist(count: number) {
  const [checked, setChecked] = useState<boolean[]>(Array(count).fill(false));
  const toggle = (i: number) => setChecked(p => p.map((v, idx) => idx === i ? !v : v));
  return { checked, toggle };
}

function RecipeView({ recipe }: { recipe: Recipe }) {
  const ingChecks  = useChecklist(recipe.ingredients.length);
  const stepChecks = useChecklist(recipe.steps.length);
  const [servings, setServings] = useState(recipe.servings);
  // Track which ingredient pills are "added" per step (keyed by "stepId-ingId")
  const [addedIngs, setAddedIngs] = useState<Record<string, boolean>>({});
  const toggleAddedIng = (key: string) => setAddedIngs(p => ({ ...p, [key]: !p[key] }));

  const ingMap = Object.fromEntries(recipe.ingredients.map(i => [i.ingredientId, i]));

  const groups: { label: string; steps: (RecipeStep & { globalIndex: number })[] }[] = [];
  recipe.steps.forEach((step, i) => {
    const label = step.group ?? 'General';
    let g = groups.find(g => g.label === label);
    if (!g) { g = { label, steps: [] }; groups.push(g); }
    g.steps.push({ ...step, globalIndex: i });
  });

  const B    = '1px solid var(--border)';
  const MONO = 'var(--font-mono)';
  const MUT  = 'var(--muted)';
  const tbl: React.CSSProperties   = { borderCollapse: 'collapse', border: B, width: '100%', fontSize: 12 };
  const thead: React.CSSProperties = { background: 'var(--surface-hover)' };
  const td: React.CSSProperties    = { padding: '9px 14px', color: 'var(--fg)', verticalAlign: 'middle' };

  const metaItems: [string, string][] = [
    ['RECIPE ID',   recipe.id.split('-')[0].toUpperCase()],
    ['YIELD',       `${servings} servings`],
    ['TOTAL TIME',  formatDuration(recipe.totalTimeSeconds)],
    ['ACTIVE TIME', recipe.activeTimeSeconds ? formatDuration(recipe.activeTimeSeconds) : '—'],
    ['DIFFICULTY',  recipe.difficulty],
    ['RATING',      recipe.ratings ? `${recipe.ratings.average.toFixed(1)} / 5` : '—'],
    ['CUISINE',     recipe.cuisine ?? '—'],
  ];

  return (
    <div className="flex h-full">
      <div className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden">

        {/* Title + meta */}
        <div className="px-4 md:px-8 pt-6 pb-5 border-b border-[var(--border)]">
          <div className="flex items-start justify-between gap-4 mb-4">
            <h1 className="font-display text-[24px] md:text-[28px] font-normal leading-tight text-[var(--fg)]">
              {recipe.title}
            </h1>
            <button className="flex items-center gap-1.5 border border-[var(--border)] px-3 py-1.5 text-[11px] font-mono text-[var(--fg)] hover:border-[var(--accent)] transition-colors flex-shrink-0">
              <Bookmark size={11} strokeWidth={1.5} /> Bookmark
            </button>
          </div>

          {/* Desktop meta strip */}
          <div className="hidden md:grid border border-[var(--border)] text-[11px]"
            style={{ gridTemplateColumns: `repeat(${metaItems.length}, minmax(0, 1fr))` }}>
            {metaItems.map(([label, value], i) => (
              <div key={label} className={i < metaItems.length - 1 ? 'border-r border-[var(--border)]' : ''}>
                <div className="px-3 py-1.5 bg-[var(--surface-hover)] border-b border-[var(--border)]">
                  <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--muted)]">{label}</span>
                </div>
                <div className="px-3 py-2 font-mono text-[11px] text-[var(--fg)]">{value}</div>
              </div>
            ))}
          </div>

          {/* Mobile meta grid */}
          <div className="md:hidden border border-[var(--border)]"
            style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '1px', background: 'var(--border)' }}>
            {metaItems.map(([label, value]) => (
              <div key={label} style={{ background: 'var(--surface)', padding: '8px 12px' }}>
                <div style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.15em', color: MUT, marginBottom: 3 }}>{label}</div>
                <div style={{ fontFamily: MONO, fontSize: 12, color: 'var(--fg)', fontWeight: 500 }}>{value}</div>
              </div>
            ))}
          </div>

          {recipe.description && (
            <p className="mt-3 text-[12px] text-[var(--muted)] leading-relaxed max-w-2xl">{recipe.description}</p>
          )}
        </div>

        <div className="px-4 md:px-8 py-6 space-y-8">

          {/* ── Ingredients ── */}
          <section>
            <SectionHeader title="Ingredients" meta={`${recipe.ingredients.length} items · ${servings} servings`} />

            {/* Mobile: flat list */}
            <div className="md:hidden border border-[var(--border)] divide-y divide-[var(--border)]">
              {recipe.ingredients.map((ing, i) => (
                <div key={ing.ingredientId}
                  className="flex items-center gap-3 px-3 py-2.5"
                  style={{ opacity: ingChecks.checked[i] ? 0.4 : 1, background: ingChecks.checked[i] ? 'var(--surface-hover)' : undefined }}>
                  <Checkbox checked={ingChecks.checked[i]} onChange={() => ingChecks.toggle(i)} />
                  <span style={{ fontFamily: MONO, fontSize: 10, color: MUT, width: 20, textAlign: 'right', flexShrink: 0 }}>{i + 1}</span>
                  <span style={{ fontWeight: 500, fontSize: 13, flex: 1, minWidth: 0 }}>{ing.name}</span>
                  <span style={{ fontFamily: MONO, fontSize: 12, color: 'var(--fg)', flexShrink: 0 }}>{ing.quantity.value}{ing.quantity.unit}</span>
                  {ing.prep && <span style={{ fontFamily: MONO, fontSize: 10, color: MUT, flexShrink: 0, maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ing.prep}</span>}
                </div>
              ))}
            </div>

            {/* Desktop: full table */}
            <div className="hidden md:block overflow-x-auto">
              <table style={{ ...tbl, minWidth: 480 }}>
                <thead>
                  <tr style={thead}>
                    <Th w={36} /><Th w={32}>#</Th><Th>Product</Th>
                    <Th w={90} right>Mass</Th><Th w={90} right>Volume</Th>
                    <Th>Prep / Notes</Th><Th w={80} center>State</Th>
                  </tr>
                </thead>
                <tbody>
                  {recipe.ingredients.map((ing, i) => (
                    <tr key={ing.ingredientId} style={{ borderTop: B, opacity: ingChecks.checked[i] ? 0.4 : 1, background: ingChecks.checked[i] ? 'var(--surface-hover)' : undefined }}>
                      <td style={{ ...td, borderRight: B, textAlign: 'center' }}><Checkbox checked={ingChecks.checked[i]} onChange={() => ingChecks.toggle(i)} /></td>
                      <td style={{ ...td, borderRight: B, fontFamily: MONO, fontSize: 10, color: MUT, textAlign: 'center' }}>{i + 1}</td>
                      <td style={{ ...td, borderRight: B, fontWeight: 500 }}>
                        <a href={`/ingredients/${ing.ingredientSlug}`} style={{ color: 'var(--fg)', textDecoration: 'none' }}
                          className="hover:text-[var(--accent)] transition-colors">{ing.name}</a>
                        {ing.optional && <span style={{ marginLeft: 8, fontSize: 10, color: MUT, fontFamily: MONO }}>(opt)</span>}
                      </td>
                      <td style={{ ...td, borderRight: B, textAlign: 'right', fontFamily: MONO, fontVariantNumeric: 'tabular-nums' }}>{ing.quantity.value}{ing.quantity.unit}</td>
                      <td style={{ ...td, borderRight: B, textAlign: 'right', fontFamily: MONO, color: MUT }}>—</td>
                      <td style={{ ...td, borderRight: B, color: MUT }}>{ing.prep ?? '—'}</td>
                      <td style={{ ...td, textAlign: 'center', fontFamily: MONO, fontSize: 9, textTransform: 'uppercase', color: MUT }}>{ing.state ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* ── Equipment ── */}
          {recipe.equipment && recipe.equipment.length > 0 && (
            <section>
              <SectionHeader title="Equipment" />
              <div className="overflow-x-auto">
                <table style={{ ...tbl, minWidth: 300 }}>
                  <thead><tr style={thead}><Th>Tool</Th><Th w={90} center>Required</Th><Th>Alternatives</Th></tr></thead>
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
              </div>
            </section>
          )}

          {/* ── Procedure ── */}
          <section>
            <SectionHeader title="Procedure" meta={`${recipe.steps.length} steps`} />

            {/* Mobile: card steps with tappable ingredient pills */}
            <div className="md:hidden border border-[var(--border)] divide-y divide-[var(--border)]">
              {groups.map((group, gi) => (
                <React.Fragment key={group.label}>
                  <div style={{ padding: '6px 12px', background: 'var(--surface-hover)', fontFamily: MONO, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--fg)', fontWeight: 600, borderTop: gi > 0 ? `2px solid var(--border)` : undefined }}>
                    {group.label}
                  </div>
                  {group.steps.map(step => {
                    const gIdx = step.globalIndex;
                    const done = stepChecks.checked[gIdx];
                    const stepIngs = (step.ingredients ?? []).map((id: string) => ingMap[id]).filter(Boolean);
                    return (
                      <div key={step.id} style={{ padding: '10px 12px', opacity: done ? 0.4 : 1, background: done ? 'var(--surface-hover)' : undefined }}>
                        <div className="flex items-start gap-3">
                          <Checkbox checked={done} onChange={() => stepChecks.toggle(gIdx)} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--fg)', margin: 0 }}>{step.instruction}</p>
                            {/* Tappable ingredient pills */}
                            {stepIngs.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 mt-2">
                                {stepIngs.map((ing: RecipeIngredientRef) => {
                                  const key = `${step.id}-${ing.ingredientId}`;
                                  const added = addedIngs[key];
                                  return (
                                    <button key={key} onClick={() => toggleAddedIng(key)}
                                      style={{
                                        fontFamily: MONO, fontSize: 10,
                                        padding: '2px 8px', borderRadius: 3,
                                        border: `1px solid ${added ? 'var(--accent)' : 'var(--border)'}`,
                                        background: added ? 'var(--accent-subtle)' : 'var(--surface)',
                                        color: added ? 'var(--accent-text)' : 'var(--fg)',
                                        cursor: 'pointer', transition: 'all 0.15s',
                                        textDecoration: added ? 'line-through' : 'none',
                                      }}>
                                      {ing.name} · {ing.quantity.value}{ing.quantity.unit}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                            {/* Meta tags: time, temp, tools */}
                            <div className="flex flex-wrap gap-1.5 mt-1.5">
                              {step.durationSeconds && (
                                <span style={{ fontFamily: MONO, fontSize: 10, color: MUT }}>⏱ {formatDuration(step.durationSeconds)}</span>
                              )}
                              {step.temperature && (
                                <span style={{ fontFamily: MONO, fontSize: 10, color: MUT }}>
                                  {step.temperature.value}°{step.temperature.unit === 'celsius' ? 'C' : 'F'}
                                </span>
                              )}
                              {step.tools && step.tools.length > 0 && (
                                <span style={{ fontFamily: MONO, fontSize: 10, color: MUT }}>{step.tools.join(' · ')}</span>
                              )}
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
                <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 600, color: 'var(--fg)' }}>{formatDuration(recipe.totalTimeSeconds)}</span>
              </div>
            </div>

            {/* Desktop: full table */}
            <div className="hidden md:block overflow-x-auto">
              <table style={{ ...tbl, minWidth: 600 }}>
                <thead>
                  <tr style={thead}>
                    <Th w={36} /><Th>Product</Th><Th w={80} right>Mass</Th>
                    <Th w={70} right>Volume</Th><Th w={130}>Tool</Th>
                    <Th w={90}>Setting</Th><Th w={70} right>Time</Th><Th>Instruction</Th>
                  </tr>
                </thead>
                {groups.map((group, gi) => (
                  <React.Fragment key={group.label}>
                    <tbody>
                      <tr>
                        <td colSpan={8} style={{ padding: '7px 14px', background: 'var(--surface-hover)', borderTop: gi === 0 ? B : `2px solid var(--border)`, borderBottom: B, fontFamily: MONO, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--fg)', fontWeight: 600 }}>
                          {group.label}
                        </td>
                      </tr>
                      {group.steps.map(step => {
                        const gIdx = step.globalIndex;
                        const done = stepChecks.checked[gIdx];
                        const stepIngs = (step.ingredients ?? []).map((id: string) => ingMap[id]).filter(Boolean);
                        const rowCount = Math.max(1, stepIngs.length);
                        return stepIngs.length === 0 ? (
                          <tr key={step.id} style={{ borderTop: B, opacity: done ? 0.4 : 1, background: done ? 'var(--surface-hover)' : undefined, verticalAlign: 'middle' }}>
                            <td style={{ ...td, borderRight: B, textAlign: 'center' }}><Checkbox checked={done} onChange={() => stepChecks.toggle(gIdx)} /></td>
                            <td style={{ ...td, borderRight: B, color: MUT, fontFamily: MONO, fontSize: 10 }}>—</td>
                            <td style={{ ...td, borderRight: B, textAlign: 'right', fontFamily: MONO, color: MUT }}>—</td>
                            <td style={{ ...td, borderRight: B, textAlign: 'right', fontFamily: MONO, color: MUT }}>—</td>
                            <td style={{ ...td, borderRight: B, color: MUT, fontSize: 11 }}>{step.tools?.join(', ') || '—'}</td>
                            <td style={{ ...td, borderRight: B, fontFamily: MONO, fontSize: 11, color: step.temperature ? 'var(--fg)' : MUT }}>
                              {step.temperature ? `${step.temperature.value}°${step.temperature.unit === 'celsius' ? 'C' : 'F'}` : '—'}
                            </td>
                            <td style={{ ...td, borderRight: B, textAlign: 'right', fontFamily: MONO, fontSize: 11, fontVariantNumeric: 'tabular-nums', color: step.durationSeconds ? 'var(--fg)' : MUT }}>
                              {step.durationSeconds ? formatDuration(step.durationSeconds) : '—'}
                            </td>
                            <td style={{ ...td, lineHeight: 1.55 }}>{step.instruction}</td>
                          </tr>
                        ) : (
                          stepIngs.map((ing: RecipeIngredientRef, rowIdx: number) => (
                            <tr key={`${step.id}-${rowIdx}`} style={{ borderTop: rowIdx === 0 ? B : `1px dashed var(--border)`, opacity: done ? 0.4 : 1, background: done ? 'var(--surface-hover)' : undefined, verticalAlign: 'middle' }}>
                              {rowIdx === 0 && <td rowSpan={rowCount} style={{ ...td, borderRight: B, textAlign: 'center' }}><Checkbox checked={done} onChange={() => stepChecks.toggle(gIdx)} /></td>}
                              <td style={{ ...td, borderRight: B, fontWeight: 500 }}>
                                <a href={`/ingredients/${ing.ingredientSlug}`} style={{ color: 'var(--fg)', textDecoration: 'none' }} className="hover:text-[var(--accent)] transition-colors">{ing.name}</a>
                              </td>
                              <td style={{ ...td, borderRight: B, textAlign: 'right', fontFamily: MONO, fontVariantNumeric: 'tabular-nums' }}>{ing.quantity.value}{ing.quantity.unit}</td>
                              <td style={{ ...td, borderRight: B, textAlign: 'right', fontFamily: MONO, color: MUT }}>—</td>
                              {rowIdx === 0 && <td rowSpan={rowCount} style={{ ...td, borderRight: B, color: MUT, fontSize: 11 }}>{step.tools?.join(', ') || '—'}</td>}
                              {rowIdx === 0 && <td rowSpan={rowCount} style={{ ...td, borderRight: B, fontFamily: MONO, fontSize: 11, color: step.temperature ? 'var(--fg)' : MUT }}>{step.temperature ? `${step.temperature.value}°${step.temperature.unit === 'celsius' ? 'C' : 'F'}` : '—'}</td>}
                              {rowIdx === 0 && <td rowSpan={rowCount} style={{ ...td, borderRight: B, textAlign: 'right', fontFamily: MONO, fontSize: 11, fontVariantNumeric: 'tabular-nums', color: step.durationSeconds ? 'var(--fg)' : MUT }}>{step.durationSeconds ? formatDuration(step.durationSeconds) : '—'}</td>}
                              {rowIdx === 0 && <td rowSpan={rowCount} style={{ ...td, lineHeight: 1.55 }}>{step.instruction}</td>}
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
            </div>
          </section>

          {/* ── Nutrition ── */}
          {recipe.nutrition && (
            <section>
              <SectionHeader title="Nutrition" meta="per serving" />
              <div className="overflow-x-auto">
                <table style={{ ...tbl, minWidth: 280 }}>
                  <thead><tr style={thead}><Th>Nutrient</Th><Th w={130} right>Per serving</Th><Th w={130} right>Per 100g</Th></tr></thead>
                  <tbody>
                    {([['Calories',recipe.nutrition.calories,'kcal'],['Protein',recipe.nutrition.protein,'g'],['Fat',recipe.nutrition.fat,'g'],['Carbohydrates',recipe.nutrition.carbohydrates,'g'],['Fiber',recipe.nutrition.fiber,'g'],['Sodium',recipe.nutrition.sodium,'mg']] as [string,number|undefined,string][]).filter(([,v])=>v!=null).map(([label,value,u])=>(
                      <tr key={label} style={{ borderTop: B }}>
                        <td style={{ ...td, borderRight: B }}>{label}</td>
                        <td style={{ ...td, borderRight: B, textAlign: 'right', fontFamily: MONO, fontVariantNumeric: 'tabular-nums' }}>{value}<span style={{ color: MUT, marginLeft: 3 }}>{u}</span></td>
                        <td style={{ ...td, textAlign: 'right', fontFamily: MONO, color: MUT }}>—</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <div className="md:hidden h-16" />
        </div>
      </div>

      {/* Right panel — desktop only */}
      <aside className="hidden md:block w-48 flex-shrink-0 border-l border-[var(--border)] sticky top-0 h-full overflow-y-auto bg-[var(--surface)] text-[12px]">
        <PanelSection title="Progress">
          <ProgressBar label="Ingredients" done={ingChecks.checked.filter(Boolean).length} total={recipe.ingredients.length} />
          <div className="mt-2"><ProgressBar label="Steps" done={stepChecks.checked.filter(Boolean).length} total={recipe.steps.length} /></div>
        </PanelSection>
        <PanelSection title="Servings">
          <div className="flex items-center border border-[var(--border)]">
            <button onClick={() => setServings(s => Math.max(1, s-1))} className="w-8 h-8 font-mono text-[var(--muted)] hover:text-[var(--fg)] border-r border-[var(--border)] flex items-center justify-center hover:bg-[var(--surface-hover)] transition-colors">−</button>
            <span className="flex-1 text-center font-mono tabular-nums text-[13px]">{servings}</span>
            <button onClick={() => setServings(s => s+1)} className="w-8 h-8 font-mono text-[var(--muted)] hover:text-[var(--fg)] border-l border-[var(--border)] flex items-center justify-center hover:bg-[var(--surface-hover)] transition-colors">+</button>
          </div>
        </PanelSection>
        {recipe.nutrition && (
          <PanelSection title="Nutrition · per serving">
            <table className="w-full text-[11px]">
              <tbody>
                {([['Calories',recipe.nutrition.calories,'kcal'],['Protein',recipe.nutrition.protein,'g'],['Fat',recipe.nutrition.fat,'g'],['Carbs',recipe.nutrition.carbohydrates,'g'],['Fiber',recipe.nutrition.fiber,'g'],['Sodium',recipe.nutrition.sodium,'mg']] as [string,number|undefined,string][]).filter(([,v])=>v!=null).map(([label,value,u])=>(
                  <tr key={label} className="border-b border-[var(--border-subtle)] last:border-0">
                    <td className="py-1.5 text-[var(--muted)]">{label}</td>
                    <td className="py-1.5 text-right font-mono tabular-nums text-[var(--fg)]">{value}<span className="text-[var(--muted)] ml-0.5">{u}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </PanelSection>
        )}
        <PanelSection title="Recipe Information">
          <table className="w-full text-[11px]">
            <tbody>
              {[['Version',`v${recipe.version}`],['Cuisine',recipe.cuisine??'—'],['Difficulty',recipe.difficulty],['Updated',new Date(recipe.updatedAt).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})]].map(([k,v])=>(
                <tr key={k} className="border-b border-[var(--border-subtle)] last:border-0">
                  <td className="py-1.5 text-[var(--muted)] font-mono text-[10px]">{k}</td>
                  <td className="py-1.5 text-[var(--fg)] text-right">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </PanelSection>
      </aside>

      {/* Mobile sticky bar */}
      <div className="md:hidden fixed bottom-[56px] left-0 right-0 z-10 bg-[var(--surface)] border-t border-[var(--border)] px-4 py-2 flex items-center gap-4">
        <div className="flex-1 min-w-0"><ProgressBar label="Ingredients" done={ingChecks.checked.filter(Boolean).length} total={recipe.ingredients.length} /></div>
        <div className="flex-1 min-w-0"><ProgressBar label="Steps" done={stepChecks.checked.filter(Boolean).length} total={recipe.steps.length} /></div>
        <div className="flex items-center border border-[var(--border)] flex-shrink-0">
          <button onClick={() => setServings(s => Math.max(1, s-1))} className="w-7 h-7 font-mono text-[var(--muted)] border-r border-[var(--border)] flex items-center justify-center hover:bg-[var(--surface-hover)] transition-colors text-[13px]">−</button>
          <span className="px-2 font-mono tabular-nums text-[12px]">{servings}</span>
          <button onClick={() => setServings(s => s+1)} className="w-7 h-7 font-mono text-[var(--muted)] border-l border-[var(--border)] flex items-center justify-center hover:bg-[var(--surface-hover)] transition-colors text-[13px]">+</button>
        </div>
      </div>
    </div>
  );
}

export default function RecipePage({ params }: { params: Promise<{ slug: string }> }) {
  return <RecipePageClient params={params} />;
}

function RecipePageClient({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [recipe, setRecipe]   = useState<Recipe | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  React.useEffect(() => {
    async function load() {
      setLoading(true); setError(null);
      try {
        const { createClient } = await import('@/lib/supabase/client');
        const supabase = createClient();
        const { data, error: dbError } = await supabase
          .from('recipes')
          .select(`*, recipe_ingredients(*, ingredients!ingredient_id(id, slug, name)), recipe_steps(*), recipe_equipment(*, equipment!equipment_id(id, slug, name))`)
          .eq('slug', slug).eq('is_published', true).single();
        if (dbError) { console.error('[RecipePage]', dbError); throw dbError; }
        if (data) {
          const { mapRecipeFromDB } = await import('@/lib/recipe-mapper');
          setRecipe(mapRecipeFromDB(data)); setLoading(false); return;
        }
      } catch (err) { console.error('[RecipePage] Falling back to sample data:', err); }
      const { sampleRecipes } = await import('@/data/sample-recipes');
      const r = sampleRecipes.find(r => r.slug === slug) ?? null;
      if (!r) setError('Recipe not found.');
      setRecipe(r); setLoading(false);
    }
    load();
  }, [slug]);

  if (loading) return <div className="flex items-center justify-center h-64"><span className="font-mono text-[11px] text-[var(--muted)] uppercase tracking-widest">Loading…</span></div>;
  if (error || !recipe) return <div className="p-8 font-mono text-[12px] text-[var(--muted)]">{error ?? 'Recipe not found.'}</div>;
  return <RecipeView recipe={recipe} />;
}

function Th({ children, w, right, center }: { children?: React.ReactNode; w?: number; right?: boolean; center?: boolean }) {
  return <th style={{ padding: '8px 14px', fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'var(--muted)', borderRight: '1px solid var(--border)', textAlign: right ? 'right' : center ? 'center' : 'left', width: w, whiteSpace: 'nowrap' }} className="last:border-r-0">{children}</th>;
}

function Checkbox({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button onClick={onChange} role="checkbox" aria-checked={checked}
      className="w-4 h-4 border border-[var(--border)] flex items-center justify-center hover:border-[var(--accent)] transition-colors flex-shrink-0"
      style={{ background: checked ? 'var(--accent)' : 'var(--surface)' }}>
      {checked && <span style={{ color: '#fff', fontSize: 9, lineHeight: 1, fontFamily: 'var(--font-mono)' }}>✓</span>}
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
