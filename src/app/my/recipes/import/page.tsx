'use client';
// src/app/my/recipes/import/page.tsx
// Paste recipe text → Claude parses it → pre-fills recipe editor

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Sparkles, AlertTriangle, ChevronRight, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

const MONO = 'var(--font-mono)';
const B    = '1px solid var(--border)';

const EXAMPLE = `Spaghetti Carbonara

Serves 4 | 30 minutes

Ingredients:
400g spaghetti
200g guanciale or pancetta, diced
4 large eggs
100g Pecorino Romano, finely grated
50g Parmesan, finely grated
Black pepper, freshly cracked
Salt for pasta water

Method:
1. Bring a large pot of salted water to boil. Cook spaghetti until al dente, about 8-10 minutes.
2. Meanwhile, fry guanciale in a large pan over medium heat until crispy, about 8 minutes. Remove from heat.
3. Whisk eggs with grated cheeses and a generous amount of black pepper.
4. Reserve 200ml pasta water before draining.
5. Add hot pasta to the guanciale pan off the heat. Pour over egg mixture and toss quickly, adding pasta water gradually until creamy.
6. Serve immediately with extra cheese and black pepper.`;

export default function ImportRecipePage() {
  const router = useRouter();

  const [text,     setText]     = useState('');
  const [status,   setStatus]   = useState<'idle'|'loading'|'done'|'error'>('idle');
  const [error,    setError]    = useState<string|null>(null);
  const [preview,  setPreview]  = useState<any>(null);

  const handleImport = async () => {
    if (!text.trim()) return;
    setStatus('loading');
    setError(null);
    setPreview(null);

    try {
      const res  = await fetch('/api/recipes/import', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ text }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? 'Import failed');
      }

      setPreview(data.recipe);
      setStatus('done');
    } catch (err: any) {
      setError(err.message ?? 'Import failed');
      setStatus('error');
    }
  };

  const handleOpenInEditor = () => {
    if (!preview) return;
    // Store in sessionStorage, editor will pick it up
    sessionStorage.setItem('soupdog_import', JSON.stringify(preview));
    router.push('/my/recipes/new?import=1');
  };

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '0 24px 100px' }}>

      {/* Breadcrumb */}
      <div className="border-b border-[var(--border)] px-4 md:px-8 py-3 flex items-center gap-3 -mx-6 mb-8">
        <Link href="/my/recipes"
          className="flex items-center gap-1.5 text-[11px] font-mono text-[var(--muted)] hover:text-[var(--accent)] transition-colors">
          <ArrowLeft size={12} /> My Recipes
        </Link>
        <span className="text-[var(--border)]">/</span>
        <span className="text-[11px] font-mono text-[var(--fg)] flex items-center gap-1.5">
          Import recipe <Sparkles size={10} style={{ color: 'var(--accent)' }} />
        </span>
      </div>

      {/* Description */}
      <p style={{ fontFamily: MONO, fontSize: 11, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 24 }}>
        Paste any recipe text — from a website, cookbook, or your own notes.
        Claude will parse it into Soupdog's structured format for you to review and edit.
      </p>

      {status !== 'done' && (
        <>
          {/* Text input */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', marginBottom: 6 }}>
              <div style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase',
                letterSpacing: '0.18em', color: 'var(--muted)' }}>
                Recipe text
              </div>
              <button
                onClick={() => setText(EXAMPLE)}
                style={{ fontFamily: MONO, fontSize: 9, color: 'var(--muted)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  textDecoration: 'underline' }}>
                Load example
              </button>
            </div>
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="Paste recipe here — title, ingredients, method, serving size, timings…"
              style={{
                width: '100%', minHeight: 320, padding: '12px 14px',
                border: B, background: 'var(--surface)', color: 'var(--fg)',
                fontFamily: MONO, fontSize: 12, outline: 'none',
                resize: 'vertical', lineHeight: 1.7,
                boxSizing: 'border-box',
              }}
            />
            <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--muted)', marginTop: 4 }}>
              {text.length} / 20,000 characters
            </div>
          </div>

          {/* Tips */}
          <div style={{ border: B, padding: '12px 16px', marginBottom: 20,
            background: 'var(--surface-hover)' }}>
            <div style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase',
              letterSpacing: '0.15em', color: 'var(--muted)', marginBottom: 8 }}>
              Tips for best results
            </div>
            {[
              'Include serving size and total time if available',
              'Numbered steps work best — Claude preserves the structure',
              'Ingredient quantities in any unit — Claude converts to metric',
              'You can paste recipes in any language',
              'Review and edit the result before saving',
            ].map((tip, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8,
                fontFamily: MONO, fontSize: 10, color: 'var(--muted)',
                marginBottom: i < 4 ? 5 : 0, lineHeight: 1.5 }}>
                <span style={{ color: 'var(--accent)', flexShrink: 0 }}>·</span>
                {tip}
              </div>
            ))}
          </div>

          {/* Error */}
          {status === 'error' && error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 14px', border: '1px solid #b45309',
              background: '#fef3c7', fontFamily: MONO, fontSize: 11,
              color: '#92400e', marginBottom: 16 }}>
              <AlertTriangle size={12} />
              {error}
            </div>
          )}


        </>
      )}

      {/* Preview */}
      {status === 'done' && preview && (
        <div>
          {/* Success banner */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 14px', border: '1px solid var(--accent)',
            background: 'var(--accent-subtle)', fontFamily: MONO,
            fontSize: 11, color: 'var(--accent)', marginBottom: 20 }}>
            <Sparkles size={12} />
            Recipe parsed — review below then open in editor to edit and save
          </div>

          {/* Recipe preview */}
          <div style={{ border: B, marginBottom: 20 }}>

            {/* Title + meta */}
            <div style={{ padding: '16px 20px', borderBottom: B }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20,
                fontWeight: 400, margin: '0 0 8px' }}>
                {preview.title}
              </h2>
              {preview.description && (
                <p style={{ fontFamily: MONO, fontSize: 11, color: 'var(--muted)',
                  margin: '0 0 10px', lineHeight: 1.6 }}>
                  {preview.description}
                </p>
              )}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                {[
                  ['Serves',    preview.servings],
                  ['Total time', preview.totalTimeMinutes ? `${preview.totalTimeMinutes} min` : null],
                  ['Difficulty', preview.difficulty],
                  ['Cuisine',    preview.cuisine],
                ].filter(([, v]) => v).map(([label, value]) => (
                  <div key={label as string} style={{ fontFamily: MONO, fontSize: 10 }}>
                    <span style={{ color: 'var(--muted)', textTransform: 'uppercase',
                      letterSpacing: '0.12em', marginRight: 6 }}>{label}</span>
                    <span style={{ color: 'var(--fg)' }}>{value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Ingredients */}
            <div style={{ padding: '14px 20px', borderBottom: B }}>
              <div style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase',
                letterSpacing: '0.18em', color: 'var(--muted)', marginBottom: 10 }}>
                Ingredients ({preview.ingredients?.length ?? 0})
              </div>
              <table style={{ borderCollapse: 'collapse', border: B, width: '100%', fontSize: 12 }}>
                <tbody>
                  {(preview.ingredients ?? []).map((ing: any, i: number) => (
                    <tr key={i} style={{ borderTop: i > 0 ? B : 'none' }}>
                      <td style={{ padding: '6px 12px', fontFamily: MONO,
                        fontSize: 11, color: 'var(--muted)', borderRight: B,
                        whiteSpace: 'nowrap' as const }}>
                        {ing.quantityValue} {ing.quantityUnit}
                      </td>
                      <td style={{ padding: '6px 12px', fontWeight: 500 }}>{ing.name}</td>
                      <td style={{ padding: '6px 12px', fontFamily: MONO,
                        fontSize: 10, color: 'var(--muted)' }}>
                        {ing.prepNote ?? ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Steps */}
            <div style={{ padding: '14px 20px' }}>
              <div style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase',
                letterSpacing: '0.18em', color: 'var(--muted)', marginBottom: 10 }}>
                Steps ({(preview.groups ?? []).reduce((n: number, g: any) => n + (g.steps?.length ?? 0), 0)})
              </div>
              {(preview.groups ?? []).map((group: any, gi: number) => (
                <div key={gi} style={{ marginBottom: gi < (preview.groups.length - 1) ? 16 : 0 }}>
                  {group.outputName && (
                    <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 600,
                      textTransform: 'uppercase', letterSpacing: '0.15em',
                      color: 'var(--fg)', marginBottom: 8, paddingBottom: 4,
                      borderBottom: B }}>
                      {group.outputName}
                    </div>
                  )}
                  {(group.steps ?? []).map((step: any, si: number) => (
                    <div key={si} style={{ display: 'flex', gap: 12, marginBottom: 8,
                      paddingBottom: 8, borderBottom: si < group.steps.length - 1 ? `1px dashed var(--border)` : 'none' }}>
                      <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--muted)',
                        flexShrink: 0, width: 20, textAlign: 'right' as const,
                        paddingTop: 2 }}>
                        {si + 1}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 12, lineHeight: 1.6, margin: '0 0 4px',
                          color: 'var(--fg)' }}>
                          {step.instruction}
                        </p>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {step.durationMinutes > 0 && (
                            <span style={{ fontFamily: MONO, fontSize: 9,
                              color: 'var(--muted)' }}>
                              ⏱ {step.durationMinutes} min
                            </span>
                          )}
                          {step.taskFamily && (
                            <span style={{ fontFamily: MONO, fontSize: 9,
                              color: 'var(--accent)', textTransform: 'uppercase',
                              letterSpacing: '0.1em' }}>
                              {step.taskFamily}
                            </span>
                          )}
                          {(step.stepIngredients ?? []).length > 0 && (
                            <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--muted)' }}>
                              {step.stepIngredients.join(', ')}
                            </span>
                          )}
                          {(step.stepTools ?? []).length > 0 && (
                            <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--muted)',
                              border: '1px solid var(--border)', padding: '1px 5px' }}>
                              🔧 {step.stepTools.join(', ')}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* Debug — raw first step tools */}
          {preview?.groups?.[0]?.steps?.[0] && (
            <div style={{ padding: '8px 12px', background: 'var(--surface-hover)',
              border: B, fontFamily: MONO, fontSize: 10, color: 'var(--muted)',
              marginBottom: 16 }}>
              <strong>Debug step 1 tools:</strong>{' '}
              {JSON.stringify(preview.groups[0].steps[0].stepTools ?? 'none')}
            </div>
          )}

          {/* Bottom action bar */}
        </div>
      )}
    </div>
  );
}
