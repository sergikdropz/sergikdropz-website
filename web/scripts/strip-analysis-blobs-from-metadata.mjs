#!/usr/bin/env node
/**
 * Remove the duplicated `sonic_dna` / `waveform_data` blobs from the `metadata`
 * jsonb on music_library_tracks and audio_files.
 *
 * Analysis writers used to mirror both blobs into `metadata` on top of writing
 * them to their own columns. That grew `metadata` to ~60KB per track, so any
 * list query selecting the column detoasted megabytes and tripped the Postgres
 * statement timeout (the /api/music-library/sync 503).
 *
 * Safety: a blob is only stripped from `metadata` once the dedicated column for
 * that row is confirmed populated. Where a waveform exists ONLY in metadata, it
 * is backfilled into the column first and verified before the strip. Nothing is
 * removed that is not already readable somewhere else.
 *
 * Usage:
 *   node scripts/strip-analysis-blobs-from-metadata.mjs --dry-run
 *   node scripts/strip-analysis-blobs-from-metadata.mjs --limit 5     # canary
 *   node scripts/strip-analysis-blobs-from-metadata.mjs
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

/** Reading `metadata` in bulk is exactly what times out — page in small chunks. */
const PAGE = 20

const TABLES = [
  { table: 'music_library_tracks', dnaColumn: 'sonic_dna', waveformColumn: 'waveform', storageUrlColumn: null },
  { table: 'audio_files', dnaColumn: 'sonic_dna', waveformColumn: 'waveform_data', storageUrlColumn: 'waveform_json_url' },
]

function usablePeaks(raw) {
  if (!Array.isArray(raw)) return false
  let finite = 0
  for (const v of raw) if (Number.isFinite(Number(v))) finite++
  return finite >= 64
}

function isObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

async function processTable({ table, dnaColumn, waveformColumn, storageUrlColumn }) {
  console.log(`\n=== ${table} ===`)

  const { data: idRows, error: idError } = await supabase.from(table).select('id')
  if (idError) {
    console.error(`[${table}] could not list ids: ${idError.message}`)
    return null
  }

  const queue = limit ? idRows.slice(0, limit) : idRows
  console.log(`[${table}] ${idRows.length} rows total; scanning ${queue.length}`)

  const stats = {
    scanned: 0,
    dnaStripped: 0,
    waveformStripped: 0,
    waveformBackfilled: 0,
    keptMissingColumn: 0,
    bytesFreed: 0,
    failed: 0,
  }

  const columns = ['id', 'metadata', dnaColumn, waveformColumn, storageUrlColumn].filter(Boolean).join(',')

  for (let i = 0; i < queue.length; i += PAGE) {
    const ids = queue.slice(i, i + PAGE).map((r) => r.id)
    const { data: rows, error } = await supabase.from(table).select(columns).in('id', ids)
    if (error) {
      console.error(`[${table}] page ${i} fetch failed: ${error.message}`)
      stats.failed += ids.length
      continue
    }

    for (const row of rows) {
      stats.scanned += 1
      if (!isObject(row.metadata)) continue

      const metadata = { ...row.metadata }
      const before = JSON.stringify(metadata).length
      const update = {}
      let changed = false

      // --- sonic_dna -------------------------------------------------------
      if (metadata.sonic_dna != null) {
        if (row[dnaColumn] != null) {
          delete metadata.sonic_dna
          changed = true
          stats.dnaStripped += 1
        } else {
          stats.keptMissingColumn += 1
          console.warn(`[${table}] KEEP sonic_dna ${row.id}: ${dnaColumn} column is empty`)
        }
      }

      // --- waveform_data ---------------------------------------------------
      if (metadata.waveform_data != null) {
        const hasColumn = row[waveformColumn] != null
        const hasStorage = storageUrlColumn ? Boolean(row[storageUrlColumn]) : false

        if (hasColumn || hasStorage) {
          delete metadata.waveform_data
          changed = true
          stats.waveformStripped += 1
        } else if (usablePeaks(metadata.waveform_data)) {
          // Only copy in metadata — promote to the real column, then strip.
          if (dryRun) {
            stats.waveformBackfilled += 1
            stats.waveformStripped += 1
            console.log(`[${table}] would backfill ${waveformColumn} from metadata for ${row.id}`)
            delete metadata.waveform_data
            changed = true
          } else {
            const { error: backfillError } = await supabase
              .from(table)
              .update({ [waveformColumn]: metadata.waveform_data })
              .eq('id', row.id)
            if (backfillError) {
              stats.failed += 1
              console.warn(`[${table}] KEEP waveform ${row.id}: backfill failed — ${backfillError.message}`)
            } else {
              const { data: check } = await supabase.from(table).select(waveformColumn).eq('id', row.id).single()
              if (check && check[waveformColumn] != null) {
                stats.waveformBackfilled += 1
                stats.waveformStripped += 1
                delete metadata.waveform_data
                changed = true
                console.log(`[${table}] backfilled ${waveformColumn} for ${row.id}`)
              } else {
                stats.failed += 1
                console.warn(`[${table}] KEEP waveform ${row.id}: backfill did not verify`)
              }
            }
          }
        } else {
          stats.keptMissingColumn += 1
          console.warn(`[${table}] KEEP waveform ${row.id}: not usable peaks and ${waveformColumn} is empty`)
        }
      }

      if (!changed) continue

      stats.bytesFreed += before - JSON.stringify(metadata).length
      if (dryRun) continue

      update.metadata = metadata
      const { error: updateError } = await supabase.from(table).update(update).eq('id', row.id)
      if (updateError) {
        stats.failed += 1
        console.warn(`[${table}] update failed ${row.id}: ${updateError.message}`)
      }
    }
  }

  console.log(`[${table}] done`, { ...stats, bytesFreed: stats.bytesFreed.toLocaleString() })
  return stats
}

console.log(`[strip-analysis-blobs] ${dryRun ? 'DRY RUN' : 'LIVE'}${limit ? ` limit=${limit}` : ''}`)

let totalFreed = 0
for (const spec of TABLES) {
  const stats = await processTable(spec)
  if (stats) totalFreed += stats.bytesFreed
}

console.log(`\n[strip-analysis-blobs] total metadata bytes freed: ${totalFreed.toLocaleString()}`)
if (!dryRun && totalFreed > 0) {
  console.log('Run VACUUM on both tables afterwards to release the TOAST pages.')
}
