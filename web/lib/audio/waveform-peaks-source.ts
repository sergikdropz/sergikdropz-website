import { sanitizeWaveformPeaks } from '@/lib/audio/sanitize-waveform-peaks'
import {
  expandCompactEnvelopes,
  type DspEnvelopeBucket,
} from '@/lib/audio/waveform-dsp-envelope'

/** Columns a caller must select for `resolveWaveformPeaks` to work. */
export const WAVEFORM_SOURCE_SELECT = 'waveform_json_url, waveform_data'

export type WaveformSourceRow = {
  waveform_json_url?: string | null
  waveform_data?: unknown
}

export type WaveformTapePayload = {
  peaks: number[]
  envelopes: DspEnvelopeBucket[] | null
}

/** Parse Storage / static JSON: plain peak array or compact `{ d, e }` / `{ data, envelopes }`. */
export function parseWaveformTapePayload(body: unknown): WaveformTapePayload | null {
  if (!body) return null
  if (Array.isArray(body)) {
    const peaks = sanitizeWaveformPeaks(body)
    return peaks ? { peaks, envelopes: null } : null
  }
  if (typeof body !== 'object') return null
  const rec = body as Record<string, unknown>
  const peaksRaw = Array.isArray(rec.d)
    ? rec.d
    : Array.isArray(rec.data)
      ? rec.data
      : Array.isArray(rec.waveform_data)
        ? rec.waveform_data
        : null
  const peaks = sanitizeWaveformPeaks(peaksRaw)
  if (!peaks) return null
  const envelopes = expandCompactEnvelopes(rec.e ?? rec.envelopes)
  return { peaks, envelopes }
}

export async function fetchWaveformTapeFromUrl(url: string): Promise<WaveformTapePayload | null> {
  try {
    const res = await fetch(url, { cache: 'force-cache' })
    if (!res.ok) return null
    return parseWaveformTapePayload(await res.json())
  } catch {
    return null
  }
}

export async function fetchWaveformPeaksFromUrl(url: string): Promise<number[] | null> {
  const tape = await fetchWaveformTapeFromUrl(url)
  return tape?.peaks ?? null
}

export async function resolveWaveformPeaks(
  row: WaveformSourceRow | null | undefined,
): Promise<number[] | null> {
  if (!row) return null
  if (row.waveform_json_url) {
    const peaks = await fetchWaveformPeaksFromUrl(row.waveform_json_url)
    if (peaks?.length) return peaks
  }
  return sanitizeWaveformPeaks(row.waveform_data)
}

export async function resolveWaveformTape(
  row: WaveformSourceRow | null | undefined,
): Promise<WaveformTapePayload | null> {
  if (!row) return null
  if (row.waveform_json_url) {
    const tape = await fetchWaveformTapeFromUrl(row.waveform_json_url)
    if (tape?.peaks?.length) return tape
  }
  const peaks = sanitizeWaveformPeaks(row.waveform_data)
  return peaks ? { peaks, envelopes: null } : null
}
