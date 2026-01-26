'use client';

import { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { supabase, type Sighting } from '@/lib/supabase/browser';

// Fix for default marker icons in Next.js
if (typeof window !== 'undefined') {
  delete (L.Icon.Default.prototype as any)._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  });
}

// Custom marker icons
function createUnverifiedIcon(): L.DivIcon {
  return L.divIcon({
    className: 'unverified-marker',
    html: '<div class="unverified-pulse-ring"></div>',
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

function createVerifiedIcon(): L.DivIcon {
  return L.divIcon({
    className: 'verified-marker',
    html: '<div class="verified-square"></div>',
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
}

function createHistoricalIcon(): L.DivIcon {
  return L.divIcon({
    className: 'historical-marker',
    html: '<div class="historical-dot"></div>',
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

// Component to update map bounds when sightings change
function MapUpdater({ sightings }: { sightings: Sighting[] }) {
  const map = useMap();
  
  useEffect(() => {
    if (sightings.length === 0) return;
    
    const bounds = L.latLngBounds(
      sightings.map(s => [s.lat, s.lng] as [number, number])
    );
    map.fitBounds(bounds, { padding: [50, 50] });
  }, [sightings, map]);
  
  return null;
}

interface LiveMapProps {
  onMarkerClick?: (sighting: Sighting) => void;
  showActiveOnly?: boolean;
}

export default function LiveMap({ onMarkerClick, showActiveOnly = false }: LiveMapProps) {
  const [sightings, setSightings] = useState<Sighting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const subscriptionRef = useRef<any>(null);

  useEffect(() => {
    // Initial load
    async function loadSightings() {
      try {
        const now = new Date();
        const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        
        let query = supabase
          .from('sightings')
          .select('*')
          .order('event_time', { ascending: false });
        
        if (showActiveOnly) {
          query = query.gte('event_time', twentyFourHoursAgo.toISOString());
        }
        
        const { data, error: fetchError } = await query;
        
        if (fetchError) {
          console.error('Supabase error:', fetchError);
          throw new Error(fetchError.message || 'Failed to load sightings');
        }
        setSightings(data || []);
        setLoading(false);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to load sightings';
        console.error('Error loading sightings:', err);
        setError(errorMessage);
        setLoading(false);
      }
    }

    loadSightings();

    // Subscribe to realtime changes
    const channel = supabase
      .channel('sightings-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'sightings',
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setSightings((prev) => [payload.new as Sighting, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            setSightings((prev) =>
              prev.map((s) => (s.id === payload.new.id ? (payload.new as Sighting) : s))
            );
          } else if (payload.eventType === 'DELETE') {
            setSightings((prev) => prev.filter((s) => s.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    subscriptionRef.current = channel;

    return () => {
      if (subscriptionRef.current) {
        supabase.removeChannel(subscriptionRef.current);
      }
    };
  }, [showActiveOnly]);

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-black text-white">
        <p className="font-mono text-sm">LOADING MAP...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-black text-red-500">
        <p className="font-mono text-sm">ERROR: {error}</p>
      </div>
    );
  }

  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  return (
    <>
      <MapContainer
        center={[40.7128, -74.0060]} // Default to NYC, will be adjusted by MapUpdater
        zoom={13}
        style={{ height: '100%', width: '100%', zIndex: 0 }}
        className="dark-map"
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        />
        <MapUpdater sightings={sightings} />
        {sightings.map((sighting) => {
          const isHistorical = new Date(sighting.event_time) < twentyFourHoursAgo;
          const icon =
            sighting.status === 'verified'
              ? createVerifiedIcon()
              : isHistorical
              ? createHistoricalIcon()
              : createUnverifiedIcon();

          return (
            <Marker
              key={sighting.id}
              position={[sighting.lat, sighting.lng]}
              icon={icon}
              eventHandlers={{
                click: () => {
                  if (onMarkerClick) {
                    onMarkerClick(sighting);
                  }
                },
              }}
            >
              <Popup>
                <div className="font-mono text-xs text-black">
                  <p className="font-bold">{sighting.activity_type}</p>
                  <p className="text-gray-600">
                    {new Date(sighting.event_time).toLocaleString()}
                  </p>
                  {sighting.notes && <p className="mt-1">{sighting.notes}</p>}
                  <p className="mt-1 text-xs">
                    Status: {sighting.status} ({sighting.validations_count} validations)
                  </p>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
      <style jsx global>{`
        .dark-map {
          background-color: #000000;
        }
        .unverified-marker {
          background: transparent;
          border: none;
        }
        .unverified-pulse-ring {
          width: 24px;
          height: 24px;
          border: 3px solid #ffd700;
          border-radius: 50%;
          animation: pulse-ring 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
        @keyframes pulse-ring {
          0%, 100% {
            opacity: 1;
            transform: scale(1);
          }
          50% {
            opacity: 0.5;
            transform: scale(1.2);
          }
        }
        .verified-marker {
          background: transparent;
          border: none;
        }
        .verified-square {
          width: 20px;
          height: 20px;
          background-color: #ff3b30;
          border: 2px solid #ffffff;
          transform: rotate(45deg);
        }
        .historical-marker {
          background: transparent;
          border: none;
        }
        .historical-dot {
          width: 16px;
          height: 16px;
          background-color: #4a4a4a;
          border-radius: 50%;
          border: 1px solid #666666;
        }
      `}</style>
    </>
  );
}
