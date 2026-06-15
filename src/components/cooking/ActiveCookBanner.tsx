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
  const [ended, setEnded] = useState<Set<string>>(new Set());

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

  // Stop a session from anywhere — the "I walked away and it's still running, end it"
  // case. Marks it abandoned and removes the strip immediately.
  const stop = async (sid: string) => {
    setEnded(e => new Set(e).add(sid));   // optimistic remove
    try {
      await fetch(`/api/my/cooking-sessions/${sid}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionStatus: 'abandoned' }),
      });
    } catch { /* if it fails it reappears on next navigation */ }
  };

  // Hide the banner entirely while the user is anywhere in the cooking area — they're
  // already looking at a session, so a "resume" prompt is noise. (Covers the session
  // screen and any future cooking sub-pages.)
  const inCookingArea = pathname?.startsWith('/my/cooking-sessions');
  const visible = inCookingArea ? [] : sessions.filter(s => !ended.has(s.id));
  if (visible.length === 0) return null;

  // Only ever surface ONE session (the most recent live cook). When the multi-session
  // view lands, this becomes a list/dashboard — same data, wider scope.
  const s = visible[0];

  return (
    <div
      style={{
        position: 'fixed', left: '50%', transform: 'translateX(-50%)', bottom: 16, zIndex: 60,
        display: 'inline-flex', alignItems: 'center', gap: 10,
        background: 'var(--accent)', color: 'var(--bg)',
        borderRadius: 999, padding: '8px 10px 8px 18px',
        boxShadow: '0 6px 24px rgba(0,0,0,0.18)', fontFamily: 'var(--font-mono)', fontSize: 12,
        maxWidth: 'calc(100vw - 32px)',
      }}
    >
      <button
        onClick={() => router.push(`/my/cooking-sessions/${s.id}`)}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 9, background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit', padding: 0, minWidth: 0 }}
      >
        <ChefHat size={15} style={{ flexShrink: 0 }} />
        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {s.status === 'paused' ? 'Paused' : 'Cooking'} · {s.title} — tap to resume
        </span>
      </button>
      <button
        aria-label="Stop cooking"
        title="Stop cooking"
        onClick={() => stop(s.id)}
        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: 999, background: 'rgba(255,255,255,0.18)', border: 'none', color: 'inherit', cursor: 'pointer', flexShrink: 0 }}
      >
        <X size={13} />
      </button>
    </div>
  );
}
