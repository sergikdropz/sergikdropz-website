#!/usr/bin/env node
import { readdirSync, statSync, existsSync, readFileSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '..', '.env.local') })

const IMAGE_EXT = /\.(avif|gif|jpe?g|png|webp)$/i

function normalizeFolderArtworkId(id) {
  let next = String(id || '').trim()
  if (next.startsWith('folder-')) next = next.slice('folder-'.length)
  return next.replace(/-+$/g, '')
}

function artworkLookupKeys(id) {
  const raw = String(id || '').trim()
  const normalized = normalizeFolderArtworkId(raw)
  return [...new Set([raw, normalized, normalized ? `folder-${normalized}` : ''].filter(Boolean))]
}

function listLocalFolderArtwork() {
  const dir = join(__dirname, '..', 'public', 'images', 'audio', 'artwork')
  const best = new Map()
  if (!existsSync(dir)) return best
  for (const file of readdirSync(dir)) {
    if (!IMAGE_EXT.test(file)) continue
    const stem = file.replace(/\.[^.]+$/, '')
    const url = `/images/audio/artwork/${file}`
    const mtime = statSync(join(dir, file)).mtimeMs
    for (const id of artworkLookupKeys(stem)) {
      const prev = best.get(id)
      if (!prev || mtime >= prev.mtime) best.set(id, { url, mtime, file })
    }
  }
  return new Map(Array.from(best, ([id, row]) => [id, row]))
}

function mimeForArtworkFile(fileName) {
  const ext = (fileName.split('.').pop() || '').toLowerCase()
  if (ext === 'png') return 'image/png'
  if (ext === 'webp') return 'image/webp'
  if (ext === 'gif') return 'image/gif'
  if (ext === 'avif') return 'image/avif'
  return 'image/jpeg'
}

async function publishLocalFilesToStorage(supabase, localRows) {
  const dir = join(__dirname, '..', 'public', 'images', 'audio', 'artwork')
  const published = new Map()
  const unique = new Map()
  for (const row of localRows.values()) unique.set(row.file, row)
  for (const [file, row] of unique) {
    const buffer = readFileSync(join(dir, file))
    const path = `artwork/${file}`
    const { error } = await supabase.storage.from('audio-files').upload(path, buffer, {
      contentType: mimeForArtworkFile(file),
      upsert: true,
    })
    if (error) {
      console.warn(`storage upload failed ${file}: ${error.message}`)
      continue
    }
    const publicUrl = supabase.storage.from('audio-files').getPublicUrl(path).data.publicUrl
    console.log(`uploaded ${file} → ${publicUrl}`)
    for (const [id, candidate] of localRows) {
      if (candidate.file === file) published.set(id, publicUrl)
    }
  }
  for (const [id, row] of localRows) {
    if (!published.has(id)) published.set(id, row.url)
  }
  return published
}

async function persistSystemicCover(supabase, folderId, artworkUrl) {
  const playlistId = folderId.startsWith('playlist-') ? folderId : `playlist-${folderId}`
  const resolvedFolderId = folderId.startsWith('playlist-') ? folderId.slice('playlist-'.length) : folderId

  const { error: folderError } = await supabase
    .from('music_library_folders')
    .update({ artwork_url: artworkUrl })
    .eq('id', resolvedFolderId)
  if (folderError) throw new Error(folderError.message)

  await supabase.from('music_library_playlists').update({ artwork_url: artworkUrl }).eq('id', playlistId)

  const { data: tracks, error } = await supabase
    .from('music_library_tracks')
    .update({ artwork_url: artworkUrl })
    .eq('folder_id', resolvedFolderId)
    .select('id, audio_file_id')
  if (error) throw new Error(error.message)

  const rows = tracks || []
  const audioIds = [...new Set(rows.map((row) => row.audio_file_id).filter(Boolean))]
  let audioFilesUpdated = 0
  for (let i = 0; i < audioIds.length; i += 80) {
    const slice = audioIds.slice(i, i + 80)
    const { error: audioError, count } = await supabase
      .from('audio_files')
      .update({ artwork_url: artworkUrl })
      .in('id', slice)
    if (!audioError) audioFilesUpdated += typeof count === 'number' ? count : slice.length
  }
  return { tracksUpdated: rows.length, audioFilesUpdated }
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  }

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const localByFolderId = await publishLocalFilesToStorage(supabase, listLocalFolderArtwork())

  const { data: folders, error: folderError } = await supabase
    .from('music_library_folders')
    .select('id, artwork_url')
  if (folderError) throw new Error(folderError.message)

  const { data: tracks, error: trackError } = await supabase
    .from('music_library_tracks')
    .select('folder_id, artwork_url, updated_at')
    .not('artwork_url', 'is', null)
    .neq('artwork_url', '')
    .order('updated_at', { ascending: false })
  if (trackError) throw new Error(trackError.message)

  const trackArtByFolder = new Map()
  for (const row of tracks || []) {
    if (!row.folder_id || !row.artwork_url || trackArtByFolder.has(row.folder_id)) continue
    trackArtByFolder.set(row.folder_id, row.artwork_url)
  }

  let foldersWritten = 0
  let tracksUpdated = 0
  let audioFilesUpdated = 0
  let skipped = 0

  for (const folder of folders || []) {
    const artworkUrl =
      artworkLookupKeys(folder.id).map((key) => localByFolderId.get(key)).find(Boolean) ||
      (folder.artwork_url ? String(folder.artwork_url).split('?')[0] : '') ||
      trackArtByFolder.get(folder.id) ||
      null
    if (!artworkUrl) {
      skipped += 1
      continue
    }
    const written = await persistSystemicCover(supabase, folder.id, artworkUrl)
    foldersWritten += 1
    tracksUpdated += written.tracksUpdated
    audioFilesUpdated += written.audioFilesUpdated
    console.log(`wrote ${folder.id} → ${artworkUrl} (${written.tracksUpdated} tracks)`)
  }

  const version = Date.now()
  await supabase.from('settings').upsert(
    { key: 'music_library_publish_version', value: { version } },
    { onConflict: 'key' },
  )

  console.log(
    JSON.stringify(
      {
        foldersConsidered: (folders || []).length,
        foldersWritten,
        tracksUpdated,
        audioFilesUpdated,
        skipped,
        localFiles: localByFolderId.size,
        publishVersion: version,
      },
      null,
      2,
    ),
  )
}

main().catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})
