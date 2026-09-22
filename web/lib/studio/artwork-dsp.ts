/**
 * DSP-ready release cover art — probe dimensions and write a separate
 * `studio/release-covers/{releaseId}/dsp-ready.jpg` without mutating site artwork_url.
 *
 * Spec (Revelator / common DSP): square JPEG, edge 1400–3000px, &lt;10MB.
 * Oversized marketing art is downscaled into the DSP folder only.
 */

import sharp from 'sharp'
import { createSupabaseServerClient } from '@/lib/supabase'

export const DSP_COVER_MIN_EDGE = 1400
export const DSP_COVER_TARGET_EDGE = 3000
export const DSP_COVER_MAX_BYTES = 10 * 1024 * 1024

export type ArtworkProbe = {
  width: number
  height: number
  format?: string
  bytes: number
  ok: boolean
  issues: string[]
}

export type DspCoverEnsureResult = {
  url: string
  width: number
  height: number
  bytes: number
  reusedExisting: boolean
  sourceUrl: string
  path: string
}

function dspCoverPath(releaseId: string): string {
  const safe = String(releaseId || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_')
  return `studio/release-covers/${safe}/dsp-ready.jpg`
}

export async function fetchArtworkBuffer(
  url: string,
  fetchImpl: typeof fetch = fetch
): Promise<{ buffer: Buffer; contentType?: string }> {
  const res = await fetchImpl(url, {
    headers: { Accept: 'image/*,*/*' },
    redirect: 'follow',
  })
  if (!res.ok) {
    throw new Error(`Could not fetch artwork (${res.status})`)
  }
  const ab = await res.arrayBuffer()
  return {
    buffer: Buffer.from(ab),
    contentType: res.headers.get('content-type') || undefined,
  }
}

export async function probeArtworkBuffer(buffer: Buffer): Promise<ArtworkProbe> {
  const issues: string[] = []
  const meta = await sharp(buffer).metadata()
  const width = meta.width || 0
  const height = meta.height || 0
  const bytes = buffer.byteLength

  if (width < DSP_COVER_MIN_EDGE || height < DSP_COVER_MIN_EDGE) {
    issues.push(
      `Cover is ${width}×${height} — DSPs require at least ${DSP_COVER_MIN_EDGE}×${DSP_COVER_MIN_EDGE}`
    )
  }
  if (width !== height) {
    issues.push(`Cover is not square (${width}×${height}) — will center-crop for DSP pack`)
  }
  if (bytes > DSP_COVER_MAX_BYTES) {
    issues.push(`Cover is ${(bytes / (1024 * 1024)).toFixed(1)}MB — DSP max is 10MB`)
  }

  const tooSmall = width < DSP_COVER_MIN_EDGE || height < DSP_COVER_MIN_EDGE
  return {
    width,
    height,
    format: meta.format,
    bytes,
    ok: !tooSmall,
    issues,
  }
}

export async function probeArtworkUrl(
  url: string,
  fetchImpl: typeof fetch = fetch
): Promise<ArtworkProbe> {
  const { buffer } = await fetchArtworkBuffer(url, fetchImpl)
  return probeArtworkBuffer(buffer)
}

/**
 * Build a DSP-ready JPEG: square center-crop, edge clamped to [1400, 3000], quality under 10MB.
 */
export async function renderDspReadyJpeg(source: Buffer): Promise<{
  buffer: Buffer
  width: number
  height: number
}> {
  const meta = await sharp(source).metadata()
  const w = meta.width || 0
  const h = meta.height || 0
  if (w < DSP_COVER_MIN_EDGE || h < DSP_COVER_MIN_EDGE) {
    throw new Error(
      `Source cover ${w}×${h} is below ${DSP_COVER_MIN_EDGE}px — replace marketing art with a higher-res master before generating DSP cover`
    )
  }

  const edge = Math.min(DSP_COVER_TARGET_EDGE, Math.min(w, h))

  let quality = 92
  let out = await sharp(source)
    .rotate()
    .resize(edge, edge, { fit: 'cover', position: 'centre' })
    .jpeg({ quality, mozjpeg: true })
    .toBuffer()

  while (out.byteLength > DSP_COVER_MAX_BYTES && quality > 60) {
    quality -= 8
    out = await sharp(source)
      .rotate()
      .resize(edge, edge, { fit: 'cover', position: 'centre' })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer()
  }

  if (out.byteLength > DSP_COVER_MAX_BYTES) {
    throw new Error('Could not compress DSP cover under 10MB — try a simpler source image')
  }

  const outMeta = await sharp(out).metadata()
  return {
    buffer: out,
    width: outMeta.width || edge,
    height: outMeta.height || edge,
  }
}

export function dspCoverMeetsSpec(probe: ArtworkProbe): boolean {
  return (
    probe.ok &&
    probe.width === probe.height &&
    probe.width >= DSP_COVER_MIN_EDGE &&
    probe.width <= DSP_COVER_TARGET_EDGE &&
    probe.bytes <= DSP_COVER_MAX_BYTES &&
    (probe.format === 'jpeg' || probe.format === 'jpg')
  )
}

/**
 * Ensure a DSP-ready cover exists in gallery-images/studio/release-covers/{id}/
 * Leaves artwork_url untouched.
 */
export async function ensureDspReadyCover(input: {
  releaseId: string
  sourceUrl: string
  existingDspUrl?: string | null
  force?: boolean
  fetchImpl?: typeof fetch
  supabase?: ReturnType<typeof createSupabaseServerClient>
}): Promise<DspCoverEnsureResult> {
  const fetchImpl = input.fetchImpl || fetch
  const supabase = input.supabase || createSupabaseServerClient()
  const path = dspCoverPath(input.releaseId)

  if (input.existingDspUrl && !input.force) {
    try {
      const existing = await probeArtworkUrl(input.existingDspUrl, fetchImpl)
      if (dspCoverMeetsSpec(existing)) {
        return {
          url: input.existingDspUrl,
          width: existing.width,
          height: existing.height,
          bytes: existing.bytes,
          reusedExisting: true,
          sourceUrl: input.sourceUrl,
          path,
        }
      }
    } catch {
      // regenerate
    }
  }

  const { buffer: source } = await fetchArtworkBuffer(input.sourceUrl, fetchImpl)
  const rendered = await renderDspReadyJpeg(source)

  const { error: uploadError } = await supabase.storage.from('gallery-images').upload(path, rendered.buffer, {
    contentType: 'image/jpeg',
    upsert: true,
  })

  if (uploadError) {
    throw new Error(`DSP cover upload failed: ${uploadError.message}`)
  }

  const { data: urlData } = supabase.storage.from('gallery-images').getPublicUrl(path)
  return {
    url: urlData.publicUrl,
    width: rendered.width,
    height: rendered.height,
    bytes: rendered.buffer.byteLength,
    reusedExisting: false,
    sourceUrl: input.sourceUrl,
    path,
  }
}
