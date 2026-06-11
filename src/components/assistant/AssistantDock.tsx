'use client';
// src/components/assistant/AssistantDock.tsx
//
// The global assistant — a FLOATING overlay (Facebook/Intercom pattern), not a
// layout column, so it costs zero page width. Collapsed = a small sparkle
// bubble bottom-right; expanded = a floating panel above the page. Conversation
// + page context come from AssistantProvider, so the chat follows the user
// across navigation and knows what page they're on.
//
// Streams from /api/assistant (Soupdog/food-scoped, read-only). On mobile the
// expanded state is a full-screen sheet.

import React, { useState, useRef, useEffect } from 'react';
import { Send, ChevronDown } from 'lucide-react';
import { useAssistant } from './AssistantProvider';

const MONO = 'var(--font-mono)';
const MUT = 'var(--muted)';
const FG = 'var(--fg)';
const ACCENT = 'var(--accent)';
const B = '1px solid var(--border)';

function Sparkle({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3z" />
    </svg>
  );
}

export function AssistantDock() {
  const { pageContext, messages, setMessages, open, setOpen } = useAssistant();
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, streaming, open]);

  async function send(text?: string) {
    const msg = (text ?? input).trim();
    if (!msg || streaming) return;
    setInput('');
    const history = messages.slice(-8);
    setMessages(m => [...m, { role: 'user', content: msg }, { role: 'assistant', content: '' }]);
    setStreaming(true);
    try {
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context: pageContext ?? { entityType: 'page' }, message: msg, history }),
      });
      if (!res.ok || !res.body) {
        const e = await res.json().catch(() => ({}));
        setMessages(m => { const n = [...m]; n[n.length - 1] = { role: 'assistant', content: e.error ?? 'Something went wrong. Please try again.' }; return n; });
        setStreaming(false); return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of decoder.decode(value, { stream: true }).split('\n')) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (!data) continue;
          try {
            const ev = JSON.parse(data);
            if (ev.type === 'chunk') {
              acc += ev.text;
              setMessages(m => { const n = [...m]; n[n.length - 1] = { role: 'assistant', content: acc }; return n; });
            } else if (ev.type === 'error') {
              acc = acc || 'Something went wrong. Please try again.';
              setMessages(m => { const n = [...m]; n[n.length - 1] = { role: 'assistant', content: acc }; return n; });
            }
          } catch { /* skip */ }
        }
      }
    } catch {
      setMessages(m => { const n = [...m]; n[n.length - 1] = { role: 'assistant', content: 'Something went wrong. Please try again.' }; return n; });
    } finally {
      setStreaming(false);
    }
  }

  const here = pageContext?.entityName;
  const suggestions = here
    ? [`Tell me more about ${here.toLowerCase()}`, `What can I make with ${here.toLowerCase()}?`, `What can I substitute it with?`]
    : ['What can you help me with?', 'Suggest a quick dinner idea', 'How do I plan my meals here?'];

  // ── Collapsed: floating sparkle bubble, bottom-right ───────────
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="no-print"
        title="Ask Soupdog"
        style={{
          position: 'fixed', right: 20, bottom: 20, zIndex: 70,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 52, height: 52, borderRadius: '50%',
          background: ACCENT, color: '#fff', border: 'none', cursor: 'pointer',
          boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
        }}
      >
        <Sparkle size={22} />
      </button>
    );
  }

  // ── Expanded: floating panel (overlay) — full-screen on mobile ─
  return (
    <div
      className="no-print"
      style={{
        position: 'fixed', zIndex: 70,
        // desktop: floating card bottom-right; mobile: full-screen sheet
        right: 'var(--dock-right, 20px)', bottom: 'var(--dock-bottom, 20px)',
      }}
    >
      <div
        style={{
          display: 'flex', flexDirection: 'column',
          width: 'min(380px, calc(100vw - 40px))',
          height: 'min(560px, calc(100vh - 120px))',
          background: 'var(--bg)', border: B,
          boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 14px', borderBottom: B }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7,
            fontFamily: MONO, fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', color: MUT }}>
            <span style={{ color: ACCENT }}><Sparkle size={12} /></span> Ask Soupdog
          </span>
          <button onClick={() => setOpen(false)} title="Minimise"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: MUT, padding: 2 }}>
            <ChevronDown size={18} />
          </button>
        </div>

        {/* Context chip */}
        {here && (
          <div style={{ fontFamily: MONO, fontSize: 9, color: MUT, textTransform: 'uppercase',
            letterSpacing: '0.1em', padding: '8px 14px', borderBottom: B }}>
            Looking at: <span style={{ color: FG }}>{here}</span>
          </div>
        )}

        {/* Messages */}
        <div ref={scrollRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '14px' }}>
          {messages.length === 0 ? (
            <div>
              <p style={{ fontSize: 12.5, lineHeight: 1.6, color: MUT, margin: '0 0 12px' }}>
                Ask me anything about{here ? ` ${here.toLowerCase()}` : ' food'}, cooking, or Soupdog.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {suggestions.map(s => (
                  <button key={s} onClick={() => send(s)}
                    style={{ textAlign: 'left', fontSize: 12.5, color: ACCENT, background: 'none',
                      border: B, padding: '7px 10px', cursor: 'pointer', lineHeight: 1.3 }}
                    className="hover:bg-[var(--surface-hover)] transition-colors">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {messages.map((m, i) => (
                <div key={i} style={{
                  fontSize: 13, lineHeight: 1.6,
                  color: m.role === 'user' ? FG : 'var(--fg-secondary)',
                  padding: m.role === 'user' ? '8px 10px' : 0,
                  background: m.role === 'user' ? 'var(--surface)' : 'transparent',
                  border: m.role === 'user' ? B : 'none',
                  whiteSpace: 'pre-wrap',
                }}>
                  {m.content || (streaming && i === messages.length - 1
                    ? <span style={{ color: MUT, fontStyle: 'italic' }}>…</span> : '')}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Input */}
        <div style={{ borderTop: B, padding: '10px 12px' }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="Ask a question…"
              rows={2}
              style={{ flex: 1, border: B, background: 'var(--surface)', padding: '8px 10px',
                fontSize: 13, color: FG, outline: 'none', resize: 'none', fontFamily: 'inherit', lineHeight: 1.4 }}
            />
            <button onClick={() => send()} disabled={streaming || !input.trim()} title="Send"
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 34, height: 34, background: ACCENT, border: 'none', color: '#fff',
                cursor: (streaming || !input.trim()) ? 'default' : 'pointer',
                opacity: (streaming || !input.trim()) ? 0.5 : 1, flexShrink: 0 }}>
              <Send size={14} />
            </button>
          </div>
          <p style={{ fontFamily: MONO, fontSize: 9, color: MUT, margin: '6px 0 0', lineHeight: 1.4 }}>
            Soupdog's assistant can make mistakes. Double-check anything important.
          </p>
        </div>
      </div>
    </div>
  );
}
