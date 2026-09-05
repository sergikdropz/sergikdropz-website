/**
 * DJ-style LPF / HPF filter sweeps per deck during mixes.
 */

import { smootherstep } from './curves'
import type { MixIntelligence } from './mix-intelligence'
import type { MixStyle } from './types'

export type DeckFilterState = {
  /** Low-pass cutoff Hz (20000 = open) */
  lpfHz: number
  /** High-pass cutoff Hz (20 = open) */
  hpfHz: number
}

const OPEN_LPF = 20000
const OPEN_HPF = 20

function lerpHz(a: number, b: number, t: number): number {
  const u = Math.max(0, Math.min(1, t))
  return a * Math.pow(b / a, u)
}

const OPEN_FILTERS: DeckFilterState = { hpfHz: OPEN_HPF, lpfHz: OPEN_LPF }

/**
 * Per-deck LPF/HPF for creative mix styles.
 * Smooth / crossfade stays fully open — EQ + faders do the blend.
 */
export function deckFiltersAtProgress(params: {
  progress: number
  style: MixStyle
  role: 'outgoing' | 'incoming'
  intel?: MixIntelligence
}): DeckFilterState {
  if (params.style === 'crossfade' || !params.style) {
    return OPEN_FILTERS
  }

  const x = Math.max(0, Math.min(1, params.progress))
  const intensity = params.intel?.filterIntensity ?? 0.6
  const delay = params.role === 'incoming' ? (params.intel?.incomingDelay ?? 0) : 0
  const xd = params.role === 'incoming' ? Math.max(0, x - delay) / Math.max(1e-6, 1 - delay) : x

  if (params.role === 'outgoing') {
    switch (params.style) {
      case 'cut': {
        const close = smootherstep(Math.max(0, (x - 0.5) / 0.45))
        return {
          hpfHz: lerpHz(OPEN_HPF, 180 + 120 * intensity, smootherstep(x * 1.1)),
          lpfHz: lerpHz(OPEN_LPF, 900 + 400 * (1 - intensity), close),
        }
      }
      case 'filter-eq': {
        const hpf = smootherstep(Math.min(1, x / 0.42))
        return {
          hpfHz: lerpHz(OPEN_HPF, 220 + 180 * intensity, hpf),
          lpfHz: OPEN_LPF,
        }
      }
      case 'bass-swap': {
        const swap = smootherstep(Math.max(0, (x - 0.15) / 0.65))
        return {
          hpfHz: lerpHz(OPEN_HPF, 280 + 200 * intensity, swap),
          lpfHz: OPEN_LPF,
        }
      }
      default:
        return OPEN_FILTERS
    }
  }

  switch (params.style) {
    case 'cut': {
      const open = smootherstep(Math.max(0, (xd - 0.35) / 0.55))
      return {
        hpfHz: OPEN_HPF,
        lpfHz: lerpHz(650 + 350 * intensity, OPEN_LPF, open),
      }
    }
    case 'filter-eq': {
      const open = smootherstep(Math.max(0, (xd - 0.28) / 0.65))
      return {
        hpfHz: OPEN_HPF,
        lpfHz: lerpHz(480 + 320 * intensity, OPEN_LPF, open),
      }
    }
    case 'bass-swap': {
      const open = smootherstep(Math.max(0, (xd - 0.12) / 0.75))
      return {
        hpfHz: OPEN_HPF,
        lpfHz: lerpHz(720 + 280 * intensity, OPEN_LPF, open),
      }
    }
    default:
      return OPEN_FILTERS
  }
}
