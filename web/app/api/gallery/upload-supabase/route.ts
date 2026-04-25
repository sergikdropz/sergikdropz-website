import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'
import { getServerSession } from '@/lib/auth'
import { supabaseIsReachable, supabaseUnavailableResponse } from '@/lib/supabaseReachability'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!(await supabaseIsReachable())) {
      return supabaseUnavailableResponse()
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
    if (!file.type.startsWith('image/')) {
      return NextResponse.json(
        { error: 'Invalid file type. Only images are allowed.' },
        { status: 400 }
      )
    }

    // Check file size (10MB limit)
    const maxSize = 10 * 1024 * 1024 // 10MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 10MB.' },
        { status: 400 }
      )
    }

    const supabase = createSupabaseServerClient()

    // Ensure bucket exists
    const { data: buckets } = await supabase.storage.listBuckets()
    const bucketExists = buckets?.some((b) => b.name === 'gallery-images')

    if (!bucketExists) {
      const { error: createError } = await supabase.storage.createBucket('gallery-images', {
        public: true,
        fileSizeLimit: 10 * 1024 * 1024, // 10MB
      })
      if (createError) {
        console.error('Error creating bucket:', createError)
      }
    }

    // Upload file
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const fileName = file.name

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('gallery-images')
      .upload(fileName, buffer, {
        contentType: file.type,
        upsert: true,
      })

    if (uploadError) {
      console.error('Upload error:', uploadError)
      return NextResponse.json(
        { error: 'Failed to upload file', details: uploadError.message },
        { status: 500 }
      )
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('gallery-images')
      .getPublicUrl(fileName)

    return NextResponse.json({
      success: true,
      filename: fileName,
      publicUrl: urlData.publicUrl,
    })
  } catch (error: any) {
    console.error('Upload error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}
