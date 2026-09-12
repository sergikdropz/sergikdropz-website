import {
  extractVaultRelativePath,
  normalizeVaultAudioUrl,
} from '@/utils/normalizeVaultAudioUrl'

/** Extract storage-relative path from a vault URL or path. */
export function vaultRelativePath(urlOrPath: string): string | null {
  return extractVaultRelativePath(urlOrPath)
}

/** Vault-relative path for waveform DB lookups (keep WAV when catalog still points at masters). */
export function waveformLookupPath(urlOrPath: string): string | null {
  return extractVaultRelativePath(urlOrPath, { preferMp3: false })
}

/** Whether this browser can decode audio into peaks (main thread or worker). */
export function canAnalyzeAudioWaveform(): boolean {
  if (typeof window === 'undefined') return false
  const w = window as Window & { webkitAudioContext?: typeof AudioContext }
  return Boolean(typeof AudioContext !== 'undefined' || w.webkitAudioContext)
}

export function isAudioContextUnavailableError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '')
  return /audiocontext is not supported/i.test(msg)
}

const WAVEFORM_AUDIO_EXT = /\.(wav|m4a|aac|ogg|oga|opus|flac|aiff?|webm)$/i

/** Vault-relative JSON path (unencoded) for a static tape. */
export function staticWaveformRelPath(storageRel: string): string {
  return storageRel.replace(WAVEFORM_AUDIO_EXT, '.mp3').replace(/\.mp3$/i, '.json')
}

/** Deployed static tape JSON under /public/waveforms (mp3 basename). */
export function staticWaveformJsonUrl(storageRel: string): string {
  return (
    '/waveforms/' +
    staticWaveformRelPath(storageRel)
      .split('/')
      .map((s) => encodeURIComponent(s))
      .join('/')
  )
}

export type StaticWaveformEnvelope = {
  peak: number
  rms: number
  low: number
  mid: number
  high: number
  flux?: number
}

export type StaticWaveformTape = {
  data: number[]
  envelopes?: StaticWaveformEnvelope[]
}

/** Compact deploy `{ d, e }` or legacy `{ data, envelopes }` — optional flux as 6th `e` column. */
export function parseStaticWaveformJson(body: unknown): StaticWaveformTape | null {
  if (!body || typeof body !== 'object') return null
  const rec = body as Record<string, unknown>
  const data: number[] | undefined = Array.isArray(rec.d)
    ? rec.d
    : Array.isArray(rec.data)
      ? rec.data
      : undefined
  let envelopes: StaticWaveformEnvelope[] | undefined
  if (Array.isArray(rec.e) && rec.e.length > 0 && Array.isArray(rec.e[0])) {
    envelopes = rec.e.map((row: number[]) => ({
      peak: row[0] ?? 0,
      rms: row[1] ?? 0,
      low: row[2] ?? 0,
      mid: row[3] ?? 0,
      high: row[4] ?? 0,
      ...(typeof row[5] === 'number' ? { flux: row[5] } : {}),
    }))
  } else if (Array.isArray(rec.envelopes) && rec.envelopes.length > 0) {
    envelopes = rec.envelopes as StaticWaveformEnvelope[]
  }
  if (!data?.length && !envelopes?.length) return null
  return { data: data || [], envelopes }
}

/** Fetch a static tape via API so missing files return 200 instead of console 404s. */
export async function fetchStaticWaveformTape(storageRel: string): Promise<StaticWaveformTape | null> {
  if (!storageRel) return null
  try {
    const res = await fetch(`/api/audio/static-waveform?${new URLSearchParams({ rel: storageRel })}`, {
      cache: 'force-cache',
    })
    if (!res.ok) return null
    const body = await res.json()
    if (body?.available === false) return null
    return parseStaticWaveformJson(body)
  } catch {
    return null
  }
}

/**
 * Candidate URLs for waveform decode — same bytes as playback when possible.
 * Always try same-origin `/audio/...` (dev + media tunnel).
 */
export function waveformAnalysisUrls(playbackUrl: string, trackFile?: string): string[] {
  const out: string[] = []
  const push = (u: string | null | undefined) => {
    if (!u || typeof u !== 'string') return
    const n = normalizeVaultAudioUrl(u)
    // Same-origin only. A raw media-host URL fails CORS, and the tunnel answers
    // header-less browser requests with an HTML interstitial rather than audio.
    if (!n.startsWith('/') && !n.startsWith('blob:')) return
    if (!out.includes(n)) out.push(n)
  }

  push(playbackUrl)
  push(trackFile)

  const rel =
    vaultRelativePath(normalizeVaultAudioUrl(playbackUrl)) ||
    (trackFile ? vaultRelativePath(normalizeVaultAudioUrl(trackFile)) : null) ||
    vaultRelativePath(playbackUrl) ||
    (trackFile ? vaultRelativePath(trackFile) : null)

  if (rel) {
    const encoded = rel.split('/').map((s) => encodeURIComponent(s)).join('/')
    push(`/audio/${encoded}`)
    push(`/audio/${rel}`)
  }

  return out
}

/**
 * Stored peaks were often analyzed from WAV masters while playback serves MP3.
 * When sources diverge, prefer regenerating from the resolved playback URL.
 */
export function storedWaveformLikelyStale(trackFile: string, playbackUrl: string): boolean {
  if (!trackFile || !playbackUrl) return false

  const normalizedTrack = normalizeVaultAudioUrl(trackFile)
  const normalizedPlayback = normalizeVaultAudioUrl(playbackUrl)

  if (/\.wav(?=$|[?#])/i.test(trackFile) && /\.mp3(?=$|[?#])/i.test(normalizedPlayback)) {
    return true
  }

  const trackRel = vaultRelativePath(normalizedTrack)
  const playbackRel = vaultRelativePath(normalizedPlayback)
  if (trackRel && playbackRel) {
    const trackMp3 = trackRel.replace(/\.wav$/i, '.mp3')
    const playbackMp3 = playbackRel.replace(/\.wav$/i, '.mp3')
    if (trackMp3 === playbackMp3) return false
    return true
  }

  return normalizedTrack !== normalizedPlayback
}

/** Detect the synthetic sine fallback used when analysis fails. */
export function looksLikeSyntheticPeaks(peaks: number[]): boolean {
  if (peaks.length < 100) return false
  let hits = 0
  const bars = peaks.length
  for (let i = 0; i < bars; i++) {
    const position = i / bars
    const expected =
      0.08 +
      Math.abs(Math.sin(position * Math.PI * 12)) * 0.35 +
      Math.abs(Math.sin(position * Math.PI * 48)) * 0.25 +
      Math.abs(Math.sin(position * Math.PI * 120)) * 0.15
    if (Math.abs(peaks[i] - expected) < 0.02) hits++
  }
  return hits / bars > 0.85
}
