import { NextRequest, NextResponse } from 'next/server'
import { runTrackUploadPipeline } from '@/utils/trackUploadPipeline'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 minutes max for full pipeline

/**
 * POST /api/audio/upload-with-pipeline
 * 
 * Comprehensive upload endpoint that:
 * 1. Uploads audio file
 * 2. Extracts all metadata
 * 3. Generates waveform
 * 4. Runs Sonic DNA analysis
 * 5. Detects key signature
 * 6. Creates fully populated track in database
 * 
 * Request: FormData with:
 * - file: Audio file (required)
 * - title: Track title (optional, parsed from filename)
 * - artist: Artist name (optional, defaults to SERGIK)
 * - folderId: Target folder ID (optional)
 * 
 * Response: Track data with all analysis results
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const title = formData.get('title') as string | null
    const artist = formData.get('artist') as string | null
    const folderId = formData.get('folderId') as string | null

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      )
    }

    console.log(`[Upload Pipeline] Starting for: ${file.name}`)

    // Run the comprehensive pipeline
    const result = await runTrackUploadPipeline({
      file,
      filename: file.name,
      title: title || undefined,
      artist: artist || undefined,
      folderId: folderId || undefined
    })

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Pipeline failed' },
        { status: 500 }
      )
    }

    console.log(`[Upload Pipeline] Complete for: ${file.name}`)

    return NextResponse.json({
      success: true,
      trackId: result.trackId,
      audioFileId: result.audioFileId,
      data: result.data
    })

  } catch (error: any) {
    console.error('[Upload Pipeline] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Upload failed' },
      { status: 500 }
    )
  }
}
