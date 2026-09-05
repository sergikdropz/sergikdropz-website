import { NextResponse } from 'next/server'
import { createSupabaseServerClient, isLocalHomeSupabase } from '@/lib/supabase'
import { mergeSonicDNAIntoMetadata } from '@/utils/mergeSonicDNAIntoMetadata'
import { requireAdminApi } from '@/lib/auth/route-policy'
import { isHomeApiPlainTextError, saveLocalArtworkFile } from '@/lib/local-artwork'
import { persistSystemicCover, resolveTrackCollection } from '@/lib/catalog-sync/persist-systemic-cover'
import { bumpMusicLibraryPublishVersion } from '@/lib/music-library-publish'

export const dynamic = 'force-dynamic'

const MAX_SIZE_MB = 20
const HEIC_EXT = /\.(heic|heif)$/i
const HEIC_MIME = /image\/hei[cf]/i

function isHeicUpload(fileName: string, mimeType: string): boolean {
  return HEIC_EXT.test(fileName) || HEIC_MIME.test(mimeType)
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

    const ext = (fileName.split('.').pop() || 'jpg').toLowerCase()
    const path = `artwork/${artworkId}.${ext === 'jpeg' ? 'jpg' : ext}`
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    let artworkUrl: string
    let localUrl: string | null = null
    const useLocal =
      isLocalHomeSupabase() ||
      process.env.NEXT_PUBLIC_LOCAL_AUDIO === '1'

    try {
      localUrl = await saveLocalArtworkFile(artworkId, fileName, mimeType, buffer)
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
          .upload(path, buffer, { contentType: mimeType, upsert: true })

        if (uploadError) {
          if (isHomeApiPlainTextError(uploadError.message)) {
            if (!localUrl) {
              localUrl = await saveLocalArtworkFile(artworkId, fileName, mimeType, buffer)
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
          localUrl = await saveLocalArtworkFile(artworkId, fileName, mimeType, buffer)
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
