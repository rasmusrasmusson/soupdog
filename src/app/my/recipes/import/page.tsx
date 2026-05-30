'use client';
// src/app/my/recipes/import/page.tsx

import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, AlertTriangle, ChevronRight, ArrowLeft, Send, RotateCcw } from 'lucide-react';
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

interface ChatTurn {
  type: 'answer' | 'modification';
  user: string;
  recipe: any;
  assistantSummary: string;
}

interface PendingChange {
  recipe: any;
  summary: string;
}

export default function ImportRecipePage() {
  const router = useRouter();

  const [text,    setText]    = useState('');
  const [status,  setStatus]  = useState<'idle'|'loading'|'done'|'error'>('idle');
  const [error,   setError]   = useState<string|null>(null);
  const [preview, setPreview] = useState<any>(null);

  const [chatHistory, setChatHistory] = useState<ChatTurn[]>([]);
  const [chatInput,   setChatInput]   = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError,   setChatError]   = useState<string|null>(null);
  const [pending,     setPending]     = useState<PendingChange|null>(null);

  const chatEndRef   = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, chatLoading, pending]);

  const handleImport = async () => {
    if (!text.trim()) return;
    setStatus('loading');
    setError(null);
    setPreview(null);
    setChatHistory([]);
    setPending(null);

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

  const [streamingText, setStreamingText] = useState('');

  const handleChatSend = async () => {
    if (!chatInput.trim() || chatLoading || !preview) return;
    const message = chatInput.trim();
    setChatInput('');
    setChatError(null);
    setChatLoading(true);
    setStreamingText('');
    setPending(null);

    try {
      const res = await fetch('/api/recipes/import/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ recipe: preview, message, history: chatHistory }),
      });

      if (!res.ok) throw new Error('Request failed');

      const reader  = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));

            if (event.type === 'chunk') {
              setStreamingText(t => t + event.text);
            } else if (event.type === 'progress') {
              // modification in progress — spinner stays, no text shown
            } else if (event.type === 'done') {
              setStreamingText('');
              if (event.responseType === 'answer') {
                setChatHistory(prev => [...prev, { type: 'answer', user: message, recipe: preview, assistantSummary: event.answer }]);
              } else if (event.requiresConfirmation) {
                setPending({ recipe: event.recipe, summary: event.changeSummary });
                setChatHistory(prev => [...prev, { type: 'modification', user: message, recipe: event.recipe, assistantSummary: event.changeSummary }]);
              } else {
                setPreview(event.recipe);
                setChatHistory(prev => [...prev, { type: 'modification', user: message, recipe: event.recipe, assistantSummary: event.changeSummary }]);
              }
            } else if (event.type === 'error') {
              throw new Error(event.error);
            }
          } catch (parseErr) { /* skip malformed events */ }
        }
      }
    } catch (err: any) {
      setChatError(err.message ?? 'Request failed');
      setStreamingText('');
    } finally {
      setChatLoading(false);
      chatInputRef.current?.focus();
    }
  };

  const handleApply = () => {
    if (!pending) return;
    setPreview(pending.recipe);
    setPending(null);
  };

  const handleCancel = () => {
    setChatHistory(prev => prev.slice(0, -1));
    setPending(null);
  };

  const handleChatKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleChatSend(); }
  };

  const handleOpenInEditor = () => {
    if (!preview) return;
    sessionStorage.setItem('soupdog_import', JSON.stringify(preview));
    router.push('/my/recipes/new?import=1');
  };

  const stepCount = (preview?.groups ?? []).reduce((n: number, g: any) => n + (g.steps?.length ?? 0), 0);

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 24px 100px' }}>

      <div className="border-b border-[var(--border)] px-4 md:px-8 py-3 flex items-center gap-3 -mx-6 mb-8">
        <Link href="/my/recipes"
          className="flex items-center gap-1.5 text-[11px] font-mono text-[var(--muted)] hover:text-[var(--accent)] transition-colors">
          <ArrowLeft size={12} /> My Recipes
        </Link>
        <span className="text-[var(--border)]">/</span>
        <span className="text-[11px] font-mono text-[var(--fg)]">Add recipe</span>
        <span style={{ marginLeft: 'auto' }}>
          <Link href="/my/recipes/new"
            style={{ fontFamily: MONO, fontSize: 10, color: 'var(--muted)', textDecoration: 'none' }}
            className="hover:text-[var(--accent)] transition-colors">
            Use form editor →
          </Link>
        </span>
      </div>

      <p style={{ fontFamily: MONO, fontSize: 11, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 24 }}>
        Paste a recipe from anywhere — a website, cookbook, or your own notes — and Soupdog will structure it for you.
        You can adjust it before saving.
      </p>

      {status !== 'done' && (
        <>
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <div style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'var(--muted)' }}>
                Recipe text
              </div>
              <button onClick={() => setText(EXAMPLE)}
                style={{ fontFamily: MONO, fontSize: 9, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                Load example
              </button>
            </div>
            <textarea value={text} onChange={e => setText(e.target.value)}
              placeholder="Paste recipe here — title, ingredients, method, serving size, timings…"
              style={{ width: '100%', minHeight: 320, padding: '12px 14px', border: B,
                background: 'var(--surface)', color: 'var(--fg)', fontFamily: MONO, fontSize: 12,
                outline: 'none', resize: 'vertical', lineHeight: 1.7, boxSizing: 'border-box' }} />
            <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--muted)', marginTop: 4 }}>
              {text.length} / 20,000 characters
            </div>
          </div>

          <div style={{ border: B, padding: '12px 16px', marginBottom: 20, background: 'var(--surface-hover)' }}>
            <div style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--muted)', marginBottom: 8 }}>
              Tips for best results
            </div>
            {['Include serving size and total time if available',
              'Numbered steps work best',
              'Ingredient quantities in any unit — Soupdog converts to metric',
              'You can paste recipes in any language',
              'Review and adjust the result before saving',
            ].map((tip, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8,
                fontFamily: MONO, fontSize: 10, color: 'var(--muted)', marginBottom: i < 4 ? 5 : 0, lineHeight: 1.5 }}>
                <span style={{ color: 'var(--accent)', flexShrink: 0 }}>·</span>{tip}
              </div>
            ))}
          </div>

          {status === 'error' && error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
              border: '1px solid #b45309', background: '#fef3c7', fontFamily: MONO, fontSize: 11,
              color: '#92400e', marginBottom: 16 }}>
              <AlertTriangle size={12} />{error}
            </div>
          )}
        </>
      )}

      {status === 'done' && preview && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 24, alignItems: 'start' }}>

          {/* Recipe preview */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
              border: B, background: 'var(--surface-hover)', fontFamily: MONO, fontSize: 11,
              color: 'var(--muted)', marginBottom: 20 }}>
              {stepCount} steps · {preview.ingredients?.length ?? 0} ingredients
              {chatHistory.filter(t => t.type === 'modification').length > 0 && (
                <span style={{ marginLeft: 8, color: 'var(--accent)' }}>
                  · {chatHistory.filter(t => t.type === 'modification').length} edit{chatHistory.filter(t => t.type === 'modification').length !== 1 ? 's' : ''}
                </span>
              )}
            </div>

            <div style={{ border: B }}>
              <div style={{ padding: '16px 20px', borderBottom: B }}>
                <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 400, margin: '0 0 8px' }}>
                  {preview.title}
                </h2>
                {preview.description && (
                  <p style={{ fontFamily: MONO, fontSize: 11, color: 'var(--muted)', margin: '0 0 10px', lineHeight: 1.6 }}>
                    {preview.description}
                  </p>
                )}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                  {[['Serves', preview.servings], ['Total time', preview.totalTimeMinutes ? `${preview.totalTimeMinutes} min` : null],
                    ['Difficulty', preview.difficulty], ['Cuisine', preview.cuisine]]
                    .filter(([, v]) => v).map(([label, value]) => (
                    <div key={label as string} style={{ fontFamily: MONO, fontSize: 10 }}>
                      <span style={{ color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.12em', marginRight: 6 }}>{label}</span>
                      <span style={{ color: 'var(--fg)' }}>{value}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ padding: '14px 20px', borderBottom: B }}>
                <div style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'var(--muted)', marginBottom: 10 }}>
                  Ingredients ({preview.ingredients?.length ?? 0})
                </div>
                <table style={{ borderCollapse: 'collapse', border: B, width: '100%', fontSize: 12 }}>
                  <tbody>
                    {(preview.ingredients ?? []).map((ing: any, i: number) => (
                      <tr key={i} style={{ borderTop: i > 0 ? B : 'none' }}>
                        <td style={{ padding: '6px 12px', fontFamily: MONO, fontSize: 11, color: 'var(--muted)', borderRight: B, whiteSpace: 'nowrap' as const }}>
                          {ing.quantityValue} {ing.quantityUnit}
                        </td>
                        <td style={{ padding: '6px 12px', fontWeight: 500 }}>{ing.name}</td>
                        <td style={{ padding: '6px 12px', fontFamily: MONO, fontSize: 10, color: 'var(--muted)' }}>{ing.prepNote ?? ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ padding: '14px 20px' }}>
                <div style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'var(--muted)', marginBottom: 10 }}>
                  Steps ({stepCount})
                </div>
                {(preview.groups ?? []).map((group: any, gi: number) => (
                  <div key={gi} style={{ marginBottom: gi < (preview.groups.length - 1) ? 16 : 0 }}>
                    {group.outputName && (
                      <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
                        letterSpacing: '0.15em', color: 'var(--fg)', marginBottom: 8, paddingBottom: 4, borderBottom: B }}>
                        {group.outputName}
                      </div>
                    )}
                    {(group.steps ?? []).map((step: any, si: number) => (
                      <div key={si} style={{ display: 'flex', gap: 12, marginBottom: 8, paddingBottom: 8,
                        borderBottom: si < group.steps.length - 1 ? `1px dashed var(--border)` : 'none' }}>
                        <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--muted)', flexShrink: 0,
                          width: 20, textAlign: 'right' as const, paddingTop: 2 }}>{si + 1}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 12, lineHeight: 1.6, margin: '0 0 4px', color: 'var(--fg)' }}>{step.instruction}</p>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            {step.durationMinutes > 0 && <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--muted)' }}>⏱ {step.durationMinutes} min</span>}
                            {step.taskFamily && <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{step.taskFamily}</span>}
                            {(step.stepIngredients ?? []).length > 0 && <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--muted)' }}>{step.stepIngredients.join(', ')}</span>}
                            {(step.stepTools ?? []).length > 0 && <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--muted)', border: '1px solid var(--border)', padding: '1px 5px' }}>🔧 {step.stepTools.join(', ')}</span>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Chat panel */}
          <div style={{ position: 'sticky', top: 24 }}>
            <div style={{ border: B, background: 'var(--surface)', display: 'flex', flexDirection: 'column', maxHeight: '80vh' }}>

              <div style={{ padding: '10px 16px', borderBottom: B, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'var(--muted)' }}>
                  Adjust recipe
                </span>
                {chatHistory.length > 0 && (
                  <button onClick={() => { setChatHistory([]); setPending(null); }}
                    title="Clear history"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 2, display: 'flex', alignItems: 'center' }}>
                    <RotateCcw size={11} />
                  </button>
                )}
              </div>

              <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px',
                display: 'flex', flexDirection: 'column', gap: 10, minHeight: 160, maxHeight: 360 }}>

                {chatHistory.length === 0 && !chatLoading && (
                  <>
                    <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--muted)', lineHeight: 1.6, textAlign: 'center', padding: '12px 0' }}>
                      Ask questions or give instructions — <em>'What can I substitute for guanciale?'</em> or <em>'Make it vegetarian'</em>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {['Make it vegetarian', 'Scale to 6 servings', 'Break down steps further', 'Add timing to each step'].map(s => (
                        <button key={s} onClick={() => setChatInput(s)}
                          style={{ textAlign: 'left', background: 'var(--surface-hover)', border: B,
                            padding: '7px 10px', cursor: 'pointer', fontFamily: MONO, fontSize: 10, color: 'var(--muted)', transition: 'color 0.15s' }}
                          onMouseEnter={e => (e.currentTarget.style.color = 'var(--fg)')}
                          onMouseLeave={e => (e.currentTarget.style.color = 'var(--muted)')}>
                          {s}
                        </button>
                      ))}
                    </div>
                  </>
                )}

                {chatHistory.map((turn, i) => {
                  const isPending = pending && i === chatHistory.length - 1 && turn.type === 'modification';
                  return (
                    <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      <div style={{ alignSelf: 'flex-end', background: 'var(--accent)', color: '#fff',
                        padding: '6px 10px', maxWidth: '85%', fontFamily: MONO, fontSize: 10, lineHeight: 1.5 }}>
                        {turn.user}
                      </div>
                      {isPending ? (
                        <div style={{ border: '1px solid var(--accent)', background: 'var(--accent-subtle)',
                          padding: '10px 12px', fontFamily: MONO, fontSize: 10, lineHeight: 1.5 }}>
                          <div style={{ color: 'var(--fg)', marginBottom: 8 }}>{turn.assistantSummary}</div>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button onClick={handleApply}
                              style={{ flex: 1, padding: '6px 0', background: 'var(--accent)', color: '#fff',
                                border: 'none', cursor: 'pointer', fontFamily: MONO, fontSize: 10 }}>
                              Apply
                            </button>
                            <button onClick={handleCancel}
                              style={{ flex: 1, padding: '6px 0', background: 'none', color: 'var(--muted)',
                                border: B, cursor: 'pointer', fontFamily: MONO, fontSize: 10 }}>
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : turn.type === 'answer' ? (
                        <div style={{ alignSelf: 'flex-start', background: 'var(--surface-hover)', border: B,
                          padding: '8px 12px', maxWidth: '85%', fontFamily: MONO, fontSize: 10,
                          color: 'var(--fg)', lineHeight: 1.6 }}>
                          {turn.assistantSummary}
                        </div>
                      ) : (
                        <div style={{ alignSelf: 'flex-start', background: 'var(--surface-hover)', border: B,
                          padding: '6px 10px', maxWidth: '85%', fontFamily: MONO, fontSize: 10,
                          color: 'var(--muted)', lineHeight: 1.5 }}>
                          ✓ {turn.assistantSummary}
                        </div>
                      )}
                    </div>
                  );
                })}

                {(chatLoading || streamingText) && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {streamingText ? (
                      <div style={{ alignSelf: 'flex-start', background: 'var(--surface-hover)', border: B,
                        padding: '8px 12px', maxWidth: '85%', fontFamily: MONO, fontSize: 10,
                        color: 'var(--fg)', lineHeight: 1.6 }}>
                        {streamingText}<span style={{ opacity: 0.4 }}>▋</span>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: MONO, fontSize: 10, color: 'var(--muted)' }}>
                        <Loader2 size={11} className="animate-spin" /> Thinking…
                      </div>
                    )}
                  </div>
                )}

                {chatError && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px',
                    border: '1px solid #b45309', background: '#fef3c7', fontFamily: MONO, fontSize: 10, color: '#92400e' }}>
                    <AlertTriangle size={10} />{chatError}
                  </div>
                )}

                <div ref={chatEndRef} />
              </div>

              <div style={{ borderTop: B, padding: '10px 12px', display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <textarea ref={chatInputRef} value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={handleChatKeyDown}
                  placeholder="Ask a question or give an instruction…"
                  rows={2} disabled={chatLoading || !!pending}
                  style={{ flex: 1, padding: '8px 10px', border: B, background: 'var(--bg)',
                    color: 'var(--fg)', fontFamily: MONO, fontSize: 11, outline: 'none',
                    resize: 'none', lineHeight: 1.5, opacity: (chatLoading || !!pending) ? 0.4 : 1 }} />
                <button onClick={handleChatSend}
                  disabled={chatLoading || !chatInput.trim() || !!pending}
                  style={{ padding: '8px 10px', border: 'none', background: 'var(--accent)', color: '#fff',
                    cursor: (chatLoading || !chatInput.trim() || !!pending) ? 'not-allowed' : 'pointer',
                    opacity: (chatLoading || !chatInput.trim() || !!pending) ? 0.4 : 1,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {chatLoading ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                </button>
              </div>
              <div style={{ padding: '5px 12px', borderTop: B, fontFamily: MONO, fontSize: 9, color: 'var(--muted)', opacity: 0.6 }}>
                Enter to send · Shift+Enter for new line
              </div>
            </div>
          </div>
        </div>
      )}

      {status === 'done' && (
        <div className="fixed bottom-0 left-0 right-0 bg-[var(--surface)] border-t border-[var(--border)] px-6 py-3 flex items-center justify-between z-50">
          <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--muted)' }}>
            {chatHistory.filter(t => t.type === 'modification').length > 0
              ? `${chatHistory.filter(t => t.type === 'modification').length} edit${chatHistory.filter(t => t.type === 'modification').length !== 1 ? 's' : ''} — open in editor to save`
              : 'Review then open in editor to save'}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => { setStatus('idle'); setPreview(null); setChatHistory([]); setPending(null); }}
              style={{ padding: '8px 16px', border: '1px solid var(--border)', background: 'none',
                fontFamily: MONO, fontSize: 11, cursor: 'pointer', color: 'var(--muted)' }}>
              ← Try again
            </button>
            <button onClick={handleOpenInEditor}
              style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 20px', border: 'none',
                background: 'var(--accent)', color: '#fff', fontFamily: MONO, fontSize: 11, cursor: 'pointer' }}>
              Open in editor <ChevronRight size={12} />
            </button>
          </div>
        </div>
      )}

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
            <button onClick={handleImport} disabled={status === 'loading' || !text.trim()}
              style={{ padding: '8px 20px', border: 'none', background: 'var(--accent)', color: '#fff',
                fontFamily: MONO, fontSize: 11,
                cursor: status === 'loading' || !text.trim() ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', gap: 7,
                opacity: status === 'loading' || !text.trim() ? 0.6 : 1 }}>
              {status === 'loading' ? <><Loader2 size={12} className="animate-spin" /> Parsing…</> : 'Import'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
