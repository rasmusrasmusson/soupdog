import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/lib/auth-context';
import { LocaleProvider } from '@/lib/locale-context';
import { RootShell } from '@/components/layout/RootShell';
import enMessages from '../../messages/en.json';

export const metadata: Metadata = {
  title: { default: 'Soupdog', template: '%s — Soupdog' },
  description: 'Precise cooking programs. A food process, recipe, and cooking intelligence platform.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr">
      <body>
        <AuthProvider>
          <LocaleProvider initialMessages={enMessages}>
            <RootShell>
              {children}
            </RootShell>
          </LocaleProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
