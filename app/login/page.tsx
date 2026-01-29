'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/browser';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirectTo') ?? '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'magic' | 'password'>('magic');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}${redirectTo}` },
    });
    setLoading(false);
    if (error) {
      setMessage({ type: 'error', text: error.message });
      return;
    }
    setMessage({
      type: 'success',
      text: 'Check your email for the sign-in link.',
    });
  };

  const handlePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setLoading(false);
    if (error) {
      setMessage({ type: 'error', text: error.message });
      return;
    }
    router.push(redirectTo);
    router.refresh();
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      <div className="ice-panel w-full max-w-md p-6">
        <h1 className="ice-heading text-2xl mb-2">Sign in</h1>
        <p className="ice-mono text-sm text-white/60 mb-6">
          Trusted verifiers and admins sign in here to confirm sightings.
        </p>

        <form
          onSubmit={(e) => {
            if (mode === 'magic') handleMagicLink(e);
            else handlePassword(e);
          }}
          className="space-y-4"
        >
          <div>
            <label htmlFor="email" className="ice-mono text-xs text-white/80 block mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              className="w-full bg-black border-2 border-[var(--ice-border)] rounded px-3 py-2 text-white placeholder:text-white/40"
            />
          </div>

          {mode !== 'magic' && (
            <div>
              <label htmlFor="password" className="ice-mono text-xs text-white/80 block mb-1">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required={mode === 'password'}
                className="w-full bg-black border-2 border-[var(--ice-border)] rounded px-3 py-2 text-white placeholder:text-white/40"
              />
            </div>
          )}

          {message && (
            <div
              className={`ice-panel p-3 border-2 ${
                message.type === 'success' ? 'border-[var(--ice-yellow)]' : 'border-[var(--ice-red)]'
              }`}
            >
              <p className={`ice-mono text-xs ${message.type === 'success' ? 'text-[var(--ice-yellow)]' : 'text-[var(--ice-red)]'}`}>
                {message.text}
              </p>
            </div>
          )}

          <div className="flex flex-col gap-2">
            {mode === 'magic' && (
              <button
                type="submit"
                disabled={loading}
                className="ice-button ice-button--alert w-full"
              >
                {loading ? 'Sending link…' : 'Send magic link'}
              </button>
            )}
            {mode === 'password' && (
              <button
                type="submit"
                disabled={loading}
                className="ice-button ice-button--alert w-full"
              >
                {loading ? 'Signing in…' : 'Sign in'}
              </button>
            )}

            <div className="flex flex-wrap gap-2 justify-center mt-2">
              <button
                type="button"
                onClick={() => setMode(mode === 'magic' ? 'password' : 'magic')}
                className="ice-button ice-button--ghost text-xs"
              >
                {mode === 'magic' ? 'Use password' : 'Use magic link'}
              </button>
            </div>
          </div>
        </form>

        <p className="ice-mono text-xs text-white/50 mt-6 text-center">
          <Link href="/" className="underline hover:text-white/80">
            Back to map
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex flex-col items-center justify-center p-6">
          <p className="ice-mono text-white/60">Loading…</p>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
