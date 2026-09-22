#!/usr/bin/env node
/**
 * Bulk-ingest DistroKid Vault WAVs into the Music Library playlist “Distrokid Exports”
 * (same path as drag-drop → /api/music-library/playlists/link-files).
 *
 * Default dir: /Volumes/SERGIK/Distrokid downloads
 * Default playlist: playlist-1789691284218 (or name match “Distrokid Exports”)
 *
 * Usage:
 *   cd web && npx tsx scripts/ingest-distrokid-exports-playlist.ts
 *   cd web && npx tsx scripts/ingest-distrokid-exports-playlist.ts --dir="…" --playlist=playlist-1789691284218
 */
import { config } from 'dotenv'
import { createHash } from 'crypto'
import { copyFileSync, mkdirSync, readdirSync, readFileSync, statSync } from 'fs'
import { basename, join } from 'path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  isrcFromDistroKidWavFileName,
  titleFromDistroKidWavFileName,
} from '../lib/studio/distrokid-wav-import-server'

config({ path: '.env.local' })

const DEFAULT_DIR = '/Volumes/SERGIK/Distrokid downloads'
const DEFAULT_PLAYLIST_ID = 'playlist-1789691284218'
const DEFAULT_PLAYLIST_NAME = 'Distrokid Exports'

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'track'
  )
}

function safeSegment(value: string): string {
  return (
    value
      .replace(/[<>:"|?*\u0000-\u001f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120) || 'untitled'
  )
}

function folderIdFromPlaylistId(playlistId: string) {
  return playlistId.startsWith('playlist-') ? playlistId.slice('playlist-'.length) : playlistId
}

function titleForFile(fileName: string): string {
  return (
    titleFromDistroKidWavFileName(fileName) ||
    fileName.replace(/\.wav$/i, '').replace(/^[A-Z0-9]{12}[-_]/i, '') ||
    fileName
  )
}

async function ensureFolder(supabase: SupabaseClient, folderId: string, name: string) {
  const { data } = await supabase.from('music_library_folders').select('id').eq('id', folderId).maybeSingle()
  if (data?.id) return
  await supabase.from('music_library_folders').insert({
    id: folderId,
    name,
    parent_id: null,
    path: `Playlists/${name}`,
  })
}

async function resolvePlaylist(
  supabase: SupabaseClient,
  preferredId: string,
): Promise<{ id: string; name: string; track_ids: string[] }> {
  const byId = await supabase
    .from('music_library_playlists')
    .select('id, name, track_ids')
    .eq('id', preferredId)
    .maybeSingle()
  if (byId.data) {
    return {
      id: byId.data.id,
      name: byId.data.name || DEFAULT_PLAYLIST_NAME,
      track_ids: Array.isArray(byId.data.track_ids) ? byId.data.track_ids : [],
    }
  }

  const byName = await supabase
    .from('music_library_playlists')
    .select('id, name, track_ids')
    .ilike('name', '%distrokid%export%')
    .limit(5)

  const hit = (byName.data || []).find((row) => /distrokid/i.test(String(row.name || '')))
  if (hit) {
    return {
      id: hit.id,
      name: hit.name || DEFAULT_PLAYLIST_NAME,
      track_ids: Array.isArray(hit.track_ids) ? hit.track_ids : [],
    }
  }

  throw new Error(
    `Playlist not found (id=${preferredId}). Open Music Library and select Distrokid Exports first.`,
  )
}

function pickWavFiles(dir: string): string[] {
  const names = readdirSync(dir).filter((name) => /\.wav$/i.test(name))
  const isrcPrefixed = names.filter((name) => /^[A-Z0-9]{12}[-_]/i.test(name))
  // Prefer DistroKid ISRC-prefixed masters; drop bare SERGIKSoulCandy.wav style dupes when ISRC twin exists.
  const preferred = isrcPrefixed.length ? isrcPrefixed : names
  return preferred
    .map((name) => join(dir, name))
    .filter((path) => {
      try {
        return statSync(path).isFile() && statSync(path).size > 1000
      } catch {
        return false
      }
    })
}

async function findExistingTrackId(
  supabase: SupabaseClient,
  opts: { fileName: string; filePath: string; isrc: string | null; title: string },
): Promise<string | null> {
  if (opts.isrc) {
    const { data: byIsrc } = await supabase
      .from('music_library_tracks')
      .select('id, title, metadata')
      .or('is_archived.is.null,is_archived.eq.false')
      .limit(5000)
    const match = (byIsrc || []).find((row) => {
      const meta = (row.metadata || {}) as Record<string, unknown>
      const isrc = String(meta.isrc || meta.isrc_full || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase()
      return isrc === opts.isrc
    })
    if (match?.id) return String(match.id)
  }

  const { data: byName } = await supabase
    .from('audio_files')
    .select('id')
    .eq('file_name', opts.fileName)
    .limit(1)
    .maybeSingle()
  const { data: byPath } = await supabase
    .from('audio_files')
    .select('id')
    .eq('file_path', opts.filePath)
    .limit(1)
    .maybeSingle()
  const audio = byName || byPath

  if (audio?.id) {
    const { data: track } = await supabase
      .from('music_library_tracks')
      .select('id')
      .eq('audio_file_id', audio.id)
      .limit(1)
      .maybeSingle()
    if (track?.id) return String(track.id)
  }

  const titleKey = opts.title.toLowerCase().replace(/[^a-z0-9]+/g, '')
  if (titleKey) {
    const { data: byTitle } = await supabase
      .from('music_library_tracks')
      .select('id, title')
      .ilike('title', `%${opts.title.slice(0, 40)}%`)
      .limit(20)
    const hit = (byTitle || []).find(
      (row) => String(row.title || '').toLowerCase().replace(/[^a-z0-9]+/g, '') === titleKey,
    )
    if (hit?.id) return String(hit.id)
  }

  return null
}

async function ingestOne(
  supabase: SupabaseClient,
  absPath: string,
  opts: { playlistName: string; folderId: string },
): Promise<{ trackId: string; created: boolean; title: string; fileName: string }> {
  const fileName = basename(absPath)
  const title = titleForFile(fileName)
  const isrc = isrcFromDistroKidWavFileName(fileName)
  const playlistSeg = safeSegment(opts.playlistName)
  const baseName = safeSegment(fileName)
  const relativePath = `unreleased/Playlists/${playlistSeg}/${baseName}`
  const absDest = join(process.cwd(), 'public', 'audio', ...relativePath.split('/'))

  mkdirSync(join(absDest, '..'), { recursive: true })
  copyFileSync(absPath, absDest)

  const fileUrl = `/audio/${relativePath
    .split('/')
    .map((s) => encodeURIComponent(s))
    .join('/')}`
  const size = statSync(absDest).size

  const existingId = await findExistingTrackId(supabase, {
    fileName: baseName,
    filePath: relativePath,
    isrc,
    title,
  })
  if (existingId) {
    // Refresh URL/path on existing audio when we re-copied a DistroKid master.
    const { data: track } = await supabase
      .from('music_library_tracks')
      .select('id, audio_file_id, metadata')
      .eq('id', existingId)
      .maybeSingle()
    if (track?.audio_file_id) {
      await supabase
        .from('audio_files')
        .update({ file_url: fileUrl, file_path: relativePath, file_name: baseName, size_bytes: size })
        .eq('id', track.audio_file_id)
    }
    if (track) {
      const meta = { ...((track.metadata as Record<string, unknown>) || {}) }
      if (isrc) {
        meta.isrc = isrc
        meta.isrc_full = isrc
      }
      meta.source = 'distrokid-exports-playlist'
      meta.file_path = relativePath
      await supabase
        .from('music_library_tracks')
        .update({ file_url: fileUrl, folder_id: opts.folderId, metadata: meta })
        .eq('id', existingId)
    }
    return { trackId: existingId, created: false, title, fileName }
  }

  const { data: audioRow, error: audioErr } = await supabase
    .from('audio_files')
    .insert({
      title,
      artist: 'SERGIK',
      file_name: baseName,
      file_path: relativePath,
      file_url: fileUrl,
      format: 'WAV',
      size_bytes: size,
      size_mb: parseFloat((size / (1024 * 1024)).toFixed(2)),
      folder_path: relativePath.includes('/')
        ? relativePath.slice(0, relativePath.lastIndexOf('/'))
        : '',
      is_purchasable: false,
    })
    .select('id')
    .single()
  if (audioErr) throw new Error(audioErr.message)

  const trackId = `track-${slugify(opts.folderId)}-${slugify(title)}-${createHash('sha1')
    .update(relativePath)
    .digest('hex')
    .slice(0, 10)}`

  const { error: trackErr } = await supabase.from('music_library_tracks').insert({
    id: trackId,
    folder_id: opts.folderId,
    audio_file_id: audioRow.id,
    title,
    artist: 'SERGIK',
    file_url: fileUrl,
    metadata: {
      file_path: relativePath,
      source: 'distrokid-exports-playlist',
      ingested_at: new Date().toISOString(),
      ...(isrc ? { isrc, isrc_full: isrc } : {}),
    },
  })
  if (trackErr) throw new Error(trackErr.message)

  return { trackId, created: true, title, fileName }
}

async function main() {
  const dirArg = process.argv.find((a) => a.startsWith('--dir='))
  const playlistArg = process.argv.find((a) => a.startsWith('--playlist='))
  const dir = dirArg?.slice('--dir='.length) || DEFAULT_DIR
  const playlistIdArg = playlistArg?.slice('--playlist='.length) || DEFAULT_PLAYLIST_ID

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const playlist = await resolvePlaylist(supabase, playlistIdArg)
  const folderId = folderIdFromPlaylistId(playlist.id)
  await ensureFolder(supabase, folderId, playlist.name)

  const files = pickWavFiles(dir)
  if (!files.length) {
    console.error(`No WAV files in ${dir}`)
    process.exit(1)
  }

  console.log(`Playlist: ${playlist.name} (${playlist.id})`)
  console.log(`Ingesting ${files.length} DistroKid WAV(s) from ${dir}`)

  const trackIds = [...playlist.track_ids]
  let created = 0
  let linked = 0
  let failed = 0

  for (const abs of files) {
    const name = basename(abs)
    try {
      const result = await ingestOne(supabase, abs, {
        playlistName: playlist.name,
        folderId,
      })
      if (!trackIds.includes(result.trackId)) {
        trackIds.push(result.trackId)
        linked += 1
      }
      if (result.created) created += 1
      console.log(
        `${result.created ? 'created' : 'linked '}  ${name} → ${result.title} (${result.trackId})`,
      )
    } catch (err) {
      failed += 1
      console.error(`FAIL     ${name}:`, err instanceof Error ? err.message : err)
    }
  }

  const { error: upErr } = await supabase
    .from('music_library_playlists')
    .update({ track_ids: trackIds, updated_at: new Date().toISOString() })
    .eq('id', playlist.id)

  if (upErr) {
    console.error('Failed to update playlist track_ids:', upErr.message)
    process.exit(1)
  }

  console.log(
    `\nDone. playlist tracks=${trackIds.length} · created=${created} · newly linked=${linked} · failed=${failed}`,
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
