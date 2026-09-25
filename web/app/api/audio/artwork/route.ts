import { NextResponse } from 'next/server'
import { createSupabaseServerClient, isLocalHomeSupabase } from '@/lib/supabase'
import { mergeSonicDNAIntoMetadata } from '@/utils/mergeSonicDNAIntoMetadata'
import { requireAdminApi } from '@/lib/auth/route-policy'
import { isHomeApiPlainTextError, saveLocalArtworkFile, deleteLocalArtworkFiles } from '@/lib/local-artwork'
import { persistSystemicCover, resolveTrackCollection } from '@/lib/catalog-sync/persist-systemic-cover'
import { artworkFileIdFromUrl, stripArtworkCacheBust } from '@/lib/catalog-sync/artwork'
import { bumpMusicLibraryPublishVersion } from '@/lib/music-library-publish'
import { resolveImageUrl } from '@/utils/resolveImageUrl'

export const dynamic = 'force-dynamic'

const MAX_SIZE_MB = 20
const HEIC_EXT = /\.(heic|heif)$/i
const HEIC_MIME = /image\/hei[cf]/i

function isHeicUpload(fileName: string, mimeType: string): boolean {
  return HEIC_EXT.test(fileName) || HEIC_MIME.test(mimeType)
}

function storageObjectPathFromSrc(src: string): string | null {
  const path = stripArtworkCacheBust(src)
  const markers = [
    '/object/public/audio-files/',
    '/object/sign/audio-files/',
    '/audio-files/',
  ]
  for (const marker of markers) {
    const idx = path.indexOf(marker)
    if (idx === -1) continue
    const rel = path.slice(idx + marker.length).replace(/^\/+/, '')
    if (rel.startsWith('artwork/')) return rel
  }
  const fileId = artworkFileIdFromUrl(path)
  if (!fileId) return null
  const extMatch = path.match(/\.([a-z0-9]+)$/i)
  const ext = (extMatch?.[1] || 'jpg').toLowerCase() === 'jpeg' ? 'jpg' : (extMatch?.[1] || 'jpg').toLowerCase()
  return `artwork/${fileId}.${ext}`
}

export async function POST(request: Request) {
  try {
    const auth = await requireAdminApi()
    if (!auth.ok) return auth.response
    const formData = await request.formData()
    const file = formData.get('file') as File
    const trackId = formData.get('trackId') as string | null
    const audioFileId = formData.get('audioFileId') as string | null
    const folderId = formData.get('folderId') as string | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      return NextResponse.json({ error: `File too large (max ${MAX_SIZE_MB}MB)` }, { status: 400 })
    }

    const fileName = file.name || 'artwork'
    const mimeType = file.type || 'image/jpeg'
    if (isHeicUpload(fileName, mimeType)) {
      return NextResponse.json(
        { error: 'HEIC/HEIF photos can’t be used as cover art. Export as JPG or PNG and try again.' },
        { status: 400 },
      )
    }

    const supabase = createSupabaseServerClient()
    const collection = await resolveTrackCollection(supabase, { trackId, audioFileId })
    const resolvedAudioFileId = collection.audioFileId || audioFileId
    const collectionFolderId = folderId || collection.folderId

    const artworkId =
      (collectionFolderId ? `folder-${collectionFolderId}` : null) ||
      resolvedAudioFileId ||
      trackId ||
      (folderId ? `folder-${folderId}` : null)
    if (!artworkId) {
      return NextResponse.json({ error: 'trackId, audioFileId, or folderId is required' }, { status: 400 })
    }

    const arrayBuffer = await file.arrayBuffer()
    const rawBuffer = Buffer.from(arrayBuffer)

    let normalized
    try {
      const { normalizeCoverArtworkBuffer } = await import('@/lib/media/normalize-cover')
      normalized = await normalizeCoverArtworkBuffer(rawBuffer)
    } catch (err: any) {
      console.error('[artwork] Normalize failed:', err)
      return NextResponse.json(
        { error: err?.message || 'Could not process cover art image' },
        { status: 400 },
      )
    }

    const buffer = normalized.buffer
    const mimeTypeOut = normalized.mimeType
    const ext = normalized.ext
    const path = `artwork/${artworkId}.${ext}`
    const normalizedFileName = `${artworkId}.${ext}`

    let artworkUrl: string
    let localUrl: string | null = null
    const useLocal =
      isLocalHomeSupabase() ||
      process.env.NEXT_PUBLIC_LOCAL_AUDIO === '1'

    try {
      localUrl = await saveLocalArtworkFile(
        artworkId,
        normalizedFileName,
        mimeTypeOut,
        buffer,
        { normalize: false },
      )
    } catch (err) {
      if (!useLocal) {
        console.warn('[artwork] Local cover write failed:', err)
      } else {
        throw err
      }
    }

    if (useLocal) {
      if (!localUrl) throw new Error('Failed to save cover art file')
      artworkUrl = localUrl
    } else {
      try {
        const { error: uploadError } = await supabase.storage
          .from('audio-files')
          .upload(path, buffer, { contentType: mimeTypeOut, upsert: true })

        if (uploadError) {
          if (isHomeApiPlainTextError(uploadError.message)) {
            if (!localUrl) {
              localUrl = await saveLocalArtworkFile(
                artworkId,
                normalizedFileName,
                mimeTypeOut,
                buffer,
                { normalize: false },
              )
            }
            artworkUrl = localUrl
          } else if (localUrl) {
            console.warn('[artwork] Storage upload failed, using local file:', uploadError.message)
            artworkUrl = localUrl
          } else {
            return NextResponse.json({ error: uploadError.message }, { status: 500 })
          }
        } else {
          const { data: urlData } = supabase.storage.from('audio-files').getPublicUrl(path)
          // Public Storage URL so production (and shop) can load the cover.
          // Keep the local file as a localhost fallback only.
          artworkUrl = urlData.publicUrl || localUrl || ''
        }
      } catch (error: unknown) {
        if (!isHomeApiPlainTextError(error) && !localUrl) throw error
        if (!localUrl) {
          localUrl = await saveLocalArtworkFile(
            artworkId,
            normalizedFileName,
            mimeTypeOut,
            buffer,
            { normalize: false },
          )
        }
        artworkUrl = localUrl
      }
    }

    let systemic = {
      folderId: collectionFolderId || null,
      playlistId: null as string | null,
      tracksUpdated: 0,
      audioFilesUpdated: 0,
    }

    if (collectionFolderId) {
      systemic = await persistSystemicCover(supabase, collectionFolderId, artworkUrl)
    } else if (resolvedAudioFileId) {
      const { data: audioFile } = await supabase
        .from('audio_files')
        .select('metadata, sonic_dna')
        .eq('id', resolvedAudioFileId)
        .maybeSingle()

      const updatedMetadata = mergeSonicDNAIntoMetadata(
        audioFile?.metadata || {},
        audioFile?.sonic_dna || null,
        { artwork_url: artworkUrl }
      )

      await supabase
        .from('audio_files')
        .update({ artwork_url: artworkUrl, metadata: updatedMetadata })
        .eq('id', resolvedAudioFileId)

      await supabase
        .from('music_library_tracks')
        .update({ artwork_url: artworkUrl })
        .eq('audio_file_id', resolvedAudioFileId)
    } else if (trackId) {
      await supabase
        .from('music_library_tracks')
        .update({ artwork_url: artworkUrl })
        .eq('id', trackId)
    }

    let publishVersion: number | null = null
    try {
      publishVersion = await bumpMusicLibraryPublishVersion()
    } catch {
      /* non-fatal */
    }

    return NextResponse.json({
      success: true,
      artworkUrl,
      folderId: systemic.folderId,
      playlistId: systemic.playlistId,
      tracksUpdated: systemic.tracksUpdated,
      audioFilesUpdated: systemic.audioFilesUpdated,
      publishVersion,
    })
  } catch (error: any) {
    const message = isHomeApiPlainTextError(error)
      ? 'Local home server has no Storage API. Cover art is saved as a site file instead — retry the upload.'
      : error.message || 'Upload failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * DELETE /api/audio/artwork
 * Body: { src: string } — remove a cover file from local public + Storage and clear matching DB URLs.
 */
export async function DELETE(request: Request) {
  try {
    const auth = await requireAdminApi()
    if (!auth.ok) return auth.response

    const body = await request.json().catch(() => ({}))
    const rawSrc = typeof body?.src === 'string' ? body.src.trim() : ''
    if (!rawSrc) {
      return NextResponse.json({ error: 'src is required' }, { status: 400 })
    }

    const resolved = resolveImageUrl(rawSrc) || rawSrc
    const base = stripArtworkCacheBust(resolved)
    const fileId = artworkFileIdFromUrl(base)
    if (!fileId) {
      return NextResponse.json(
        { error: 'Only uploaded folder covers (folder-*.*) can be deleted from the pool' },
        { status: 400 },
      )
    }

    const deletedLocal = await deleteLocalArtworkFiles(fileId)
    const storagePath = storageObjectPathFromSrc(base)
    let storageDeleted = false
    const supabase = createSupabaseServerClient()

    if (storagePath) {
      try {
        const { error } = await supabase.storage.from('audio-files').remove([storagePath])
        storageDeleted = !error
        if (error) console.warn('[artwork] Storage delete failed:', error.message)
      } catch (err) {
        console.warn('[artwork] Storage delete threw:', err)
      }
    }

    // Clear folders / tracks that still point at this cover (any host variant of the same file id).
    const like = `%${fileId}.%`
    const { data: folders } = await supabase
      .from('music_library_folders')
      .select('id, artwork_url')
      .ilike('artwork_url', like)
      .limit(200)

    let foldersCleared = 0
    for (const row of folders || []) {
      const rowBase = stripArtworkCacheBust(resolveImageUrl(String(row.artwork_url || '')) || String(row.artwork_url || ''))
      if (!rowBase.includes(fileId)) continue
      const { error } = await supabase
        .from('music_library_folders')
        .update({ artwork_url: null })
        .eq('id', row.id)
      if (!error) foldersCleared += 1
    }

    const { data: tracks } = await supabase
      .from('music_library_tracks')
      .select('id, artwork_url')
      .ilike('artwork_url', like)
      .limit(500)

    let tracksCleared = 0
    for (const row of tracks || []) {
      const rowBase = stripArtworkCacheBust(resolveImageUrl(String(row.artwork_url || '')) || String(row.artwork_url || ''))
      if (!rowBase.includes(fileId)) continue
      const { error } = await supabase
        .from('music_library_tracks')
        .update({ artwork_url: null })
        .eq('id', row.id)
      if (!error) tracksCleared += 1
    }

    let publishVersion: number | null = null
    try {
      publishVersion = await bumpMusicLibraryPublishVersion()
    } catch {
      /* non-fatal */
    }

    return NextResponse.json({
      success: true,
      fileId,
      deletedLocal,
      storageDeleted,
      foldersCleared,
      tracksCleared,
      publishVersion,
    })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Delete failed' }, { status: 500 })
  }
}
