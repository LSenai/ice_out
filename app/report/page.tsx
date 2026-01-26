'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { MapContainer, TileLayer } from 'react-leaflet';
import { supabase } from '@/lib/supabase/browser';
import { scrubMediaFile } from '@/lib/media/scrub';
import MapWithPin from '@/components/Map/MapWithPin';

const MapWithPinDynamic = dynamic(() => import('@/components/Map/MapWithPin'), {
  ssr: false,
});

export default function ReportPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Form state
  const [activityType, setActivityType] = useState('');
  const [notes, setNotes] = useState('');
  const [eventTime, setEventTime] = useState(new Date().toISOString().slice(0, 16));
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [mediaPreviews, setMediaPreviews] = useState<string[]>([]);

  // Get user location on mount
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLat(position.coords.latitude);
          setLng(position.coords.longitude);
        },
        () => {
          // Silently fail - user can manually set location
        }
      );
    }
  }, []);

  // Handle media file selection
  const handleMediaChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setMediaFiles(files);

    // Create previews
    const previews = await Promise.all(
      files.map((file) => {
        return new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.readAsDataURL(file);
        });
      })
    );
    setMediaPreviews(previews);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (!lat || !lng) {
      setError('Please select a location on the map or enable location access.');
      setLoading(false);
      return;
    }

    if (!activityType.trim()) {
      setError('Please enter an activity type.');
      setLoading(false);
      return;
    }

    try {
      // Upload media files if any
      const mediaUrls: Array<{ path: string; type: string }> = [];

      for (const file of mediaFiles) {
        // Scrub EXIF data
        const scrubbedBlob = await scrubMediaFile(file);
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${file.name.split('.').pop()}`;
        const filePath = `sightings/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('sightings-media')
          .upload(filePath, scrubbedBlob, {
            contentType: file.type,
            upsert: false,
          });

        if (uploadError) throw uploadError;

        mediaUrls.push({
          path: filePath,
          type: file.type,
        });
      }

      // Insert sighting
      const { error: insertError } = await supabase.from('sightings').insert({
        event_time: new Date(eventTime).toISOString(),
        lat,
        lng,
        activity_type: activityType.trim(),
        notes: notes.trim() || null,
        media: mediaUrls,
      });

      if (insertError) throw insertError;

      setSuccess(true);
      setTimeout(() => {
        router.push('/');
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit report.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black px-4 py-6 text-white sm:px-8 lg:px-12">
      <header className="mb-8 flex items-center justify-between border-b-2 border-white pb-6">
        <div>
          <h1 className="ice-heading text-3xl">Report a Sighting</h1>
          <p className="ice-mono mt-2 text-xs text-white/60">
            Share information to help keep the community vigilant
          </p>
        </div>
        <button
          onClick={() => router.push('/')}
          className="ice-button ice-button--ghost"
        >
          Cancel
        </button>
      </header>

      <form onSubmit={handleSubmit} className="mx-auto max-w-2xl space-y-6">
        {error && (
          <div className="ice-panel border-2 border-[#ff3b30] p-4">
            <p className="ice-mono text-sm text-[#ff3b30]">{error}</p>
          </div>
        )}

        {success && (
          <div className="ice-panel border-2 border-[#ffd700] p-4">
            <p className="ice-mono text-sm text-[#ffd700]">
              Report submitted successfully! Redirecting...
            </p>
          </div>
        )}

        {/* Location Map */}
        <div className="ice-panel p-4">
          <label className="ice-heading mb-3 block text-lg">
            Location <span className="text-[#ff3b30]">*</span>
          </label>
          <p className="ice-mono mb-3 text-xs text-white/60">
            Click on the map to set location, or use your current location
          </p>
          <div className="h-64 w-full overflow-hidden rounded-[2px] border-2 border-white/10">
            {lat && lng ? (
              <MapContainer
                center={[lat, lng]}
                zoom={13}
                style={{ height: '100%', width: '100%' }}
                className="dark-map"
              >
                <TileLayer
                  url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                />
                <MapWithPinDynamic
                  onLocationSelect={(newLat, newLng) => {
                    setLat(newLat);
                    setLng(newLng);
                  }}
                  initialLat={lat}
                  initialLng={lng}
                />
              </MapContainer>
            ) : (
              <div className="flex h-full items-center justify-center">
                <p className="ice-mono text-sm text-white/50">
                  Loading map...
                </p>
              </div>
            )}
          </div>
          {lat && lng && (
            <p className="ice-mono mt-2 text-xs text-white/60">
              Selected: {lat.toFixed(6)}, {lng.toFixed(6)}
            </p>
          )}
        </div>

        {/* Event Time */}
        <div className="ice-panel p-4">
          <label htmlFor="event-time" className="ice-heading mb-3 block text-lg">
            When did this occur? <span className="text-[#ff3b30]">*</span>
          </label>
          <input
            type="datetime-local"
            id="event-time"
            value={eventTime}
            onChange={(e) => setEventTime(e.target.value)}
            className="ice-input w-full"
            required
          />
        </div>

        {/* Activity Type */}
        <div className="ice-panel p-4">
          <label htmlFor="activity-type" className="ice-heading mb-3 block text-lg">
            Activity Type <span className="text-[#ff3b30]">*</span>
          </label>
          <input
            type="text"
            id="activity-type"
            value={activityType}
            onChange={(e) => setActivityType(e.target.value)}
            placeholder="e.g., Vehicle stop, Checkpoint, Presence"
            className="ice-input w-full"
            maxLength={64}
            required
          />
        </div>

        {/* Notes */}
        <div className="ice-panel p-4">
          <label htmlFor="notes" className="ice-heading mb-3 block text-lg">
            Details (Optional)
          </label>
          <textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Additional information about the sighting..."
            className="ice-input w-full"
            rows={4}
            maxLength={2000}
          />
        </div>

        {/* Media Upload */}
        <div className="ice-panel p-4">
          <label htmlFor="media" className="ice-heading mb-3 block text-lg">
            Media (Optional)
          </label>
          <p className="ice-mono mb-3 text-xs text-white/60">
            Photos and videos. EXIF data will be automatically removed.
          </p>
          <input
            type="file"
            id="media"
            accept="image/*,video/*"
            multiple
            onChange={handleMediaChange}
            className="ice-input w-full"
          />
          {mediaPreviews.length > 0 && (
            <div className="mt-4 grid grid-cols-2 gap-4">
              {mediaPreviews.map((preview, idx) => (
                <div
                  key={idx}
                  className="ice-panel aspect-video overflow-hidden"
                >
                  {mediaFiles[idx]?.type.startsWith('image/') ? (
                    <img
                      src={preview}
                      alt={`Preview ${idx + 1}`}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <video
                      src={preview}
                      controls
                      className="h-full w-full object-cover"
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Submit Button */}
        <div className="flex gap-4">
          <button
            type="button"
            onClick={() => router.push('/')}
            className="ice-button ice-button--ghost flex-1"
            disabled={loading}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="ice-button ice-button--alert flex-1"
            disabled={loading || success}
          >
            {loading ? 'Submitting...' : success ? 'Submitted!' : 'Submit Report'}
          </button>
        </div>
      </form>
    </div>
  );
}
