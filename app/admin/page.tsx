'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/browser';
import { useAuth } from '@/components/Auth/AuthProvider';
import type { ProfileRole } from '@/lib/supabase/browser';

type ProfileRow = { id: string; email: string | null; role: string };

export default function AdminPage() {
  const router = useRouter();
  const { user, role, loading: authLoading } = useAuth();
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteMessage, setInviteMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace(`/login?redirectTo=${encodeURIComponent('/admin')}`);
      return;
    }
    if (role !== 'admin') {
      setError('Access denied. Admin only.');
      setLoading(false);
      return;
    }

    async function load() {
      const { data, error: rpcError } = await supabase.rpc('get_profiles_for_admin');
      if (rpcError) {
        setError(rpcError.message);
        setProfiles([]);
      } else {
        setProfiles((data as ProfileRow[]) ?? []);
      }
      setLoading(false);
    }
    load();
  }, [user, role, authLoading, router]);

  const handleRoleChange = async (id: string, newRole: ProfileRole) => {
    setUpdatingId(id);
    setError(null);
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ role: newRole, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (updateError) {
      setError(updateError.message);
    } else {
      setProfiles((prev) =>
        prev.map((p) => (p.id === id ? { ...p, role: newRole } : p))
      );
    }
    setUpdatingId(null);
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = inviteEmail.trim();
    if (!email) return;
    setInviteLoading(true);
    setInviteMessage(null);
    setError(null);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setInviteMessage({ type: 'error', text: 'Not signed in.' });
      setInviteLoading(false);
      return;
    }
    try {
      const res = await fetch('/api/invite-validator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          access_token: session.access_token,
          refresh_token: session.refresh_token,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setInviteMessage({ type: 'error', text: (data.error as string) || res.statusText });
        setInviteLoading(false);
        return;
      }
      setInviteMessage({ type: 'success', text: 'Invite sent. They will get an email to sign in and become a trusted verifier.' });
      setInviteEmail('');
    } catch (err) {
      setInviteMessage({ type: 'error', text: err instanceof Error ? err.message : 'Request failed' });
    }
    setInviteLoading(false);
  };

  if (authLoading || (user && role !== 'admin' && !error)) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <p className="ice-mono text-white/60">Loading…</p>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  if (error && role !== 'admin') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6">
        <div className="ice-panel border-2 border-[#ff3b30] p-6 max-w-md">
          <p className="ice-mono text-[#ff3b30]">{error}</p>
          <Link href="/" className="ice-button ice-button--ghost mt-4 inline-block">
            Back to map
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6 sm:p-8">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b-2 border-white pb-6 mb-8">
        <div>
          <h1 className="ice-heading text-2xl">Admin — Manage roles</h1>
          <p className="ice-mono text-xs text-white/60 mt-1">
            Assign trusted or admin role to users. Only admins can update roles.
          </p>
        </div>
        <Link href="/" className="ice-button ice-button--ghost">
          Back to map
        </Link>
      </header>

      {error && role === 'admin' && (
        <div className="ice-panel border-2 border-[#ff3b30] p-3 mb-6">
          <p className="ice-mono text-xs text-[#ff3b30]">{error}</p>
        </div>
      )}

      <section className="ice-panel mb-8">
        <h2 className="ice-heading text-lg mb-2">Invite trusted verifier</h2>
        <p className="ice-mono text-xs text-white/60 mb-4">
          Send an invite link to an email. When they sign in, they will get the trusted role and can confirm sightings (Level 3).
        </p>
        <form onSubmit={handleInvite} className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <label htmlFor="invite-email" className="ice-mono text-xs text-white/80 block mb-1">
              Email
            </label>
            <input
              id="invite-email"
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="verifier@example.com"
              required
              className="w-full bg-black border-2 border-[var(--ice-border)] rounded px-3 py-2 text-white placeholder:text-white/40"
            />
          </div>
          <button
            type="submit"
            disabled={inviteLoading}
            className="ice-button ice-button--alert"
          >
            {inviteLoading ? 'Sending…' : 'Send invite'}
          </button>
        </form>
        {inviteMessage && (
          <div
            className={`mt-3 p-3 border-2 ${
              inviteMessage.type === 'success' ? 'border-[var(--ice-yellow)]' : 'border-[var(--ice-red)]'
            }`}
          >
            <p className={`ice-mono text-xs ${inviteMessage.type === 'success' ? 'text-[var(--ice-yellow)]' : 'text-[var(--ice-red)]'}`}>
              {inviteMessage.text}
            </p>
          </div>
        )}
      </section>

      {loading ? (
        <p className="ice-mono text-white/60">Loading profiles…</p>
      ) : (
        <div className="ice-panel overflow-x-auto">
          <table className="w-full ice-mono text-sm">
            <thead>
              <tr className="border-b-2 border-white/20">
                <th className="text-left px-4 py-3 text-white/60">Email</th>
                <th className="text-left px-4 py-3 text-white/60">User ID</th>
                <th className="text-left px-4 py-3 text-white/60">Role</th>
              </tr>
            </thead>
            <tbody>
              {profiles.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-white/50">
                    No profiles (or not an admin).
                  </td>
                </tr>
              ) : (
                profiles.map((p) => (
                  <tr key={p.id} className="border-b border-white/10">
                    <td className="px-4 py-3 text-white/80">{p.email ?? '—'}</td>
                    <td className="px-4 py-3 text-white/50 font-mono text-xs">{p.id}</td>
                    <td className="px-4 py-3">
                      <select
                        value={p.role}
                        disabled={updatingId === p.id}
                        onChange={(e) =>
                          handleRoleChange(p.id, e.target.value as ProfileRole)
                        }
                        className="bg-black border-2 border-[var(--ice-border)] rounded px-2 py-1 text-white"
                      >
                        <option value="anonymous">anonymous</option>
                        <option value="trusted">trusted</option>
                        <option value="admin">admin</option>
                      </select>
                      {updatingId === p.id && (
                        <span className="ice-mono text-xs text-white/50 ml-2">
                          Updating…
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
