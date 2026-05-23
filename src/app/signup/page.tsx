'use client';
import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Mail, Lock, Eye, EyeOff } from 'lucide-react';

export default function SignupPage() {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [showPw, setShowPw]     = useState(false);
  const [done, setDone]         = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  const signUp = async () => {
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    if (password.length < 8)  { setError('Password must be at least 8 characters.'); return; }
    setLoading(true); setError('');
    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();
    const { error } = await supabase.auth.signUp({
      email, password,
      options: { emailRedirectTo: `${location.origin}/auth/callback` },
    });
    if (error) { setError(error.message); setLoading(false); return; }
    setDone(true); setLoading(false);
  };

  const signUpWithGoogle = async () => {
    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${location.origin}/auth/callback` },
    });
  };

  const signUpWithMicrosoft = async () => {
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg)] px-4">
      <div className="w-full max-w-sm">

        <Link href="/" className="flex items-center gap-2.5 mb-10">
          <Image src="/logo.svg" alt="Soupdog" width={32} height={32} />
          <span className="font-semibold text-[14px] tracking-tight text-[var(--fg)]">soupdog</span>
        </Link>

        <h1 className="font-display text-[28px] font-light text-[var(--fg)] mb-1">Create account</h1>
        <p className="text-[12px] text-[var(--muted)] mb-7">
          Free forever. Save recipes, manage your household, register appliances.
        </p>

        {done ? (
          <div className="border border-[var(--border)] p-6 text-center">
            <div className="text-2xl mb-3">✉️</div>
            <p className="text-[13px] font-medium text-[var(--fg)] mb-1">Confirm your email</p>
            <p className="text-[11px] text-[var(--muted)]">
              We sent a confirmation link to <strong>{email}</strong>. Click it to activate your account.
            </p>
          </div>
        ) : (
          <div className="space-y-3">

            {/* OAuth */}
            <button onClick={signUpWithGoogle}
              className="w-full flex items-center gap-3 border border-[var(--border)] px-4 py-2.5 text-[12px] font-mono text-[var(--fg)] hover:bg-[var(--surface-hover)] transition-colors">
              <GoogleIcon /> Continue with Google
            </button>
            <button onClick={signUpWithMicrosoft}
              className="w-full flex items-center gap-3 border border-[var(--border)] px-4 py-2.5 text-[12px] font-mono text-[var(--fg)] hover:bg-[var(--surface-hover)] transition-colors">
              <MicrosoftIcon /> Continue with Microsoft
            </button>

            <div className="flex items-center gap-3 py-1">
              <div className="flex-1 h-px bg-[var(--border)]" />
              <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--muted)]">or</span>
              <div className="flex-1 h-px bg-[var(--border)]" />
            </div>

            {/* Email */}
            <div className="flex items-center border border-[var(--border)] px-3 focus-within:border-[var(--accent)] transition-colors">
              <Mail size={13} strokeWidth={1.5} className="text-[var(--muted)] mr-2.5 flex-shrink-0" />
              <input type="email" placeholder="Email address" value={email}
                onChange={e => setEmail(e.target.value)}
                className="flex-1 py-2.5 text-[12px] bg-transparent outline-none text-[var(--fg)] placeholder:text-[var(--muted)]" />
            </div>

            {/* Password */}
            <div className="flex items-center border border-[var(--border)] px-3 focus-within:border-[var(--accent)] transition-colors">
              <Lock size={13} strokeWidth={1.5} className="text-[var(--muted)] mr-2.5 flex-shrink-0" />
              <input type={showPw ? 'text' : 'password'} placeholder="Password (min. 8 characters)"
                value={password} onChange={e => setPassword(e.target.value)}
                className="flex-1 py-2.5 text-[12px] bg-transparent outline-none text-[var(--fg)] placeholder:text-[var(--muted)]" />
              <button onClick={() => setShowPw(s => !s)} className="text-[var(--muted)] hover:text-[var(--fg)] ml-2">
                {showPw ? <EyeOff size={13} strokeWidth={1.5} /> : <Eye size={13} strokeWidth={1.5} />}
              </button>
            </div>

            {/* Confirm password */}
            <div className="flex items-center border border-[var(--border)] px-3 focus-within:border-[var(--accent)] transition-colors">
              <Lock size={13} strokeWidth={1.5} className="text-[var(--muted)] mr-2.5 flex-shrink-0" />
              <input type={showPw ? 'text' : 'password'} placeholder="Confirm password"
                value={confirm} onChange={e => setConfirm(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && signUp()}
                className="flex-1 py-2.5 text-[12px] bg-transparent outline-none text-[var(--fg)] placeholder:text-[var(--muted)]" />
            </div>

            {error && <p className="text-[11px] text-[var(--error)] font-mono">{error}</p>}

            <button onClick={signUp}
              disabled={!email || !password || !confirm || loading}
              className="w-full bg-[var(--accent)] text-white py-2.5 text-[12px] font-mono hover:bg-[var(--accent-mid)] transition-colors disabled:opacity-40 tracking-wide">
              {loading ? 'Creating account…' : 'Create account'}
            </button>
          </div>
        )}

        <p className="mt-8 text-[11px] text-[var(--muted)] text-center">
          Already have an account?{' '}
          <Link href="/login" className="text-[var(--accent)] hover:underline">Sign in</Link>
        </p>
        <p className="mt-2 text-[10px] text-[var(--muted)] text-center">
          By signing up you agree to our{' '}
          <Link href="/terms" className="underline hover:text-[var(--fg)]">Terms</Link>
          {' '}and{' '}
          <Link href="/privacy" className="underline hover:text-[var(--fg)]">Privacy Policy</Link>.
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
