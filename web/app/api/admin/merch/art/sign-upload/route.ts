import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { requireAdminApi } from '@/lib/auth/route-policy'
import { createSupabaseServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const BUCKET = 'gallery-images'

/**
 * Issue a short-lived signed upload URL so the browser can send art bytes
 * straight to Supabase Storage, bypassing Vercel's ~4.5MB serverless
 * request-body limit. Returns a token + the final public URL. When storage is
 * unavailable (e.g. the self-hosted gateway) this returns 503 and the client
 * falls back to the multipart upload route.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  let body: { contentType?: string } = {}
  try {
    body = await request.json()
  } catch {
    /* body is optional; default to PNG */
  }

  const type = (body.contentType || '').toLowerCase()
  if (type && type !== 'image/png' && type !== 'image/jpeg') {
    return NextResponse.json({ error: 'Use a PNG or JPEG' }, { status: 400 })
  }
  const ext = type.includes('jpeg') || type.includes('jpg') ? 'jpg' : 'png'
  const id = `${randomUUID()}.${ext}`
  const path = `merch-designs/${id}`

  try {
    const supabase = createSupabaseServerClient()
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path)
    if (error || !data?.token) {
      return NextResponse.json(
        { error: error?.message || 'Could not create an upload URL', configured: false },
        { status: 503 },
      )
    }
    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path)
    return NextResponse.json({ id, path, token: data.token, publicUrl: pub.publicUrl })
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Could not create an upload URL',
        configured: false,
      },
      { status: 503 },
    )
  }
}
