import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase'

/**
 * POST /api/studio/upload/artwork
 * Handle artwork upload
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
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
    if (!validTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'File must be an image (JPEG, PNG, or WebP)' },
        { status: 400 }
      )
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024 // 10MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: 'File size must be less than 10MB' },
        { status: 400 }
      )
    }

    // Read file buffer
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Upload to Supabase Storage
    const supabase = createSupabaseServerClient()
    const fileName = `${Date.now()}-${file.name}`
    const filePath = `studio/artwork/${fileName}`

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('gallery-images')
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: false,
      })

    if (uploadError) {
      console.error('Error uploading artwork:', uploadError)
      return NextResponse.json(
        { error: 'Failed to upload artwork' },
        { status: 500 }
      )
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('gallery-images')
      .getPublicUrl(filePath)

    return NextResponse.json({
      url: urlData.publicUrl,
      fileName,
      filePath,
    })
  } catch (error: any) {
    console.error('Error in POST /api/studio/upload/artwork:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to upload artwork' },
      { status: 500 }
    )
  }
}
