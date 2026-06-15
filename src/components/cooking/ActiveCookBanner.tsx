// src/components/cooking/ActiveCookBanner.tsx
'use client';

// A persistent "you're cooking" strip — the way back to a live session from anywhere
// (the delivery-app active-order pattern: the session finds you, you don't navigate
// back to it). Mounted in the app shell, so it appears on every logged-in page while a
// cook is in progress; tapping it returns to the cooking screen.
//
// SEAM FOR LATER (do not build yet): this renders a SET of sessions. Today the set is
// "my own active session(s)". The same component, fed a wider set, becomes the
// multi-session view — a cook managing several, and eventually a head chef / franchise
// overseeing others' sessions. That wider set is an ACCESS concern (Sharing &
// Delegation: delegated read of others' sessions), not a change here. Keep this taking
// a list so that future is a data-scope change, not a rebuild.

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ChefHat, X } from 'lucide-react';

interface SessionSummary {
  id: string; mealCanonicalId: string; title: string;
  status: 'active' | 'paused' | 'completed' | 'abandoned';
}

export function ActiveCookBanner() {
  const router = useRouter();
  const pathname = usePathname();
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  // Fetch the caller's active/paused cooks. Refreshes on navigation so finishing a
  // cook removes the strip without a manual reload.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/my/cooking-sessions');
        if (!res.ok) return;
        const { sessions: all } = await res.json();
        if (cancelled) return;
        const live = (all ?? []).filter((s: SessionSummary) => s.status === 'active' || s.status === 'paused');
        setSessions(live);
      } catch { /* silent — the banner is non-critical chrome */ }
    })();
    return () => { cancelled = true; };
  }, [pathname]);

  // Don't show the strip for a session while you're already on its screen.
  const onSessionScreen = (sid: string) => pathname === `/my/cooking-sessions/${sid}`;
  const visible = sessions.filter(s => !dismissed.has(s.id) && !onSessionScreen(s.id));
  if (visible.length === 0) return null;

  // v1: surface the most recent live cook. (When the multi-session view lands, this
  // becomes a list/dashboard — same data, wider scope.)
  const s = visible[0];

  return (
    <button
      onClick={() => router.push(`/my/cooking-sessions/${s.id}`)}
      style={{
        position: 'fixed', left: '50%', transform: 'translateX(-50%)', bottom: 16, zIndex: 60,
        display: 'inline-flex', alignItems: 'center', gap: 10,
        background: 'var(--accent)', color: 'var(--bg)', border: 'none',
        borderRadius: 999, padding: '10px 16px 10px 18px', cursor: 'pointer',
        boxShadow: '0 6px 24px rgba(0,0,0,0.18)', fontFamily: 'var(--font-mono)', fontSize: 12,
        maxWidth: 'calc(100vw - 32px)',
      }}
    >
      <ChefHat size={15} />
      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {s.status === 'paused' ? 'Paused' : 'Cooking'} · {s.title} — tap to resume
      </span>
      {visible.length > 1 && (
        <span style={{ background: 'var(--bg)', color: 'var(--accent)', borderRadius: 999, padding: '1px 7px', fontSize: 10.5 }}>
          +{visible.length - 1}
        </span>
      )}
      <span
        role="button"
        aria-label="Dismiss"
        onClick={(e) => { e.stopPropagation(); setDismissed(d => new Set(d).add(s.id)); }}
        style={{ display: 'inline-flex', marginLeft: 2, opacity: 0.8 }}
      >
        <X size={14} />
      </span>
    </button>
  );
}
