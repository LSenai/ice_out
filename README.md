# ICE OUT — Community Vigilance Network

Real-time community reporting of ICE/federal agent activity with anonymous validation.

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Styling**: Tailwind CSS v4
- **Database**: Supabase (PostgreSQL + Realtime)
- **Mapping**: Leaflet.js with CartoDB Dark Matter tiles
- **Media**: Supabase Storage with EXIF scrubbing

## Getting Started

### Prerequisites

1. Node.js 20+
2. Supabase account and project
3. Environment variables (see below)

### Setup

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables in `.env.local`:
```env
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

3. Run database migrations:
   - Go to Supabase Dashboard → SQL Editor
   - Run the migration file: `supabase/migrations/20260126120000_init_iceout.sql`
   - Enable Realtime for `sightings` and `validations` tables (via SQL or Dashboard)

4. Set up Storage:
   - Create a bucket named `sightings-media` in Supabase Storage
   - Configure appropriate RLS policies

5. Start the development server:
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the app.

## Features

- **Live Map**: Real-time sightings map with status-based markers
  - Unverified: Yellow pulsing ring (#FFD700)
  - Verified: Red square (#FF3B30) (after 3 validations)
  - Historical: Gray dot (#4A4A4A) (older than 24h)
- **Report Sighting**: Anonymous submission with location, activity type, notes, and media
- **Validation**: Proximity-gated validation (within 500m)
- **Media Scrubbing**: Automatic EXIF data removal for privacy

## CSV Import

To import existing sightings from a CSV file:

1. Install additional dependencies:
```bash
npm install --save-dev csv-parse tsx
```

2. Set service role key in `.env.local`:
```env
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

3. Run the import script:
```bash
npx tsx scripts/import_sightings.ts path/to/sightings.csv
```

### CSV Format

Expected columns:
- `timestamp`: ISO 8601 datetime (e.g., "2024-01-26T14:30:00Z")
- `lat`: Latitude (-90 to 90)
- `lng`: Longitude (-180 to 180)
- `activity_type`: Type of activity (max 64 chars)
- `notes`: Optional description (max 2000 chars)
- `media_urls`: Optional comma-separated URLs

Example:
```csv
timestamp,lat,lng,activity_type,notes,media_urls
2024-01-26T14:30:00Z,40.7128,-74.0060,Vehicle stop,"ICE vehicle observed",https://example.com/photo.jpg
```

## Deploy on Vercel

1. Push your code to GitHub
2. Import project in Vercel
3. Add environment variables in Vercel dashboard
4. Deploy!

## License

Private project — Community Vigilance Network
