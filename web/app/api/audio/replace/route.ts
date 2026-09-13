import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'
import { extractMetadataFromBuffer } from '@/utils/extractMetadataFromBuffer'
import { generateWaveformFromBuffer } from '@/utils/generateWaveformFromBuffer'
import { processUploadOptimized } from '@/utils/processUploadOptimized'
import { requireAdminApi } from '@/lib/auth/route-policy'

const MAX_SIZE_MB = 100

export async function POST(request: Request) {
  try {
    const auth = await requireAdminApi()
    if (!auth.ok) return auth.response
    const formData = await request.formData()
    const file = formData.get('file') as File
    const audioFileId = formData.get('audioFileId') as string | null
    const trackId = formData.get('trackId') as string | null

    if (!file || !audioFileId) {
      return NextResponse.json({ error: 'file and audioFileId are required' }, { status: 400 })
    }

    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      return NextResponse.json({ error: `File too large (max ${MAX_SIZE_MB}MB)` }, { status: 400 })
    }

    const supabase = createSupabaseServerClient()

    const { data: audioFile, error: audioError } = await supabase
      .from('audio_files')
      .select('id, file_path, file_url, file_name, artist, title')
      .eq('id', audioFileId)
      .single()

    if (audioError || !audioFile) {
      return NextResponse.json({ error: audioError?.message || 'Audio file not found' }, { status: 404 })
    }

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const fileName = file.name || audioFile.file_name || 'audio'
    const ext = (fileName.split('.').pop() || 'mp3').toUpperCase()

    const filePath = audioFile.file_path || `replacements/${audioFileId}/${fileName}`

    const { error: uploadError } = await supabase.storage
      .from('audio-files')
      .upload(filePath, buffer, { contentType: file.type || 'audio/mpeg', upsert: true })

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 })
    }

    const { data: urlData } = supabase.storage.from('audio-files').getPublicUrl(filePath)
    const fileUrl = urlData.publicUrl

    const metadata = await extractMetadataFromBuffer(buffer, fileName)
    const waveform = await generateWaveformFromBuffer(buffer, fileName)

    const { error: updateError } = await supabase
      .from('audio_files')
      .update({
        file_name: fileName,
        file_path: filePath,
        file_url: fileUrl,
        format: ext,
        size_bytes: file.size,
        size_mb: parseFloat((file.size / (1024 * 1024)).toFixed(2)),
        duration_seconds: metadata.duration || null,
        key_signature: metadata.key || null,
        waveform_data: waveform?.data || null,
        waveform_samples: waveform?.samples || null,
        sonic_dna_status: 'pending',
        sonic_dna_error: null,
      })
      .eq('id', audioFileId)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    await supabase
      .from('music_library_tracks')
      .update({ file_url: fileUrl })
      .eq('audio_file_id', audioFileId)

    // Kick off async re-analysis
    processUploadOptimized(
      audioFileId,
      buffer,
      fileName,
      fileUrl,
      filePath,
      { metadata, waveform, musicbrainz: null }
    )

    return NextResponse.json({ success: true, fileUrl })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Replace failed' }, { status: 500 })
  }
}
