// src/components/cooking/StartCookingButton.tsx
'use client';

// "Start cooking" — creates a cooking session for a meal and routes to the live
// cooking screen. A session is self-contained (it snapshots the recipe at start), so
// starting a cook freezes the current recipe into a resumable work order. If an active
// session already exists for this meal, we resume it rather than starting a duplicate.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, ChefHat } from 'lucide-react';

export function StartCookingButton({ mealId, compact = false }: { mealId: string; compact?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      // If an active session already exists for this meal, resume it directly.
      const listRes = await fetch('/api/my/cooking-sessions');
      if (listRes.ok) {
        const { sessions } = await listRes.json();
        const existing = (sessions ?? []).find(
          (s: any) => s.mealCanonicalId === mealId && (s.status === 'active' || s.status === 'paused')
        );
        if (existing) { router.push(`/my/cooking-sessions/${existing.id}`); return; }
      }
      // Otherwise go to setup (who's cooking / who does what), which starts the session.
      router.push(`/my/meals/${mealId}/cook-setup`);
    } catch {
      // Even if the check fails, setup can proceed.
      router.push(`/my/meals/${mealId}/cook-setup`);
    }
  };

  if (compact) {
    return (
      <button onClick={start} disabled={busy}
        style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)', background: 'transparent', border: 'none', cursor: busy ? 'default' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5, padding: 0 }}
        className="hover:underline" title={error ?? 'Start cooking'}>
        {busy ? <Loader2 size={12} className="animate-spin" /> : <ChefHat size={12} />} Start cooking
      </button>
    );
  }

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 4 }}>
      <button onClick={start} disabled={busy}
        style={{ fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--bg)', background: 'var(--accent)', border: 'none', borderRadius: 8, padding: '10px 18px', cursor: busy ? 'default' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7 }}>
        {busy ? <Loader2 size={14} className="animate-spin" /> : <ChefHat size={14} />} Start cooking
      </button>
      {error && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: '#b3402e' }}>{error}</span>}
    </div>
  );
}
