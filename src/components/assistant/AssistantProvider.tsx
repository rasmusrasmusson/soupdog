'use client';
// src/components/assistant/AssistantProvider.tsx
//
// Global state for the site-wide assistant dock. Holds:
//   • the CURRENT PAGE CONTEXT (what the user is looking at) — pages publish it
//     via useAssistantContext(); the dock reads it so "this"/"it" resolves;
//   • the CONVERSATION (messages) — lives here so it follows the user across
//     navigation (the dock is mounted once in AppShell, never unmounts);
//   • the open/collapsed UI state.
//
// Mounted once inside AppShell (logged-in only). Logged-out users use the
// MarketingShell and never see the dock — so the access gate is structural.

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';

export interface PageContext {
  entityType: string;            // 'ingredient' | 'tool' | 'technique' | 'recipe' | 'page'
  entityName?: string;
  summary?: string;
  facts?: Record<string, any> | string;
}

export interface AssistantMsg { role: 'user' | 'assistant'; content: string; links?: { url: string; label: string }[] }

interface AssistantState {
  // page context
  pageContext: PageContext | null;
  setPageContext: (c: PageContext | null) => void;
  // conversation
  messages: AssistantMsg[];
  setMessages: React.Dispatch<React.SetStateAction<AssistantMsg[]>>;
  // ui
  open: boolean;
  setOpen: (v: boolean) => void;
}

const Ctx = createContext<AssistantState | null>(null);

export function AssistantProvider({ children }: { children: React.ReactNode }) {
  const [pageContext, setPageContext] = useState<PageContext | null>(null);
  const [messages, setMessages] = useState<AssistantMsg[]>([]);
  const [open, setOpen] = useState(true); // open by default

  return (
    <Ctx.Provider value={{ pageContext, setPageContext, messages, setMessages, open, setOpen }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAssistant(): AssistantState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAssistant must be used within AssistantProvider');
  return v;
}

// Pages call this to publish what the user is looking at. Clears on unmount so
// navigating to a page that doesn't publish context returns the dock to the
// general "browsing Soupdog" mode.
export function useAssistantContext(ctx: PageContext | null) {
  const v = useContext(Ctx);
  // Stable-ish signature so we don't thrash on every render.
  const sig = JSON.stringify(ctx);
  const setRef = useRef(v?.setPageContext);
  setRef.current = v?.setPageContext;

  useEffect(() => {
    setRef.current?.(ctx);
    return () => setRef.current?.(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);
}

// Convenience for the dock: returns a noop-safe handle even outside the provider
// (so the dock can be defensively imported anywhere).
export function useAssistantSafe(): AssistantState | null {
  return useContext(Ctx);
}
