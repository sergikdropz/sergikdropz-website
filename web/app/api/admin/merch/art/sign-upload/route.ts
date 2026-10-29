import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { requireAdminApi } from '@/lib/auth/route-policy'
import { createSupabaseServerClient } from '@/lib/supabase'
import { isR2ArtConfigured, presignR2ArtPut } from '@/lib/merch/r2-art'

export const dynamic = 'force-dynamic'

const BUCKET = 'gallery-images'

/**
 * Issue a short-lived signed upload URL so the browser can send art bytes
 * straight to object storage, bypassing Vercel's ~4.5MB serverless request-body
 * limit. Prefers Cloudflare R2 (presigned PUT); falls back to a Supabase signed
 * upload token. When storage is unavailable this returns 503 and the client
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
  const contentType = type || 'image/png'

  // Primary backend: Cloudflare R2 presigned PUT.
  if (isR2ArtConfigured()) {
    const signed = await presignR2ArtPut(id, contentType)
    if (signed?.uploadUrl) {
      return NextResponse.json({
        provider: 'r2',
        id,
        uploadUrl: signed.uploadUrl,
        contentType,
        publicUrl: signed.publicUrl,
      })
    }
  }

  // Fallback: Supabase Storage signed upload token.
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
    return NextResponse.json({ provider: 'supabase', id, path, token: data.token, publicUrl: pub.publicUrl })
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
