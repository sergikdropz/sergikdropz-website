import { existsSync } from 'fs'
import { writeFile } from 'fs/promises'
import path from 'path'
import { getR2MediaConfig, putR2Object, r2ObjectExists } from '@/lib/audio/r2Media'
import { contentTypeForDownload, readVaultAudio } from '@/lib/shares/share-download-bytes'
import { applyShareId3, stampPreservesAudio, type ShareAudioTagFields } from '@/lib/shares/share-download-id3'
import {
  fetchArtworkJpeg,
  loadShareDownloadTags,
} from '@/lib/shares/share-download-embed'
import { mp3RelativeCandidates, wavRelativeCandidates } from '@/lib/shares/share-download'
import { shareDownloadTagFields } from '@/lib/shares/share-download-tag-text'
import { createSupabaseServerClient } from '@/lib/supabase'

function hintsFrom(meta: unknown): string[] {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return []
  const row = meta as Record<string, unknown>
  return [row.distribution_wav_url, row.dspMastersPath, row.file_path].filter(
    (value): value is string => typeof value === 'string' && value.trim().length > 0,
  )
}

async function firstHit(candidates: string[]): Promise<string | null> {
  if (!getR2MediaConfig()) {
    const root = path.join(process.cwd(), 'public', 'audio')
    for (const rel of candidates) {
      const filePath = path.resolve(root, rel)
      if (filePath.startsWith(root + path.sep) && existsSync(filePath)) return rel
    }
    return null
  }
  for (const rel of candidates) {
    if (await r2ObjectExists(rel)) return rel
  }
  return null
}

async function writeStamped(relativePath: string, bytes: Buffer): Promise<void> {
  if (getR2MediaConfig()) {
    await putR2Object(relativePath, bytes, { contentType: contentTypeForDownload(relativePath) })
  }
  const root = path.join(process.cwd(), 'public', 'audio')
  const local = path.resolve(root, relativePath)
  if (local.startsWith(root + path.sep) && existsSync(local)) {
    await writeFile(local, bytes)
  }
}

/**
 * Write catalog, artwork, and Sonic DNA into the vault MP3 and WAV after analysis.
 * Rekordbox, Serato, Traktor, and Music all read these same ID3 fields.
 */
export async function imprintCatalogTags(audioFileId: string): Promise<string[]> {
  const supabase = createSupabaseServerClient()
  const audio = await supabase
    .from('audio_files')
    .select('id,title,artist,file_url,file_path,artwork_url,metadata,bpm,key_signature,energy_level')
    .eq('id', audioFileId)
    .maybeSingle()
  if (audio.error || !audio.data) return []

  const library = await supabase
    .from('music_library_tracks')
    .select('id,title,artist,folder_id,artwork_url')
    .eq('audio_file_id', audioFileId)
    .limit(1)
    .maybeSingle()

  let albumTitle = String(audio.data.title || 'SERGIK')
  let albumArtist = String(audio.data.artist || 'SERGIK')
  let year: number | null = null
  let artwork = audio.data.artwork_url ? String(audio.data.artwork_url) : library.data?.artwork_url ? String(library.data.artwork_url) : ''
  let tag: ShareAudioTagFields | undefined

  if (library.data?.id) {
    let trackIds = [{ id: String(library.data.id), title: String(library.data.title || albumTitle), artist: String(library.data.artist || albumArtist) }]
    if (library.data.folder_id) {
      const folder = await supabase
        .from('music_library_folders')
        .select('name,artwork_url,year,album_artist')
        .eq('id', library.data.folder_id)
        .maybeSingle()
      if (!folder.error && folder.data) {
        albumTitle = String(folder.data.name || albumTitle)
        if (folder.data.album_artist) albumArtist = String(folder.data.album_artist)
        year = folder.data.year ?? null
        if (folder.data.artwork_url) artwork = String(folder.data.artwork_url)
      }
      const siblings = await supabase
        .from('music_library_tracks')
        .select('id,title,artist')
        .eq('folder_id', library.data.folder_id)
      if (!siblings.error && siblings.data?.length) {
        trackIds = siblings.data.map((row) => ({
          id: String(row.id),
          title: String(row.title || ''),
          artist: String(row.artist || albumArtist),
        }))
      }
    }
    const tags = await loadShareDownloadTags(trackIds, {
      title: albumTitle,
      artist: albumArtist,
      year,
      artworkUrl: artwork,
    })
    tag = tags.get(String(library.data.id))
  }

  if (!tag) {
    tag = shareDownloadTagFields({
      title: String(audio.data.title || 'Untitled'),
      artist: String(audio.data.artist || 'SERGIK'),
      album: albumTitle,
      albumArtist,
      bpm: audio.data.bpm,
      key: audio.data.key_signature,
      energy: audio.data.energy_level,
      year,
    })
  }

  const stream = String(audio.data.file_url || audio.data.file_path || '')
  const hints = hintsFrom(audio.data.metadata)
  const targets = [
    await firstHit(mp3RelativeCandidates([stream, audio.data.file_path, ...hints])),
    await firstHit(wavRelativeCandidates({ stream, hints })),
  ].filter((rel, index, all): rel is string => Boolean(rel) && all.indexOf(rel) === index)

    const artworkJpeg = await fetchArtworkJpeg(artwork)
    const stamped: string[] = []
    for (const relativePath of targets) {
      const format = /\.wav$/i.test(relativePath) ? 'wav' : 'mp3'
      try {
        const original = await readVaultAudio(relativePath)
        if (!original || original.length < 64) continue
        const tagged = applyShareId3(original, format, tag, artworkJpeg)
        if (!stampPreservesAudio(original, tagged, format)) {
          console.warn(`[catalog-tags] left ${relativePath} unchanged — stamp did not keep the audio bytes`)
          continue
        }
        await writeStamped(relativePath, tagged)
        stamped.push(relativePath)
      } catch (err) {
        console.warn(`[catalog-tags] left ${relativePath} unchanged:`, err instanceof Error ? err.message : err)
      }
    }
  if (stamped.length) {
    console.log(`[catalog-tags] stamped ${stamped.join(', ')}`)
  }
  return stamped
}

/** Restamp after the vault response so a save does not wait on large WAV masters. */
export function scheduleCatalogTagImprint(audioFileIds: Array<string | null | undefined>) {
  const ids = [...new Set(audioFileIds.map((id) => String(id || '').trim()).filter(Boolean))]
  if (!ids.length) return
  setImmediate(() => {
    void (async () => {
      for (const id of ids) {
        try {
          await imprintCatalogTags(id)
        } catch (err) {
          console.warn('[catalog-tags] imprint failed:', err instanceof Error ? err.message : err)
        }
      }
    })()
  })
}

export async function scheduleFolderCatalogTags(folderId: string) {
  const id = String(folderId || '').trim()
  if (!id) return
  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase
    .from('music_library_tracks')
    .select('audio_file_id')
    .eq('folder_id', id)
  if (error) {
    console.warn('[catalog-tags] folder lookup failed:', error.message)
    return
  }
  scheduleCatalogTagImprint((data || []).map((row) => row.audio_file_id as string | null))
}
