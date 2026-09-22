import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'
import { requireAdminApi } from '@/lib/auth/route-policy'
import {
  fingerprintHashFromBuffer,
  replaceLibraryAudioFile,
  uploadStudioMasterWav,
  wavMasterError,
} from '@/lib/audio/replace-audio-file'
import { extractMetadataFromBuffer } from '@/utils/extractMetadataFromBuffer'

/**
 * POST /api/studio/tracks/[id]/replace-wav
 * Swap the distribution master WAV. Keeps ISRC. If the row is vault-linked,
 * also replaces the Music Vault audio object and requeues Sonic DNA.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const auth = await requireAdminApi()
    if (!auth.ok) return auth.response

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file) {
      return NextResponse.json({ error: 'Choose a WAV file.' }, { status: 400 })
    }
    const wavError = wavMasterError(file)
    if (wavError) {
      return NextResponse.json({ error: wavError }, { status: 400 })
    }

    const supabase = createSupabaseServerClient()
    const { data: track, error: trackError } = await supabase
      .from('distribution_tracks')
      .select('id, title, isrc_full, wav_url, duration, music_library_track_id')
      .eq('id', params.id)
      .single()

    if (trackError || !track) {
      return NextResponse.json({ error: 'Track not found' }, { status: 404 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const fingerprint = fingerprintHashFromBuffer(buffer)
    const libraryTrackId =
      typeof track.music_library_track_id === 'string' ? track.music_library_track_id : null

    let fileUrl: string
    let duration: number | null = null
    let vault: {
      updated: boolean
      trackId: string | null
      audioFileId: string | null
      dnaQueued: boolean
      reason?: string
    } = {
      updated: false,
      trackId: libraryTrackId,
      audioFileId: null,
      dnaQueued: false,
    }

    if (libraryTrackId) {
      const { data: libraryTrack, error: libraryError } = await supabase
        .from('music_library_tracks')
        .select('id, audio_file_id, file_url, duration')
        .eq('id', libraryTrackId)
        .single()

      if (libraryError || !libraryTrack) {
        return NextResponse.json(
          { error: 'Catalog row is vault-linked, but the Music Vault track is missing.' },
          { status: 409 },
        )
      }

      const audioFileId =
        typeof libraryTrack.audio_file_id === 'string' ? libraryTrack.audio_file_id : null
      if (!audioFileId) {
        return NextResponse.json(
          { error: 'Vault track has no audio file to replace. Relink it in Music Vault, then try again.' },
          { status: 409 },
        )
      }

      const replaced = await replaceLibraryAudioFile(supabase, {
        audioFileId,
        libraryTrackId,
        fileName: file.name,
        mimeType: file.type || 'audio/wav',
        fileSize: file.size,
        buffer,
      })
      fileUrl = replaced.fileUrl
      duration = replaced.duration
      vault = {
        updated: true,
        trackId: libraryTrackId,
        audioFileId,
        dnaQueued: true,
      }
    } else {
      const uploaded = await uploadStudioMasterWav(supabase, {
        trackId: params.id,
        fileName: file.name,
        buffer,
      })
      fileUrl = uploaded.fileUrl
      const meta = await extractMetadataFromBuffer(buffer, file.name)
      duration = meta.duration != null ? Math.round(meta.duration) : null
      vault = {
        updated: false,
        trackId: null,
        audioFileId: null,
        dnaQueued: false,
        reason: 'not_linked',
      }
    }

    const updates: Record<string, unknown> = {
      wav_url: fileUrl,
      fingerprint_hash: fingerprint,
    }
    if (duration != null) updates.duration = duration

    const { data: saved, error: saveError } = await supabase
      .from('distribution_tracks')
      .update(updates)
      .eq('id', params.id)
      .select()
      .single()

    if (saveError || !saved) {
      return NextResponse.json(
        { error: saveError?.message || 'Failed to update catalog master' },
        { status: 500 },
      )
    }

    return NextResponse.json({
      track: saved,
      isrc: track.isrc_full || saved.isrc_full || null,
      wav_url: saved.wav_url,
      vault,
    })
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Replace WAV failed' },
      { status: 500 },
    )
  }
}
