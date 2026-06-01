'use client';
import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Mail, Lock, Eye, EyeOff } from 'lucide-react';

type Mode = 'password' | 'magic';

export default function LoginPage() {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw]     = useState(false);
  const [mode, setMode]         = useState<Mode>('password');
  const [sent, setSent]         = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  const signInWithPassword = async () => {
    setLoading(true); setError('');
    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setError(error.message); setLoading(false); return; }
    window.location.href = '/';
  };

  const signInWithMagicLink = async () => {
    setLoading(true); setError('');
    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/auth/callback` },
    });
    if (error) { setError(error.message); setLoading(false); return; }
    setSent(true); setLoading(false);
  };

  const signInWithGoogle = async () => {
    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${location.origin}/auth/callback` },
    });
  };

  const signInWithMicrosoft = async () => {
    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: 'azure',
      options: {
        scopes: 'email profile',
        redirectTo: `${location.origin}/auth/callback`,
      },
    });
  };

  const signInWithApple = async () => {
    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: 'apple',
      options: { redirectTo: `${location.origin}/auth/callback` },
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg)] px-4">
      <div className="w-full max-w-sm">

        {/* Wordmark */}
        <Link href="/" className="flex items-center gap-2.5 mb-10">
          <Image src="/logo.svg" alt="Soupdog" width={32} height={32} />
          <span className="font-semibold text-[14px] tracking-tight text-[var(--fg)]">soupdog</span>
        </Link>

        <h1 className="font-display text-[28px] font-light text-[var(--fg)] mb-1">Sign in</h1>
        <p className="text-[12px] text-[var(--muted)] mb-7">
          Access your recipes, household, and kitchen inventory.
        </p>

        {sent ? (
          <div className="border border-[var(--border)] p-6 text-center">
            <div className="text-2xl mb-3">✉️</div>
            <p className="text-[13px] font-medium text-[var(--fg)] mb-1">Check your email</p>
            <p className="text-[11px] text-[var(--muted)]">
              We sent a sign-in link to <strong>{email}</strong>
            </p>
          </div>
        ) : (
          <div className="space-y-3">

            {/* OAuth buttons */}
            <button onClick={signInWithGoogle}
              className="w-full flex items-center gap-3 border border-[var(--border)] px-4 py-2.5 text-[12px] font-mono text-[var(--fg)] hover:bg-[var(--surface-hover)] transition-colors">
              <GoogleIcon />
              Continue with Google
            </button>

            <button onClick={signInWithMicrosoft}
              className="w-full flex items-center gap-3 border border-[var(--border)] px-4 py-2.5 text-[12px] font-mono text-[var(--fg)] hover:bg-[var(--surface-hover)] transition-colors">
              <MicrosoftIcon />
              Continue with Microsoft
            </button>

            <button onClick={signInWithApple}
              className="w-full flex items-center gap-3 border border-[var(--border)] px-4 py-2.5 text-[12px] font-mono text-[var(--fg)] hover:bg-[var(--surface-hover)] transition-colors">
              <AppleIcon />
              Continue with Apple
            </button>

            {/* Divider */}
            <div className="flex items-center gap-3 py-1">
              <div className="flex-1 h-px bg-[var(--border)]" />
              <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--muted)]">or</span>
              <div className="flex-1 h-px bg-[var(--border)]" />
            </div>

            {/* Email field */}
            <div className="flex items-center border border-[var(--border)] px-3 focus-within:border-[var(--accent)] transition-colors">
              <Mail size={13} strokeWidth={1.5} className="text-[var(--muted)] mr-2.5 flex-shrink-0" />
              <input
                type="email"
                placeholder="Email address"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="flex-1 py-2.5 text-[12px] bg-transparent outline-none text-[var(--fg)] placeholder:text-[var(--muted)]"
              />
            </div>

            {/* Password field (shown in password mode) */}
            {mode === 'password' && (
              <div className="flex items-center border border-[var(--border)] px-3 focus-within:border-[var(--accent)] transition-colors">
                <Lock size={13} strokeWidth={1.5} className="text-[var(--muted)] mr-2.5 flex-shrink-0" />
                <input
                  type={showPw ? 'text' : 'password'}
                  placeholder="Password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && signInWithPassword()}
                  className="flex-1 py-2.5 text-[12px] bg-transparent outline-none text-[var(--fg)] placeholder:text-[var(--muted)]"
                />
                <button onClick={() => setShowPw(s => !s)}
                  className="text-[var(--muted)] hover:text-[var(--fg)] transition-colors ml-2">
                  {showPw ? <EyeOff size={13} strokeWidth={1.5} /> : <Eye size={13} strokeWidth={1.5} />}
                </button>
              </div>
            )}

            {/* Error */}
            {error && (
              <p className="text-[11px] text-[var(--error)] font-mono">{error}</p>
            )}

            {/* Primary action */}
            {mode === 'password' ? (
              <button
                onClick={signInWithPassword}
                disabled={!email || !password || loading}
                className="w-full bg-[var(--accent)] text-white py-2.5 text-[12px] font-mono hover:bg-[var(--accent-mid)] transition-colors disabled:opacity-40 tracking-wide">
                {loading ? 'Signing in…' : 'Sign in'}
              </button>
            ) : (
              <button
                onClick={signInWithMagicLink}
                disabled={!email || loading}
                className="w-full bg-[var(--accent)] text-white py-2.5 text-[12px] font-mono hover:bg-[var(--accent-mid)] transition-colors disabled:opacity-40 tracking-wide">
                {loading ? 'Sending…' : 'Send magic link'}
              </button>
            )}

            {/* Toggle mode */}
            <button
              onClick={() => { setMode(m => m === 'password' ? 'magic' : 'password'); setError(''); }}
              className="w-full text-center text-[11px] text-[var(--muted)] hover:text-[var(--fg)] transition-colors font-mono">
              {mode === 'password' ? 'Sign in with email link instead →' : 'Sign in with password instead →'}
            </button>

            {/* Forgot password */}
            {mode === 'password' && (
              <div className="text-center">
                <Link href="/forgot-password"
                  className="text-[11px] text-[var(--muted)] hover:text-[var(--accent)] transition-colors font-mono">
                  Forgot password?
                </Link>
              </div>
            )}
          </div>
        )}

        <p className="mt-8 text-[11px] text-[var(--muted)] text-center">
          No account?{' '}
          <Link href="/signup" className="text-[var(--accent)] hover:underline">Create one free</Link>
        </p>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
}

function MicrosoftIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24">
      <path fill="#F25022" d="M1 1h10v10H1z"/>
      <path fill="#00A4EF" d="M13 1h10v10H13z"/>
      <path fill="#7FBA00" d="M1 13h10v10H1z"/>
      <path fill="#FFB900" d="M13 13h10v10H13z"/>
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M16.36 12.78c-.02-2.06 1.68-3.05 1.76-3.1-0.96-1.4-2.45-1.6-2.98-1.62-1.27-.13-2.48.75-3.12.75-.64 0-1.64-.73-2.7-.71-1.39.02-2.67.81-3.38 2.05-1.44 2.5-.37 6.2 1.04 8.23.69.99 1.51 2.1 2.59 2.06 1.04-.04 1.43-.67 2.69-.67 1.25 0 1.61.67 2.71.65 1.12-.02 1.83-1.01 2.51-2.01.79-1.15 1.12-2.27 1.13-2.33-.03-.01-2.17-.83-2.19-3.3zM14.3 6.6c.57-.69.95-1.65.85-2.6-.82.03-1.81.55-2.4 1.23-.53.61-.99 1.58-.87 2.51.91.07 1.85-.46 2.42-1.14z"/>
    </svg>
  );
}
