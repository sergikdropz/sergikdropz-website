import { readFileSync } from 'fs';
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '..', '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const data = JSON.parse(readFileSync('/tmp/itunes-restore-data.json', 'utf8'));

console.log(`Inserting ${data.tracks.length} tracks...`);

const BATCH = 50;
let inserted = 0;
let errors = 0;

for (let i = 0; i < data.tracks.length; i += BATCH) {
  const batch = data.tracks.slice(i, i + BATCH);
  
  const rows = batch.map(t => ({
    id: t.id,
    folder_id: t.folder_id,
    title: t.title,
    artist: t.artist,
    duration: t.duration,
    file_url: t.file_url,
    artwork_url: t.artwork_url,
    bpm: t.bpm,
    key_signature: t.key_signature,
    energy_level: t.energy_level,
    danceability: t.danceability,
    sonic_dna: t.sonic_dna,
    waveform: t.waveform,
    display_order: t.display_order,
    track_number: t.track_number,
    genre: t.genre,
    sort_artist: t.sort_artist,
    metadata: t.metadata || {},
  }));

  const { error } = await supabase
    .from('music_library_tracks')
    .upsert(rows, { onConflict: 'id', ignoreDuplicates: true });

  if (error) {
    console.error(`Batch ${i / BATCH} error:`, error.message);
    errors++;
  } else {
    inserted += batch.length;
    console.log(`  Batch ${Math.floor(i / BATCH)}: ${batch.length} tracks OK (${inserted}/${data.tracks.length})`);
  }
}

console.log(`\nDone: ${inserted} inserted, ${errors} errors`);

const { count } = await supabase
  .from('music_library_tracks')
  .select('*', { count: 'exact', head: true });
console.log(`Total tracks in DB: ${count}`);
