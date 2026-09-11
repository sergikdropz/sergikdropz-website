/**
 * Single place to resolve waveform peaks for a track on the server.
 *
 * Peaks live in the `audio-analysis` Storage bucket and are referenced by
 * `audio_files.waveform_json_url`. Reading them from the CDN instead of the
 * `waveform_data` column keeps a ~21 kB TOAST value out of every track load,
 * which is what was driving the project's Disk IO budget.
 *
 * `waveform_data` is still consulted as a fallback for rows that predate the
 * Storage backfill.
 */
import { sanitizeWaveformPeaks } from '@/lib/audio/sanitize-waveform-peaks'

/** Columns a caller must select for `resolveWaveformPeaks` to work. */
export const WAVEFORM_SOURCE_SELECT = 'waveform_json_url, waveform_data'

export type WaveformSourceRow = {
  waveform_json_url?: string | null
  waveform_data?: unknown
}

export async function fetchWaveformPeaksFromUrl(url: string): Promise<number[] | null> {
  try {
    const res = await fetch(url, { cache: 'force-cache' })
    if (!res.ok) return null
    return sanitizeWaveformPeaks(await res.json())
  } catch {
    return null
  }
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
