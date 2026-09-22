import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'
import { requireAdminApi } from '@/lib/auth/route-policy'
import { replaceLibraryAudioFile } from '@/lib/audio/replace-audio-file'

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
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const result = await replaceLibraryAudioFile(supabase, {
      audioFileId,
      libraryTrackId: trackId,
      fileName: file.name,
      mimeType: file.type,
      fileSize: file.size,
      buffer,
    })

    return NextResponse.json({ success: true, fileUrl: result.fileUrl })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Replace failed' }, { status: 500 })
  }
}
