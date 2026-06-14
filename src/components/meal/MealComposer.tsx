// src/components/meal/MealComposer.tsx
'use client';

// AI compose — Slice B (the butler panel).
//
// A small conversational surface in the meal editor. The cook describes what
// they feel like — precise ("carbonara, a rocket salad, a negroni"), partial
// ("doing the carbonara, what goes with it?"), or open ("something sweet, dunno")
// — and the butler answers in ONE of two ways, driven by the compose route:
//
//   • a clarifying question (with tappable quick-options) when the request is too
//     open to choose well, or
//   • suggestion cards (each a real dish/drink from the catalogue, with a reason),
//     which the cook adds individually or all at once.
//
// Accepting a suggestion calls the editor's existing addComponent — so the AI
// path and the manual RecipePicker path converge on the same state and dedup.
// Everything here is client state until the user hits Save in the editor.

import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, Plus, Loader2, CornerDownLeft } from 'lucide-react';

const MONO = { fontFamily: 'var(--font-mono)' } as const;
const SERIF = { fontFamily: 'var(--font-serif, Georgia, serif)' } as const;
const B = '1px solid var(--border)';

// Matches the editor's CompType (UI cares about dish | drink).
type CompType = 'dish' | 'side' | 'drink';

// The addable shape the editor's addComponent expects.
export interface ComposeOption {
  id: string;
  title: string;
  cuisine: string | null;
  totalTimeMinutes: number | null;
}

interface Suggestion {
  canonicalId: string;
  title: string;
  type: CompType;
  cuisine: string | null;
  totalTimeMinutes: number | null;
  reason: string;
}

interface ClarifyingQuestion {
  question: string;
  suggestions: string[];
}

// One entry in the little thread.
type ThreadItem =
  | { kind: 'user'; text: string }
  | { kind: 'question'; q: ClarifyingQuestion }
  | { kind: 'suggestions'; items: Suggestion[]; note?: string }
  | { kind: 'note'; text: string };

export default function MealComposer({
  mealId,
  currentComponentIds,
  onAdd,
}: {
  mealId: string;
  currentComponentIds: string[];
  onAdd: (type: CompType, opt: ComposeOption) => void;
}) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [thread, setThread] = useState<ThreadItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [thread, busy]);

  // Client local time "HH:MM" — lets the butler infer the slot without trusting
  // the server's clock.
  function localTime(): string {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  async function ask(text?: string) {
    const prompt = (text ?? input).trim();
    if (!prompt || busy) return;
    setInput('');
    setThread(t => [...t, { kind: 'user', text: prompt }]);
    setBusy(true);
    try {
      const res = await fetch(`/api/my/meals/${mealId}/compose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, localTime: localTime(), currentComponentIds }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        setThread(t => [...t, { kind: 'note', text: e.error ?? 'Compose failed. Try rephrasing.' }]);
        return;
      }
      const d = await res.json();
      if (d.clarifyingQuestion?.question) {
        setThread(t => [...t, { kind: 'question', q: d.clarifyingQuestion }]);
      } else if (Array.isArray(d.suggestions) && d.suggestions.length) {
        setThread(t => [...t, { kind: 'suggestions', items: d.suggestions, note: d.note }]);
      } else {
        setThread(t => [...t, { kind: 'note', text: d.note ?? 'I couldn’t find a good fit in your dishes for that. Try different words, or add more dishes first.' }]);
      }
    } catch {
      setThread(t => [...t, { kind: 'note', text: 'Something went wrong. Try again.' }]);
    } finally {
      setBusy(false);
    }
  }

  function accept(s: Suggestion) {
    if (added.has(s.canonicalId) || currentComponentIds.includes(s.canonicalId)) return;
    onAdd(s.type, { id: s.canonicalId, title: s.title, cuisine: s.cuisine, totalTimeMinutes: s.totalTimeMinutes });
    setAdded(prev => new Set(prev).add(s.canonicalId));
  }

  function acceptAll(items: Suggestion[]) {
    for (const s of items) accept(s);
  }

  const isAdded = (cid: string) => added.has(cid) || currentComponentIds.includes(cid);

  // ── Collapsed: a single invitation button ──────────────────────
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 26,
          border: '1px dashed var(--border)', borderRadius: 8, background: 'transparent',
          color: 'var(--accent)', cursor: 'pointer', fontSize: 13, padding: '9px 16px',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      >
        <Sparkles size={15} /> Compose with the butler
      </button>
    );
  }

  // ── Open: the conversational panel ─────────────────────────────
  return (
    <div style={{ border: B, borderRadius: 12, marginBottom: 28, background: 'var(--bg)', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: B }}>
        <span style={{ ...MONO, display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--muted)' }}>
          <span style={{ color: 'var(--accent)' }}><Sparkles size={13} /></span> Compose with the butler
        </span>
        <button onClick={() => setOpen(false)} title="Close"
          style={{ ...MONO, fontSize: 10, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          Close
        </button>
      </div>

      {/* Thread */}
      <div ref={scrollRef} style={{ maxHeight: 360, overflowY: 'auto', padding: '14px 16px' }}>
        {thread.length === 0 && (
          <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--muted)', margin: 0 }}>
            Tell me what you feel like — exact (“carbonara, a rocket salad, a negroni”), a starting point
            (“I’m doing the carbonara, what goes with it?”), or open (“something light, maybe Italian”).
            I’ll suggest from your own dishes.
          </p>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {thread.map((item, i) => {
            if (item.kind === 'user') {
              return (
                <div key={i} style={{ alignSelf: 'flex-end', maxWidth: '85%', fontSize: 13, lineHeight: 1.5,
                  color: 'var(--fg)', background: 'var(--surface)', border: B, padding: '8px 11px', borderRadius: 10 }}>
                  {item.text}
                </div>
              );
            }
            if (item.kind === 'note') {
              return <div key={i} style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--fg-secondary, var(--muted))' }}>{item.text}</div>;
            }
            if (item.kind === 'question') {
              return (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                  <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--fg-secondary, var(--fg))' }}>{item.q.question}</div>
                  {item.q.suggestions.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                      {item.q.suggestions.map((s, si) => (
                        <button key={si} onClick={() => ask(s)} disabled={busy}
                          style={{ ...MONO, fontSize: 11, padding: '6px 11px', border: B, borderRadius: 14,
                            background: 'var(--surface)', color: 'var(--fg)', cursor: busy ? 'default' : 'pointer' }}>
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            }
            // suggestions
            const remaining = item.items.filter(s => !isAdded(s.canonicalId));
            return (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {item.note && <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--fg-secondary, var(--fg))' }}>{item.note}</div>}
                {item.items.map((s) => {
                  const done = isAdded(s.canonicalId);
                  return (
                    <div key={s.canonicalId} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', border: B, borderRadius: 10, background: 'var(--surface)' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                          <span style={{ ...SERIF, fontSize: 16, color: 'var(--fg)' }}>{s.title}</span>
                          <span style={{ ...MONO, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted)' }}>{s.type}</span>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--muted)', margin: '2px 0 4px' }}>
                          {[s.cuisine, s.totalTimeMinutes ? `${s.totalTimeMinutes} min` : null].filter(Boolean).join(' · ') || '—'}
                        </div>
                        {s.reason && <div style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--fg-secondary, var(--muted))' }}>{s.reason}</div>}
                      </div>
                      <button onClick={() => accept(s)} disabled={done}
                        style={{ ...MONO, flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11,
                          padding: '6px 11px', border: done ? B : 'none', borderRadius: 8,
                          background: done ? 'transparent' : 'var(--accent)', color: done ? 'var(--muted)' : '#fff',
                          cursor: done ? 'default' : 'pointer' }}>
                        {done ? 'Added' : <><Plus size={12} /> Add</>}
                      </button>
                    </div>
                  );
                })}
                {remaining.length > 1 && (
                  <button onClick={() => acceptAll(item.items)}
                    style={{ ...MONO, alignSelf: 'flex-start', fontSize: 11, padding: '6px 12px', border: B, borderRadius: 8,
                      background: 'transparent', color: 'var(--accent)', cursor: 'pointer' }}>
                    <Plus size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                    Add all {remaining.length}
                  </button>
                )}
              </div>
            );
          })}
          {busy && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: 'var(--muted)', fontStyle: 'italic' }}>
              <Loader2 size={13} className="animate-spin" /> Thinking…
            </div>
          )}
        </div>
      </div>

      {/* Input */}
      <div style={{ borderTop: B, padding: '10px 12px' }}>
        <div style={{ display: 'flex', gap: 7, alignItems: 'flex-end' }}>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(); } }}
            placeholder="Describe the meal…"
            rows={2}
            style={{ flex: 1, border: B, borderRadius: 8, background: 'var(--surface)', padding: '8px 10px',
              fontSize: 13, color: 'var(--fg)', outline: 'none', resize: 'none', fontFamily: 'inherit', lineHeight: 1.4 }}
          />
          <button onClick={() => ask()} disabled={busy || !input.trim()} title="Send"
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36,
              background: 'var(--accent)', border: 'none', borderRadius: 8, color: '#fff',
              cursor: (busy || !input.trim()) ? 'default' : 'pointer', opacity: (busy || !input.trim()) ? 0.5 : 1, flexShrink: 0 }}>
            <CornerDownLeft size={15} />
          </button>
        </div>
        <p style={{ ...MONO, fontSize: 9, color: 'var(--muted)', margin: '6px 0 0', lineHeight: 1.4 }}>
          Suggests from your own dishes — added items stay editable below.
        </p>
      </div>
    </div>
  );
}
