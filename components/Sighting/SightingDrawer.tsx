'use client';

import { useState } from 'react';
import { supabase, type Sighting } from '@/lib/supabase/browser';
import { isWithinProximity } from '@/lib/geo/haversine';
import { generateValidatorHash } from '@/lib/privacy/hash';

interface SightingDrawerProps {
  sighting: Sighting | null;
  onClose: () => void;
}

export default function SightingDrawer({ sighting, onClose }: SightingDrawerProps) {
  const [validating, setValidating] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [validationSuccess, setValidationSuccess] = useState(false);

  if (!sighting) return null;

  const handleValidate = async () => {
    if (validating || validationSuccess) return;

    setValidating(true);
    setValidationError(null);

    try {
      // Request user's geolocation
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: false,
          timeout: 10000,
          maximumAge: 60000,
        });
      });

      const userLat = position.coords.latitude;
      const userLng = position.coords.longitude;

      // Check proximity (500m)
      if (!isWithinProximity(userLat, userLng, sighting.lat, sighting.lng, 500)) {
        setValidationError('You must be within 500 meters to validate this sighting.');
        setValidating(false);
        return;
      }

      // Generate validator hash
      const validatorHash = generateValidatorHash(sighting.id);

      // Insert validation
      const { error } = await supabase.from('validations').insert({
        sighting_id: sighting.id,
        validator_hash: validatorHash,
        validator_lat: Math.round(userLat * 100) / 100, // Round for privacy
        validator_lng: Math.round(userLng * 100) / 100,
      });

      if (error) {
        if (error.code === '23505') {
          // Unique constraint violation - already validated
          setValidationError('You have already validated this sighting.');
        } else {
          throw error;
        }
      } else {
        setValidationSuccess(true);
      }
    } catch (err) {
      if (err instanceof GeolocationPositionError) {
        if (err.code === err.PERMISSION_DENIED) {
          setValidationError('Location permission denied. Please enable location access to validate.');
        } else {
          setValidationError('Unable to get your location. Please try again.');
        }
      } else {
        setValidationError(err instanceof Error ? err.message : 'Failed to validate sighting.');
      }
    } finally {
      setValidating(false);
    }
  };

  const isVerified = sighting.status === 'verified';
  const validationsNeeded = Math.max(0, 3 - sighting.validations_count);

  return (
    <div className="ice-panel fixed bottom-0 left-0 right-0 z-50 max-h-[60vh] overflow-y-auto border-t-2 border-white p-6 sm:left-auto sm:right-6 sm:top-6 sm:bottom-auto sm:max-h-[80vh] sm:max-w-md sm:border-t-0">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="ice-heading text-xl">{sighting.activity_type}</h3>
          <p className="ice-mono text-xs text-white/60 mt-1">
            {new Date(sighting.event_time).toLocaleString()}
          </p>
        </div>
        <button
          onClick={onClose}
          className="ice-button ice-button--ghost h-8 w-8 p-0 text-lg"
          aria-label="Close"
        >
          ×
        </button>
      </div>

      {sighting.notes && (
        <div className="mb-4">
          <p className="ice-mono text-sm text-white/80">{sighting.notes}</p>
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3">
        <div className="ice-panel p-3">
          <p className="ice-mono text-xs text-white/60">Status</p>
          <p
            className={`ice-heading mt-1 text-lg ${
              isVerified ? 'text-[#ff3b30]' : 'text-[#ffd700]'
            }`}
          >
            {isVerified ? 'Verified' : 'Unverified'}
          </p>
        </div>
        <div className="ice-panel p-3">
          <p className="ice-mono text-xs text-white/60">Validations</p>
          <p className="ice-heading mt-1 text-lg">
            {sighting.validations_count}/3
          </p>
        </div>
      </div>

      {sighting.media && sighting.media.length > 0 && (
        <div className="mb-4">
          <p className="ice-mono text-xs text-white/60 mb-2">Media</p>
          <div className="grid grid-cols-2 gap-2">
            {sighting.media.map((item, idx) => (
              <div
                key={idx}
                className="ice-panel aspect-video flex items-center justify-center overflow-hidden"
              >
                {item.type.startsWith('image/') ? (
                  <img
                    src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/sightings-media/${item.path}`}
                    alt={`Media ${idx + 1}`}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <video
                    src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/sightings-media/${item.path}`}
                    controls
                    className="h-full w-full object-cover"
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {!isVerified && (
        <div className="space-y-3">
          {validationError && (
            <div className="ice-panel border-2 border-[#ff3b30] p-3">
              <p className="ice-mono text-xs text-[#ff3b30]">{validationError}</p>
            </div>
          )}
          {validationSuccess && (
            <div className="ice-panel border-2 border-[#ffd700] p-3">
              <p className="ice-mono text-xs text-[#ffd700]">
                Validation recorded. {validationsNeeded - 1} more needed for verification.
              </p>
            </div>
          )}
          <button
            onClick={handleValidate}
            disabled={validating || validationSuccess}
            className="ice-button ice-button--alert w-full"
          >
            {validating
              ? 'Validating...'
              : validationSuccess
              ? 'Validated'
              : `Validate Sighting (${validationsNeeded} needed)`}
          </button>
          <p className="ice-mono text-xs text-white/50 text-center">
            Requires location within 500m
          </p>
        </div>
      )}

      {isVerified && (
        <div className="ice-panel border-2 border-[#ff3b30] p-3">
          <p className="ice-mono text-xs text-[#ff3b30] text-center">
            ✓ This sighting has been verified by the community
          </p>
        </div>
      )}
    </div>
  );
}
