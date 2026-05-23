'use client';
import Link from 'next/link';
import Image from 'next/image';

export function MarketingHeader() {
  return (
    <header className="h-14 flex items-center justify-between px-8 bg-[var(--surface)] border-b border-[var(--border)]">
      <Link href="/" className="flex items-center -my-1">
        <Image src="/wordmark.svg" alt="Soupdog" width={200} height={60}
          style={{ height: 40, width: 'auto' }} priority />
      </Link>
      <div className="flex items-center gap-3">
        <Link href="/login"
          className="text-[12px] font-mono border border-[var(--border)] px-4 py-2 text-[var(--fg)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors tracking-wide">
          SIGN IN
        </Link>
        <Link href="/signup"
          className="text-[12px] font-mono bg-[var(--accent)] text-white px-4 py-2 hover:bg-[var(--accent-mid)] transition-colors tracking-wide">
          SIGN UP FREE
        </Link>
      </div>
    </header>
  );
}
