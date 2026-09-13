#!/usr/bin/env node
/**
 * Clear the waveform JSONB columns now that peaks are served from the
 * audio-analysis Storage bucket.
 *
 * Safety: a row is only cleared after its waveform_json_url has been fetched and
 * confirmed to return a usable peak array. Nothing is deleted that is not already
 * readable from Storage, so this is recoverable by re-downloading that URL.
 *
 * Clears:
 *   audio_files.waveform_data
 *   music_library_tracks.waveform  (for tracks linked to the same audio file)
 *
 * Usage:
 *   node scripts/clear-waveform-jsonb.mjs --dry-run
 *   node scripts/clear-waveform-jsonb.mjs --limit 5     # canary
 *   node scripts/clear-waveform-jsonb.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { join } from 'path'

config({ path: join(process.cwd(), '.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const limitArg = args.indexOf('--limit')
const limit = limitArg >= 0 ? Number(args[limitArg + 1]) : null

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in web/.env.local')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

function usablePeaks(raw) {
  if (!Array.isArray(raw)) return false
  let finite = 0
  for (const v of raw) if (Number.isFinite(Number(v))) finite++
  return finite >= 64
}

console.log(`[clear-waveform] ${dryRun ? 'DRY RUN' : 'LIVE'}${limit ? ` limit=${limit}` : ''}`)

const { data: rows, error } = await supabase
  .from('audio_files')
  .select('id, waveform_json_url')
  .not('waveform_data', 'is', null)

if (error) {
  console.error('[clear-waveform] fetch failed:', error.message)
  process.exit(1)
}

const queue = limit ? rows.slice(0, limit) : rows
console.log(`[clear-waveform] ${rows.length} rows still hold waveform_data; processing ${queue.length}`)

const stats = { cleared: 0, libraryCleared: 0, noUrl: 0, badUrl: 0, failed: 0 }

for (const row of queue) {
  if (!row.waveform_json_url) {
    stats.noUrl += 1
    console.warn(`[clear-waveform] SKIP ${row.id}: no waveform_json_url`)
    continue
  }
  try {
    const res = await fetch(row.waveform_json_url, { cache: 'no-store' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const peaks = await res.json()
    if (!usablePeaks(peaks)) throw new Error('storage payload is not a usable peak array')

    if (dryRun) {
      stats.cleared += 1
      continue
    }

    const { error: audioError } = await supabase
      .from('audio_files')
      .update({ waveform_data: null })
      .eq('id', row.id)
    if (audioError) throw new Error(`audio_files: ${audioError.message}`)
    stats.cleared += 1

    const { error: libError, count } = await supabase
      .from('music_library_tracks')
      .update({ waveform: null }, { count: 'exact' })
      .eq('audio_file_id', row.id)
      .not('waveform', 'is', null)
    if (libError) console.warn(`[clear-waveform] library clear failed for ${row.id}: ${libError.message}`)
    else stats.libraryCleared += count ?? 0
    console.log(`[clear-waveform] cleared ${row.id} (${count ?? 0} library rows)`)
  } catch (err) {
    stats.badUrl += 1
    console.warn(`[clear-waveform] KEEP ${row.id}: ${err.message}`)
  }
}

console.log('[clear-waveform] done', stats)
if (!dryRun && stats.cleared > 0) {
  console.log('\nRun VACUUM on both tables afterwards to release the TOAST pages.')
}
