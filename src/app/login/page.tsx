'use client';
import { useState } from 'react';
import { Soup, Mail, Globe } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const getClient = async () => {
    const { createClient } = await import('@/lib/supabase/client');
    return createClient();
  };

  const signInWithEmail = async () => {
    setLoading(true);
    const supabase = await getClient();
    await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/auth/callback` },
    });
    setSent(true);
    setLoading(false);
  };

  const signInWithGoogle = async () => {
    const supabase = await getClient();
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${location.origin}/auth/callback` },
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg)]">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2.5 mb-10">
          <div className="w-8 h-8 bg-[var(--accent)] rounded-sm flex items-center justify-center">
            <Soup size={16} className="text-white" strokeWidth={2} />
          </div>
          <span className="font-semibold tracking-tight text-[var(--fg)] text-lg">Soupdog</span>
        </div>

        <h1 className="font-display text-3xl font-light text-[var(--fg)] mb-2">Sign in</h1>
        <p className="text-sm text-[var(--muted)] mb-8">
          Access your recipes, household, and kitchen inventory.
        </p>

        {sent ? (
          <div className="border border-[var(--border)] rounded-sm p-6 text-center">
            <div className="text-2xl mb-3">✉️</div>
            <p className="text-sm text-[var(--fg)] font-medium mb-1">Check your email</p>
            <p className="text-xs text-[var(--muted)]">We sent a magic link to <strong>{email}</strong></p>
          </div>
        ) : (
          <div className="space-y-3">
            <button
              onClick={signInWithGoogle}
              className="w-full flex items-center justify-center gap-2.5 border border-[var(--border)] rounded-sm py-2.5 text-sm text-[var(--fg)] hover:bg-[var(--surface-hover)] transition-colors"
            >
              <Globe size={15} strokeWidth={1.5} />
              Continue with Google
            </button>

            <div className="flex items-center gap-3 my-4">
              <div className="flex-1 h-px bg-[var(--border)]" />
              <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--muted)]">or</span>
              <div className="flex-1 h-px bg-[var(--border)]" />
            </div>

            <div className="flex gap-2">
              <div className="flex-1 flex items-center border border-[var(--border)] rounded-sm px-3 focus-within:border-[var(--accent)] transition-colors">
                <Mail size={13} strokeWidth={1.5} className="text-[var(--muted)] mr-2 flex-shrink-0" />
                <input
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && signInWithEmail()}
                  className="flex-1 py-2.5 text-sm bg-transparent outline-none text-[var(--fg)] placeholder:text-[var(--muted)]"
                />
              </div>
              <button
                onClick={signInWithEmail}
                disabled={!email || loading}
                className="px-4 py-2.5 bg-[var(--accent)] text-white text-sm rounded-sm hover:opacity-90 transition-opacity disabled:opacity-40"
              >
                {loading ? '…' : 'Send'}
              </button>
            </div>
          </div>
        )}

        <p className="mt-8 text-[10px] text-[var(--muted)] text-center">
          By signing in you agree to our{' '}
          <a href="/terms" className="underline hover:text-[var(--fg)]">Terms</a>
          {' '}and{' '}
          <a href="/privacy" className="underline hover:text-[var(--fg)]">Privacy Policy</a>.
        </p>
      </div>
    </div>
  );
}
