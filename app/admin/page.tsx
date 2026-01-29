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
