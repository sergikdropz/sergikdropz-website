import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/auth/route-policy'
import { storeMerchArt } from '@/lib/merch/art-store'
import {
  croweCreativeGenerateImage,
  resolveCroweCreativeEnv,
} from '@/lib/ai/crowe-creative-client'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const MAX_PROMPT = 2000

/**
 * Pull a usable image out of a provider payload. Providers disagree on shape, so
 * we walk the object looking for the first image URL or base64/data-uri blob.
 */
function extractImage(data: unknown): { url?: string; dataUri?: string } | null {
  const seen = new Set<unknown>()
  const isImageUrl = (s: string) =>
    /^https?:\/\//i.test(s) && /(\.png|\.jpe?g|\.webp|image|media|generat|output|render|cdn)/i.test(s)

  const walk = (value: unknown, key?: string): { url?: string; dataUri?: string } | null => {
    if (value == null) return null
    if (typeof value === 'string') {
      const s = value.trim()
      if (s.startsWith('data:image/')) return { dataUri: s }
      if (isImageUrl(s)) return { url: s }
      // base64 under a telling key
      if (key && /b64|base64|image|img|bytes/i.test(key) && s.length > 256 && /^[A-Za-z0-9+/=\s]+$/.test(s)) {
        return { dataUri: `data:image/png;base64,${s.replace(/\s+/g, '')}` }
      }
      return null
    }
    if (typeof value !== 'object') return null
    if (seen.has(value)) return null
    seen.add(value)
    if (Array.isArray(value)) {
      for (const item of value) {
        const hit = walk(item)
        if (hit) return hit
      }
      return null
    }
    // Prefer obviously image-y keys first.
    const entries = Object.entries(value as Record<string, unknown>)
    entries.sort(([a], [b]) => {
      const score = (k: string) => (/url|image|img|output|result|data|b64/i.test(k) ? 0 : 1)
      return score(a) - score(b)
    })
    for (const [k, v] of entries) {
      const hit = walk(v, k)
      if (hit) return hit
    }
    return null
  }

  return walk(data)
}

async function fetchImageBytes(found: { url?: string; dataUri?: string }): Promise<{ bytes: Buffer; contentType: string } | null> {
  if (found.dataUri) {
    const match = /^data:([^;]+);base64,([\s\S]*)$/.exec(found.dataUri)
    if (!match) return null
    return { bytes: Buffer.from(match[2], 'base64'), contentType: match[1] || 'image/png' }
  }
  if (found.url) {
    const res = await fetch(found.url)
    if (!res.ok) return null
    const contentType = res.headers.get('content-type') || 'image/png'
    if (!contentType.startsWith('image/')) return null
    return { bytes: Buffer.from(await res.arrayBuffer()), contentType }
  }
  return null
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  let body: { prompt?: string; model?: string } = {}
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const prompt = (body.prompt || '').trim()
  if (!prompt) {
    return NextResponse.json({ error: 'Describe the artwork you want to generate.' }, { status: 400 })
  }
  if (prompt.length > MAX_PROMPT) {
    return NextResponse.json({ error: `Keep the prompt under ${MAX_PROMPT} characters.` }, { status: 400 })
  }

  const env = resolveCroweCreativeEnv()
  if (!env.configured) {
    return NextResponse.json(
      {
        error: 'No image provider configured.',
        hint: 'Set CROWE_API_KEY (or CROWELOGIC_API_KEY) in web/.env.local to enable AI art generation.',
        configured: false,
      },
      { status: 503 },
    )
  }

  // Nudge the model toward print-ready art: isolated subject on a clean background
  // so the one-click background remover can lift it cleanly.
  const model = (body.model || 'nano-banana').trim()
  const printPrompt = `${prompt}. High-detail vector-style illustration, bold clean lines, isolated centered subject on a plain solid white background, no mockup, no t-shirt, no watermark, print-ready.`

  const res = await croweCreativeGenerateImage(printPrompt, model, 1)
  if (!res.ok) {
    return NextResponse.json(
      { error: res.error || 'Image generation failed', status: res.status, details: res.data },
      { status: 502 },
    )
  }

  const found = extractImage(res.data)
  if (!found) {
    return NextResponse.json(
      { error: 'The provider returned no image URL. Try a different model or prompt.' },
      { status: 502 },
    )
  }

  const image = await fetchImageBytes(found)
  if (!image) {
    return NextResponse.json({ error: 'Could not download the generated image.' }, { status: 502 })
  }

  const stored = await storeMerchArt(image.bytes, image.contentType)
  return NextResponse.json({ ...stored, model, prompt })
}
