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

/** Deployed static tape JSON under /public/waveforms (mp3 basename). */
export function staticWaveformJsonUrl(storageRel: string): string {
  const clean = storageRel.replace(/\.wav$/i, '.mp3').replace(/\.mp3$/i, '.json')
  return (
    '/waveforms/' +
    clean
      .split('/')
      .map((s) => encodeURIComponent(s))
      .join('/')
  )
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
