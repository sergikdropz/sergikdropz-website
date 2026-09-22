#!/usr/bin/env node
/**
 * Ingest DistroKid Vault WAVs from a folder into Music Vault (Cloudflare R2) + Release Studio.
 *
 * Default folder: /Volumes/SERGIK/Distrokid downloads
 *
 * Usage:
 *   cd web && npx tsx scripts/import-distrokid-wavs.ts
 *   cd web && npx tsx scripts/import-distrokid-wavs.ts --dir="/Volumes/SERGIK/Distrokid downloads"
 *   cd web && npx tsx scripts/import-distrokid-wavs.ts --force
 */
import { config } from 'dotenv'
import { readdirSync, readFileSync, statSync } from 'fs'
import { join, basename } from 'path'
import { createClient } from '@supabase/supabase-js'
import {
  ingestDistroKidWav,
  isrcFromDistroKidWavFileName,
  titleFromDistroKidWavFileName,
} from '../lib/studio/distrokid-wav-import-server'
import { parseDistroKidCatalogJson } from '../lib/studio/distrokid-import'

config({ path: '.env.local' })

const DEFAULT_DIR = '/Volumes/SERGIK/Distrokid downloads'

async function main() {
  const force = process.argv.includes('--force')
  const dirArg = process.argv.find((a) => a.startsWith('--dir='))
  const catalogArg = process.argv.find((a) => a.startsWith('--catalog='))
  const dir = dirArg?.slice('--dir='.length) || DEFAULT_DIR

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  let catalogByIsrc = new Map<
    string,
    { title: string; artist: string; albumTitle: string; albumuuid: string }
  >()
  if (catalogArg) {
    const catalog = parseDistroKidCatalogJson(
      JSON.parse(readFileSync(catalogArg.slice('--catalog='.length), 'utf-8')),
    )
    for (const release of catalog.releases) {
      for (const track of release.tracks) {
        if (!track.isrc) continue
        catalogByIsrc.set(track.isrc, {
          title: track.title,
          artist: release.artist,
          albumTitle: release.title,
          albumuuid: release.albumuuid,
        })
      }
    }
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const wavNames = readdirSync(dir).filter((name) => /\.wav$/i.test(name))
  const hasIsrcPrefixed = wavNames.some((name) => /^[A-Z0-9]{12}[-_]/i.test(name))
  const files = wavNames
    .filter((name) => !hasIsrcPrefixed || /^[A-Z0-9]{12}[-_]/i.test(name))
    .map((name) => join(dir, name))
    .filter((path) => {
      try {
        return statSync(path).isFile() && statSync(path).size > 1000
      } catch {
        return false
      }
    })

  if (!files.length) {
    console.error(`No WAV files in ${dir}`)
    process.exit(1)
  }

  console.log(`Found ${files.length} WAV(s) in ${dir}`)

  for (const filePath of files) {
    const fileName = basename(filePath)
    const isrc = isrcFromDistroKidWavFileName(fileName)
    const fromCatalog = isrc ? catalogByIsrc.get(isrc) : undefined
    const title = fromCatalog?.title || titleFromDistroKidWavFileName(fileName)
    const buffer = readFileSync(filePath)
    const result = await ingestDistroKidWav(supabase, {
      buffer,
      fileName,
      isrc,
      title,
      artist: fromCatalog?.artist || 'Sergik',
      albumTitle: fromCatalog?.albumTitle || null,
      albumuuid: fromCatalog?.albumuuid || null,
      skipIfVaultLinked: !force,
    })
    console.log(
      `${result.status.padEnd(10)} ${fileName} isrc=${result.isrc || '—'} → dist=${result.distribution_track_id || '—'} vault=${result.music_library_track_id || '—'}${
        result.message ? ` (${result.message})` : ''
      }`,
    )
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
