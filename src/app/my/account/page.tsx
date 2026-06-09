'use client';
// src/app/my/account/page.tsx
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { Gauge, CreditCard, LogOut, ChevronRight } from 'lucide-react';

const B = '1px solid var(--border)';
const MONO = 'var(--font-mono)';
const MUT = 'var(--muted)';

// Map Supabase provider keys to user-facing names. (azure = Microsoft.)
const PROVIDER_NAMES: Record<string, string> = {
  email: 'Email', azure: 'Microsoft', google: 'Google', apple: 'Apple',
};
function providerLabel(key: string): string {
  return PROVIDER_NAMES[key] ?? (key.charAt(0).toUpperCase() + key.slice(1));
}

interface Usage {
  plan: string;
  allowance: number;
  used: number;
  remaining: number;
  percentUsed: number;
  daysUntilReset: number;
  isPlaceholder: boolean;
}

function Row({ href, icon: Icon, title, sub }: { href: string; icon: any; title: string; sub: string }) {
  return (
    <Link
      href={href}
      style={{
        display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px',
        borderBottom: B, textDecoration: 'none', color: 'var(--fg)',
      }}
      className="hover:bg-[var(--surface-hover)]"
    >
      <Icon size={18} strokeWidth={1.5} style={{ color: MUT, flexShrink: 0 }} />
      <span style={{ flex: 1 }}>
        <span style={{ display: 'block', fontSize: 14, fontWeight: 600 }}>{title}</span>
        <span style={{ display: 'block', fontSize: 12, color: MUT, marginTop: 2 }}>{sub}</span>
      </span>
      <ChevronRight size={16} style={{ color: MUT, flexShrink: 0 }} />
    </Link>
  );
}

export default function AccountPage() {
  const { user, loading: authLoading, signOut } = useAuth();
  const [usage, setUsage] = useState<Usage | null>(null);

  useEffect(() => {
    if (!user) return;
    fetch('/api/my/usage').then(r => r.json()).then(d => { if (!d.error) setUsage(d); }).catch(() => {});
  }, [user]);

  if (authLoading) return <div style={{ padding: 40, color: MUT }}>Loading…</div>;
  if (!user) return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: 40 }}>
      <p style={{ color: MUT }}>Please sign in to manage your account.</p>
      <Link href="/login" style={{ color: 'var(--accent)' }}>Sign in</Link>
    </div>
  );

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '32px 24px 80px' }}>
      <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: MUT }}>
        Your account
      </span>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 30, fontWeight: 600, margin: '10px 0 26px', color: 'var(--fg)' }}>
        Account &amp; membership
      </h1>

      {/* Plan / membership card */}
      <div style={{ border: B, background: 'var(--surface)', marginBottom: 24 }}>
        <div style={{ padding: '18px 18px 16px' }}>
          <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: MUT }}>
            Current plan
          </span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 6 }}>
            <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--fg)' }}>{usage?.plan ?? '—'}</span>
            {usage?.isPlaceholder && (
              <span style={{ fontFamily: MONO, fontSize: 10, color: MUT }}>(preview — billing not yet live)</span>
            )}
          </div>

          {usage && (
            <div style={{ marginTop: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: MUT, marginBottom: 6 }}>
                <span>This month&rsquo;s usage</span>
                <span>resets in {usage.daysUntilReset} day{usage.daysUntilReset === 1 ? '' : 's'}</span>
              </div>
              <div style={{ height: 8, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ width: `${usage.percentUsed}%`, height: '100%', background: 'var(--accent)' }} />
              </div>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', borderTop: B }}>
          <Link href="/pricing" style={{
            flex: 1, textAlign: 'center', padding: '12px', fontFamily: MONO, fontSize: 12,
            color: '#fff', background: 'var(--accent)', textDecoration: 'none',
            textTransform: 'uppercase', letterSpacing: '0.08em',
          }}>
            {usage?.plan && usage.plan !== 'Free' ? 'Change plan' : 'Upgrade'}
          </Link>
          <Link href="/my/usage" style={{
            flex: 1, textAlign: 'center', padding: '12px', fontFamily: MONO, fontSize: 12,
            color: 'var(--fg)', textDecoration: 'none', borderLeft: B,
            textTransform: 'uppercase', letterSpacing: '0.08em',
          }}>
            View usage
          </Link>
        </div>
      </div>

      {/* Account & profile rows */}
      <div style={{ border: B, background: 'var(--surface)' }}>
        <div style={{ padding: '16px 18px', borderBottom: B }}>
          <span style={{ fontSize: 12, color: MUT }}>Signed in as</span>
          <div style={{ fontFamily: MONO, fontSize: 13, color: 'var(--fg)', marginTop: 2, wordBreak: 'break-all' }}>
            {user.email}
          </div>
          {(() => {
            const providers: string[] = (user.app_metadata as any)?.providers
              ?? ((user.app_metadata as any)?.provider ? [(user.app_metadata as any).provider] : []);
            if (!providers.length) return null;
            return (
              <div style={{ marginTop: 8, fontSize: 12, color: MUT }}>
                Sign-in {providers.length > 1 ? 'methods' : 'method'}:{' '}
                <span style={{ color: 'var(--fg)' }}>
                  {providers.map(providerLabel).join(', ')}
                </span>
              </div>
            );
          })()}
        </div>
        <Row href="/my/usage"   icon={Gauge} title="Usage"     sub="What you&rsquo;ve used this month" />
        <Row href="/pricing"    icon={CreditCard} title="Plans &amp; pricing" sub="Compare what each plan includes" />
        <button
          onClick={signOut}
          style={{
            display: 'flex', alignItems: 'center', gap: 14, width: '100%',
            padding: '16px 18px', fontSize: 14, fontWeight: 600, color: 'var(--fg)',
            background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
          }}
          className="hover:bg-[var(--surface-hover)]"
        >
          <LogOut size={18} strokeWidth={1.5} style={{ color: MUT }} /> Sign out
        </button>
      </div>

      {usage?.isPlaceholder && (
        <p style={{ fontSize: 12, color: MUT, marginTop: 18, lineHeight: 1.5 }}>
          Membership and billing aren&rsquo;t switched on yet. Plans and usage shown here are a
          preview so you can see how it will work.
        </p>
      )}
    </div>
  );
}
