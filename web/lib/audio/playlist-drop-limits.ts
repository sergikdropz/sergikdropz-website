/** Soft floor — short tracks can always ingest up to this without duration checks. */
export const PLAYLIST_DROP_MAX_DIRECT_BYTES = 80 * 1024 * 1024

/** Absolute ceiling for any single drop (with or without convert). */
export const PLAYLIST_DROP_MAX_CONVERT_BYTES = 512 * 1024 * 1024

/**
 * Budget for long lossless masters: 48 kHz × 24-bit × stereo × 1.25 headroom.
 * ~10.3 MB/min at 16/44.1 stereo is typical; this covers high-res WAV for long cuts.
 */
export const HIGH_RES_WAV_BYTES_PER_SEC = Math.ceil(48000 * 3 * 2 * 1.25)

/** Formats that are worth converting to high-quality MP3 when over the duration budget. */
export const CONVERTIBLE_OVERSIZE_EXT = /\.(wav|wave|flac|aiff?|caf|pcm)$/i

/**
 * Raise the direct-ingest cap for longer songs so a long WAV isn't rejected just for
 * being >80MB when its size is proportional to duration.
 */
export function maxDirectBytesForDuration(durationSec: number | null | undefined): number {
  if (durationSec == null || !Number.isFinite(durationSec) || durationSec <= 0) {
    return PLAYLIST_DROP_MAX_DIRECT_BYTES
  }
  const byDuration = Math.ceil(durationSec * HIGH_RES_WAV_BYTES_PER_SEC)
  return Math.min(
    PLAYLIST_DROP_MAX_CONVERT_BYTES,
    Math.max(PLAYLIST_DROP_MAX_DIRECT_BYTES, byDuration),
  )
}

export function isWithinDirectIngestLimit(
  sizeBytes: number,
  durationSec?: number | null,
): boolean {
  if (sizeBytes <= PLAYLIST_DROP_MAX_DIRECT_BYTES) return true
  if (sizeBytes > PLAYLIST_DROP_MAX_CONVERT_BYTES) return false
  return sizeBytes <= maxDirectBytesForDuration(durationSec)
}

export function isConvertibleOversizeAudio(
  fileName: string,
  sizeBytes: number,
  durationSec?: number | null,
): boolean {
  if (!CONVERTIBLE_OVERSIZE_EXT.test(fileName)) return false
  if (sizeBytes <= PLAYLIST_DROP_MAX_DIRECT_BYTES) return false
  return !isWithinDirectIngestLimit(sizeBytes, durationSec)
}

export function formatBytesMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

export function formatDurationClock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${String(r).padStart(2, '0')}`
}

/**
 * Read duration from a dropped File via the browser media element (metadata only).
 * Returns null if the browser can't probe it.
 */
export function probeAudioFileDuration(file: File, timeoutMs = 12000): Promise<number | null> {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') {
    return Promise.resolve(null)
  }
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const audio = new Audio()
    let settled = false
    const finish = (value: number | null) => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      audio.removeAttribute('src')
      audio.load()
      URL.revokeObjectURL(url)
      resolve(value)
    }
    const timer = window.setTimeout(() => finish(null), timeoutMs)
    audio.preload = 'metadata'
    audio.onloadedmetadata = () => {
      const d = audio.duration
      finish(Number.isFinite(d) && d > 0 ? d : null)
    }
    audio.onerror = () => finish(null)
    audio.src = url
  })
}
