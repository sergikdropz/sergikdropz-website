import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/auth/route-policy'
import { storeMerchArt } from '@/lib/merch/art-store'
import { isPicsartConfigured, picsartUpscale, pickUpscaleFactor } from '@/lib/merch/picsart'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const MAX_FACTOR = 8

/**
 * Upscale a piece of merch art with Picsart's AI upscaler and re-store the result
 * in our own bucket. The client sends the current art URL plus the multiplier it
 * needs to clear the 150 DPI print threshold. When no provider key is configured
 * this returns 503 so the client can fall back to a local canvas resample.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  if (!isPicsartConfigured()) {
    return NextResponse.json(
      {
        error: 'No upscale provider configured.',
        hint: 'Set PICSART_API_KEY in web/.env.local (get a developer key at https://console.picsart.io).',
        configured: false,
      },
      { status: 503 },
    )
  }

  let body: { url?: string; factor?: number } = {}
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const sourceUrl = (body.url || '').trim()
  if (!sourceUrl) {
    return NextResponse.json({ error: 'Provide the art URL to upscale.' }, { status: 400 })
  }

  const desired = Number(body.factor)
  const factor = pickUpscaleFactor(
    Number.isFinite(desired) && desired > 1 ? Math.min(desired, MAX_FACTOR) : 2,
  )

  // Resolve the source bytes. Supabase/public URLs are absolute; local library
  // art (/api/merch/art/...) resolves against this request's origin.
  let absolute: string
  try {
    absolute = sourceUrl.startsWith('http')
      ? sourceUrl
      : new URL(sourceUrl, request.nextUrl.origin).toString()
  } catch {
    return NextResponse.json({ error: 'That art URL could not be resolved.' }, { status: 400 })
  }

  const srcRes = await fetch(absolute).catch(() => null)
  if (!srcRes || !srcRes.ok) {
    return NextResponse.json({ error: 'Could not read the source art.' }, { status: 400 })
  }
  const srcType = srcRes.headers.get('content-type') || 'image/png'
  const srcBytes = Buffer.from(await srcRes.arrayBuffer())

  const up = await picsartUpscale(srcBytes, srcType, factor)
  if (!up.ok) {
    return NextResponse.json(
      { error: up.error, provider: 'picsart' },
      { status: up.status === 503 ? 503 : 502 },
    )
  }

  const stored = await storeMerchArt(up.bytes, up.contentType)
  return NextResponse.json({ ...stored, provider: 'picsart', factor })
}
