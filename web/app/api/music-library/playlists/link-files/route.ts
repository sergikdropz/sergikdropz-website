import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase'
import { getServerSession } from '@/lib/auth'
import { supabaseIsReachable, supabaseUnavailableResponse } from '@/lib/supabaseReachability'
import { bumpMusicLibraryPublishVersion } from '@/lib/music-library-publish'
import {
  dropBasename,
  dropVaultRelativeHint,
  isAudioDropName,
  matchDropsToVault,
  type DroppedFileRef,
  type VaultMatchCandidate,
} from '@/lib/music-library/match-vault-files'
import {
  ensurePlaylistFolder,
  ingestAudioIntoVault,
} from '@/lib/music-library/ingest-vault-audio'
import { convertBufferToHighQualityMp3 } from '@/lib/audio/convert-buffer-to-mp3'
import { extractMetadataFromBuffer } from '@/utils/extractMetadataFromBuffer'
import {
  formatBytesMb,
  formatDurationClock,
  isConvertibleOversizeAudio,
  isWithinDirectIngestLimit,
  maxDirectBytesForDuration,
  PLAYLIST_DROP_MAX_CONVERT_BYTES,
  PLAYLIST_DROP_MAX_DIRECT_BYTES,
} from '@/lib/audio/playlist-drop-limits'

const LIVE_REVALIDATE_PATHS = [
  '/music-library',
  '/api/music-library/sync',
  '/api/music-library/folders',
  '/api/music-library/playlists',
  '/api/music-library/tracks',
  '/api/music-library/tracks-optimized',
  '/api/music-library/browse',
  '/api/music-library/catalog-version',
]

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

function folderIdFromPlaylistId(playlistId: string) {
  return playlistId.startsWith('playlist-') ? playlistId.slice('playlist-'.length) : playlistId
}

function truthyFormFlag(value: FormDataEntryValue | null): boolean {
  if (value == null) return false
  const s = String(value).trim().toLowerCase()
  return s === '1' || s === 'true' || s === 'yes' || s === 'on'
}

/**
 * POST /api/music-library/playlists/link-files
 *
 * Drag-drop from the computer into a curated playlist.
 * 1) Match existing vault catalog tracks by path/name
 * 2) Auto-ingest unmatched audio into the vault (public/audio + DB rows)
 * 3) Append all track IDs to playlist.track_ids
 *
 * Accepts multipart FormData:
 *   playlistId: string
 *   files: File[] (repeatable)
 *   paths?: string[] (optional relative hints, same order as files)
 *   convertToMp3?: "1" — convert oversized lossless (wav/flac/…) to 320k MP3 before ingest
 *
 * Also accepts JSON { playlistId, files: [{ name, path? }] } for match-only.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!(await supabaseIsReachable())) return supabaseUnavailableResponse()

    const contentType = request.headers.get('content-type') || ''
    let playlistId = ''
    let convertToMp3 = false
    const refs: DroppedFileRef[] = []
    const blobs: {
      ref: DroppedFileRef
      buffer: Buffer
      mimeType: string
      originalName: string
      lastModifiedMs?: number
    }[] = []
    const oversized: {
      file: string
      sizeBytes: number
      maxBytes: number
      convertible: boolean
      durationSec?: number
    }[] = []

    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData()
      playlistId = String(form.get('playlistId') || '')
      convertToMp3 = truthyFormFlag(form.get('convertToMp3'))
      const pathHints = form.getAll('paths').map((p) => String(p || ''))
      const fileEntries = form.getAll('files').filter((f): f is File => typeof File !== 'undefined' && f instanceof File)
      // Some clients send "file" singular
      const extra = form.getAll('file').filter((f): f is File => typeof File !== 'undefined' && f instanceof File)
      const allFiles = [...fileEntries, ...extra]

      for (let i = 0; i < allFiles.length; i++) {
        const file = allFiles[i]
        const path = pathHints[i] || (file as File & { webkitRelativePath?: string }).webkitRelativePath || undefined
        const ref: DroppedFileRef = { name: file.name, path }
        refs.push(ref)
        if (!isAudioDropName(dropBasename(ref))) continue

        if (file.size > PLAYLIST_DROP_MAX_CONVERT_BYTES) {
          return NextResponse.json(
            {
              error: `${file.name} is ${formatBytesMb(file.size)} (max ${formatBytesMb(PLAYLIST_DROP_MAX_CONVERT_BYTES)} even with MP3 convert)`,
              code: 'FILE_TOO_LARGE_FOR_CONVERT',
              file: file.name,
              sizeBytes: file.size,
              maxBytes: PLAYLIST_DROP_MAX_CONVERT_BYTES,
            },
            { status: 413 },
          )
        }

        const buffer = Buffer.from(await file.arrayBuffer())
        let durationSec: number | undefined
        if (file.size > PLAYLIST_DROP_MAX_DIRECT_BYTES) {
          try {
            const meta = await extractMetadataFromBuffer(buffer, file.name)
            if (meta.duration && meta.duration > 0) durationSec = meta.duration
          } catch {
            /* duration optional */
          }
        }

        const withinDurationBudget = isWithinDirectIngestLimit(file.size, durationSec)
        const convertible = isConvertibleOversizeAudio(file.name, file.size, durationSec)

        if (!withinDurationBudget) {
          if (convertToMp3 && convertible) {
            try {
              const mp3 = await convertBufferToHighQualityMp3(buffer, file.name, { bitrate: '320' })
              blobs.push({
                ref: { ...ref, name: mp3.fileName },
                buffer: mp3.buffer,
                mimeType: mp3.mimeType,
                originalName: file.name,
                lastModifiedMs: typeof file.lastModified === 'number' ? file.lastModified : undefined,
              })
            } catch (err: any) {
              return NextResponse.json(
                {
                  error: err?.message || `Failed to convert ${file.name} to MP3`,
                  code: 'CONVERT_FAILED',
                  file: file.name,
                },
                { status: 500 },
              )
            }
            continue
          }

          oversized.push({
            file: file.name,
            sizeBytes: file.size,
            maxBytes: maxDirectBytesForDuration(durationSec),
            convertible,
            ...(durationSec != null ? { durationSec } : {}),
          })
          continue
        }

        blobs.push({
          ref,
          buffer,
          mimeType: file.type || 'audio/mpeg',
          originalName: file.name,
          lastModifiedMs: typeof file.lastModified === 'number' ? file.lastModified : undefined,
        })
      }

      if (oversized.length) {
        const anyConvertible = oversized.some((o) => o.convertible)
        const detail = oversized
          .map((o) => {
            const dur =
              o.durationSec != null ? ` · ${formatDurationClock(o.durationSec)}` : ''
            return `${o.file} (${formatBytesMb(o.sizeBytes)}${dur}, limit ${formatBytesMb(o.maxBytes)})`
          })
          .join('; ')
        return NextResponse.json(
          {
            error: anyConvertible
              ? `${detail}. Convert to high-quality MP3 (320kbps) to continue.`
              : `${detail} exceed the duration-based size budget.`,
            code: 'FILE_TOO_LARGE',
            maxBytes: Math.max(...oversized.map((o) => o.maxBytes), PLAYLIST_DROP_MAX_DIRECT_BYTES),
            files: oversized,
            convertible: anyConvertible,
          },
          { status: 413 },
        )
      }
    } else {
      const body = await request.json().catch(() => ({}))
      playlistId = typeof body.playlistId === 'string' ? body.playlistId : ''
      const filesIn = Array.isArray(body.files) ? body.files : []
      for (const f of filesIn) {
        refs.push({
          name: String(f?.name || ''),
          path: f?.path ? String(f.path) : undefined,
        })
      }
    }

    if (!playlistId) {
      return NextResponse.json({ error: 'playlistId is required' }, { status: 400 })
    }
    if (!refs.length) {
      return NextResponse.json({ error: 'No files in drop' }, { status: 400 })
    }

    const audioRefs = refs.filter((r) => isAudioDropName(dropBasename(r)))
    if (!audioRefs.length) {
      return NextResponse.json({
        success: false,
        error: 'No audio files in drop',
        matched: [],
        created: [],
        unmatched: refs.map((r) => dropBasename(r)),
        trackIds: [],
      })
    }

    const supabase = createSupabaseServerClient()

    const { data: playlist, error: plErr } = await supabase
      .from('music_library_playlists')
      .select('id, name, track_ids')
      .eq('id', playlistId)
      .maybeSingle()

    if (plErr || !playlist) {
      return NextResponse.json(
        { error: plErr?.message || 'Playlist not found' },
        { status: plErr ? 500 : 404 },
      )
    }

    const folderId = folderIdFromPlaylistId(playlistId)
    await ensurePlaylistFolder(folderId, playlist.name)

    const [{ data: libraryTracks }, { data: audioFiles }] = await Promise.all([
      supabase
        .from('music_library_tracks')
        .select('id, title, artist, file_url, audio_file_id')
        .or('is_archived.is.null,is_archived.eq.false'),
      supabase.from('audio_files').select('id, file_name, file_path, file_url, title, artist'),
    ])

    const byAudioId = new Map((audioFiles || []).map((a: any) => [a.id, a]))
    const candidates: VaultMatchCandidate[] = (libraryTracks || []).map((t: any) => {
      const audio = t.audio_file_id ? byAudioId.get(t.audio_file_id) : null
      return {
        id: t.id,
        title: t.title,
        artist: t.artist,
        file_url: t.file_url || audio?.file_url || null,
        file_path: audio?.file_path || null,
        file_name: audio?.file_name || null,
        audio_file_id: t.audio_file_id,
      }
    })

    const matchResults = matchDropsToVault(audioRefs, candidates)
    const blobByOriginalBase = new Map(
      blobs.map((b) => [dropBasename({ name: b.originalName }).toLowerCase(), b]),
    )

    const matchedIds: string[] = []
    const created: { file: string; trackId: string; filePath: string; convertedFrom?: string }[] = []
    const ingestFailed: { file: string; error: string }[] = []
    const stillUnmatched: { file: string; reason: string }[] = []

    for (const result of matchResults) {
      const base = dropBasename(result.ref)
      if (result.reason === 'matched' && result.trackId) {
        matchedIds.push(result.trackId)
        continue
      }
      if (result.reason === 'not_audio') continue

      const blob = blobByOriginalBase.get(base.toLowerCase())
      if (!blob) {
        stillUnmatched.push({
          file: base,
          reason: 'no_file_bytes',
        })
        continue
      }

      try {
        const ingestName = dropBasename(blob.ref)
        const ingested = await ingestAudioIntoVault({
          fileName: ingestName,
          buffer: blob.buffer,
          mimeType: blob.mimeType,
          playlistName: playlist.name,
          folderId,
          relativeHint: dropVaultRelativeHint({
            name: ingestName,
            path: blob.ref.path,
          }),
          lastModifiedMs: blob.lastModifiedMs,
        })
        matchedIds.push(ingested.trackId)
        if (ingested.created) {
          created.push({
            file: ingestName,
            trackId: ingested.trackId,
            filePath: ingested.filePath,
            ...(blob.originalName !== ingestName ? { convertedFrom: blob.originalName } : {}),
          })
        }
      } catch (err: any) {
        const error = err?.message || 'ingest failed'
        console.error('[link-files] ingest failed', base, error)
        ingestFailed.push({
          file: base,
          error,
        })
      }
    }

    const uniqueMatched = [...new Set(matchedIds)]
    const existing: string[] = Array.isArray(playlist.track_ids) ? playlist.track_ids : []
    const nextIds = [...existing]
    const added: string[] = []
    for (const id of uniqueMatched) {
      if (!nextIds.includes(id)) {
        nextIds.push(id)
        added.push(id)
      }
    }

    if (added.length || created.length) {
      const { error: upErr } = await supabase
        .from('music_library_playlists')
        .update({ track_ids: nextIds, updated_at: new Date().toISOString() })
        .eq('id', playlistId)

      if (upErr) {
        return NextResponse.json({ error: upErr.message }, { status: 500 })
      }
    }

    // Publish catalog version so live music-library clients refresh (same signal as Sync Production).
    let publishVersion: number | null = null
    if (added.length || created.length) {
      try {
        publishVersion = await bumpMusicLibraryPublishVersion(session.user?.id)
        for (const path of LIVE_REVALIDATE_PATHS) {
          try {
            revalidatePath(path)
          } catch {
            /* ignore */
          }
        }
        try {
          revalidatePath('/music-library', 'layout')
        } catch {
          /* ignore */
        }
      } catch (bumpErr) {
        console.warn('[link-files] Failed to bump live catalog version:', bumpErr)
      }
    }

    const converted = created.filter((c) => c.convertedFrom).map((c) => ({
      from: c.convertedFrom as string,
      to: c.file,
      trackId: c.trackId,
    }))

    return NextResponse.json({
      success: true,
      playlistId,
      playlistName: playlist.name,
      added,
      created,
      converted,
      alreadyInPlaylist: uniqueMatched.filter((id) => existing.includes(id)),
      matched: matchResults
        .filter((r) => r.reason === 'matched')
        .map((r) => ({ file: dropBasename(r.ref), trackId: r.trackId, score: r.score })),
      unmatched: [...stillUnmatched, ...ingestFailed.map((f) => ({ file: f.file, reason: f.error }))],
      ingestFailed,
      trackIds: nextIds,
      publishVersion,
      databaseUpdated: Boolean(added.length || created.length),
    })
  } catch (error: any) {
    console.error('link-files error:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to link files' },
      { status: 500 },
    )
  }
}
