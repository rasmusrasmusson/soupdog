'use client';
import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Mail } from 'lucide-react';

export default function ForgotPasswordPage() {
  const [email, setEmail]   = useState('');
  const [sent, setSent]     = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState('');

  const reset = async () => {
    setLoading(true); setError('');
    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${location.origin}/auth/callback?next=/reset-password`,
    });
    if (error) { setError(error.message); setLoading(false); return; }
    setSent(true); setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg)] px-4">
      <div className="w-full max-w-sm">
        <Link href="/" className="flex items-center mb-10">
          <Image src="/wordmark.svg" alt="Soupdog" width={180} height={54}
            style={{ height: 36, width: 'auto' }} />
        </Link>

        <h1 className="font-display text-[28px] font-light text-[var(--fg)] mb-1">Reset password</h1>
        <p className="text-[12px] text-[var(--muted)] mb-7">
          Enter your email and we'll send you a reset link.
        </p>

        {sent ? (
          <div className="border border-[var(--border)] p-6 text-center">
            <div className="text-2xl mb-3">✉️</div>
            <p className="text-[13px] font-medium text-[var(--fg)] mb-1">Check your email</p>
            <p className="text-[11px] text-[var(--muted)]">
              We sent a password reset link to <strong>{email}</strong>
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center border border-[var(--border)] px-3 focus-within:border-[var(--accent)] transition-colors">
              <Mail size={13} strokeWidth={1.5} className="text-[var(--muted)] mr-2.5 flex-shrink-0" />
              <input type="email" placeholder="Email address" value={email}
                onChange={e => setEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && reset()}
                className="flex-1 py-2.5 text-[12px] bg-transparent outline-none text-[var(--fg)] placeholder:text-[var(--muted)]" />
            </div>
            {error && <p className="text-[11px] text-[var(--error)] font-mono">{error}</p>}
            <button onClick={reset} disabled={!email || loading}
              className="w-full bg-[var(--accent)] text-white py-2.5 text-[12px] font-mono hover:bg-[var(--accent-mid)] transition-colors disabled:opacity-40 tracking-wide">
              {loading ? 'Sending…' : 'Send reset link'}
            </button>
          </div>
        )}

        <p className="mt-6 text-center">
          <Link href="/login" className="text-[11px] text-[var(--muted)] hover:text-[var(--accent)] font-mono transition-colors">
            ← Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
