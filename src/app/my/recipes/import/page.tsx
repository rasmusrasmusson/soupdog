'use client';
// src/app/my/recipes/import/page.tsx
// Paste recipe text → Claude parses it → preview → refine via AI chat → open in editor

import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Sparkles, AlertTriangle, ChevronRight, ArrowLeft, Send, RotateCcw } from 'lucide-react';
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

// Chat history entry — each turn stores the message and the resulting recipe state
interface ChatTurn { type: 'answer' | 'modification';
  user: string;
  recipe: any;
  // for display only:
  assistantSummary: string;
}

export default function ImportRecipePage() {
  const router = useRouter();

  const [text,     setText]     = useState('');
  const [status,   setStatus]   = useState<'idle'|'loading'|'done'|'error'>('idle');
  const [error,    setError]    = useState<string|null>(null);
  const [preview,  setPreview]  = useState<any>(null);

  // Chat state
  const [chatHistory,   setChatHistory]   = useState<ChatTurn[]>([]);
  const [chatInput,     setChatInput]     = useState('');
  const [chatLoading,   setChatLoading]   = useState(false);
  const [chatError,     setChatError]     = useState<string|null>(null);

  const chatEndRef   = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);

  // Scroll chat to bottom when new messages arrive
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, chatLoading]);

  const handleImport = async () => {
    if (!text.trim()) return;
    setStatus('loading');
    setError(null);
    setPreview(null);
    setChatHistory([]);

    try {
      const res  = await fetch('/api/recipes/import', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ text }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error ?? 'Import failed');

      setPreview(data.recipe);
      setStatus('done');
    } catch (err: any) {
      setError(err.message ?? 'Import failed');
      setStatus('error');
    }
  };

  const handleChatSend = async () => {
    if (!chatInput.trim() || chatLoading || !preview) return;

    const message = chatInput.trim();
    setChatInput('');
    setChatError(null);
    setChatLoading(true);

    try {
      const res = await fetch('/api/recipes/import/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          recipe:  preview,
          message,
          history: chatHistory,
        }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error ?? 'Request failed');

      const updatedRecipe = data.recipe;

      // Count what changed for the summary
      const prevStepCount = (preview.groups ?? []).reduce((n: number, g: any) => n + (g.steps?.length ?? 0), 0);
      const newStepCount  = (updatedRecipe.groups ?? []).reduce((n: number, g: any) => n + (g.steps?.length ?? 0), 0);
      const prevIngCount  = preview.ingredients?.length ?? 0;
      const newIngCount   = updatedRecipe.ingredients?.length ?? 0;

      const changes: string[] = [];
      if (updatedRecipe.title !== preview.title) changes.push(`renamed to "${updatedRecipe.title}"`);
      if (newIngCount !== prevIngCount) changes.push(`${Math.abs(newIngCount - prevIngCount)} ingredient${Math.abs(newIngCount - prevIngCount) !== 1 ? 's' : ''} ${newIngCount > prevIngCount ? 'added' : 'removed'}`);
      if (newStepCount !== prevStepCount) changes.push(`${Math.abs(newStepCount - prevStepCount)} step${Math.abs(newStepCount - prevStepCount) !== 1 ? 's' : ''} ${newStepCount > prevStepCount ? 'added' : 'removed'}`);
      if (changes.length === 0) changes.push('recipe updated');

      const summary = changes.join(', ');

      setChatHistory(prev => [...prev, { user: message, recipe: updatedRecipe, assistantSummary: summary }]);
      setPreview(updatedRecipe);

    } catch (err: any) {
      setChatError(err.message ?? 'Request failed');
    } finally {
      setChatLoading(false);
      chatInputRef.current?.focus();
    }
  };

  const handleChatKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleChatSend();
    }
  };

  const handleOpenInEditor = () => {
    if (!preview) return;
    sessionStorage.setItem('soupdog_import', JSON.stringify(preview));
    router.push('/my/recipes/new?import=1');
  };

  const stepCount = (preview?.groups ?? []).reduce((n: number, g: any) => n + (g.steps?.length ?? 0), 0);

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 24px 100px' }}>

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
        Soupdog will parse it into Soupdog's structured format for you to review and edit.
      </p>

      {/* Input state */}
      {status !== 'done' && (
        <>
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

      {/* Preview + Chat — two column layout on wider screens */}
      {status === 'done' && preview && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 24, alignItems: 'start' }}>

          {/* Left — Recipe preview */}
          <div>
            {/* Success banner */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 14px', border: '1px solid var(--accent)',
              background: 'var(--accent-subtle)', fontFamily: MONO,
              fontSize: 11, color: 'var(--accent)', marginBottom: 20 }}>
              <Sparkles size={12} />
              Recipe parsed — {stepCount} steps · {preview.ingredients?.length ?? 0} ingredients
              {chatHistory.length > 0 && (
                <span style={{ marginLeft: 8, opacity: 0.7 }}>
                  · {chatHistory.length} edit{chatHistory.length !== 1 ? 's' : ''} made
                </span>
              )}
            </div>

            <div style={{ border: B }}>

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
                    ['Serves',     preview.servings],
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
                  Steps ({stepCount})
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
                              <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--muted)' }}>
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
          </div>

          {/* Right — AI chat panel */}
          <div style={{ position: 'sticky', top: 24 }}>
            <div style={{ border: B, background: 'var(--surface)', display: 'flex', flexDirection: 'column', maxHeight: '80vh' }}>

              {/* Chat header */}
              <div style={{ padding: '12px 16px', borderBottom: B, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Sparkles size={12} style={{ color: 'var(--accent)' }} />
                <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 600,
                  textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--fg)' }}>
                  ADJUST RECIPE
                </span>
                {chatHistory.length > 0 && (
                  <button
                    onClick={() => { setChatHistory([]); }}
                    title="Clear chat history"
                    style={{ marginLeft: 'auto', background: 'none', border: 'none',
                      cursor: 'pointer', color: 'var(--muted)', padding: 2,
                      display: 'flex', alignItems: 'center' }}>
                    <RotateCcw size={11} />
                  </button>
                )}
              </div>

              {/* Chat messages */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px',
                display: 'flex', flexDirection: 'column', gap: 12, minHeight: 200, maxHeight: 400 }}>

                {chatHistory.length === 0 && !chatLoading && (
                  <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--muted)',
                    lineHeight: 1.6, textAlign: 'center', padding: '20px 0' }}>
                    Ask questions or give instructions — 'What can I substitute for guanciale?' or 'Make it vegetarian'<br />
                    <span style={{ opacity: 0.7 }}>Changes update the preview in real time.</span>
                  </div>
                )}

                {/* Suggestion chips — shown only when no history yet */}
                {chatHistory.length === 0 && !chatLoading && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {[
                      'Make it vegetarian',
                      'Scale to 6 servings',
                      'Break down steps further',
                      'Add timing to each step',
                    ].map(suggestion => (
                      <button
                        key={suggestion}
                        onClick={() => setChatInput(suggestion)}
                        style={{ textAlign: 'left', background: 'var(--surface-hover)',
                          border: B, padding: '7px 10px', cursor: 'pointer',
                          fontFamily: MONO, fontSize: 10, color: 'var(--muted)',
                          transition: 'color 0.15s' }}
                        onMouseEnter={e => (e.currentTarget.style.color = 'var(--fg)')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'var(--muted)')}>
                        {suggestion}
                      </button>
                    ))}
                  </div>
                )}

                {/* Conversation turns */}
                {chatHistory.map((turn, i) => (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {/* User message */}
                    <div style={{ alignSelf: 'flex-end', background: 'var(--accent)',
                      color: '#fff', padding: '7px 11px', maxWidth: '85%',
                      fontFamily: MONO, fontSize: 10, lineHeight: 1.5 }}>
                      {turn.user}
                    </div>
                    {/* Assistant response */}
                    <div style={{ alignSelf: 'flex-start', background: 'var(--surface-hover)',
                      border: B, padding: '7px 11px', maxWidth: '85%',
                      fontFamily: MONO, fontSize: 10, color: 'var(--muted)', lineHeight: 1.5 }}>
                      ✓ {turn.assistantSummary}
                    </div>
                  </div>
                ))}

                {/* Loading indicator */}
                {chatLoading && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8,
                    fontFamily: MONO, fontSize: 10, color: 'var(--muted)' }}>
                    <Loader2 size={11} className="animate-spin" />
                    Updating recipe…
                  </div>
                )}

                {/* Chat error */}
                {chatError && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6,
                    padding: '7px 10px', border: '1px solid #b45309',
                    background: '#fef3c7', fontFamily: MONO, fontSize: 10, color: '#92400e' }}>
                    <AlertTriangle size={10} />
                    {chatError}
                  </div>
                )}

                <div ref={chatEndRef} />
              </div>

              {/* Chat input */}
              <div style={{ borderTop: B, padding: '10px 12px', display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <textarea
                  ref={chatInputRef}
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={handleChatKeyDown}
                  placeholder="Ask a question or give an instruction…"
                  rows={2}
                  disabled={chatLoading}
                  style={{
                    flex: 1, padding: '8px 10px', border: B,
                    background: 'var(--bg)', color: 'var(--fg)',
                    fontFamily: MONO, fontSize: 11, outline: 'none',
                    resize: 'none', lineHeight: 1.5,
                    opacity: chatLoading ? 0.5 : 1,
                  }}
                />
                <button
                  onClick={handleChatSend}
                  disabled={chatLoading || !chatInput.trim()}
                  style={{
                    padding: '8px 10px', border: 'none',
                    background: 'var(--accent)', color: '#fff',
                    cursor: chatLoading || !chatInput.trim() ? 'not-allowed' : 'pointer',
                    opacity: chatLoading || !chatInput.trim() ? 0.5 : 1,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                  {chatLoading
                    ? <Loader2 size={13} className="animate-spin" />
                    : <Send size={13} />
                  }
                </button>
              </div>

              {/* Hint */}
              <div style={{ padding: '6px 12px', borderTop: B,
                fontFamily: MONO, fontSize: 9, color: 'var(--muted)', opacity: 0.7 }}>
                Ask questions or give instructions · Enter to send
              </div>
            </div>
          </div>

        </div>
      )}

      {/* Fixed bottom bar — preview state */}
      {status === 'done' && (
        <div className="fixed bottom-0 left-0 right-0 bg-[var(--surface)] border-t border-[var(--border)] px-6 py-3 flex items-center justify-between z-50">
          <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--muted)' }}>
            {chatHistory.length > 0
              ? `${chatHistory.length} edit${chatHistory.length !== 1 ? 's' : ''} made — open in editor to save`
              : 'Review the parsed recipe then open in editor to save'
            }
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => { setStatus('idle'); setPreview(null); setChatHistory([]); }}
              style={{ padding: '8px 16px', border: '1px solid var(--border)', background: 'none',
                fontFamily: MONO, fontSize: 11, cursor: 'pointer', color: 'var(--muted)' }}>
              ← Try again
            </button>
            <button
              onClick={handleOpenInEditor}
              style={{ display: 'flex', alignItems: 'center', gap: 7,
                padding: '8px 20px', border: 'none',
                background: 'var(--accent)', color: '#fff',
                fontFamily: MONO, fontSize: 11, cursor: 'pointer' }}>
              Open in editor <ChevronRight size={12} />
            </button>
          </div>
        </div>
      )}

      {/* Fixed bottom bar — input state */}
      {status !== 'done' && (
        <div className="fixed bottom-0 left-0 right-0 bg-[var(--surface)] border-t border-[var(--border)] px-6 py-3 flex items-center justify-between z-50">
          <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--muted)' }}>
            {status === 'loading' ? 'Parsing recipe…' : 'Paste a recipe and click Import'}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => router.back()}
              style={{ padding: '8px 16px', border: '1px solid var(--border)', background: 'none',
                fontFamily: MONO, fontSize: 11, cursor: 'pointer', color: 'var(--muted)' }}>
              Cancel
            </button>
            <button
              onClick={handleImport}
              disabled={status === 'loading' || !text.trim()}
              style={{
                padding: '8px 20px', border: 'none',
                background: 'var(--accent)', color: '#fff',
                fontFamily: MONO, fontSize: 11,
                cursor: status === 'loading' || !text.trim() ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', gap: 7,
                opacity: status === 'loading' || !text.trim() ? 0.6 : 1,
              }}>
              {status === 'loading'
                ? <><Loader2 size={12} className="animate-spin" /> Parsing…</>
                : <><Sparkles size={12} /> Import</>
              }
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
