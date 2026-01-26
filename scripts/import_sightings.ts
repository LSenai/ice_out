/**
 * CSV Import Script for ICE OUT Sightings
 * 
 * Usage:
 *   npx tsx scripts/import_sightings.ts path/to/sightings.csv
 * 
 * CSV Format (expected columns):
 *   - timestamp: ISO 8601 datetime string (e.g., "2024-01-26T14:30:00Z")
 *   - lat: Latitude (number, -90 to 90)
 *   - lng: Longitude (number, -180 to 180)
 *   - activity_type: Type of activity (string, max 64 chars)
 *   - notes: Optional description (string, max 2000 chars)
 *   - media_urls: Optional comma-separated URLs (string)
 * 
 * Environment Variables Required:
 *   - NEXT_PUBLIC_SUPABASE_URL: Your Supabase project URL
 *   - SUPABASE_SERVICE_ROLE_KEY: Service role key (server-side only, bypasses RLS)
 */

import { createClient } from '@supabase/supabase-js';
import { parse } from 'csv-parse/sync';
import { readFileSync } from 'fs';
import { join } from 'path';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Error: Missing Supabase environment variables');
  console.error('Required: NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface CSVRow {
  timestamp: string;
  lat: string;
  lng: string;
  activity_type: string;
  notes?: string;
  media_urls?: string;
}

async function importSightings(csvPath: string) {
  console.log(`Reading CSV file: ${csvPath}`);

  const fileContent = readFileSync(csvPath, 'utf-8');

  const records: CSVRow[] = parse(fileContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  console.log(`Found ${records.length} records to import`);

  const errors: Array<{ row: number; error: string }> = [];
  let successCount = 0;

  for (let i = 0; i < records.length; i++) {
    const row = records[i];
    const rowNum = i + 2; // +2 because CSV is 1-indexed and has header

    try {
      // Validate and parse data
      const lat = parseFloat(row.lat);
      const lng = parseFloat(row.lng);

      if (isNaN(lat) || lat < -90 || lat > 90) {
        throw new Error(`Invalid latitude: ${row.lat}`);
      }
      if (isNaN(lng) || lng < -180 || lng > 180) {
        throw new Error(`Invalid longitude: ${row.lng}`);
      }

      const eventTime = new Date(row.timestamp);
      if (isNaN(eventTime.getTime())) {
        throw new Error(`Invalid timestamp: ${row.timestamp}`);
      }

      if (!row.activity_type || row.activity_type.length > 64) {
        throw new Error(`Invalid activity_type: ${row.activity_type}`);
      }

      if (row.notes && row.notes.length > 2000) {
        throw new Error(`Notes too long: ${row.notes.length} chars (max 2000)`);
      }

      // Parse media URLs if provided
      const media: Array<{ path: string; type: string }> = [];
      if (row.media_urls) {
        const urls = row.media_urls.split(',').map((url) => url.trim());
        for (const url of urls) {
          if (url) {
            // Extract filename from URL or use a placeholder
            const fileName = url.split('/').pop() || 'media';
            const extension = fileName.split('.').pop()?.toLowerCase() || 'jpg';
            const type = extension.match(/^(jpg|jpeg|png|gif|webp)$/i)
              ? 'image/jpeg'
              : extension.match(/^(mp4|webm|mov)$/i)
              ? 'video/mp4'
              : 'image/jpeg';

            media.push({
              path: url, // Store full URL for external media
              type,
            });
          }
        }
      }

      // Insert into database
      const { error } = await supabase.from('sightings').insert({
        event_time: eventTime.toISOString(),
        lat,
        lng,
        activity_type: row.activity_type.trim(),
        notes: row.notes?.trim() || null,
        media,
      });

      if (error) {
        throw error;
      }

      successCount++;
      if (successCount % 10 === 0) {
        console.log(`  Imported ${successCount}/${records.length}...`);
      }
    } catch (err) {
      errors.push({
        row: rowNum,
        error: err instanceof Error ? err.message : String(err),
      });
      console.error(`  Error on row ${rowNum}:`, err);
    }
  }

  console.log('\n=== Import Summary ===');
  console.log(`Success: ${successCount}/${records.length}`);
  console.log(`Errors: ${errors.length}`);

  if (errors.length > 0) {
    console.log('\n=== Errors ===');
    errors.forEach(({ row, error }) => {
      console.log(`Row ${row}: ${error}`);
    });
  }

  return { successCount, errorCount: errors.length };
}

// Main execution
const csvPath = process.argv[2];

if (!csvPath) {
  console.error('Usage: npx tsx scripts/import_sightings.ts <path-to-csv>');
  console.error('\nExample CSV format:');
  console.error('timestamp,lat,lng,activity_type,notes,media_urls');
  console.error('2024-01-26T14:30:00Z,40.7128,-74.0060,Vehicle stop,"ICE vehicle observed",https://example.com/photo.jpg');
  process.exit(1);
}

importSightings(csvPath)
  .then(() => {
    console.log('\nImport completed!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\nFatal error:', err);
    process.exit(1);
  });
