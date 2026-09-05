/**
 * Human-readable hints for an outgoing → incoming Auto DJ pair.
 */

import type { MixTrackRef } from './types'

export type MixPairHint = {
  bpmDeltaPct: number | null
  bpmHint: string | null
  keyHint: string | null
}

function readKey(track: { sonic_dna?: unknown; trackKey?: string | null }): string | null {
  if (typeof track.trackKey === 'string' && track.trackKey.trim()) return track.trackKey.trim()
  const dna = track.sonic_dna as { key?: string; musical_key?: string } | null | undefined
  const k = dna?.key ?? dna?.musical_key
  return typeof k === 'string' && k.trim() ? k.trim() : null
}

/** Short label for deck strip / status line (e.g. ΔBPM +3% · 5A→8B). */
export function buildMixPairHint(
  outgoing: MixTrackRef | { bpm?: number | null; sonic_dna?: unknown },
  incoming: MixTrackRef | { bpm?: number | null; sonic_dna?: unknown },
): MixPairHint {
  const outBpm = typeof outgoing.bpm === 'number' && outgoing.bpm > 0 ? outgoing.bpm : null
  const inBpm = typeof incoming.bpm === 'number' && incoming.bpm > 0 ? incoming.bpm : null
  let bpmDeltaPct: number | null = null
  let bpmHint: string | null = null
  if (outBpm && inBpm) {
    bpmDeltaPct = Math.round(((inBpm - outBpm) / outBpm) * 1000) / 10
    const sign = bpmDeltaPct > 0 ? '+' : ''
    bpmHint = `ΔBPM ${sign}${bpmDeltaPct.toFixed(1)}%`
  }
  const outKey = readKey(outgoing)
  const inKey = readKey(incoming)
  const keyHint =
    outKey && inKey && outKey !== inKey ? `${outKey}→${inKey}` : outKey && inKey ? outKey : null
  return { bpmDeltaPct, bpmHint, keyHint }
}

export function formatMixPairHintLine(hint: MixPairHint): string | null {
  const parts = [hint.bpmHint, hint.keyHint].filter(Boolean)
  return parts.length ? parts.join(' · ') : null
}

/** 0 = heavily filtered, 1 = fully open (for FIL indicator). */
export function filterOpenness(hpfHz: number, lpfHz: number): number {
  const hpf = Math.max(20, Math.min(12000, hpfHz))
  const lpf = Math.max(80, Math.min(22000, lpfHz))
  const hpfOpen = 1 - Math.max(0, Math.min(1, (hpf - 20) / 900))
  const lpfOpen = 1 - Math.max(0, Math.min(1, (20000 - lpf) / 19000))
  return Math.max(0, Math.min(1, (hpfOpen + lpfOpen) / 2))
}
