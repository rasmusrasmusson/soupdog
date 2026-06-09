'use client';
import Link from 'next/link';
import Image from 'next/image';
import { Search, LogOut, Globe, User, CreditCard, Gauge } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useLocale } from '@/lib/locale-context';
import type { Locale } from '@/i18n/config';
import { Avatar } from '@/components/people/Avatar';

export function Header() {
  const [searchQuery, setSearchQuery] = useState('');
  const { user, loading, signOut } = useAuth();
  const { locale, setLocale, t, messages } = useLocale();
  const router = useRouter();
  const searchRef = useRef<HTMLInputElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // The user's chosen avatar colour + display name live on their profile, not on
  // the auth user. Fetch once when logged in so the header monogram matches what
  // they set in /my/profile. Muted styling — the header avatar is decorative.
  const [avatar, setAvatar] = useState<{ color: string | null; name: string | null; initials: string | null }>({ color: null, name: null, initials: null });
  useEffect(() => {
    if (!user) { setAvatar({ color: null, name: null, initials: null }); return; }
    let active = true;
    const loadAvatar = () => {
      fetch('/api/my/profile')
        .then(r => r.json())
        .then(d => { if (active) setAvatar({
          color: d?.profile?.avatar_color ?? null,
          name: d?.profile?.full_name || d?.profile?.display_name || null,
          initials: d?.profile?.avatar_initials ?? null,
        }); })
        .catch(() => { /* leave defaults; Avatar falls back to deterministic colour + initial */ });
    };
    loadAvatar();
    // Re-fetch when the profile is saved elsewhere (e.g. /my/profile), so the
    // header avatar updates without a hard refresh.
    const onProfileUpdated = () => loadAvatar();
    window.addEventListener('soupdog:profile-updated', onProfileUpdated);
    return () => { active = false; window.removeEventListener('soupdog:profile-updated', onProfileUpdated); };
  }, [user]);

  // Close the account menu on outside click or Escape (only while open).
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [menuOpen]);

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
        {/* Language — always visible + globe icon + endonyms, so a user who
            landed in a language they can't read can still find and change it. */}
        <div className="flex items-center gap-1.5">
          <Globe size={13} strokeWidth={1.5} className="text-[var(--muted)]" aria-hidden="true" />
          <select value={locale} onChange={e => setLocale(e.target.value as Locale)}
            aria-label="Select language"
            className="text-[11px] font-mono border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[var(--fg)] cursor-pointer outline-none hover:border-[var(--accent)] transition-colors">
            {langOptions.map(([code, name]) => (
              <option key={code} value={code}>{name as string}</option>
            ))}
          </select>
        </div>

        {/* Auth */}
        {!loading && (
          user ? (
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen(o => !o)}
                aria-label="Account menu"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                className="flex items-center rounded-full transition-opacity hover:opacity-80"
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                <Avatar
                  id={user.id}
                  name={avatar.name || user.email || '?'}
                  colorKey={avatar.color}
                  initials={avatar.initials}
                  size={28}
                  muted
                />
              </button>

              {menuOpen && (
                <div
                  role="menu"
                  style={{
                    position: 'absolute', right: 0, top: 'calc(100% + 8px)', zIndex: 60,
                    minWidth: 220, background: 'var(--surface)', border: '1px solid var(--border)',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.10)', overflow: 'hidden',
                  }}
                >
                  <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {avatar.name || 'Your profile'}
                    </div>
                    {user.email && (
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {user.email}
                      </div>
                    )}
                  </div>

                  {[
                    { href: '/my/profile', label: 'Profile',    icon: User },
                    { href: '/my/account', label: 'Account & membership', icon: CreditCard },
                    { href: '/my/usage',   label: 'Usage',      icon: Gauge },
                  ].map(({ href, label, icon: Icon }) => (
                    <Link
                      key={href} href={href} role="menuitem"
                      onClick={() => setMenuOpen(false)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px',
                        fontSize: 13, color: 'var(--fg)', textDecoration: 'none',
                      }}
                      className="hover:bg-[var(--surface-hover)]"
                    >
                      <Icon size={14} strokeWidth={1.5} style={{ color: 'var(--muted)' }} /> {label}
                    </Link>
                  ))}

                  <button
                    onClick={() => { setMenuOpen(false); signOut(); }}
                    role="menuitem"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                      padding: '9px 14px', fontSize: 13, color: 'var(--fg)',
                      background: 'none', border: 'none', borderTop: '1px solid var(--border)',
                      cursor: 'pointer', textAlign: 'left',
                    }}
                    className="hover:bg-[var(--surface-hover)]"
                  >
                    <LogOut size={14} strokeWidth={1.5} style={{ color: 'var(--muted)' }} /> {t('header.signOut')}
                  </button>
                </div>
              )}
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
