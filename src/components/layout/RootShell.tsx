'use client';
import { useAuth } from '@/lib/auth-context';
import { AppShell } from './AppShell';
import { MarketingShell } from './MarketingShell';

export function RootShell({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center">
        <span className="font-mono text-[11px] text-[var(--muted)] uppercase tracking-widest">Loading…</span>
      </div>
    );
  }

  if (user) return <AppShell>{children}</AppShell>;
  return <MarketingShell>{children}</MarketingShell>;
}
