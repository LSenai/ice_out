import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseInstance: SupabaseClient | null = null;

function getSupabaseClient(): SupabaseClient {
  if (supabaseInstance) {
    return supabaseInstance;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    const missing = [];
    if (!supabaseUrl) missing.push('NEXT_PUBLIC_SUPABASE_URL');
    if (!supabaseAnonKey) missing.push('NEXT_PUBLIC_SUPABASE_ANON_KEY');
    
    throw new Error(
      `Missing Supabase environment variables: ${missing.join(', ')}\n` +
      `Please add these to your Vercel environment variables:\n` +
      `NEXT_PUBLIC_SUPABASE_URL=your-project-url\n` +
      `NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key`
    );
  }

  supabaseInstance = createClient(supabaseUrl, supabaseAnonKey);
  return supabaseInstance;
}

// Export the client directly - it will be initialized on first access
// Since this is only used in client components, it won't cause build errors
export const supabase = (() => {
  // Create a getter that initializes on first access
  let client: SupabaseClient | null = null;
  
  return new Proxy({} as SupabaseClient, {
    get(_target, prop) {
      if (!client) {
        client = getSupabaseClient();
      }
      const value = client[prop as keyof SupabaseClient];
      if (typeof value === 'function') {
        return value.bind(client);
      }
      return value;
    },
  });
})();

// Database types
export type SightingStatus = 'unverified' | 'verified' | 'active' | 'confirmed';

export type Sighting = {
  id: string;
  created_at: string;
  event_time: string;
  lat: number;
  lng: number;
  activity_type: string;
  notes: string | null;
  media: Array<{ path: string; type: string; thumbPath?: string }>;
  status: SightingStatus;
  validations_count: number;
};

export type Validation = {
  id: string;
  created_at: string;
  sighting_id: string;
  validator_id: string | null;
  device_fingerprint: string | null;
  is_within_range: boolean;
  /** @deprecated legacy; new inserts use device_fingerprint */
  validator_hash: string | null;
  /** @deprecated do not store validator coordinates */
  validator_lat: number | null;
  /** @deprecated do not store validator coordinates */
  validator_lng: number | null;
};

export type ProfileRole = 'anonymous' | 'trusted' | 'admin';

export type Profile = {
  id: string;
  role: ProfileRole;
  updated_at: string;
};
