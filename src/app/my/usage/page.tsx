'use client';

// src/app/my/usage/page.tsx
// Read-only AI usage meter. Reads /api/my/usage, shows consumption in calm,
// plain-language form. No enforcement. Credit costs + allowance are placeholders.

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';

type Bucket = { label: string; count: number; credits: number };
type Usage = {
  plan: string;
  allowance: number;
  used: number;
  remaining: number;
  percentUsed: number;
  daysUntilReset: number;
  resetDate: string;
  breakdown: Bucket[];
  isPlaceholder: boolean;
};

const B = '1px solid var(--border)';

export default function UsagePage() {
  const { user, loading: authLoading } = useAuth();
  const [usage, setUsage] = useState<Usage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { setLoading(false); return; }
    fetch('/api/my/usage')
      .then(r => r.ok ? r.json() : Promise.reject(new Error('Could not load usage')))
      .then((d: Usage) => setUsage(d))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [user, authLoading]);

  if (authLoading || loading) {
    return (
      <div style={{ padding: '48px 32px' }}>
        <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.15em' }}>
          Loading…
        </span>
      </div>
    );
  }

  if (!user) {
    return (
      <div style={{ padding: '48px 32px', color: 'var(--muted)' }}>
        Please sign in to see your usage.
      </div>
    );
  }

  if (error || !usage) {
    return (
      <div style={{ padding: '48px 32px', color: 'var(--muted)' }}>
        {error ?? 'No usage data available.'}
      </div>
    );
  }

  // Calm plain-language summary of the fill level.
  const level =
    usage.percentUsed >= 90 ? 'almost all' :
    usage.percentUsed >= 66 ? 'most' :
    usage.percentUsed >= 40 ? 'about half' :
    usage.percentUsed >= 15 ? 'about a third' :
    usage.percentUsed > 0   ? 'a little' : 'none';

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '40px 32px 80px' }}>

      <h1 style={{ fontFamily: 'var(--font-serif, Georgia, serif)', fontSize: 26, fontWeight: 500, margin: '0 0 4px', color: 'var(--fg)' }}>
        Usage
      </h1>
      <p style={{ fontSize: 14, color: 'var(--muted)', margin: '0 0 28px' }}>
        What you&rsquo;ve used Soupdog&rsquo;s assistant for this month.
      </p>

      {/* Plan + summary card */}
      <div style={{ border: B, borderRadius: 10, background: 'var(--surface)', padding: '20px 24px', marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
          <div>
            <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 3 }}>
              Current plan
            </div>
            <div style={{ fontSize: 19, fontWeight: 500, color: 'var(--fg)' }}>{usage.plan}</div>
          </div>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>
            resets in {usage.daysUntilReset} {usage.daysUntilReset === 1 ? 'day' : 'days'}
          </div>
        </div>

        {/* Meter bar */}
        <div style={{ height: 8, background: 'var(--bg)', border: B, borderRadius: 999, overflow: 'hidden', marginBottom: 8 }}>
          <div style={{ width: `${usage.percentUsed}%`, height: '100%', background: 'var(--accent)', borderRadius: 999, transition: 'width 0.4s ease' }} />
        </div>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>
          You&rsquo;ve used {level} of this month&rsquo;s allowance.
        </p>
      </div>

      {/* Breakdown */}
      <div style={{ border: B, borderRadius: 10, background: 'var(--surface)', padding: '20px 24px', marginBottom: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--fg)', marginBottom: 14 }}>
          This month
        </div>

        {usage.breakdown.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>
            You haven&rsquo;t used the assistant yet this month.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {usage.breakdown.map((b) => (
              <div key={b.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: B, paddingBottom: 10 }}>
                <span style={{ fontSize: 14, color: 'var(--fg)' }}>{b.label}</span>
                <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 13, color: 'var(--muted)' }}>
                  {b.count} {b.count === 1 ? 'time' : 'times'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Manage (stubbed — wires to pricing/billing later) */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <a href="/pricing" style={btnStyle}>Change plan</a>
        <a href="/pricing" style={btnStyle}>Get more this month</a>
      </div>

      <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 28, lineHeight: 1.6 }}>
        Everyday browsing, saving and editing recipes is always free and unlimited.
        These figures cover the assistant&rsquo;s help with imports, edits and lookups.
      </p>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 150,
  textAlign: 'center',
  fontSize: 13,
  padding: '9px 16px',
  border: '1px solid var(--border)',
  borderRadius: 8,
  color: 'var(--fg)',
  textDecoration: 'none',
  background: 'var(--surface)',
};
