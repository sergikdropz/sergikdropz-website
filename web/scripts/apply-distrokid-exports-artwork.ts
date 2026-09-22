#!/usr/bin/env node
/**
 * Apply DistroKid release artwork (and proper titles) to Music Library tracks
 * on the Distrokid Exports playlist — match by ISRC from the catalog export.
 *
 * Usage:
 *   cd web && npx tsx scripts/apply-distrokid-exports-artwork.ts
 *   cd web && npx tsx scripts/apply-distrokid-exports-artwork.ts --catalog=/path/to/export.json
 */
import { config } from 'dotenv'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { createClient } from '@supabase/supabase-js'
import { parseDistroKidCatalogJson } from '../lib/studio/distrokid-import'
import { MUSIC_LIBRARY_PUBLISH_VERSION_KEY } from '../lib/site-settings-keys'

config({ path: '.env.local' })

const DEFAULT_PLAYLIST_ID = 'playlist-1789691284218'
const CATALOG_CANDIDATES = [
  '/Volumes/SERGIK/Distrokid downloads/distrokid-catalog-export.json',
  join(process.cwd(), 'data/distrokid-catalog-export.json'),
]

/** Prefer durable local/vault covers when we already host them. */
const LOCAL_EP_ARTWORK: Record<string, string> = {
  'soul candy':
    '/images/audio/artwork/folder-collection-unreleased-eps-sergik---soul-candy.jpg',
  ftp: '/images/audio/artwork/folder-collection-unreleased-eps-sergik---ftp.jpg',
  'how ya': '/images/audio/artwork/folder-collection-unreleased-eps-sergik---how-ya.jpg',
  'staying a vibe':
    '/images/audio/artwork/folder-collection-unreleased-eps-sergik---staying-a-vibe.jpg',
  'vice & virtues':
    '/images/audio/artwork/folder-collection-unreleased-eps-sergik---vice--virtues.jpg',
  utopia: '/images/audio/artwork/folder-collection-unreleased-eps-sergik---utopia.jpg',
  'the world dont stop':
    '/images/audio/artwork/folder-collection-unreleased-eps-sergik---the-world-dont-stop.jpg',
  'are we awake':
    '/images/audio/artwork/folder-collection-unreleased-eps-sergik---are-we-awake.jpg',
  daze: '/images/audio/artwork/folder-collection-unreleased-eps-sergik---daze.jpg',
  inspire: '/images/audio/artwork/folder-collection-unreleased-eps-sergik---inspire.jpg',
  'in the streets':
    '/images/audio/artwork/folder-collection-unreleased-eps-sergik---in-the-streets.jpg',
}

function normalizeKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function resolveLocalArtwork(releaseTitle: string): string | null {
  const key = normalizeKey(releaseTitle)
  const mapped = LOCAL_EP_ARTWORK[key]
  if (mapped) {
    const abs = join(process.cwd(), 'public', mapped.replace(/^\//, ''))
    if (existsSync(abs)) return mapped
  }
  // Fuzzy: any key contained in title or vice versa
  for (const [name, path] of Object.entries(LOCAL_EP_ARTWORK)) {
    if (key.includes(name) || name.includes(key)) {
      const abs = join(process.cwd(), 'public', path.replace(/^\//, ''))
      if (existsSync(abs)) return path
    }
  }
  return null
}

function pickCatalogPath(explicit?: string): string {
  if (explicit && existsSync(explicit)) return explicit
  for (const candidate of CATALOG_CANDIDATES) {
    if (existsSync(candidate)) return candidate
  }
  throw new Error('DistroKid catalog JSON not found (pass --catalog=…)')
}

async function main() {
  const catalogArg = process.argv.find((a) => a.startsWith('--catalog='))
  const playlistArg = process.argv.find((a) => a.startsWith('--playlist='))
  const playlistId = playlistArg?.slice('--playlist='.length) || DEFAULT_PLAYLIST_ID
  const catalogPath = pickCatalogPath(catalogArg?.slice('--catalog='.length))

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const catalog = parseDistroKidCatalogJson(JSON.parse(readFileSync(catalogPath, 'utf-8')))

  type ArtRow = {
    isrc: string
    title: string
    releaseTitle: string
    artworkUrl: string
    albumType: 'single' | 'ep' | 'album'
  }
  const byIsrc = new Map<string, ArtRow>()
  for (const release of catalog.releases) {
    const local = resolveLocalArtwork(release.title)
    const artworkUrl = local || release.artwork_url
    if (!artworkUrl) continue
    const trackCount = release.tracks.length
    const albumType: 'single' | 'ep' | 'album' =
      release.type_hint === 'album' || trackCount > 6
        ? 'album'
        : release.type_hint === 'single' || trackCount <= 1
          ? 'single'
          : 'ep'
    for (const track of release.tracks) {
      if (!track.isrc) continue
      byIsrc.set(track.isrc.toUpperCase(), {
        isrc: track.isrc.toUpperCase(),
        title: track.title,
        releaseTitle: release.title,
        artworkUrl,
        albumType,
      })
    }
  }

  console.log(`Catalog: ${catalogPath}`)
  console.log(`ISRC→artwork map: ${byIsrc.size} tracks from ${catalog.releases.length} releases`)

  const { data: playlist, error: plErr } = await supabase
    .from('music_library_playlists')
    .select('id, name, track_ids, artwork_url')
    .eq('id', playlistId)
    .maybeSingle()

  if (plErr || !playlist) {
    console.error(plErr?.message || `Playlist ${playlistId} not found`)
    process.exit(1)
  }

  const trackIds: string[] = Array.isArray(playlist.track_ids) ? playlist.track_ids : []
  if (!trackIds.length) {
    console.error('Playlist has no tracks — run ingest-distrokid-exports-playlist.ts first')
    process.exit(1)
  }

  const { data: tracks, error: tracksErr } = await supabase
    .from('music_library_tracks')
    .select('id, title, artwork_url, audio_file_id, metadata, folder_id')
    .in('id', trackIds)

  if (tracksErr) {
    console.error(tracksErr.message)
    process.exit(1)
  }

  let updated = 0
  let skipped = 0
  let missing = 0
  const artByRelease = new Map<string, string>()

  for (const track of tracks || []) {
    const meta = (track.metadata || {}) as Record<string, unknown>
    const isrc = String(meta.isrc || meta.isrc_full || '')
      .replace(/[^A-Za-z0-9]/g, '')
      .toUpperCase()

    // Fallback: parse ISRC from track id like track-dk-qzes72569811-…
    const fromId = String(track.id || '').match(/([a-z]{2}[a-z0-9]{10})/i)?.[1]?.toUpperCase()
    const key = isrc || fromId || ''
    const hit = key ? byIsrc.get(key) : undefined

    if (!hit) {
      missing += 1
      console.log(`MISS  ${track.id}  title=${track.title}`)
      continue
    }

    artByRelease.set(hit.releaseTitle, hit.artworkUrl)

    const nextMeta = {
      ...meta,
      isrc: hit.isrc,
      isrc_full: hit.isrc,
      album: hit.releaseTitle,
      album_type: hit.albumType,
      has_artwork: true,
      artwork_source: hit.artworkUrl.startsWith('/') ? 'local-ep' : 'distrokid-catalog',
    }

    const sameArt = track.artwork_url === hit.artworkUrl
    const sameTitle = track.title === hit.title
    const sameAlbum = meta.album === hit.releaseTitle && meta.album_type === hit.albumType
    if (sameArt && sameTitle && sameAlbum && meta.isrc === hit.isrc) {
      skipped += 1
      continue
    }

    const { error } = await supabase
      .from('music_library_tracks')
      .update({
        artwork_url: hit.artworkUrl,
        title: hit.title,
        metadata: nextMeta,
      })
      .eq('id', track.id)

    if (error) {
      console.error(`FAIL  ${track.id}: ${error.message}`)
      continue
    }

    if (track.audio_file_id) {
      await supabase
        .from('audio_files')
        .update({
          artwork_url: hit.artworkUrl,
          title: hit.title,
        })
        .eq('id', track.audio_file_id)
    }

    updated += 1
    console.log(
      `OK    ${hit.isrc}  ${hit.title}  ← ${hit.albumType} “${hit.releaseTitle}”  (${hit.artworkUrl.startsWith('/') ? 'local' : 'distrokid'})`,
    )
  }

  // Playlist cover: prefer Soul Candy, else first mapped release art
  const playlistArt =
    artByRelease.get('Soul Candy') ||
    [...artByRelease.values()][0] ||
    playlist.artwork_url ||
    null

  if (playlistArt && playlistArt !== playlist.artwork_url) {
    await supabase
      .from('music_library_playlists')
      .update({ artwork_url: playlistArt, updated_at: new Date().toISOString() })
      .eq('id', playlist.id)
    console.log(`Playlist cover → ${playlistArt}`)
  }

  // Companion folder (playlist- stripped)
  const folderId = playlist.id.startsWith('playlist-')
    ? playlist.id.slice('playlist-'.length)
    : playlist.id
  if (playlistArt) {
    await supabase
      .from('music_library_folders')
      .update({ artwork_url: playlistArt })
      .eq('id', folderId)
  }

  try {
    const version = Date.now()
    const { error: bumpErr } = await supabase.from('settings').upsert(
      {
        key: MUSIC_LIBRARY_PUBLISH_VERSION_KEY,
        value: { version },
      },
      { onConflict: 'key' },
    )
    if (bumpErr) throw bumpErr
    console.log(`Publish version bumped → ${version}`)
  } catch (err) {
    console.warn('Publish bump skipped:', err instanceof Error ? err.message : err)
  }

  console.log(
    `\nDone. updated=${updated} skipped=${skipped} missing=${missing} playlist=${playlist.name} (${trackIds.length} tracks)`,
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
