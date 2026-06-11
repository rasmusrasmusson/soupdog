'use client';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { MobileNav } from './MobileNav';
import { AssistantProvider } from '@/components/assistant/AssistantProvider';
import { AssistantDock } from '@/components/assistant/AssistantDock';

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <AssistantProvider>
      <Header />
      <div className="flex" style={{ height: 'calc(100vh - 48px)' }}>
        <Sidebar />
        <main className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden">
          {children}
        </main>
        {/* Global assistant — present on every logged-in page, conversation
            follows the user. Renders its own collapsed tab when closed. */}
        <AssistantDock />
      </div>
      <MobileNav />
    </AssistantProvider>
  );
}
