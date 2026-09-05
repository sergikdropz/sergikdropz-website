#!/usr/bin/env npx tsx
/**
 * Apply Date created from /Volumes/SERGIK/Exports SERGIK birthtimes
 * onto all music_library_tracks (year + metadata.original_date).
 *
 * Does NOT overwrite release `date`.
 *
 * Usage:
 *   cd web && npx tsx scripts/apply-export-created-dates.ts
 *   cd web && npx tsx scripts/apply-export-created-dates.ts --dry-run
 *   cd web && npx tsx scripts/apply-export-created-dates.ts --force
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { basename, dirname, join } from 'path'
import { fileURLToPath } from 'url'
import {
  getExportsRoot,
  loadExportFolderIndex,
  lookupExportFolderDate,
} from '../lib/audio/export-folder-dates'
import { createdDateFromTrack } from '../lib/music-library/track-created-date'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '..', '.env.local') })

const dryRun = process.argv.includes('--dry-run')
const force = process.argv.includes('--force')

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function main() {
  console.log('Exports SERGIK → vault Date created')
  if (dryRun) console.log('(dry run — no writes)\n')

  const root = getExportsRoot()
  const idx = await loadExportFolderIndex(root, { forceReload: true })
  console.log(`Exports root: ${root}`)
  console.log(`Indexed audio files: ${idx.count}`)

  if (!idx.count) {
    console.error('No export files found — is the SERGIK volume mounted?')
    process.exit(1)
  }

  const tracks: Array<{
    id: string
    title: string | null
    artist: string | null
    file_url: string | null
    year: number | null
    date_created: string | null
    metadata: Record<string, unknown> | null
  }> = []

  let from = 0
  const page = 1000
  for (;;) {
    const { data, error } = await supabase
      .from('music_library_tracks')
      .select('id, title, artist, file_url, year, date_created, metadata')
      .or('is_archived.is.null,is_archived.eq.false')
      .range(from, from + page - 1)
    if (error) throw new Error(error.message)
    if (!data?.length) break
    tracks.push(...(data as typeof tracks))
    if (data.length < page) break
    from += page
  }

  console.log(`Vault tracks: ${tracks.length}\n`)

  let updated = 0
  let matched = 0
  let noMatch = 0
  let skippedExisting = 0
  const unmatched: string[] = []

  for (const track of tracks) {
    if (!force && createdDateFromTrack(track)) {
      skippedExisting++
      continue
    }
    const fileName = track.file_url ? basename(String(track.file_url).split('?')[0]) : null
    const hit = await lookupExportFolderDate({
      fileName,
      fileUrl: track.file_url,
      title: track.title,
      artist: track.artist,
      root,
    })

    if (!hit) {
      noMatch++
      unmatched.push(track.title || track.id)
      continue
    }
    matched++

    const prevMeta =
      track.metadata && typeof track.metadata === 'object' && !Array.isArray(track.metadata)
        ? track.metadata
        : {}

    if (dryRun) {
      updated++
      console.log(`  ${hit.isoDate}  ${track.title}  ←  ${basename(hit.absPath)}`)
      continue
    }

    const { error: upErr } = await supabase
      .from('music_library_tracks')
      .update({
        year: hit.year,
        date_created: hit.isoDate,
        metadata: {
          ...prevMeta,
          original_date: hit.isoDate,
          original_date_source: hit.source,
          original_date_export_path: hit.absPath,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', track.id)

    if (upErr) {
      console.error(`  fail ${track.title}: ${upErr.message}`)
      noMatch++
    } else {
      updated++
      process.stdout.write('.')
    }
  }

  console.log('\n')
  console.log(`Matched: ${matched}`)
  console.log(`Updated: ${updated}`)
  console.log(`Already had created date: ${skippedExisting}`)
  console.log(`No export match: ${noMatch}`)
  if (unmatched.length && unmatched.length <= 40) {
    console.log('\nUnmatched titles:')
    unmatched.forEach((t) => console.log('  -', t))
  } else if (unmatched.length > 40) {
    console.log(`\n(${unmatched.length} unmatched — showing 40)`)
    unmatched.slice(0, 40).forEach((t) => console.log('  -', t))
  }
  console.log('\nDone.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
