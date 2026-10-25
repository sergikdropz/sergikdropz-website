import { peaksFromWaveformBody } from '@/lib/audio/waveform-peaks-source'

function isHttps(url: string | null | undefined): url is string {
  return typeof url === 'string' && /^https:\/\//i.test(url)
}

async function peaksFromResponse(res: Response): Promise<number[] | null> {
  if (!res.ok) return null
  const body = await res.json().catch(() => null)
  const peaks = peaksFromWaveformBody(body)
  return peaks?.length ? peaks : null
}

/**
 * Peaks live in public Storage (or R2). Read that URL directly.
 * The site route only looks up the link, then redirects. `inline=1` is the
 * fallback when a browser blocks the cross-origin file.
 */
export async function loadWaveformPeaks(opts: {
  path?: string | null
  trackId?: string | null
  waveformUrl?: string | null
}): Promise<number[] | null> {
  if (isHttps(opts.waveformUrl)) {
    try {
      const direct = await peaksFromResponse(await fetch(opts.waveformUrl))
      if (direct) return direct
    } catch {
      /* CORS or network — ask the site to inline the file */
    }
  }

  const params = new URLSearchParams()
  if (opts.path) params.set('path', opts.path)
  if (opts.trackId) params.set('trackId', opts.trackId)
  if (!params.toString()) return null

  try {
    const redirected = await peaksFromResponse(await fetch(`/api/audio/waveform?${params}`))
    if (redirected) return redirected
  } catch {
    /* redirect target blocked */
  }

  try {
    params.set('inline', '1')
    return await peaksFromResponse(await fetch(`/api/audio/waveform?${params}`))
  } catch {
    return null
  }
}
