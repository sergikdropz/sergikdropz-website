import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase'
import { createHash } from 'crypto'

/**
 * POST /api/studio/upload/wav
 * Handle WAV file upload
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      )
    }

    // Validate file type
    if (!file.name.endsWith('.wav') && !file.name.endsWith('.WAV')) {
      return NextResponse.json(
        { error: 'File must be a WAV file' },
        { status: 400 }
      )
    }

    // Read file buffer for fingerprint hash
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const fingerprintHash = createHash('sha256').update(buffer).digest('hex')

    // Upload to Supabase Storage
    const supabase = createSupabaseServerClient()
    const fileName = `${Date.now()}-${file.name}`
    const filePath = `studio/wav/${fileName}`

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('audio-files')
      .upload(filePath, buffer, {
        contentType: 'audio/wav',
        upsert: false,
      })

    if (uploadError) {
      console.error('Error uploading file:', uploadError)
      return NextResponse.json(
        { error: 'Failed to upload file' },
        { status: 500 }
      )
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('audio-files')
      .getPublicUrl(filePath)

    return NextResponse.json({
      url: urlData.publicUrl,
      fingerprintHash,
      fileName,
      filePath,
    })
  } catch (error: any) {
    console.error('Error in POST /api/studio/upload/wav:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to upload file' },
      { status: 500 }
    )
  }
}
