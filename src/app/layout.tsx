import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/lib/auth-context';
import { RootShell } from '@/components/layout/RootShell';

export const metadata: Metadata = {
  title: { default: 'soup.dog', template: '%s — soup.dog' },
  description: 'Precise cooking programs. A food process, recipe, and cooking intelligence platform.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <RootShell>
            {children}
          </RootShell>
        </AuthProvider>
      </body>
    </html>
  );
}
