#!/usr/bin/env node

/**
 * After encoding MP3s under public/audio and rewriting data/music-library.json:
 * - Upload each .mp3 to Supabase Storage (upsert)
 * - Update audio_files row that pointed at the .wav (same id, new path + URL + size + format)
 * - Optionally remove the old .wav object from storage
 *
 * Usage:
 *   node scripts/supabase-replace-wav-with-mp3.mjs [--dry-run] [--remove-wav-storage]
 *
 * After this, if you use table music_library_tracks with .wav URLs, run in Supabase SQL:
 *
 *   UPDATE music_library_tracks
 *   SET file_url = regexp_replace(file_url, '\\.wav($|[?#])', '.mp3\\1', 'gi')
 *   WHERE file_url ~* '\\.wav($|[?#])';
 *
 * Requires web/.env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js'
import { readFile, stat, readdir } from 'fs/promises'
import { join, relative, dirname, basename, extname } from 'path'
import { existsSync } from 'fs'
import { parseFile } from 'music-metadata'
import { config } from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname as dirnameESM } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirnameESM(__filename)

config({ path: join(__dirname, '../.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const WEB_ROOT = join(__dirname, '..')
const AUDIO_DIR = join(WEB_ROOT, 'public', 'audio')
const BUCKET = 'audio-files'

async function extractMetadata(filePath) {
  try {
    const metadata = await parseFile(filePath)
    return {
      title: metadata.common.title || basename(filePath, extname(filePath)),
      artist: metadata.common.artist || 'SERGIK',
      duration: metadata.format.duration ? Math.round(metadata.format.duration) : null,
    }
  } catch {
    return {
      title: basename(filePath, extname(filePath)),
      artist: 'SERGIK',
      duration: null,
    }
  }
}

async function scanMp3Files(rootDir) {
  const out = []
  async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const e of entries) {
      const p = join(dir, e.name)
      if (e.isDirectory()) await walk(p)
      else if (e.isFile() && /\.mp3$/i.test(e.name)) out.push(p)
    }
  }
  if (existsSync(rootDir)) await walk(rootDir)
  return out
}

function parseFlags(argv) {
  return {
    dryRun: argv.includes('--dry-run'),
    removeWav: argv.includes('--remove-wav-storage'),
  }
}

async function main() {
  const { dryRun, removeWav } = parseFlags(process.argv)

  if (!existsSync(AUDIO_DIR)) {
    console.error('Missing', AUDIO_DIR)
    process.exit(1)
  }

  const mp3s = await scanMp3Files(AUDIO_DIR)
  console.log(`Found ${mp3s.length} MP3 files under public/audio\n`)

  let uploaded = 0
  let updated = 0
  let inserted = 0
  let removed = 0
  const errors = []

  for (const mp3Abs of mp3s) {
    const mp3Rel = relative(AUDIO_DIR, mp3Abs).replace(/\\/g, '/')
    const wavRel = mp3Rel.replace(/\.mp3$/i, '.wav')
    const fileName = basename(mp3Abs)
    const folderPath = dirname(mp3Rel)
    const folderNorm = folderPath === '.' ? '' : folderPath

    const fileStats = await stat(mp3Abs)
    const fileSize = fileStats.size
    const meta = await extractMetadata(mp3Abs)

    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(mp3Rel)
    const publicUrl = urlData.publicUrl

    if (dryRun) {
      console.log(`[dry-run] ${mp3Rel} -> DB update from ${wavRel}`)
      continue
    }

    try {
      const buf = await readFile(mp3Abs)
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(mp3Rel, buf, {
        contentType: 'audio/mpeg',
        upsert: true,
        cacheControl: '3600',
      })
      if (upErr) throw upErr
      uploaded++

      const { data: wavRow, error: selErr } = await supabase
        .from('audio_files')
        .select('id')
        .eq('file_path', wavRel)
        .maybeSingle()

      if (selErr) throw selErr

      if (wavRow?.id) {
        const { error: uErr } = await supabase
          .from('audio_files')
          .update({
            title: meta.title,
            artist: meta.artist,
            file_name: fileName,
            file_path: mp3Rel,
            file_url: publicUrl,
            format: 'MP3',
            size_bytes: fileSize,
            size_mb: parseFloat((fileSize / (1024 * 1024)).toFixed(2)),
            duration_seconds: meta.duration,
            folder_path: folderNorm,
          })
          .eq('id', wavRow.id)

        if (uErr) throw uErr
        updated++
        console.log(`✅ DB updated: ${wavRel} -> ${mp3Rel}`)
      } else {
        const { data: mp3Existing, error: exErr } = await supabase
          .from('audio_files')
          .select('id')
          .eq('file_path', mp3Rel)
          .maybeSingle()
        if (exErr) throw exErr

        if (mp3Existing?.id) {
          const { error: uErr } = await supabase
            .from('audio_files')
            .update({
              title: meta.title,
              artist: meta.artist,
              file_name: fileName,
              file_url: publicUrl,
              format: 'MP3',
              size_bytes: fileSize,
              size_mb: parseFloat((fileSize / (1024 * 1024)).toFixed(2)),
              duration_seconds: meta.duration,
              folder_path: folderNorm,
            })
            .eq('id', mp3Existing.id)
          if (uErr) throw uErr
          updated++
          console.log(`✅ DB refreshed (no prior .wav row): ${mp3Rel}`)
        } else {
          const { error: insErr } = await supabase.from('audio_files').insert({
            title: meta.title,
            artist: meta.artist,
            file_name: fileName,
            file_path: mp3Rel,
            file_url: publicUrl,
            format: 'MP3',
            size_bytes: fileSize,
            size_mb: parseFloat((fileSize / (1024 * 1024)).toFixed(2)),
            duration_seconds: meta.duration,
            folder_path: folderNorm,
            is_purchasable: false,
          })
          if (insErr) throw insErr
          inserted++
          console.log(`✅ Inserted audio_files: ${mp3Rel}`)
        }
      }

      if (removeWav) {
        const { error: rmErr } = await supabase.storage.from(BUCKET).remove([wavRel])
        if (rmErr) {
          console.warn(`⚠️  Could not remove storage ${wavRel}:`, rmErr.message)
        } else {
          removed++
          console.log(`   🗑️  storage removed: ${wavRel}`)
        }
      }
    } catch (e) {
      errors.push({ mp3Rel, msg: e.message || String(e) })
      console.error(`❌ ${mp3Rel}:`, e.message || e)
    }
  }

  console.log('\n--- summary ---')
  console.log(`Uploaded MP3 objects: ${uploaded}`)
  console.log(`audio_files rows updated: ${updated}`)
  console.log(`audio_files rows inserted: ${inserted}`)
  if (removeWav) console.log(`WAV objects removed from storage: ${removed}`)
  if (errors.length) {
    console.log(`Errors: ${errors.length}`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
