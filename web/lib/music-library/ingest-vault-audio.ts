import { mkdir, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import { createSupabaseServerClient, isLocalHomeSupabase } from '@/lib/supabase'

const AUDIO_EXT = /\.(mp3|wav|m4a|aac|flac|ogg|oga|opus|aiff?|webm)$/i

function safeSegment(value: string): string {
  return value
    .replace(/[<>:"|?*\u0000-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'untitled'
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'track'
  )
}

/** Guess title/artist from "Artist - Title.mp3" style names. */
export function parseAudioFileName(fileName: string): { title: string; artist: string } {
  const stem = fileName.replace(AUDIO_EXT, '').trim()
  const parts = stem.split(/\s+-\s+/)
  if (parts.length >= 2) {
    return {
      artist: parts[0].trim() || 'SERGIK',
      title: parts.slice(1).join(' - ').trim() || stem,
    }
  }
  return { title: stem || fileName, artist: 'SERGIK' }
}

/**
 * Persist an audio blob under web/public/audio so the home-server / Caddy
 * vault can serve it without Supabase Storage.
 */
export async function saveLocalVaultAudioFile(
  relativePath: string,
  buffer: Buffer,
): Promise<{ relativePath: string; publicUrl: string }> {
  const clean = relativePath
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/^audio\//i, '')
    .split('/')
    .map(safeSegment)
    .filter(Boolean)
    .join('/')

  if (!clean || clean.includes('..')) {
    throw new Error('Invalid vault path')
  }

  const abs = join(process.cwd(), 'public', 'audio', ...clean.split('/'))
  await mkdir(dirname(abs), { recursive: true })
  await writeFile(abs, buffer)
  const encoded = clean
    .split('/')
    .map((s) => encodeURIComponent(s))
    .join('/')
  return { relativePath: clean, publicUrl: `/audio/${encoded}` }
}

export type IngestedVaultTrack = {
  trackId: string
  audioFileId: string | null
  fileUrl: string
  filePath: string
  title: string
  artist: string
  created: boolean
}

/**
 * Write audio into the vault (local disk and/or Storage) and ensure
 * audio_files + music_library_tracks rows exist.
 */
export async function ingestAudioIntoVault(opts: {
  fileName: string
  buffer: Buffer
  mimeType?: string
  playlistName: string
  folderId: string
  relativeHint?: string | null
  /** Browser File.lastModified — used as original export/creation date when tags lack a date. */
  lastModifiedMs?: number | null
}): Promise<IngestedVaultTrack> {
  const supabase = createSupabaseServerClient()
  const { title, artist } = parseAudioFileName(opts.fileName)
  const { resolveOriginalFileDate } = await import('@/lib/audio/original-file-date')
  const originalDate = await resolveOriginalFileDate({
    buffer: opts.buffer,
    fileName: opts.fileName,
    lastModifiedMs: opts.lastModifiedMs,
    // Playlist drops must not walk /Volumes/SERGIK — that scan can take minutes per request.
    skipExportFolder: true,
  })
  const playlistSeg = safeSegment(opts.playlistName)
  const baseName = safeSegment(opts.fileName)
  const relativePath =
    opts.relativeHint &&
    !opts.relativeHint.includes('..') &&
    AUDIO_EXT.test(opts.relativeHint)
      ? opts.relativeHint.replace(/^\/+/, '').replace(/^audio\//i, '')
      : `unreleased/Playlists/${playlistSeg}/${baseName}`

  const useLocal =
    isLocalHomeSupabase() ||
    process.env.NEXT_PUBLIC_LOCAL_AUDIO === '1' ||
    !process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('supabase.co')

  let fileUrl: string
  let filePath = relativePath

  if (useLocal) {
    const saved = await saveLocalVaultAudioFile(relativePath, opts.buffer)
    filePath = saved.relativePath
    fileUrl = saved.publicUrl
  } else {
    try {
      const { error: uploadError } = await supabase.storage
        .from('audio-files')
        .upload(relativePath, opts.buffer, {
          contentType: opts.mimeType || 'audio/mpeg',
          upsert: true,
        })
      if (uploadError) {
        console.warn('[ingest-vault] Storage upload failed, saving locally:', uploadError.message)
        const saved = await saveLocalVaultAudioFile(relativePath, opts.buffer)
        filePath = saved.relativePath
        fileUrl = saved.publicUrl
      } else {
        const { data: urlData } = supabase.storage.from('audio-files').getPublicUrl(relativePath)
        fileUrl = urlData.publicUrl
        filePath = relativePath
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err || 'upload failed')
      console.warn('[ingest-vault] Storage upload threw, saving locally:', message)
      const saved = await saveLocalVaultAudioFile(relativePath, opts.buffer)
      filePath = saved.relativePath
      fileUrl = saved.publicUrl
    }
  }

  let audioFileId: string | null = null
  {
    const { data: byPath } = await supabase
      .from('audio_files')
      .select('id, file_url')
      .eq('file_path', filePath)
      .limit(1)
      .maybeSingle()
    const existing =
      byPath ||
      (
        await supabase
          .from('audio_files')
          .select('id, file_url')
          .eq('file_name', baseName)
          .limit(1)
          .maybeSingle()
      ).data

    if (existing?.id) {
      audioFileId = existing.id
      if (existing.file_url) fileUrl = existing.file_url
      await supabase
        .from('audio_files')
        .update({ file_url: fileUrl, file_path: filePath })
        .eq('id', existing.id)
    } else {
      const { data: inserted, error } = await supabase
        .from('audio_files')
        .insert({
          title,
          artist,
          file_name: baseName,
          file_path: filePath,
          file_url: fileUrl,
          format: (baseName.split('.').pop() || 'mp3').toUpperCase(),
          size_bytes: opts.buffer.length,
          size_mb: parseFloat((opts.buffer.length / (1024 * 1024)).toFixed(2)),
          folder_path: filePath.includes('/')
            ? filePath.slice(0, filePath.lastIndexOf('/'))
            : '',
          is_purchasable: false,
        })
        .select('id')
        .single()
      if (error) throw new Error(error.message)
      audioFileId = inserted.id
    }
  }

  {
    let existingTrack: { id: string; file_url: string | null } | null = null
    if (audioFileId) {
      const { data } = await supabase
        .from('music_library_tracks')
        .select('id, file_url')
        .eq('audio_file_id', audioFileId)
        .limit(1)
        .maybeSingle()
      existingTrack = data
    }
    if (!existingTrack) {
      const { data } = await supabase
        .from('music_library_tracks')
        .select('id, file_url')
        .eq('file_url', fileUrl)
        .limit(1)
        .maybeSingle()
      existingTrack = data
    }

    if (existingTrack?.id) {
      return {
        trackId: existingTrack.id,
        audioFileId,
        fileUrl: existingTrack.file_url || fileUrl,
        filePath,
        title,
        artist,
        created: false,
      }
    }
  }

  const trackId = `track-${slugify(opts.folderId)}-${slugify(title)}-${Date.now()}`
  const { error: trackErr } = await supabase.from('music_library_tracks').insert({
    id: trackId,
    folder_id: opts.folderId,
    audio_file_id: audioFileId,
    title,
    artist,
    file_url: fileUrl,
    year: originalDate?.year ?? null,
    date_created: originalDate?.isoDate ?? null,
    metadata: {
      file_path: filePath,
      source: 'playlist-drop-ingest',
      ingested_at: new Date().toISOString(),
      ...(originalDate
        ? {
            original_date: originalDate.isoDate,
            original_date_source: originalDate.source,
          }
        : {}),
    },
  })
  if (trackErr) throw new Error(trackErr.message)

  return {
    trackId,
    audioFileId,
    fileUrl,
    filePath,
    title,
    artist,
    created: true,
  }
}

export async function ensurePlaylistFolder(
  folderId: string,
  playlistName: string,
): Promise<void> {
  const supabase = createSupabaseServerClient()
  const { data } = await supabase
    .from('music_library_folders')
    .select('id')
    .eq('id', folderId)
    .maybeSingle()
  if (data?.id) return

  const { error } = await supabase.from('music_library_folders').insert({
    id: folderId,
    name: playlistName,
    type: 'folder',
    parent_id: null,
    hidden: false,
  })
  if (error && !/duplicate|unique/i.test(error.message)) {
    throw new Error(error.message)
  }
}
