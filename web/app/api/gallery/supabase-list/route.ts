import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = createSupabaseServerClient()

    const { data: files, error } = await supabase.storage
      .from('gallery-images')
      .list('', {
        limit: 1000,
        sortBy: { column: 'created_at', order: 'desc' },
      })

    if (error) {
      console.error('List error:', error)
      return NextResponse.json(
        { error: 'Failed to list files', details: error.message },
        { status: 500 }
      )
    }

    const images = (files || []).map((file) => {
      const { data: urlData } = supabase.storage
        .from('gallery-images')
        .getPublicUrl(file.name)

      return {
        id: file.id,
        name: file.name,
        filename: file.name,
        publicUrl: urlData.publicUrl,
        size: file.metadata?.size,
        createdAt: file.created_at,
      }
    })

    return NextResponse.json({ files: images })
  } catch (error: any) {
    console.error('List error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}
