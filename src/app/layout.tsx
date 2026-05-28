import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/lib/auth-context';
import { LocaleProvider } from '@/lib/locale-context';
import { RootShell } from '@/components/layout/RootShell';
import enMessages from '../../messages/en.json';

export const metadata: Metadata = {
  title: { default: 'soup.dog', template: '%s — soup.dog' },
  description: 'Precise cooking programs. A food process, recipe, and cooking intelligence platform.',
  icons: {
    icon: [
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon.ico' },
    ],
    apple: { url: '/apple-touch-icon.png' },
    other: [
      { rel: 'manifest', url: '/site.webmanifest' },
    ],
  },
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
