'use client';
import { MarketingHeader } from './MarketingHeader';

export function MarketingShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <MarketingHeader />
      <main className="flex-1 min-w-0">
        {children}
      </main>
    </>
  );
}
