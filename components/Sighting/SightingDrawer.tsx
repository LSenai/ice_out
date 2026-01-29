'use client';

import { useState, useCallback } from 'react';
import FingerprintJS from '@fingerprintjs/fingerprintjs';
import { supabase, type Sighting } from '@/lib/supabase/browser';
import { isWithinProximity } from '@/lib/geo/haversine';
import { useAuth } from '@/components/Auth/AuthProvider';

interface SightingDrawerProps {
  sighting: Sighting | null;
  onClose: () => void;
}

async function getDeviceFingerprint(): Promise<string> {
  const fp = await FingerprintJS.load();
  const result = await fp.get();
  return result.visitorId;
}

export default function SightingDrawer({ sighting, onClose }: SightingDrawerProps) {
  const { user, role } = useAuth();
  const [validating, setValidating] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [validationSuccess, setValidationSuccess] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [confirmSuccess, setConfirmSuccess] = useState(false);

  const isTrustedOrAdmin = role === 'trusted' || role === 'admin';
  const canConfirm = !!user && isTrustedOrAdmin;

  const handleValidate = useCallback(async () => {
    if (!sighting || validating || validationSuccess) return;

    setValidating(true);
    setValidationError(null);

    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: false,
          timeout: 10000,
          maximumAge: 60000,
        });
      });

      const userLat = position.coords.latitude;
      const userLng = position.coords.longitude;

      if (!isWithinProximity(userLat, userLng, sighting.lat, sighting.lng, 500)) {
        setValidationError('You must be within 500 meters to validate this sighting.');
        setValidating(false);
        return;
      }

      const deviceFingerprint = await getDeviceFingerprint();

      const { error } = await supabase.from('validations').insert({
        sighting_id: sighting.id,
        device_fingerprint: deviceFingerprint,
        is_within_range: true,
        ...(user?.id ? { validator_id: user.id } : {}),
      });

      if (error) {
        if (error.code === '23505') {
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
  }, [sighting, user?.id, validating, validationSuccess]);

  const handleConfirm = useCallback(async () => {
    if (!sighting || confirming || confirmSuccess) return;

    setConfirming(true);
    setConfirmError(null);

    const { error } = await supabase
      .from('sightings')
      .update({ status: 'confirmed' })
      .eq('id', sighting.id);

    if (error) {
      setConfirmError(error.message);
    } else {
      setConfirmSuccess(true);
    }
    setConfirming(false);
  }, [sighting, confirming, confirmSuccess]);

  if (!sighting) return null;

  const isConfirmed = sighting.status === 'confirmed';
  const isVerified = sighting.status === 'verified' || sighting.status === 'active' || isConfirmed;
  const validationThreshold = sighting.media?.length ? 2 : 3;
  const validationsNeeded = Math.max(0, validationThreshold - sighting.validations_count);

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
              isConfirmed ? 'text-[#ff3b30]' : isVerified ? 'text-[#ff3b30]' : 'text-[#ffd700]'
            }`}
          >
            {isConfirmed ? 'Confirmed' : isVerified ? 'Verified' : 'Unverified'}
          </p>
        </div>
        <div className="ice-panel p-3">
          <p className="ice-mono text-xs text-white/60">Validations</p>
          <p className="ice-heading mt-1 text-lg">
            {sighting.validations_count}/{validationThreshold}
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

      {isVerified && !isConfirmed && canConfirm && (
        <div className="space-y-3 mb-4">
          {confirmError && (
            <div className="ice-panel border-2 border-[#ff3b30] p-3">
              <p className="ice-mono text-xs text-[#ff3b30]">{confirmError}</p>
            </div>
          )}
          {confirmSuccess && (
            <div className="ice-panel border-2 border-[#ffd700] p-3">
              <p className="ice-mono text-xs text-[#ffd700] text-center">
                Sighting confirmed (Level 3).
              </p>
            </div>
          )}
          <button
            onClick={handleConfirm}
            disabled={confirming || confirmSuccess}
            className="ice-button ice-button--alert w-full"
          >
            {confirming ? 'Confirming…' : confirmSuccess ? 'Confirmed' : 'Confirm sighting (Level 3)'}
          </button>
        </div>
      )}

      {isVerified && (
        <div className="ice-panel border-2 border-[#ff3b30] p-3">
          <p className="ice-mono text-xs text-[#ff3b30] text-center">
            {isConfirmed
              ? '✓ This sighting has been confirmed by a trusted verifier'
              : '✓ This sighting has been verified by the community'}
          </p>
        </div>
      )}
    </div>
  );
}
