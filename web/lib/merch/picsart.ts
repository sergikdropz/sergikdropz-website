/**
 * Picsart Programmable Image APIs — image upscaling.
 *
 * Auth is a developer API key from https://console.picsart.io (header
 * `X-Picsart-API-Key`). This is separate from a Picsart Pro/Gold consumer
 * subscription and has its own credit balance. Docs:
 * https://docs.picsart.io/reference/image-upscale
 */

const PICSART_BASE = 'https://api.picsart.io/tools/1.0'

/** Supported discrete upscale factors. */
export type PicsartUpscaleFactor = 2 | 4 | 6 | 8

export function resolvePicsartKey(): string | null {
  const key = process.env.PICSART_API_KEY || process.env.PICSART_KEY
  return key && key.trim() ? key.trim() : null
}

export function isPicsartConfigured(): boolean {
  return Boolean(resolvePicsartKey())
}

/** Round a desired multiplier up to the nearest supported Picsart factor (2/4/6/8). */
export function pickUpscaleFactor(desired: number): PicsartUpscaleFactor {
  const options: PicsartUpscaleFactor[] = [2, 4, 6, 8]
  for (const factor of options) if (factor >= desired) return factor
  return 8
}

export type PicsartUpscaleResult =
  | { ok: true; bytes: Buffer; contentType: string }
  | { ok: false; status: number; error: string }

/**
 * Upscale raw image bytes by a supported factor. Keeps PNG output so transparent
 * print files stay transparent. Returns the result bytes (downloaded from the
 * temporary Picsart result URL) so the caller can re-store them in our own bucket.
 */
export async function picsartUpscale(
  bytes: Buffer,
  contentType: string,
  factor: PicsartUpscaleFactor,
): Promise<PicsartUpscaleResult> {
  const key = resolvePicsartKey()
  if (!key) return { ok: false, status: 503, error: 'PICSART_API_KEY is not set' }

  const ext = contentType.includes('png')
    ? 'png'
    : contentType.includes('webp')
      ? 'webp'
      : 'jpg'
  const form = new FormData()
  form.set('image', new Blob([new Uint8Array(bytes)], { type: contentType || 'image/png' }), `art.${ext}`)
  form.set('upscale_factor', String(factor))
  form.set('format', 'PNG')

  let res: Response
  try {
    res = await fetch(`${PICSART_BASE}/upscale`, {
      method: 'POST',
      headers: { 'X-Picsart-API-Key': key, accept: 'application/json' },
      body: form,
    })
  } catch (error) {
    return { ok: false, status: 502, error: error instanceof Error ? error.message : 'Picsart request failed' }
  }

  const text = await res.text()
  let json: { data?: { url?: string }; detail?: string; message?: string } | null = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    /* non-JSON response */
  }

  if (!res.ok) {
    const detail = json?.detail || json?.message || text || `Picsart error ${res.status}`
    return { ok: false, status: res.status, error: String(detail).slice(0, 300) }
  }

  const url = json?.data?.url
  if (!url || typeof url !== 'string') {
    return { ok: false, status: 502, error: 'Picsart returned no result URL' }
  }

  const imgRes = await fetch(url)
  if (!imgRes.ok) return { ok: false, status: 502, error: 'Could not download the upscaled image' }
  const outType = imgRes.headers.get('content-type') || 'image/png'
  return { ok: true, bytes: Buffer.from(await imgRes.arrayBuffer()), contentType: outType }
}
