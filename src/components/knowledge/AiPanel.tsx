'use client';
// src/components/knowledge/AiPanel.tsx
//
// The right-rail assistant. Page-aware (takes a `context` object), Soupdog/
// food-scoped, read-only. Streams from /api/assistant. Three states:
//   • logged-out  → outcome-framed upsell (never says "AI"), no call;
//   • logged-in   → the chat panel;
// The access placeholder = logged-in. The upsell copy is framed by OUTCOME
// per the monetization rule (cooking help, not "unlock AI").

import React, { useState, useRef, useEffect } from 'react';
import { Send, X, Sparkle } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';

const MONO = 'var(--font-mono)';
const MUT = 'var(--muted)';
const FG = 'var(--fg)';
const ACCENT = 'var(--accent)';
const B = '1px solid var(--border)';

export interface AssistantContext {
  entityType: string;          // 'ingredient' | 'tool' | 'technique' | …
  entityName?: string;
  summary?: string;
  facts?: Record<string, any> | string;
}

interface Msg { role: 'user' | 'assistant'; content: string }

export function AiPanel({ context, onClose }: { context: AssistantContext; onClose?: () => void }) {
  const { user, loading } = useAuth();
  const loggedIn = !!user;

  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, streaming]);

  async function send() {
    const text = input.trim();
    if (!text || streaming) return;
    setInput('');
    const history = messages.slice(-8); // last few turns for context
    setMessages(m => [...m, { role: 'user', content: text }, { role: 'assistant', content: '' }]);
    setStreaming(true);

    try {
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context, message: text, history }),
      });
      if (!res.ok || !res.body) {
        const e = await res.json().catch(() => ({}));
        setMessages(m => {
          const next = [...m];
          next[next.length - 1] = { role: 'assistant', content: e.error ?? 'Something went wrong. Please try again.' };
          return next;
        });
        setStreaming(false);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (!data) continue;
          try {
            const ev = JSON.parse(data);
            if (ev.type === 'chunk') {
              acc += ev.text;
              setMessages(m => {
                const next = [...m];
                next[next.length - 1] = { role: 'assistant', content: acc };
                return next;
              });
            } else if (ev.type === 'error') {
              acc = acc || 'Something went wrong. Please try again.';
              setMessages(m => {
                const next = [...m];
                next[next.length - 1] = { role: 'assistant', content: acc };
                return next;
              });
            }
          } catch { /* skip */ }
        }
      }
    } catch {
      setMessages(m => {
        const next = [...m];
        next[next.length - 1] = { role: 'assistant', content: 'Something went wrong. Please try again.' };
        return next;
      });
    } finally {
      setStreaming(false);
    }
  }

  // Suggested openers, tailored to the entity.
  const suggestions = context.entityName
    ? [
        `Tell me more about ${context.entityName.toLowerCase()}`,
        `What can I make with ${context.entityName.toLowerCase()}?`,
        `What can I substitute it with?`,
      ]
    : ['What can you help me with?'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7,
          fontFamily: MONO, fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', color: MUT }}>
          <Sparkle size={12} style={{ color: ACCENT }} /> Ask Soupdog
        </span>
        {onClose && (
          <button onClick={onClose} title="Close"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: MUT, padding: 2 }}>
            <X size={15} />
          </button>
        )}
      </div>

      {/* Logged-out → upsell (outcome-framed, never "AI") */}
      {!loading && !loggedIn ? (
        <div style={{ border: B, padding: 16, background: 'var(--surface)' }}>
          <p style={{ fontSize: 13.5, lineHeight: 1.6, color: FG, margin: '0 0 12px' }}>
            Get cooking help on any page — ask about{context.entityName ? ` ${context.entityName.toLowerCase()},` : ''} ingredients,
            techniques, substitutions and more.
          </p>
          <a href="/signup"
            style={{ display: 'inline-block', fontFamily: MONO, fontSize: 11, color: '#fff',
              background: ACCENT, padding: '8px 16px', textDecoration: 'none',
              textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Sign up free
          </a>
          <p style={{ fontSize: 11, color: MUT, margin: '10px 0 0' }}>
            Already have an account? <a href="/login" style={{ color: ACCENT, textDecoration: 'none' }}>Log in</a>
          </p>
        </div>
      ) : (
        <>
          {/* Messages */}
          <div ref={scrollRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', marginBottom: 10 }}>
            {messages.length === 0 ? (
              <div>
                <p style={{ fontSize: 12.5, lineHeight: 1.6, color: MUT, margin: '0 0 12px' }}>
                  Ask me anything about{context.entityName ? ` ${context.entityName.toLowerCase()}` : ' food'},
                  cooking, or Soupdog.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {suggestions.map(s => (
                    <button key={s} onClick={() => setInput(s)}
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
                      ? <span style={{ color: MUT, fontStyle: 'italic' }}>…</span>
                      : '')}
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
            <button onClick={send} disabled={streaming || !input.trim()} title="Send"
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
        </>
      )}
    </div>
  );
}
