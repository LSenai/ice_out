import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  const missing = [];
  if (!supabaseUrl) missing.push('NEXT_PUBLIC_SUPABASE_URL');
  if (!supabaseAnonKey) missing.push('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  
  throw new Error(
    `Missing Supabase environment variables: ${missing.join(', ')}\n` +
    `Please create a .env.local file in the project root with:\n` +
    `NEXT_PUBLIC_SUPABASE_URL=your-project-url\n` +
    `NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key\n` +
    `\nAfter adding the file, restart the dev server with: npm run dev`
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Database types
export type Sighting = {
  id: string;
  created_at: string;
  event_time: string;
  lat: number;
  lng: number;
  activity_type: string;
  notes: string | null;
  media: Array<{ path: string; type: string; thumbPath?: string }>;
  status: 'unverified' | 'verified';
  validations_count: number;
};

export type Validation = {
  id: string;
  created_at: string;
  sighting_id: string;
  validator_hash: string;
  validator_lat: number | null;
  validator_lng: number | null;
};
