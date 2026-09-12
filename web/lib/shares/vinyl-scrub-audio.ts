/**
 * Turntable scrub audio for share listen discs.
 * - Procedural scratch / needle noise modulated by scrub speed
 * - Optional decoded-track grains with signed playbackRate (reverse + speed-up)
 */

import { vinylVelocityToRate } from '@/lib/shares/vinyl-spin-clock'

type ScrubTick = {
  deltaSeconds: number
  deltaDegrees: number
  dtMs: number
  currentTime: number
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

function createNoiseBuffer(ctx: AudioContext, seconds = 1.5): AudioBuffer {
  const length = Math.max(1, Math.floor(ctx.sampleRate * seconds))
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1
  }
  return buffer
}

export class VinylScrubAudio {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private scratchGain: GainNode | null = null
  private scratchFilter: BiquadFilterNode | null = null
  private scratchSource: AudioBufferSourceNode | null = null
  private trackBuffer: AudioBuffer | null = null
  private grain: AudioBufferSourceNode | null = null
  private grainGain: GainNode | null = null
  private loadToken = 0
  private lastGrainAt = 0
  private active = false

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null
    if (this.ctx) return this.ctx
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return null
    this.ctx = new AC()
    this.master = this.ctx.createGain()
    this.master.gain.value = 1
    this.master.connect(this.ctx.destination)

    this.scratchFilter = this.ctx.createBiquadFilter()
    this.scratchFilter.type = 'bandpass'
    this.scratchFilter.frequency.value = 1800
    this.scratchFilter.Q.value = 0.85

    this.scratchGain = this.ctx.createGain()
    this.scratchGain.gain.value = 0

    this.scratchFilter.connect(this.scratchGain)
    this.scratchGain.connect(this.master)

    this.grainGain = this.ctx.createGain()
    this.grainGain.gain.value = 0
    this.grainGain.connect(this.master)

    return this.ctx
  }

  /** Prefetch / decode the playing track for reverse + speed grains. */
  async prepareTrack(url: string | null | undefined): Promise<void> {
    if (!url) {
      this.trackBuffer = null
      return
    }
    const ctx = this.ensureContext()
    if (!ctx) return
    const token = ++this.loadToken
    try {
      const res = await fetch(url, { mode: 'cors', credentials: 'omit' })
      if (!res.ok) return
      const raw = await res.arrayBuffer()
      if (token !== this.loadToken) return
      const decoded = await ctx.decodeAudioData(raw.slice(0))
      if (token !== this.loadToken) return
      this.trackBuffer = decoded
    } catch {
      // CORS / decode failures → scratch noise only
      if (token === this.loadToken) this.trackBuffer = null
    }
  }

  async begin(): Promise<void> {
    const ctx = this.ensureContext()
    if (!ctx || !this.scratchFilter || !this.scratchGain) return
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume()
      } catch {
        /* ignore */
      }
    }

    this.stopScratchSource()
    const noise = createNoiseBuffer(ctx)
    const src = ctx.createBufferSource()
    src.buffer = noise
    src.loop = true
    src.connect(this.scratchFilter)
    src.start()
    this.scratchSource = src
    this.scratchGain.gain.setTargetAtTime(0, ctx.currentTime, 0.02)
    this.active = true
    this.lastGrainAt = 0
  }

  tick(input: ScrubTick): void {
    if (!this.active) return
    const ctx = this.ctx
    const scratchGain = this.scratchGain
    const scratchFilter = this.scratchFilter
    if (!ctx || !scratchGain || !scratchFilter) return

    const dtSec = Math.max(input.dtMs, 8) / 1000
    const degPerSec = input.deltaDegrees / dtSec
    const rate = vinylVelocityToRate(degPerSec)
    const speed = Math.abs(rate)
    const now = ctx.currentTime

    // Scratch / needle noise — louder and brighter when you whip the disc.
    const noiseLevel = clamp(0.04 + speed * 0.22, 0, 0.55)
    scratchGain.gain.setTargetAtTime(noiseLevel, now, 0.03)
    const freq = clamp(700 + speed * 2200, 500, 6500)
    scratchFilter.frequency.setTargetAtTime(freq, now, 0.04)

    // Track grains (reverse when rate < 0, sped-up when |rate| > 1).
    if (this.trackBuffer && this.grainGain && speed > 0.08) {
      const minGap = speed > 2 ? 0.028 : 0.045
      if (now - this.lastGrainAt >= minGap) {
        this.spawnGrain(input.currentTime, rate)
        this.lastGrainAt = now
      }
      const grainLevel = clamp(0.18 + speed * 0.35, 0.15, 0.85)
      this.grainGain.gain.setTargetAtTime(grainLevel, now, 0.04)
    } else if (this.grainGain) {
      this.grainGain.gain.setTargetAtTime(0, now, 0.05)
    }
  }

  private spawnGrain(atSec: number, rate: number): void {
    const ctx = this.ctx
    const buffer = this.trackBuffer
    const grainGain = this.grainGain
    if (!ctx || !buffer || !grainGain) return

    const signedRate = clamp(rate, -4.5, 4.5)
    if (Math.abs(signedRate) < 0.05) return

    const dur = clamp(0.07 + Math.abs(signedRate) * 0.03, 0.06, 0.16)
    let offset = atSec
    if (!Number.isFinite(offset)) offset = 0
    offset = clamp(offset, 0, Math.max(0, buffer.duration - 0.02))

    // Reverse grains start further ahead so playback walks backward through the buffer.
    if (signedRate < 0) {
      offset = clamp(offset + dur * Math.abs(signedRate), 0, Math.max(0, buffer.duration - 0.01))
    }

    try {
      this.grain?.stop()
    } catch {
      /* already stopped */
    }
    this.grain = null

    const src = ctx.createBufferSource()
    src.buffer = buffer
    src.playbackRate.value = signedRate
    src.connect(grainGain)
    try {
      src.start(ctx.currentTime, offset, dur)
      src.stop(ctx.currentTime + dur + 0.02)
    } catch {
      return
    }
    this.grain = src
  }

  end(): void {
    this.active = false
    const ctx = this.ctx
    if (ctx && this.scratchGain) {
      this.scratchGain.gain.setTargetAtTime(0, ctx.currentTime, 0.04)
    }
    if (ctx && this.grainGain) {
      this.grainGain.gain.setTargetAtTime(0, ctx.currentTime, 0.04)
    }
    this.stopScratchSource()
    try {
      this.grain?.stop()
    } catch {
      /* ignore */
    }
    this.grain = null
  }

  private stopScratchSource() {
    try {
      this.scratchSource?.stop()
    } catch {
      /* ignore */
    }
    try {
      this.scratchSource?.disconnect()
    } catch {
      /* ignore */
    }
    this.scratchSource = null
  }

  dispose(): void {
    this.end()
    this.trackBuffer = null
    try {
      void this.ctx?.close()
    } catch {
      /* ignore */
    }
    this.ctx = null
    this.master = null
    this.scratchGain = null
    this.scratchFilter = null
    this.grainGain = null
  }
}
