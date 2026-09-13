import type { MixEngine } from './MixEngine'

let mixEngineCtor: typeof MixEngine | null = null
let mixEngineLoad: Promise<typeof MixEngine> | null = null

/** Load the dual-deck mixer class only when Auto DJ / crossfade needs it. */
export function loadMixEngineClass(): Promise<typeof MixEngine> {
  if (mixEngineCtor) return Promise.resolve(mixEngineCtor)
  if (!mixEngineLoad) {
    mixEngineLoad = import('./MixEngine').then((mod) => {
      mixEngineCtor = mod.MixEngine
      return mixEngineCtor
    })
  }
  return mixEngineLoad
}

export function getMixEngineClass(): typeof MixEngine | null {
  return mixEngineCtor
}
