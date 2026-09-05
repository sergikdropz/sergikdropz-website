import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'
import { processUploadOptimized } from '@/utils/processUploadOptimized'
import { extractMetadataFromBuffer } from '@/utils/extractMetadataFromBuffer'
import { generateWaveformFromBuffer } from '@/utils/generateWaveformFromBuffer'
import { getMusicBrainzArtistDetails } from '@/utils/musicbrainz'
import { requireAdminApi } from '@/lib/auth/route-policy'

/**
 * API Route: Upload Audio File to Supabase Storage
 * 
 * POST /api/audio/upload
 * 
 * Body: FormData with 'file' field
 * 
 * Returns: { success: true, fileUrl: string, id: string }
 */
export async function POST(request: Request) {
  try {
    const auth = await requireAdminApi()
    if (!auth.ok) return auth.response
    const formData = await request.formData()
    const file = formData.get('file') as File
    const folder = formData.get('folder') as string || ''

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      )
    }

    // Validate file type
    const validTypes = ['audio/mpeg', 'audio/wav', 'audio/flac', 'audio/mp4', 'audio/x-m4a']
    if (!validTypes.includes(file.type) && !file.name.match(/\.(mp3|wav|flac|m4a|ogg|aac)$/i)) {
      return NextResponse.json(
        { error: 'Invalid file type. Only audio files are allowed.' },
        { status: 400 }
      )
    }

    // Check file size (50MB limit for free tier)
    const maxSize = 50 * 1024 * 1024 // 50MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 50MB.' },
        { status: 400 }
      )
    }

    const supabase = createSupabaseServerClient()

    // Convert File to ArrayBuffer
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Create file path
    const fileName = file.name
    const filePath = folder ? `${folder}/${fileName}` : fileName

    // 🚀 OPTIMIZED: Start early analysis in parallel with upload
    console.log(`[Upload] ⚡ Starting parallel processing for: ${fileName}`)
    
    // Phase 1: Extract metadata from buffer (IMMEDIATE - no wait)
    const metadataPromise = extractMetadataFromBuffer(buffer, fileName)
    
    // Phase 2: Generate waveform from buffer (IMMEDIATE - no wait)
    const waveformPromise = generateWaveformFromBuffer(buffer, fileName)
    
    // Phase 3: Start MusicBrainz lookup (parallel - based on filename)
    // We'll do a basic search, full lookup happens in agent pipeline
    const musicbrainzPromise = Promise.resolve(null) // Will be done in agent pipeline

    // Phase 4: Upload file (happens in parallel with analysis)
    const uploadPromise = supabase.storage
      .from('audio-files')
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: true,
      })

    // Wait for upload to complete
    const { data: uploadData, error: uploadError } = await uploadPromise

    if (uploadError) {
      console.error('Upload error:', uploadError)
      return NextResponse.json(
        { error: 'Failed to upload file', details: uploadError.message },
        { status: 500 }
      )
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('audio-files')
      .getPublicUrl(filePath)

    // Get early analysis results (should be ready or nearly ready)
    const [metadata, waveform, musicbrainzData] = await Promise.all([
      metadataPromise,
      waveformPromise,
      musicbrainzPromise
    ])

    console.log(`[Upload] ✅ Early analysis complete:`, {
      metadata: !!metadata,
      waveform: !!waveform,
      musicbrainz: !!musicbrainzData
    })

    // Extract file extension for format
    const format = metadata.format || fileName.split('.').pop()?.toUpperCase() || 'MP3'

    // Save metadata to database (use extracted metadata)
    const { data: dbData, error: dbError } = await supabase
      .from('audio_files')
      .insert({
        title: metadata.title || fileName.replace(/\.[^/.]+$/, ''),
        artist: metadata.artist || 'SERGIK',
        file_name: fileName,
        file_path: filePath,
        file_url: urlData.publicUrl,
        format: format,
        size_bytes: file.size,
        size_mb: parseFloat((file.size / (1024 * 1024)).toFixed(2)),
        folder_path: folder,
        is_purchasable: false,
        duration_seconds: metadata.duration || null,
        key_signature: metadata.key || null,
        // Store early waveform if available
        waveform_data: waveform?.data || null,
        waveform_samples: waveform?.samples || null,
      })
      .select()
      .single()

    if (dbError) {
      console.error('Database error:', dbError)
      // File uploaded but metadata failed - still return success
      return NextResponse.json({
        success: true,
        fileUrl: urlData.publicUrl,
        warning: 'File uploaded but metadata save failed',
      })
    }

    // 🚀 OPTIMIZED PROCESSING: Use early analysis results
    if (dbData.id) {
      processUploadOptimized(
        dbData.id,
        buffer,
        fileName,
        urlData.publicUrl,
        filePath,
        {
          metadata,
          waveform: waveform || null,
          musicbrainz: musicbrainzData || null
        }
      )
      console.log(`[Upload] 🧬 Optimized analysis started (parallel processing) for: ${fileName}`)
    }

    return NextResponse.json({
      success: true,
      fileUrl: urlData.publicUrl,
      id: dbData.id,
      fileName: fileName,
      message: 'File uploaded successfully. Analysis started in parallel during upload.',
      earlyAnalysis: {
        metadata: !!metadata,
        waveform: !!waveform,
        musicbrainz: !!musicbrainzData
      }
    })
  } catch (error: any) {
    console.error('Upload error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}

