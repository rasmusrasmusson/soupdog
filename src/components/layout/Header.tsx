'use client';
import Link from 'next/link';
import Image from 'next/image';
import { Search, LogOut } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useLocale } from '@/lib/locale-context';
import type { Locale } from '@/i18n/config';
import { Avatar } from '@/components/people/Avatar';

const unitOptions = ['metric', 'imperial', 'usCustomary'] as const;

export function Header() {
  const [unit, setUnit] = useState<typeof unitOptions[number]>('metric');
  const [searchQuery, setSearchQuery] = useState('');
  const { user, loading, signOut } = useAuth();
  const { locale, setLocale, t, messages } = useLocale();
  const router = useRouter();
  const searchRef = useRef<HTMLInputElement>(null);

  // The user's chosen avatar colour + display name live on their profile, not on
  // the auth user. Fetch once when logged in so the header monogram matches what
  // they set in /my/profile. Muted styling — the header avatar is decorative.
  const [avatar, setAvatar] = useState<{ color: string | null; name: string | null; initials: string | null }>({ color: null, name: null, initials: null });
  useEffect(() => {
    if (!user) { setAvatar({ color: null, name: null, initials: null }); return; }
    let active = true;
    fetch('/api/my/profile')
      .then(r => r.json())
      .then(d => { if (active) setAvatar({
        color: d?.profile?.avatar_color ?? null,
        name: d?.profile?.full_name || d?.profile?.display_name || null,
        initials: d?.profile?.avatar_initials ?? null,
      }); })
      .catch(() => { /* leave defaults; Avatar falls back to deterministic colour + initial */ });
    return () => { active = false; };
  }, [user]);

  const langOptions = Object.entries(messages?.languages ?? {
    en: 'English', sv: 'Svenska', zh: '中文', ar: 'العربية'
  });

  // Wire '/' key to focus search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const navigateSearch = () => {
    if (searchQuery.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') navigateSearch();
    if (e.key === 'Escape') searchRef.current?.blur();
  };

  return (
    <header className="h-12 border-b border-[var(--border)] bg-[var(--surface)] flex items-center px-5 gap-5 sticky top-0 z-50">
      {/* Wordmark */}
      <Link href="/" className="flex items-center flex-shrink-0 -my-1">
        <Image src="/wordmark.svg" alt="Soupdog" width={180} height={54}
          style={{ height: 36, width: 'auto' }} priority />
      </Link>

      {/* Search — hidden on mobile */}
      <div className="flex-1 max-w-2xl hidden md:block">
        <div className="flex items-center gap-2 border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 hover:border-[var(--accent)] transition-colors">
          <button onClick={navigateSearch} className="flex-shrink-0 text-[var(--muted)] hover:text-[var(--accent)] transition-colors">
            <Search size={12} strokeWidth={1.5} />
          </button>
          <input
            ref={searchRef}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder={t('header.search')}
            className="flex-1 bg-transparent text-[12px] text-[var(--fg)] placeholder:text-[var(--muted)] outline-none"
          />
          <kbd className="text-[10px] font-mono border border-[var(--border)] px-1 text-[var(--muted)] bg-[var(--surface)] hidden lg:block">/</kbd>
        </div>
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-3 flex-shrink-0 ms-auto">
        {/* Units — hidden on small screens */}
        <div className="hidden lg:flex items-center gap-1.5">
          <span className="text-[9px] font-mono uppercase tracking-wider text-[var(--muted)]">{t('header.units')}</span>
          <select value={unit} onChange={e => setUnit(e.target.value as typeof unit)}
            className="text-[11px] font-mono border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[var(--fg)] cursor-pointer outline-none hover:border-[var(--accent)] transition-colors">
            {unitOptions.map(o => <option key={o} value={o}>{t(`units.${o}`)}</option>)}
          </select>
        </div>

        {/* Language */}
        <div className="hidden sm:flex items-center gap-1.5">
          <span className="text-[9px] font-mono uppercase tracking-wider text-[var(--muted)]">{t('header.lang')}</span>
          <select value={locale} onChange={e => setLocale(e.target.value as Locale)}
            className="text-[11px] font-mono border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[var(--fg)] cursor-pointer outline-none hover:border-[var(--accent)] transition-colors">
            {langOptions.map(([code, name]) => (
              <option key={code} value={code}>{name as string}</option>
            ))}
          </select>
        </div>

        {/* Auth */}
        {!loading && (
          user ? (
            <div className="flex items-center gap-2">
              <Avatar
                id={user.id}
                name={avatar.name || user.email || '?'}
                colorKey={avatar.color}
                initials={avatar.initials}
                size={28}
                muted
              />
              <button onClick={signOut}
                className="hidden sm:flex items-center gap-1.5 text-[11px] font-mono border border-[var(--border)] px-3 py-1.5 text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors">
                <LogOut size={11} strokeWidth={1.5} /> {t('header.signOut')}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link href="/login"
                className="text-[11px] font-mono border border-[var(--border)] px-3 py-1.5 text-[var(--fg)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors tracking-wide">
                {t('header.signIn')}
              </Link>
              <Link href="/signup"
                className="hidden sm:block text-[11px] font-mono bg-[var(--accent)] text-white px-3 py-1.5 hover:bg-[var(--accent-mid)] transition-colors tracking-wide">
                {t('header.signUp')}
              </Link>
            </div>
          )
        )}
      </div>
    </header>
  );
}
