import { NextRequest, NextResponse } from 'next/server'
import { unlink } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'
import { createSupabaseServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function DELETE(
  request: NextRequest,
  { params }: { params: { filename: string } }
) {
  try {
    const filename = decodeURIComponent(params.filename)

    // Try to delete from local storage first
    const galleryDir = join(process.cwd(), 'web', 'public', 'images', 'gallery')
    const filePath = join(galleryDir, filename)

    if (existsSync(filePath)) {
      await unlink(filePath)
      return NextResponse.json({ success: true, message: 'File deleted from local storage' })
    }

    // Try to delete from Supabase
    try {
      const supabase = createSupabaseServerClient()
      const { error } = await supabase.storage
        .from('gallery-images')
        .remove([filename])

      if (error) {
        return NextResponse.json(
          { error: 'File not found', details: error.message },
          { status: 404 }
        )
      }

      return NextResponse.json({ success: true, message: 'File deleted from Supabase' })
    } catch (supabaseError) {
      return NextResponse.json(
        { error: 'File not found in local or Supabase storage' },
        { status: 404 }
      )
    }
  } catch (error: any) {
    console.error('Delete error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}
