'use client';
import { Header } from './Header';
import { Sidebar } from './Sidebar';

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      <div className="flex" style={{ height: 'calc(100vh - 48px)' }}>
        <Sidebar />
        <main className="flex-1 min-w-0 overflow-y-auto">
          {children}
        </main>
      </div>
    </>
  );
}
