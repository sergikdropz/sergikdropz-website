/**
 * Small Camelot pitch offsets for key-lock harmonic mixing.
 * Beatmatch stays on playbackRate; this is for the WASM formant/pitch path only.
 */

import { extractMeasured } from '@/lib/audio/sonic-dna-quality'
import { getCompatibleKeys } from '@/types/sergik-data'

function normalizeCamelot(raw: unknown): string | null {
  if (raw == null) return null
  const s = String(raw).trim().toUpperCase()
  if (/^\d{1,2}[AB]$/.test(s)) return s
  const m = s.match(/(\d{1,2})\s*([AB])/)
  return m ? `${Number(m[1])}${m[2]}` : null
}

function camelotOf(sonicDna: unknown): string | null {
  const measured = extractMeasured(sonicDna)
  return normalizeCamelot(measured?.camelot)
}

function camelotNumber(key: string): number | null {
  const m = key.match(/^(\d{1,2})([AB])$/)
  return m ? Number(m[1]) : null
}

/**
 * Semitones to shift incoming so it sits nearer outgoing, only when already
 * close (±1 Camelot number on the same wheel). Never more than ±2.
 */
export function harmonicPitchSemitones(
  outgoingDna: unknown,
  incomingDna: unknown,
  harmonicMatch: 'off' | 'camelot' | 'key-lock' | undefined,
): number {
  if (harmonicMatch !== 'key-lock') return 0
  const out = camelotOf(outgoingDna)
  const inn = camelotOf(incomingDna)
  if (!out || !inn) return 0
  if (out === inn) return 0
  const compatible = getCompatibleKeys(out)
  if (compatible.includes(inn)) return 0
  const on = camelotNumber(out)
  const innN = camelotNumber(inn)
  const outMode = out.slice(-1)
  const inMode = inn.slice(-1)
  if (on == null || innN == null || outMode !== inMode) return 0
  let d = innN - on
  if (d > 6) d -= 12
  if (d < -6) d += 12
  if (Math.abs(d) !== 1) return 0
  // One Camelot step ≈ 1 semitone on the same major/minor wheel.
  return -d
}
