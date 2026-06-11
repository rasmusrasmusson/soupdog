'use client';
// src/components/assistant/AssistantDock.tsx
//
// The global assistant — an INTEGRATED right rail (the "butler"), present on
// every logged-in page as part of the layout (like the recipe editor's chat).
// Full height, its own column. Conversation + page context come from
// AssistantProvider, so the chat follows the user across navigation and knows
// what page they're on.
//
// Collapsible: a slim collapse control tucks it to a thin tab so users can
// reclaim width when they want. Streams from /api/assistant (Soupdog-scoped,
// read-only). Desktop (lg+) only; mobile gets a future full-screen treatment.

import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Send, ChevronRight, ChevronLeft } from 'lucide-react';
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
  const router = useRouter();
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, streaming, open]);

  function setLast(content: string) {
    setMessages(m => { const n = [...m]; n[n.length - 1] = { role: 'assistant', content }; return n; });
  }

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
        setLast(e.error ?? 'Something went wrong. Please try again.');
        setStreaming(false); return;
      }

      // The route returns JSON for actions (navigate / search / answerText) and
      // an SSE stream for normal answers. Branch on content-type.
      const ctype = res.headers.get('Content-Type') ?? '';
      if (ctype.includes('application/json')) {
        const data = await res.json();
        if (data.navigate) {
          setLast(`Taking you to ${data.label ?? 'that page'}…`);
          setStreaming(false);
          router.push(data.navigate);
          return;
        }
        // Search result: text + optional clickable destinations.
        const links: { url: string; label: string }[] = [];
        if (data.navigateOffer) links.push(data.navigateOffer);
        if (Array.isArray(data.options)) links.push(...data.options);
        if (Array.isArray(data.more)) links.push(...data.more);
        setMessages(m => {
          const n = [...m];
          n[n.length - 1] = {
            role: 'assistant',
            content: data.answerText ?? 'Something went wrong. Please try again.',
            links: links.length ? links : undefined,
          };
          return n;
        });
        setStreaming(false);
        return;
      }

      // Streaming answer
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
            if (ev.type === 'chunk') { acc += ev.text; setLast(acc); }
            else if (ev.type === 'error') { setLast(acc || 'Something went wrong. Please try again.'); }
          } catch { /* skip */ }
        }
      }
    } catch {
      setLast('Something went wrong. Please try again.');
    } finally {
      setStreaming(false);
    }
  }

  const here = pageContext?.entityName;

  // ── Collapsed: a thin tab the user can re-open ─────────────────
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="hidden lg:flex no-print"
        title="Open assistant"
        style={{
          flexShrink: 0, width: 40, borderLeft: B, background: 'var(--bg)',
          flexDirection: 'column', alignItems: 'center', gap: 10,
          paddingTop: 18, cursor: 'pointer', border: 'none', borderLeftWidth: 1,
          borderLeftStyle: 'solid', borderLeftColor: 'var(--border)',
        }}
      >
        <ChevronLeft size={16} style={{ color: MUT }} />
        <span style={{ color: ACCENT }}><Sparkle size={16} /></span>
        <span style={{ writingMode: 'vertical-rl', fontFamily: MONO, fontSize: 10,
          letterSpacing: '0.15em', textTransform: 'uppercase', color: MUT, marginTop: 6 }}>
          Ask Soupdog
        </span>
      </button>
    );
  }

  // ── Open: integrated rail ──────────────────────────────────────
  return (
    <aside
      className="hidden lg:flex no-print"
      style={{
        width: 300, flexShrink: 0, borderLeft: B, background: 'var(--bg)',
        height: '100%', flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 16px', borderBottom: B }}>
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
          letterSpacing: '0.1em', padding: '8px 16px', borderBottom: B }}>
          Looking at: <span style={{ color: FG }}>{here}</span>
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '14px 16px' }}>
        {messages.length === 0 ? (
          <p style={{ fontSize: 12.5, lineHeight: 1.6, color: MUT, margin: 0 }}>
            Ask me anything about{here ? ` ${here.toLowerCase()}` : ' food'}, cooking, or Soupdog —
            substitutions, what to make, how the site works.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {messages.map((m, i) => (
              <div key={i}>
                <div style={{
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
                {m.links && m.links.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                    {m.links.map((lk, li) => (
                      <button key={li} onClick={() => router.push(lk.url)}
                        style={{ textAlign: 'left', fontSize: 12.5, color: ACCENT, background: 'none',
                          border: B, padding: '7px 10px', cursor: 'pointer', lineHeight: 1.3,
                          display: 'inline-flex', alignItems: 'center', gap: 6 }}
                        className="hover:bg-[var(--surface-hover)] transition-colors">
                        <span style={{ color: ACCENT }}>→</span> {lk.label}
                      </button>
                    ))}
                  </div>
                )}
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
          Soupdog's assistant can make mistakes.
        </p>
      </div>
    </aside>
  );
}
