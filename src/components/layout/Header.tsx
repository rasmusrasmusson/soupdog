'use client';
import Link from 'next/link';
import Image from 'next/image';
import { Search, LogOut } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/lib/auth-context';

const unitOptions = ['Metric', 'Imperial', 'US Customary'];
const langOptions = ['English', 'Svenska', 'Français', '中文', 'العربية'];

function Avatar({ email }: { email: string }) {
  const initials = email
    .split('@')[0]
    .replace(/[^a-zA-Z]/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map(w => w[0].toUpperCase())
    .slice(0, 2)
    .join('');

  return (
    <div
      title={email}
      style={{
        width: 28, height: 28,
        borderRadius: '50%',
        background: 'var(--accent)',
        color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--font-mono)',
        fontSize: 10, fontWeight: 600,
        letterSpacing: '0.05em',
        flexShrink: 0,
        cursor: 'default',
        userSelect: 'none',
      }}
    >
      {initials || '?'}
    </div>
  );
}


export function Header() {
  const [unit, setUnit] = useState('Metric');
  const [lang, setLang] = useState('English');
  const { user, loading, signOut } = useAuth();

  return (
    <header className="h-12 border-b border-[var(--border)] bg-[var(--surface)] flex items-center px-5 gap-5 sticky top-0 z-50">
      {/* Wordmark */}
      <Link href="/" className="flex items-center flex-shrink-0 -my-1">
        <Image src="/wordmark.svg" alt="Soupdog" width={180} height={54}
          style={{ height: 36, width: 'auto' }} priority />
      </Link>

      {/* Search */}
      <div className="flex-1 max-w-2xl">
        <div className="flex items-center gap-2 border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 hover:border-[var(--accent)] transition-colors">
          <Search size={12} strokeWidth={1.5} className="text-[var(--muted)]" />
          <input
            placeholder="Search recipes, ingredients, techniques..."
            className="flex-1 bg-transparent text-[12px] text-[var(--fg)] placeholder:text-[var(--muted)] outline-none"
          />
          <kbd className="text-[10px] font-mono border border-[var(--border)] px-1 text-[var(--muted)] bg-[var(--surface)]">/</kbd>
        </div>
      </div>

      {/* Right: units, language, auth */}
      <div className="flex items-center gap-4 flex-shrink-0 ml-auto">
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] font-mono uppercase tracking-wider text-[var(--muted)]">Units</span>
          <select value={unit} onChange={e => setUnit(e.target.value)}
            className="text-[11px] font-mono border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[var(--fg)] cursor-pointer outline-none hover:border-[var(--accent)] transition-colors">
            {unitOptions.map(o => <option key={o}>{o}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] font-mono uppercase tracking-wider text-[var(--muted)]">Lang</span>
          <select value={lang} onChange={e => setLang(e.target.value)}
            className="text-[11px] font-mono border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[var(--fg)] cursor-pointer outline-none hover:border-[var(--accent)] transition-colors">
            {langOptions.map(o => <option key={o}>{o}</option>)}
          </select>
        </div>

        {/* Auth state */}
        {!loading && (
          user ? (
            <div className="flex items-center gap-3">
              <Avatar email={user.email ?? ''} />
              <button
                onClick={signOut}
                className="flex items-center gap-1.5 text-[11px] font-mono border border-[var(--border)] px-3 py-1.5 text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
              >
                <LogOut size={11} strokeWidth={1.5} /> Sign out
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link href="/login"
                className="text-[11px] font-mono border border-[var(--border)] px-3 py-1.5 text-[var(--fg)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors tracking-wide">
                SIGN IN
              </Link>
              <Link href="/signup"
                className="text-[11px] font-mono bg-[var(--accent)] text-white px-3 py-1.5 hover:bg-[var(--accent-mid)] transition-colors tracking-wide">
                SIGN UP
              </Link>
            </div>
          )
        )}
      </div>
    </header>
  );
}
