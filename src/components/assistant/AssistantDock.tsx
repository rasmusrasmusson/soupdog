'use client';
// src/components/assistant/AssistantDock.tsx
//
// The global assistant. Mounted once in AppShell. Open by default; collapses to
// a small floating tab. Conversation + page context come from AssistantProvider
// so the chat follows the user across navigation and knows what page they're on.
//
// Streams from /api/assistant (Soupdog/food-scoped, read-only). Hidden on narrow
// screens by default (a floating tab on mobile would crowd MobileNav); shows on
// lg+ where there's room, matching the knowledge-rail behaviour.

import React, { useState, useRef, useEffect } from 'react';
import { Send, X, ChevronRight } from 'lucide-react';
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
  }, [messages, streaming]);

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

  // ── Collapsed: a small floating tab on the right edge ──────────
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="hidden lg:flex no-print"
        title="Ask Soupdog"
        style={{
          position: 'fixed', right: 0, bottom: 28, zIndex: 60,
          alignItems: 'center', gap: 8, padding: '10px 14px',
          background: ACCENT, color: '#fff', border: 'none',
          borderRadius: '4px 0 0 4px', cursor: 'pointer',
          fontFamily: MONO, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase',
          boxShadow: '0 2px 12px rgba(0,0,0,0.12)',
        }}
      >
        <Sparkle size={14} /> Ask
      </button>
    );
  }

  // ── Open: docked panel on the right ────────────────────────────
  return (
    <aside
      className="hidden lg:flex no-print"
      style={{
        width: 320, flexShrink: 0, borderLeft: B, background: 'var(--bg)',
        height: '100%', flexDirection: 'column', padding: '16px 16px 14px',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7,
          fontFamily: MONO, fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', color: MUT }}>
          <span style={{ color: ACCENT }}><Sparkle size={12} /></span> Ask Soupdog
        </span>
        <button onClick={() => setOpen(false)} title="Collapse"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: MUT, padding: 2 }}>
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Context chip */}
      {here && (
        <div style={{ fontFamily: MONO, fontSize: 9, color: MUT, textTransform: 'uppercase',
          letterSpacing: '0.1em', marginBottom: 10, paddingBottom: 8, borderBottom: B }}>
          Looking at: <span style={{ color: FG }}>{here}</span>
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', marginBottom: 10 }}>
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
      <p style={{ fontFamily: MONO, fontSize: 9, color: MUT, margin: '8px 0 0', lineHeight: 1.4 }}>
        Soupdog's assistant can make mistakes. Double-check anything important.
      </p>
    </aside>
  );
}
