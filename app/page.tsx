'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { supabase, type Sighting } from '@/lib/supabase/browser';
import SightingDrawer from '@/components/Sighting/SightingDrawer';
import { useAuth } from '@/components/Auth/AuthProvider';

// Dynamically import LiveMap to avoid SSR issues with Leaflet
const LiveMap = dynamic(() => import('@/components/Map/LiveMap'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-black text-white">
      <p className="font-mono text-sm">LOADING MAP...</p>
    </div>
  ),
});

export default function Home() {
  const router = useRouter();
  const { user, role, signOut } = useAuth();
  const [selectedSighting, setSelectedSighting] = useState<Sighting | null>(null);
  const [stats, setStats] = useState({
    active: 0,
    verified: 0,
    nearest: null as number | null,
  });
  const [recentSightings, setRecentSightings] = useState<Sighting[]>([]);
  const [showActiveOnly, setShowActiveOnly] = useState(true);

  useEffect(() => {
    async function loadStats() {
      try {
        const now = new Date();
        const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

        // Load active sightings
        const { data: activeData } = await supabase
          .from('sightings')
          .select('*')
          .gte('event_time', twentyFourHoursAgo.toISOString());

        // Load verified count (verified, active, or confirmed)
        const { data: verifiedData } = await supabase
          .from('sightings')
          .select('id')
          .in('status', ['verified', 'active', 'confirmed'])
          .gte('event_time', twentyFourHoursAgo.toISOString());

        // Load recent sightings for sidebar
        const { data: recentData } = await supabase
          .from('sightings')
          .select('*')
          .order('event_time', { ascending: false })
          .limit(4);

        setStats({
          active: activeData?.length || 0,
          verified: verifiedData?.length || 0,
          nearest: null, // TODO: Calculate based on user location
        });
        setRecentSightings(recentData || []);
      } catch (err) {
        const isAborted =
          (err instanceof Error && err.name === 'AbortError') ||
          (err instanceof Error && err.message?.includes('AbortError'));
        if (!isAborted) console.error('Error loading stats:', err);
      }

      // Subscribe to changes
      const channel = supabase
        .channel('stats-updates')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'sightings',
          },
          () => {
            // Reload stats on any change
            loadStats();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }

    loadStats();
  }, []);

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  return (
    <div className="min-h-screen bg-black px-4 py-6 text-white sm:px-8 lg:px-12">
      <header className="flex flex-col gap-6 border-b-2 border-white pb-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-4">
          <div className="ice-panel flex h-12 w-12 items-center justify-center">
            <div className="h-6 w-6 rounded-full border-2 border-white" />
          </div>
          <div>
            <p className="ice-heading text-3xl">ICE OUT</p>
            <p className="ice-mono text-xs uppercase text-white/70">
              Community Vigilance Network
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="ice-button ice-button--ghost"
          >
            Map View
          </button>
          <button
            onClick={() => {
              const table = document.querySelector('table');
              table?.scrollIntoView({ behavior: 'smooth' });
            }}
            className="ice-button ice-button--ghost"
          >
            Recent
          </button>
          <button
            onClick={() => router.push('/report')}
            className="ice-button ice-button--alert"
          >
            Report Sighting
          </button>
          {user ? (
            <>
              {role === 'admin' && (
                <Link href="/admin" className="ice-button ice-button--ghost">
                  Admin
                </Link>
              )}
              <button
                onClick={async () => {
                  await signOut();
                  router.refresh();
                }}
                className="ice-button ice-button--ghost"
              >
                Sign out
              </button>
            </>
          ) : (
            <Link href="/login" className="ice-button ice-button--ghost">
              Sign in
            </Link>
          )}
        </div>
      </header>

      <main className="mt-8 grid gap-6 lg:grid-cols-[1.6fr_0.9fr]">
        <section className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="ice-panel p-4">
              <p className="ice-mono text-xs text-white/60">Active Sightings</p>
              <p className="ice-heading mt-2 text-3xl">{stats.active}</p>
            </div>
            <div className="ice-panel p-4">
              <p className="ice-mono text-xs text-white/60">Verified</p>
              <p className="ice-heading mt-2 text-3xl text-[#ff3b30]">{stats.verified}</p>
            </div>
            <div className="ice-panel p-4">
              <p className="ice-mono text-xs text-white/60">Nearest</p>
              <p className="ice-heading mt-2 text-3xl">
                {stats.nearest ? `${stats.nearest.toFixed(1)} mi` : '—'}
              </p>
            </div>
          </div>

          <div className="ice-panel p-4">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b-2 border-white/10 pb-4">
              <div>
                <p className="ice-heading text-xl">Live Sightings Map</p>
                <p className="ice-mono text-xs text-white/60">
                  Updated in near real-time. Active = last 24 hours.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowActiveOnly(true)}
                  className={`ice-pill ${showActiveOnly ? '' : 'text-white/60'}`}
                >
                  Active
                </button>
                <button
                  onClick={() => setShowActiveOnly(false)}
                  className={`ice-pill ${!showActiveOnly ? '' : 'text-white/60'}`}
                >
                  All
                </button>
              </div>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_220px]">
              <div className="relative h-[420px] w-full overflow-hidden rounded-[2px] border-2 border-white/10">
                <LiveMap
                  onMarkerClick={setSelectedSighting}
                  showActiveOnly={showActiveOnly}
                />
              </div>

              <div className="space-y-4">
                <div className="ice-panel p-4">
                  <p className="ice-heading text-sm">Current Status</p>
                  <div className="mt-3 space-y-3 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="ice-mono text-white/60">Unverified</span>
                      <span className="ice-pill border-[#ffd700] text-[#ffd700]">
                        11
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="ice-mono text-white/60">Verified</span>
                      <span className="ice-pill border-[#ff3b30] text-[#ff3b30]">
                        7
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="ice-mono text-white/60">Historic</span>
                      <span className="ice-pill border-[#4a4a4a] text-[#4a4a4a]">
                        4
                      </span>
                    </div>
                  </div>
                </div>

                <div className="ice-panel p-4">
                  <p className="ice-heading text-sm">Recent Reports</p>
                  <div className="mt-3 space-y-3 text-xs">
                    {recentSightings.length === 0 ? (
                      <p className="ice-mono text-white/50">No recent reports</p>
                    ) : (
                      recentSightings.map((sighting) => (
                        <div
                          key={sighting.id}
                          className="flex items-center justify-between border-b border-white/10 pb-2 cursor-pointer hover:text-white"
                          onClick={() => setSelectedSighting(sighting)}
                        >
                          <span className="ice-mono text-white/70">
                            {sighting.activity_type}
                          </span>
                          <span
                            className={`ice-mono ${
                              sighting.status === 'confirmed' || sighting.status === 'verified' || sighting.status === 'active'
                                ? 'text-[#ff3b30]'
                                : 'text-[#ffd700]'
                            }`}
                          >
                            {formatTimeAgo(sighting.event_time)}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <aside className="space-y-6">
          <div className="ice-panel p-4">
            <p className="ice-heading text-lg">Report Flow</p>
            <p className="ice-mono mt-2 text-xs text-white/70">
              Use GPS or drop a pin. Add photos or video. Submissions appear on
              the map instantly and remain active for 24 hours.
            </p>
            <div className="mt-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-[2px] border-2 border-white/40" />
                <div>
                  <p className="ice-mono text-xs text-white/70">Step 01</p>
                  <p className="ice-heading text-sm">Pin Location</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-[2px] border-2 border-white/40" />
                <div>
                  <p className="ice-mono text-xs text-white/70">Step 02</p>
                  <p className="ice-heading text-sm">Describe Activity</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-[2px] border-2 border-white/40" />
                <div>
                  <p className="ice-mono text-xs text-white/70">Step 03</p>
                  <p className="ice-heading text-sm">Submit</p>
                </div>
              </div>
            </div>
            <button
              onClick={() => router.push('/report')}
              className="ice-button ice-button--alert mt-4 w-full"
            >
              Submit Report
            </button>
          </div>

          <div className="ice-panel p-4">
            <p className="ice-heading text-lg">Safety Notes</p>
            <ul className="ice-mono mt-3 space-y-2 text-xs text-white/70">
              <li>Only validate if you are within 500m.</li>
              <li>Keep descriptions factual and time-stamped.</li>
              <li>Media is scrubbed of EXIF data by default.</li>
            </ul>
          </div>
        </aside>
      </main>

      <section className="mt-8">
        <div className="ice-panel overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b-2 border-white/10 p-4">
            <p className="ice-heading text-lg">Sightings Table</p>
            <button className="ice-button ice-button--ghost">Export Data</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-xs">
              <thead className="ice-mono uppercase text-white/60">
                <tr className="border-b border-white/10">
                  <th className="px-4 py-3">Time</th>
                  <th className="px-4 py-3">Location</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Validations</th>
                </tr>
              </thead>
              <tbody className="ice-mono">
                {recentSightings.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-white/50">
                      No sightings yet
                    </td>
                  </tr>
                ) : (
                  recentSightings.map((sighting) => {
                    const now = new Date();
                    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
                    const isHistorical = new Date(sighting.event_time) < twentyFourHoursAgo;
                    const statusText = isHistorical
                      ? 'Historic'
                      : sighting.status === 'confirmed'
                        ? 'Confirmed'
                        : sighting.status === 'verified' || sighting.status === 'active'
                          ? 'Verified'
                          : 'Unverified';
                    const statusColor = isHistorical
                      ? 'text-[#4a4a4a]'
                      : sighting.status === 'confirmed' || sighting.status === 'verified' || sighting.status === 'active'
                        ? 'text-[#ff3b30]'
                        : 'text-[#ffd700]';

                    return (
                      <tr
                        key={sighting.id}
                        className="border-b border-white/5 cursor-pointer hover:bg-white/5"
                        onClick={() => setSelectedSighting(sighting)}
                      >
                        <td className="px-4 py-3 text-white/60">
                          {formatTimeAgo(sighting.event_time)}
                        </td>
                        <td className="px-4 py-3">
                          {sighting.lat.toFixed(4)}, {sighting.lng.toFixed(4)}
                        </td>
                        <td className="px-4 py-3 text-white/70">{sighting.activity_type}</td>
                        <td className={`px-4 py-3 ${statusColor}`}>{statusText}</td>
                        <td className="px-4 py-3">{sighting.validations_count}/{sighting.media?.length ? 2 : 3}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {selectedSighting && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50"
            onClick={() => setSelectedSighting(null)}
          />
          <SightingDrawer
            sighting={selectedSighting}
            onClose={() => setSelectedSighting(null)}
          />
        </>
      )}
    </div>
  );
}
