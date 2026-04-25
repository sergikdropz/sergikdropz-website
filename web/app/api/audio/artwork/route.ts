import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'
import { mergeSonicDNAIntoMetadata } from '@/utils/mergeSonicDNAIntoMetadata'

const MAX_SIZE_MB = 20

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const trackId = formData.get('trackId') as string | null
    const audioFileId = formData.get('audioFileId') as string | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      return NextResponse.json({ error: `File too large (max ${MAX_SIZE_MB}MB)` }, { status: 400 })
    }

    const supabase = createSupabaseServerClient()

    let resolvedAudioFileId = audioFileId
    if (!resolvedAudioFileId && trackId) {
      const { data: track } = await supabase
        .from('music_library_tracks')
        .select('audio_file_id')
        .eq('id', trackId)
        .maybeSingle()
      resolvedAudioFileId = track?.audio_file_id || null
    }

    const artworkId = resolvedAudioFileId || trackId
    if (!artworkId) {
      return NextResponse.json({ error: 'trackId or audioFileId is required' }, { status: 400 })
    }

    const fileName = file.name || 'artwork'
    const ext = (fileName.split('.').pop() || 'jpg').toLowerCase()
    const path = `artwork/${artworkId}.${ext}`

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const { error: uploadError } = await supabase.storage
      .from('audio-files')
      .upload(path, buffer, { contentType: file.type || 'image/jpeg', upsert: true })

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 })
    }

    const { data: urlData } = supabase.storage.from('audio-files').getPublicUrl(path)
    const artworkUrl = urlData.publicUrl

    if (resolvedAudioFileId) {
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

    return NextResponse.json({ success: true, artworkUrl })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Upload failed' }, { status: 500 })
  }
}
