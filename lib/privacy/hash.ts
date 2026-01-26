/**
 * Generate a privacy-preserving validator hash for anonymous users
 * Uses a combination of localStorage token + sighting ID to prevent duplicate validations
 */
export function generateValidatorHash(sightingId: string): string {
  // Get or create a device token from localStorage
  const STORAGE_KEY = 'ice_out_validator_token';
  let deviceToken = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;

  if (!deviceToken) {
    // Generate a random token if none exists
    deviceToken = crypto.randomUUID() + '-' + Date.now();
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, deviceToken);
    }
  }

  // Hash the combination of device token + sighting ID
  // This ensures one device can only validate a sighting once
  const combined = `${deviceToken}:${sightingId}`;
  
  // Simple hash function (for production, consider using Web Crypto API)
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  return Math.abs(hash).toString(36) + Date.now().toString(36);
}
