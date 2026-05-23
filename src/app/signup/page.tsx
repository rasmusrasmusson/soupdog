'use client';
import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Mail, Globe } from 'lucide-react';

export default function SignupPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent]   = useState(false);
  const [loading, setLoading] = useState(false);

  const signUp = async () => {
    setLoading(true);
    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();
    await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/auth/callback` },
    });
    setSent(true);
    setLoading(false);
  };

  const signUpWithGoogle = async () => {
    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${location.origin}/auth/callback` },
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg)]">
      <div className="w-full max-w-sm">
        <Link href="/" className="flex items-center mb-10">
          <Image src="/wordmark.svg" alt="Soupdog" width={180} height={54} style={{ height: 36, width: 'auto' }} />
        </Link>

        <h1 className="font-display text-[28px] font-light text-[var(--fg)] mb-1">Create account</h1>
        <p className="text-[12px] text-[var(--muted)] mb-7">
          Free forever. Save recipes, track your kitchen, get personalised recommendations.
        </p>

        {sent ? (
          <div className="border border-[var(--border)] p-6 text-center">
            <div className="text-2xl mb-3">✉️</div>
            <p className="text-[13px] font-medium text-[var(--fg)] mb-1">Check your email</p>
            <p className="text-[11px] text-[var(--muted)]">We sent a sign-in link to <strong>{email}</strong></p>
          </div>
        ) : (
          <div className="space-y-3">
            <button onClick={signUpWithGoogle}
              className="w-full flex items-center justify-center gap-2.5 border border-[var(--border)] py-2.5 text-[12px] font-mono text-[var(--fg)] hover:bg-[var(--surface-hover)] transition-colors">
              <Globe size={13} strokeWidth={1.5} /> Continue with Google
            </button>

            <div className="flex items-center gap-3 my-4">
              <div className="flex-1 h-px bg-[var(--border)]" />
              <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--muted)]">or</span>
              <div className="flex-1 h-px bg-[var(--border)]" />
            </div>

            <div className="flex gap-2">
              <div className="flex-1 flex items-center border border-[var(--border)] px-3 focus-within:border-[var(--accent)] transition-colors">
                <Mail size={12} strokeWidth={1.5} className="text-[var(--muted)] mr-2 flex-shrink-0" />
                <input type="email" placeholder="you@example.com" value={email}
                  onChange={e => setEmail(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && signUp()}
                  className="flex-1 py-2.5 text-[12px] bg-transparent outline-none text-[var(--fg)] placeholder:text-[var(--muted)]" />
              </div>
              <button onClick={signUp} disabled={!email || loading}
                className="px-4 py-2.5 bg-[var(--accent)] text-white text-[12px] font-mono hover:bg-[var(--accent-mid)] transition-colors disabled:opacity-40">
                {loading ? '…' : 'Join'}
              </button>
            </div>
          </div>
        )}

        <p className="mt-6 text-[11px] text-[var(--muted)] text-center">
          Already have an account?{' '}
          <Link href="/login" className="text-[var(--accent)] hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
