/**
 * Best-effort server waveform generation for Sonic DNA v2 jobs.
 * Prefers existing waveform API; falls back to empty on failure.
 */

export async function generateWaveformFromUrl(
  audioUrl: string,
  filePath?: string,
): Promise<{ peaks: number[]; sampleRate?: number } | null> {
  if (!audioUrl && !filePath) return null
  try {
    const path =
      filePath ||
      (() => {
        try {
          const u = new URL(audioUrl)
          return u.pathname.replace(/^\/storage\/v1\/object\/public\/audio-files\//, '')
        } catch {
          return audioUrl
        }
      })()

    const apiBase =
      process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.VERCEL_URL?.replace(/^/, 'https://') ||
      'http://127.0.0.1:3001'

    const response = await fetch(
      `${apiBase.replace(/\/$/, '')}/api/audio/waveform?path=${encodeURIComponent(path)}`,
      { method: 'GET', cache: 'no-store' },
    )
    if (!response.ok) return null
    const data = await response.json().catch(() => null)
    const peaks = data?.waveform || data?.peaks || data?.data
    if (!Array.isArray(peaks) || !peaks.length) return null
    return { peaks, sampleRate: data?.sampleRate }
  } catch {
    return null
  }
}
