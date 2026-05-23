'use client';
import Link from 'next/link';
import Image from 'next/image';
import { useLocale } from '@/lib/locale-context';
import type { Locale } from '@/i18n/config';

export function MarketingHeader() {
  const { t, locale, setLocale, messages } = useLocale();
  const langOptions = Object.entries(messages?.languages ?? { en: 'English', sv: 'Svenska', zh: '中文', ar: 'العربية' });

  return (
    <header className="h-12 flex items-center justify-between px-5 bg-[var(--surface)] border-b border-[var(--border)]">
      <Link href="/" className="flex items-center flex-shrink-0 -my-1">
        <Image src="/wordmark.svg" alt="Soupdog" width={180} height={54}
          style={{ height: 36, width: 'auto' }} priority />
      </Link>

      <div className="flex items-center gap-3 ms-auto">
        {/* Language selector */}
        <select value={locale} onChange={e => setLocale(e.target.value as Locale)}
          className="hidden sm:block text-[11px] font-mono border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[var(--fg)] cursor-pointer outline-none hover:border-[var(--accent)] transition-colors">
          {langOptions.map(([code, name]) => (
            <option key={code} value={code}>{name as string}</option>
          ))}
        </select>

        <Link href="/login"
          className="text-[11px] font-mono border border-[var(--border)] px-3 py-1.5 text-[var(--fg)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors tracking-wide">
          {t('header.signIn')}
        </Link>
        <Link href="/signup"
          className="hidden sm:block text-[11px] font-mono bg-[var(--accent)] text-white px-3 py-1.5 hover:bg-[var(--accent-mid)] transition-colors tracking-wide">
          {t('header.signUp')}
        </Link>
      </div>
    </header>
  );
}
