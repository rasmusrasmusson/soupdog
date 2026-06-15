// src/components/layout/AppShell.tsx
'use client';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { MobileNav } from './MobileNav';
import { AssistantProvider } from '@/components/assistant/AssistantProvider';
import { AssistantDock } from '@/components/assistant/AssistantDock';
import { ActiveCookBanner } from '@/components/cooking/ActiveCookBanner';

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <AssistantProvider>
      <Header />
      <div className="flex" style={{ height: 'calc(100vh - 48px)' }}>
        <Sidebar />
        <main className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden">
          {children}
        </main>
        {/* Global assistant — integrated right rail (the butler). Present on
            every logged-in page; conversation follows the user. Collapsible. */}
        <AssistantDock />
      </div>
      <MobileNav />
      {/* Persistent "you're cooking" strip — the way back to a live session from
          anywhere. Seed of the future multi-session / head-chef view. */}
      <ActiveCookBanner />
    </AssistantProvider>
  );
}
