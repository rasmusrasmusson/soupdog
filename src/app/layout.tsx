import type { Metadata } from 'next';
import './globals.css';
import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';

export const metadata: Metadata = {
  title: { default: 'soup.dog', template: '%s — soup.dog' },
  description: 'Precise cooking programs. A food process, recipe, and cooking intelligence platform.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {/* Top header — full width, sticky */}
        <Header />
        {/* Below header: sidebar + content */}
        <div className="flex" style={{ height: 'calc(100vh - 56px)' }}>
          <Sidebar />
          <main className="flex-1 min-w-0 overflow-y-auto">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
