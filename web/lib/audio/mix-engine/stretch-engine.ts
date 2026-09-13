/**
 * Client-side WASM formant engine (Signalsmith worklet) for HQ stretch tier.
 * Tempo stays on playbackRate for beat-lock; worklet adds formant compensation.
 */

import type { StretchPolicy } from './stretch-policy'

type StretchNode = {
  connect: (dest: AudioNode) => void
  disconnect: () => void
  schedule: (opts: Record<string, unknown>) => Promise<unknown>
  start: (opts?: Record<string, unknown>) => Promise<unknown>
}

export type DeckStretchChain = {
  input: AudioNode
  output: AudioNode
  dispose: () => void
  setFormantActive: (active: boolean, semitones?: number) => void
}

let loadPromise: Promise<{
  createSignalsmithStretchNode: (
    ctx: AudioContext,
    opts: Record<string, unknown>
  ) => Promise<StretchNode>
} | null> | null = null

async function loadStretchModule() {
  if (typeof window === 'undefined') return null
  if (!loadPromise) {
    // Import the worklet entry only — the package root also re-exports the
    // Node WASM build, which breaks Next's client webpack (`node:module`).
    loadPromise = import('signalsmith-stretch-js/worklet')
      .then((m) => m as Awaited<NonNullable<typeof loadPromise>>)
      .catch(() => null)
  }
  return loadPromise
}

/** Build optional formant worklet chain: source → [stretch] → dest */
export async function createFormantStretchChain(
  ctx: AudioContext,
  source: AudioNode,
  dest: AudioNode,
  policy: StretchPolicy
): Promise<DeckStretchChain | null> {
  if (policy.tier !== 'wasm' && policy.tier !== 'enhanced') {
    source.connect(dest)
    return {
      input: source,
      output: dest,
      dispose: () => {
        try {
          source.disconnect(dest)
        } catch {
          /* ignore */
        }
      },
      setFormantActive: () => {},
    }
  }

  const mod = await loadStretchModule()
  if (!mod) {
    source.connect(dest)
    return {
      input: source,
      output: dest,
      dispose: () => {
        try {
          source.disconnect(dest)
        } catch {
          /* ignore */
        }
      },
      setFormantActive: () => {},
    }
  }

  try {
    const stretch = (await mod.createSignalsmithStretchNode(ctx, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    })) as StretchNode

    source.connect(stretch as unknown as AudioNode)
    ;(stretch as unknown as AudioNode).connect(dest)
    await stretch.start({ active: true, semitones: 0 })
    await stretch.schedule({
      formantCompensation: true,
      formantBaseHz: 180,
      semitones: 0,
    })

    return {
      input: source,
      output: stretch as unknown as AudioNode,
      dispose: () => {
        try {
          // Disconnect only the stretch path — eqHigh may still feed a delay tap.
          source.disconnect(stretch as unknown as AudioNode)
          stretch.disconnect()
        } catch {
          /* ignore */
        }
      },
      setFormantActive: (active: boolean, semitones = 0) => {
        void stretch.schedule({
          formantCompensation: active,
          formantBaseHz: 180,
          semitones,
        })
      },
    }
  } catch {
    source.connect(dest)
    return {
      input: source,
      output: dest,
      dispose: () => {
        try {
          source.disconnect(dest)
        } catch {
          /* ignore */
        }
      },
      setFormantActive: () => {},
    }
  }
}
