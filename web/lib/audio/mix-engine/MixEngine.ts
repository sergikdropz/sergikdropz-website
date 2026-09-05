/**
 * Dual-deck mix runtime — real DJ mixer model.
 *
 * Both decks stay "on". Channel faders (gains) do the work; we never pause
 * a deck at handoff. Pause only when loading a new track onto the idle deck.
 * Active deck is which channel drives the UI playhead — not a hard cutover.
 */

import { applySoftTail, intelligentDeckMixAtProgress, smootherstep, styleMixGains, type FilterMixEqGains } from './curves'
import { deckFiltersAtProgress, type DeckFilterState } from './filters'
import { buildMixIntelligence, type MixIntelligence } from './mix-intelligence'
import { ALIGN_PHRASE_BARS } from './plan-from-dna'
import { beatPhaseErrorSec, microRateCorrection } from './sync'
import { solveAlignmentState, beatSyncLockProgress } from './alignment'
import { resolveStretchPolicy } from './stretch-policy'
import type { DeckStretchChain } from './stretch-engine'
import { dualOnsetResidualNudgeSec, transientPocketNudgeSec } from './transient-align'
import {
  resolveKickOnsetSec,
  resolveSnareClapOnsetSec,
} from './kick-onsets'
import { isFourOnFloorPocket } from './mix-techniques'
import { createMixQualityAccumulator } from './mix-quality'
import {
  clampResidualSeekSec,
  phraseQuantizedProgress,
} from './phrase-mix-doctrine'
import { resolvePlaybackBpm } from '@/lib/audio/sonic-dna-mix'
import {
  applyDeckTempo,
  clampTempoRate,
  computeTempoCrossfadePlan,
  configureKeyLock,
  masterDeckRatesAt,
  tempoMixProgress,
  TEMPO_RATE_WRITE_EPSILON,
} from './tempo'
import type {
  DeckId,
  MixEngineEvent,
  MixEngineStatus,
  MixPlan,
  MixTrackRef,
} from './types'

export type MixEngineDeckBind = {
  element: HTMLAudioElement
  track: MixTrackRef | null
}

export type StartTransitionOptions = {
  incomingRate?: number
  /** Absolute master volume 0–1 */
  masterVolume?: number
  /** Prefer AudioContext gains when available */
  audioContext?: AudioContext | null
  /** Fired each mix tick with raw progress 0→1 (and once at 1 on finish) */
  onProgress?: (raw: number) => void
  /** Fired when deck playbackRate updates (formant EQ / UI sync). */
  onDeckRate?: (deck: DeckId, rate: number) => void
  /** Key-lock time-stretch (preservesPitch) — default true */
  keyLock?: boolean
  /** User tempo target on incoming after crossfade (ExpandedPlayerControls slider) */
  incomingTargetRate?: number
  /** Per-deck EQ automation (deck A may route to MusicPlayer ThreeBandEQ) */
  onDeckEq?: (deck: DeckId, gains: { low: number; mid: number; high: number }) => void
  /** DNA EQ bias for outgoing / incoming decks */
  outgoingEqBias?: { low: number; mid: number; high: number }
  incomingEqBias?: { low: number; mid: number; high: number }
  /** Pre-built Sonic DNA intelligence (or computed from tracks) */
  mixIntelligence?: MixIntelligence
  /** Per-deck LPF/HPF when deck A uses external graph */
  onDeckFilter?: (deck: DeckId, state: { hpfHz: number; lpfHz: number }) => void
}

type Listener = (event: MixEngineEvent) => void

export class MixEngine {
  private deckA: HTMLAudioElement
  private deckB: HTMLAudioElement
  private trackA: MixTrackRef | null = null
  private trackB: MixTrackRef | null = null
  private active: DeckId = 'a'
  private status: MixEngineStatus = 'idle'
  private listeners = new Set<Listener>()
  private fadeRaf: number | null = null
  private deferredPauseTimer: ReturnType<typeof setTimeout> | null = null
  private handoffSettleTimer: ReturnType<typeof setTimeout> | null = null
  /** True from mix finish until outgoing fader/EQ settle completes. */
  private handoffSettling = false
  private mixLock = false
  private masterVolume = 1
  private gainA: GainNode | null = null
  private gainB: GainNode | null = null
  private sourceA: MediaElementAudioSourceNode | null = null
  private sourceB: MediaElementAudioSourceNode | null = null
  private ctx: AudioContext | null = null
  /** External gain already in MusicPlayer's Web Audio graph for deck A */
  private externalGainA: GainNode | null = null
  /** MusicPlayer-owned MES for deck A — wired through internal EQ/filter chain */
  private externalSourceA: MediaElementAudioSourceNode | null = null
  private eqLowA: BiquadFilterNode | null = null
  private eqMidA: BiquadFilterNode | null = null
  private eqHighA: BiquadFilterNode | null = null
  private eqLowB: BiquadFilterNode | null = null
  private eqMidB: BiquadFilterNode | null = null
  private eqHighB: BiquadFilterNode | null = null
  private hpfA: BiquadFilterNode | null = null
  private lpfA: BiquadFilterNode | null = null
  private hpfB: BiquadFilterNode | null = null
  private lpfB: BiquadFilterNode | null = null
  private deckChainAttached: Record<DeckId, boolean> = { a: false, b: false }
  private mixIntel: MixIntelligence | null = null
  private deckEqBase: Record<DeckId, FilterMixEqGains> = {
    a: { low: 0, mid: 0, high: 0 },
    b: { low: 0, mid: 0, high: 0 },
  }
  /** User EQ offsets per deck (expanded player knobs). */
  private deckUserEq: Record<DeckId, FilterMixEqGains> = {
    a: { low: 0, mid: 0, high: 0 },
    b: { low: 0, mid: 0, high: 0 },
  }
  private deckRates: Record<DeckId, number> = { a: 1, b: 1 }
  private keyLock = true
  private sumNode: GainNode | null = null
  private compressor: DynamicsCompressorNode | null = null
  private compressorMode: 'smooth' | 'punch' = 'smooth'
  private delayNode: DelayNode | null = null
  private delayFeedback: GainNode | null = null
  private delaySend: GainNode | null = null
  private delayHpf: BiquadFilterNode | null = null
  private delayTap: Record<DeckId, GainNode | null> = { a: null, b: null }
  private incomingStretch: DeckStretchChain | null = null
  private stretchInsertedDeck: DeckId | null = null
  /** Soft-bypassed stretch left on a deck until it is silent (park / loadIdle). */
  private dormantStretch: { deck: DeckId; chain: DeckStretchChain } | null = null

  constructor(deckA: HTMLAudioElement, deckB: HTMLAudioElement) {
    this.deckA = deckA
    this.deckB = deckB
    configureKeyLock(deckA, true)
    configureKeyLock(deckB, true)
  }

  /** Enable key-lock (tempo w/o vinyl pitch) on both decks. */
  setKeyLock(enabled: boolean) {
    this.keyLock = enabled
    configureKeyLock(this.deckA, enabled)
    configureKeyLock(this.deckB, enabled)
  }

  private setDeckTempo(
    deck: DeckId,
    el: HTMLAudioElement,
    targetRate: number,
    opts?: {
      instant?: boolean
      slew?: number
      notify?: boolean
      onNotify?: StartTransitionOptions['onDeckRate']
    }
  ): number {
    const applied = applyDeckTempo(el, targetRate, {
      keyLock: this.keyLock,
      currentRate: this.deckRates[deck],
      instant: opts?.instant,
      slew: opts?.slew,
    })
    const prev = this.deckRates[deck]
    this.deckRates[deck] = applied
    if (
      opts?.notify !== false &&
      Math.abs(applied - prev) >= TEMPO_RATE_WRITE_EPSILON
    ) {
      try {
        opts?.onNotify?.(deck, applied)
      } catch {
        /* ignore */
      }
    }
    return applied
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private emit(event: MixEngineEvent) {
    this.listeners.forEach((fn) => {
      try {
        fn(event)
      } catch {
        /* ignore */
      }
    })
  }

  private setStatus(status: MixEngineStatus) {
    this.status = status
    this.emit({ type: 'status', status })
  }

  getStatus() {
    return this.status
  }

  getActiveDeck(): DeckId {
    return this.active
  }

  setActiveDeck(deck: DeckId) {
    this.active = deck
    if (!this.mixLock) {
      this.applyDeckGains(deck === 'a' ? 1 : 0, deck === 'b' ? 1 : 0, { instant: true })
    }
  }

  isMixing() {
    return this.mixLock || this.handoffSettling || this.status === 'mixing'
  }

  getActiveElement(): HTMLAudioElement {
    return this.active === 'a' ? this.deckA : this.deckB
  }

  getIdleElement(): HTMLAudioElement {
    return this.active === 'a' ? this.deckB : this.deckA
  }

  getActiveTrack(): MixTrackRef | null {
    return this.active === 'a' ? this.trackA : this.trackB
  }

  getIdleTrack(): MixTrackRef | null {
    return this.active === 'a' ? this.trackB : this.trackA
  }

  /** Annotate the currently active deck without reloading audio. */
  setActiveTrack(track: MixTrackRef | null) {
    if (this.active === 'a') this.trackA = track
    else this.trackB = track
  }

  setMasterVolume(v: number) {
    this.masterVolume = Math.max(0, Math.min(1, v))
    if (!this.mixLock) {
      // Scale both channel faders without resetting crossfader position:
      // active channel full, silent channel stays at 0 (both decks still "on")
      const instant = this.handoffSettling
      this.applyDeckGains(
        this.active === 'a' ? 1 : 0,
        this.active === 'b' ? 1 : 0,
        instant ? { instant: true } : undefined,
      )
    }
  }

  /**
   * When MusicPlayer already owns MediaElementSource on deck A, pass its
   * output GainNode so fades still work (element.volume is ignored with MES).
   */
  adoptExternalGainA(gain: GainNode | null) {
    this.externalGainA = gain
    if (gain) this.rewireExternalGainToBus()
  }

  /**
   * Reuse MusicPlayer's MediaElementSource for deck A (only one MES per element).
   * Routes deck A through the same internal HPF/LPF/EQ/gain chain as deck B.
   */
  adoptExternalSourceA(source: MediaElementAudioSourceNode | null) {
    this.externalSourceA = source
    if (source) {
      this.sourceA = source
      this.deckChainAttached.a = false
    }
  }

  /** Visualization tap — post-EQ, not in the audible output path. */
  connectDeckAnalyser(deck: DeckId, analyser: AnalyserNode | null): boolean {
    if (!analyser) return false
    const { high } = this.getDeckEqNodes(deck)
    if (!high) return false
    try {
      high.connect(analyser)
      return true
    } catch {
      return false
    }
  }

  /** Sum node before master compressor — feed external deck-A graph here for unified output. */
  getMasterBusInput(): GainNode | null {
    const ctx = this.ctx ?? this.externalGainA?.context
    if (ctx && typeof ctx === 'object' && 'createGain' in ctx) {
      this.ensureMasterBus(ctx as AudioContext)
    }
    return this.sumNode
  }

  /** Route MusicPlayer's deck-A output gain into the shared master bus (not destination). */
  rewireExternalGainToBus(): boolean {
    const gain = this.externalGainA
    if (!gain) return false
    const ctx = (this.ctx ?? gain.context) as AudioContext
    this.ensureMasterBus(ctx)
    if (!this.sumNode) return false
    try {
      gain.disconnect()
    } catch {
      /* ignore */
    }
    try {
      gain.connect(this.sumNode)
      return true
    } catch {
      return false
    }
  }

  private createDeckFilters(ctx: AudioContext, deck: DeckId) {
    const hpf = ctx.createBiquadFilter()
    hpf.type = 'highpass'
    hpf.frequency.value = 20
    hpf.Q.value = 0.707
    const lpf = ctx.createBiquadFilter()
    lpf.type = 'lowpass'
    lpf.frequency.value = 20000
    lpf.Q.value = 0.707
    if (deck === 'a') {
      this.hpfA = hpf
      this.lpfA = lpf
    } else {
      this.hpfB = hpf
      this.lpfB = lpf
    }
    return { hpf, lpf }
  }

  private getDeckFilterNodes(deck: DeckId) {
    return deck === 'a'
      ? { hpf: this.hpfA, lpf: this.lpfA }
      : { hpf: this.hpfB, lpf: this.lpfB }
  }

  private applyDeckFilters(deck: DeckId, state: DeckFilterState, opts?: StartTransitionOptions) {
    if (deck === 'a' && this.externalGainA) {
      try {
        opts?.onDeckFilter?.(deck, state)
      } catch {
        /* ignore */
      }
      return
    }
    const nodes = this.getDeckFilterNodes(deck)
    if (!nodes.hpf || !nodes.lpf) {
      try {
        opts?.onDeckFilter?.(deck, state)
      } catch {
        /* ignore */
      }
      return
    }
    const hpfHz = Math.max(20, Math.min(12000, state.hpfHz))
    const lpfHz = Math.max(80, Math.min(22000, state.lpfHz))
    const ctx = this.ctx
    const ramp = (param: AudioParam, hz: number) => {
      if (ctx && typeof param.setTargetAtTime === 'function') {
        const t = ctx.currentTime
        param.cancelScheduledValues(t)
        param.setTargetAtTime(hz, t, 0.028)
      } else {
        param.value = hz
      }
    }
    try {
      ramp(nodes.hpf.frequency, hpfHz)
      ramp(nodes.lpf.frequency, lpfHz)
    } catch {
      /* ignore */
    }
    try {
      opts?.onDeckFilter?.(deck, { hpfHz, lpfHz })
    } catch {
      /* ignore */
    }
  }

  private resetDeckFilters(opts?: StartTransitionOptions) {
    const open = { hpfHz: 20, lpfHz: 20000 }
    this.applyDeckFilters('a', open, opts)
    this.applyDeckFilters('b', open, opts)
  }

  private connectDeckChain(
    source: MediaElementAudioSourceNode,
    deck: DeckId,
    gain: GainNode,
    ctx: AudioContext
  ) {
    if (this.deckChainAttached[deck]) return
    const hpf = deck === 'a' ? this.hpfA : this.hpfB
    const lpf = deck === 'a' ? this.lpfA : this.lpfB
    const eqLow = deck === 'a' ? this.eqLowA : this.eqLowB
    const eqMid = deck === 'a' ? this.eqMidA : this.eqMidB
    const eqHigh = deck === 'a' ? this.eqHighA : this.eqHighB
    if (!hpf || !lpf || !eqLow || !eqMid || !eqHigh) return
    try {
      source.disconnect()
    } catch {
      /* ignore */
    }
    source.connect(hpf)
    hpf.connect(lpf)
    lpf.connect(eqLow)
    eqLow.connect(eqMid)
    eqMid.connect(eqHigh)
    eqHigh.connect(gain)
    this.ensureMasterBus(ctx)
    const tap = this.ensureDelayTap(ctx, deck)
    try {
      eqHigh.connect(tap)
    } catch {
      /* ignore */
    }
    try {
      gain.disconnect()
    } catch {
      /* ignore */
    }
    if (this.sumNode) gain.connect(this.sumNode)
    else gain.connect(ctx.destination)
    this.deckChainAttached[deck] = true
  }

  private ensureMasterBus(ctx: AudioContext) {
    if (this.sumNode && this.compressor) return
    const sum = ctx.createGain()
    sum.gain.value = 1
    const comp = ctx.createDynamicsCompressor()
    this.sumNode = sum
    this.compressor = comp
    this.applyMasterCompressor(this.compressorMode)
    sum.connect(comp)
    comp.connect(ctx.destination)
    this.ensureDelaySend(ctx)
  }

  /** Gentle bus glue for Smooth; punchier for Filter / Cut / Bass swap. */
  private applyMasterCompressor(mode: 'smooth' | 'punch') {
    this.compressorMode = mode
    const comp = this.compressor
    if (!comp) return
    if (mode === 'smooth') {
      comp.threshold.value = -8
      comp.knee.value = 12
      comp.ratio.value = 2
      comp.attack.value = 0.008
      comp.release.value = 0.22
      return
    }
    comp.threshold.value = -14
    comp.knee.value = 10
    comp.ratio.value = 3.5
    comp.attack.value = 0.003
    comp.release.value = 0.14
  }

  private ensureDelayTap(ctx: AudioContext, deck: DeckId): GainNode {
    const existing = this.delayTap[deck]
    if (existing) return existing
    const tap = ctx.createGain()
    tap.gain.value = 0
    this.delayTap[deck] = tap
    this.ensureDelaySend(ctx)
    if (this.delayHpf) {
      try {
        tap.connect(this.delayHpf)
      } catch {
        /* ignore */
      }
    }
    return tap
  }

  private ensureDelaySend(ctx: AudioContext) {
    if (this.delayNode) return
    const hpf = ctx.createBiquadFilter()
    hpf.type = 'highpass'
    hpf.frequency.value = 380
    hpf.Q.value = 0.7
    const delay = ctx.createDelay(2)
    delay.delayTime.value = 0.25
    const fb = ctx.createGain()
    fb.gain.value = 0.32
    const send = ctx.createGain()
    send.gain.value = 0
    hpf.connect(delay)
    delay.connect(fb)
    fb.connect(delay)
    delay.connect(send)
    if (this.sumNode) send.connect(this.sumNode)
    else send.connect(ctx.destination)
    this.delayHpf = hpf
    this.delayNode = delay
    this.delayFeedback = fb
    this.delaySend = send
  }

  private setEchoSend(outgoingDeck: DeckId, amount: number, delaySec: number) {
    const tapA = this.delayTap.a
    const tapB = this.delayTap.b
    const send = this.delaySend
    const delay = this.delayNode
    const a = Math.max(0, Math.min(0.55, amount))
    const ctx = this.ctx
    const ramp = (g: GainNode | null, value: number) => {
      if (!g) return
      if (ctx && typeof g.gain.setTargetAtTime === 'function') {
        const t = ctx.currentTime
        g.gain.cancelScheduledValues(t)
        g.gain.setTargetAtTime(value, t, 0.04)
      } else {
        g.gain.value = value
      }
    }
    try {
      ramp(tapA, outgoingDeck === 'a' ? a : 0)
      ramp(tapB, outgoingDeck === 'b' ? a : 0)
      ramp(send, a > 0.01 ? 1 : 0)
      if (delay) {
        if (ctx && typeof delay.delayTime.setTargetAtTime === 'function') {
          const t = ctx.currentTime
          delay.delayTime.cancelScheduledValues(t)
          delay.delayTime.setTargetAtTime(Math.max(0.08, Math.min(1.5, delaySec)), t, 0.05)
        } else {
          delay.delayTime.value = Math.max(0.08, Math.min(1.5, delaySec))
        }
      }
    } catch {
      /* ignore */
    }
  }

  private async insertIncomingStretch(
    deck: DeckId,
    policy: ReturnType<typeof resolveStretchPolicy>,
    semitones: number
  ) {
    const ctx = this.ctx
    if (!ctx || !policy.wasmOnMixGlide) return
    // Already wired on this idle deck — just refresh formant settings.
    if (this.stretchInsertedDeck === deck && this.incomingStretch) {
      try {
        this.incomingStretch.setFormantActive(true, semitones)
      } catch {
        /* ignore */
      }
      return
    }
    // Previous mix left stretch on the other (outgoing) deck — keep it wired,
    // dispose only when that deck is silent.
    if (this.incomingStretch && this.stretchInsertedDeck && this.stretchInsertedDeck !== deck) {
      try {
        this.incomingStretch.setFormantActive(false, 0)
      } catch {
        /* ignore */
      }
      this.dormantStretch = { deck: this.stretchInsertedDeck, chain: this.incomingStretch }
      this.incomingStretch = null
      this.stretchInsertedDeck = null
    }
    // Reclaim dormant stretch if we're cuing the same deck again.
    if (this.dormantStretch?.deck === deck) {
      this.incomingStretch = this.dormantStretch.chain
      this.stretchInsertedDeck = deck
      this.dormantStretch = null
      try {
        this.incomingStretch.setFormantActive(true, semitones)
      } catch {
        /* ignore */
      }
      return
    }
    const eqHigh = deck === 'a' ? this.eqHighA : this.eqHighB
    const gain = deck === 'a' ? this.gainA : this.gainB
    if (!eqHigh || !gain) return
    try {
      eqHigh.disconnect(gain)
    } catch {
      /* ignore */
    }
    const { createFormantStretchChain } = await import('./stretch-engine')
    const chain = await createFormantStretchChain(ctx, eqHigh, gain, policy)
    if (!chain) {
      try {
        eqHigh.connect(gain)
      } catch {
        /* ignore */
      }
      return
    }
    chain.setFormantActive(true, semitones)
    this.incomingStretch = chain
    this.stretchInsertedDeck = deck
  }

  private restoreIncomingStretch() {
    const chain = this.incomingStretch
    const deck = this.stretchInsertedDeck
    this.incomingStretch = null
    this.stretchInsertedDeck = null
    if (!chain || !deck) return
    this.teardownStretchChain(deck, chain)
  }

  /** Soft-bypass formant on the live deck; keep graph wired to avoid handoff clicks. */
  private softenIncomingStretch() {
    const chain = this.incomingStretch
    if (!chain) return
    try {
      chain.setFormantActive(false, 0)
    } catch {
      /* ignore */
    }
  }

  private teardownStretchChain(deck: DeckId, chain: DeckStretchChain) {
    try {
      chain.setFormantActive(false, 0)
    } catch {
      /* ignore */
    }
    try {
      chain.dispose()
    } catch {
      /* ignore */
    }
    const eqHigh = deck === 'a' ? this.eqHighA : this.eqHighB
    const gain = deck === 'a' ? this.gainA : this.gainB
    if (eqHigh && gain) {
      try {
        eqHigh.connect(gain)
      } catch {
        /* ignore */
      }
    }
    const ctx = this.ctx
    if (ctx && eqHigh) {
      const tap = this.ensureDelayTap(ctx, deck)
      try {
        eqHigh.connect(tap)
      } catch {
        /* ignore */
      }
    }
  }

  /** Tear down stretch only when the deck is silent (parking / next load). */
  private disposeStretchIfDeck(deck: DeckId) {
    if (this.stretchInsertedDeck === deck && this.incomingStretch) {
      this.restoreIncomingStretch()
    }
    if (this.dormantStretch?.deck === deck) {
      const { chain } = this.dormantStretch
      this.dormantStretch = null
      this.teardownStretchChain(deck, chain)
    }
  }

  private createDeckEq(ctx: AudioContext, deck: DeckId) {
    const low = ctx.createBiquadFilter()
    low.type = 'lowshelf'
    low.frequency.value = 100
    low.gain.value = 0
    const mid = ctx.createBiquadFilter()
    mid.type = 'peaking'
    mid.frequency.value = 1000
    mid.Q.value = 1
    mid.gain.value = 0
    const high = ctx.createBiquadFilter()
    high.type = 'highshelf'
    high.frequency.value = 10000
    high.gain.value = 0
    if (deck === 'a') {
      this.eqLowA = low
      this.eqMidA = mid
      this.eqHighA = high
    } else {
      this.eqLowB = low
      this.eqMidB = mid
      this.eqHighB = high
    }
    return { low, mid, high }
  }

  private getDeckEqNodes(deck: DeckId) {
    return deck === 'a'
      ? { low: this.eqLowA, mid: this.eqMidA, high: this.eqHighA }
      : { low: this.eqLowB, mid: this.eqMidB, high: this.eqHighB }
  }

  private applyDeckEq(
    deck: DeckId,
    gains: FilterMixEqGains,
    opts?: StartTransitionOptions
  ) {
    const clampDb = (n: number) => Math.max(-40, Math.min(12, n))
    // Deck A often uses MusicPlayer's external graph (ThreeBandEQ)
    if (deck === 'a' && this.externalGainA) {
      try {
        opts?.onDeckEq?.(deck, gains)
      } catch {
        /* ignore */
      }
      return
    }
    const nodes = this.getDeckEqNodes(deck)
    const hasSource =
      deck === 'a'
        ? !!(this.sourceA || this.externalSourceA)
        : !!this.sourceB
    if (nodes.low && nodes.mid && nodes.high && hasSource) {
      const ctx = this.ctx
      const rampDb = (param: AudioParam, db: number) => {
        const clamped = clampDb(db)
        if (ctx && typeof param.setTargetAtTime === 'function') {
          const t = ctx.currentTime
          param.cancelScheduledValues(t)
          param.setTargetAtTime(clamped, t, 0.012)
        } else {
          param.value = clamped
        }
      }
      try {
        rampDb(nodes.low.gain, gains.low)
        rampDb(nodes.mid.gain, gains.mid)
        rampDb(nodes.high.gain, gains.high)
      } catch {
        /* ignore */
      }
      try {
        opts?.onDeckEq?.(deck, gains)
      } catch {
        /* ignore */
      }
      return
    }
    try {
      opts?.onDeckEq?.(deck, gains)
    } catch {
      /* ignore */
    }
  }

  /**
   * User EQ (expanded player faders). Writes the active deck's internal EQ when
   * that deck is audible through MixEngine (typically deck B after a handoff).
   * Deck A with externalGainA is driven by ThreeBandEQ instead — returns false.
   */
  setUserEqGains(
    gains: FilterMixEqGains,
    opts?: { instant?: boolean },
  ): boolean {
    return this.setDeckEqGains(this.active, gains, opts)
  }

  getDeckPlaybackRate(deck: DeckId): number {
    return this.deckRates[deck]
  }

  /**
   * Lock the idle (incoming) deck to a beatmatch rate before the blend.
   * Safe to call while already cued — does not reload or seek.
   */
  lockIdleTempo(rate: number): number {
    if (!(rate > 0) || !Number.isFinite(rate)) return this.deckRates[this.active === 'a' ? 'b' : 'a']
    const el = this.getIdleElement()
    const deck: DeckId = this.active === 'a' ? 'b' : 'a'
    return this.setDeckTempo(deck, el, clampTempoRate(rate), { instant: true, notify: false })
  }

  /** Mute the idle channel (including deck A via externalGainA). */
  silenceIdle(opts?: { instant?: boolean }) {
    if (this.active === 'a') this.applyDeckGains(1, 0, { instant: opts?.instant !== false, tau: 0.012 })
    else this.applyDeckGains(0, 1, { instant: opts?.instant !== false, tau: 0.012 })
  }

  /**
   * Park incoming at the mix-in cue, silent and paused.
   * Do not play through the outro — that drifts off phrase 1 and restarts at OUT.
   */
  parkIdleAtCue(cueSec: number, rate?: number) {
    if (this.mixLock) return
    const el = this.getIdleElement()
    const cue = Math.max(0, cueSec)
    this.silenceIdle({ instant: true })
    if (typeof rate === 'number' && rate > 0) this.lockIdleTempo(rate)
    try {
      if (Math.abs((el.currentTime || 0) - cue) > 0.03) {
        el.currentTime = cue
      }
    } catch {
      /* ignore */
    }
    try {
      if (!el.paused) el.pause()
    } catch {
      /* ignore */
    }
  }

  /** Silent play so the decoder is warm in the last moments before OUT. */
  warmIdle(rate?: number) {
    if (this.mixLock) return
    const el = this.getIdleElement()
    this.silenceIdle({ instant: true })
    if (typeof rate === 'number' && rate > 0) this.lockIdleTempo(rate)
    try {
      if (el.paused) void el.play().catch(() => {})
    } catch {
      /* mix start will retry */
    }
  }

  /** Set tempo on a specific deck (key-lock when enabled). */
  setDeckPlaybackRate(
    deck: DeckId,
    rate: number,
    opts?: { instant?: boolean; notify?: boolean },
  ): number {
    const el = deck === 'a' ? this.deckA : this.deckB
    return this.setDeckTempo(deck, el, rate, {
      instant: opts?.instant,
      notify: opts?.notify,
    })
  }

  getDeckEqGains(deck: DeckId): FilterMixEqGains {
    const nodes = this.getDeckEqNodes(deck)
    if (nodes.low && nodes.mid && nodes.high) {
      return {
        low: nodes.low.gain.value,
        mid: nodes.mid.gain.value,
        high: nodes.high.gain.value,
      }
    }
    return { ...this.deckUserEq[deck] }
  }

  /**
   * User EQ for a specific deck. When deck A uses externalGainA (legacy path),
   * returns false so the caller updates an external EQ graph.
   */
  setDeckEqGains(
    deck: DeckId,
    gains: FilterMixEqGains,
    opts?: { instant?: boolean },
  ): boolean {
    this.deckUserEq[deck] = { ...gains }
    if (deck === 'a' && this.externalGainA) return false
    const nodes = this.getDeckEqNodes(deck)
    const hasSource =
      deck === 'a'
        ? !!(this.sourceA || this.externalSourceA)
        : !!this.sourceB
    if (!nodes.low || !nodes.mid || !nodes.high || !hasSource) return false
    const clampDb = (n: number) => Math.max(-40, Math.min(12, n))
    const ctx = this.ctx
    const write = (param: AudioParam, db: number) => {
      const clamped = clampDb(db)
      if (opts?.instant || !ctx) {
        try {
          param.cancelScheduledValues(ctx?.currentTime ?? 0)
        } catch {
          /* ignore */
        }
        param.value = clamped
        return
      }
      param.cancelScheduledValues(ctx.currentTime)
      param.setTargetAtTime(clamped, ctx.currentTime, 0.012)
    }
    try {
      write(nodes.low.gain, gains.low)
      write(nodes.mid.gain, gains.mid)
      write(nodes.high.gain, gains.high)
      return true
    } catch {
      return false
    }
  }

  private resetDeckEq(opts?: StartTransitionOptions) {
    for (const deck of ['a', 'b'] as DeckId[]) {
      const base = this.deckEqBase[deck]
      this.applyDeckEq(deck, base, opts)
    }
  }

  /** Clear mix automation on the parked deck only — live deck stays open. */
  private resetOutgoingDeckMixState(outDeckId: DeckId, opts?: StartTransitionOptions) {
    const base = this.deckEqBase[outDeckId]
    this.applyDeckEq(outDeckId, base, opts)
    this.applyDeckFilters(outDeckId, { hpfHz: 20, lpfHz: 20000 }, opts)
  }

  /** Avoid canceling in-flight fader ramps when the blend already landed. */
  private confirmHandoffGains() {
    const vol = this.masterVolume
    const readLiveGain = (): number => {
      if (this.active === 'a') {
        if (this.externalGainA) return this.externalGainA.gain.value
        if (this.gainA) return this.gainA.gain.value
        return this.deckA.volume
      }
      if (this.gainB) return this.gainB.gain.value
      return this.deckB.volume
    }
    const settled = readLiveGain() >= vol * 0.88
    const opts = settled ? { instant: true as const } : { tau: 0.045 }
    if (this.active === 'a') this.applyDeckGains(1, 0, opts)
    else this.applyDeckGains(0, 1, opts)
  }

  private clearFade() {
    if (this.fadeRaf != null) {
      cancelAnimationFrame(this.fadeRaf)
      this.fadeRaf = null
    }
  }

  private clearDeferredPause() {
    if (this.deferredPauseTimer != null) {
      clearTimeout(this.deferredPauseTimer)
      this.deferredPauseTimer = null
    }
  }

  private clearHandoffSettle() {
    if (this.handoffSettleTimer != null) {
      clearTimeout(this.handoffSettleTimer)
      this.handoffSettleTimer = null
    }
    this.handoffSettling = false
  }

  /**
   * Real-DJ style: never kill a deck at handoff. Channel faders only.
   * Pause only when this deck is about to load a new track (see loadIdle).
   */
  private parkSilentDeck(el: HTMLAudioElement) {
    try {
      if (el !== this.getActiveElement()) {
        const deck: DeckId = el === this.deckA ? 'a' : 'b'
        // Soft tempo return — instant rate jumps click through residual gain tails.
        this.setDeckTempo(deck, el, 1, { instant: false, slew: 0.08, notify: false })
        this.disposeStretchIfDeck(deck)
      }
    } catch {
      /* ignore */
    }
  }

  /**
   * Try to attach GainNodes for both decks. Safe if MusicPlayer already created
   * a MediaElementSource on deck A — we reuse InvalidStateError by skipping graph.
   */
  attachGraph(ctx: AudioContext): boolean {
    this.ctx = ctx
    try {
      if (!this.gainA) this.gainA = ctx.createGain()
      if (!this.gainB) this.gainB = ctx.createGain()
      this.gainA.gain.value = this.active === 'a' ? 1 : 0
      this.gainB.gain.value = this.active === 'b' ? 1 : 0

      if (!this.eqLowA) this.createDeckEq(ctx, 'a')
      if (!this.eqLowB) this.createDeckEq(ctx, 'b')
      if (!this.hpfA) this.createDeckFilters(ctx, 'a')
      if (!this.hpfB) this.createDeckFilters(ctx, 'b')
      this.ensureMasterBus(ctx)

      if (!this.sourceA && !this.externalSourceA) {
        try {
          this.sourceA = ctx.createMediaElementSource(this.deckA)
        } catch {
          this.sourceA = null
        }
      } else if (this.externalSourceA) {
        this.sourceA = this.externalSourceA
      }
      if (!this.sourceB) {
        try {
          this.sourceB = ctx.createMediaElementSource(this.deckB)
        } catch {
          this.sourceB = null
        }
      }

      if (this.sourceA && this.gainA && !this.externalGainA) {
        this.connectDeckChain(this.sourceA, 'a', this.gainA, ctx)
      }

      if (this.sourceB && this.gainB) {
        this.connectDeckChain(this.sourceB, 'b', this.gainB, ctx)
      }

      // When MES is connected, element.volume is ignored — keep at 1
      this.deckA.volume = 1
      this.deckB.volume = 1
      if (this.externalGainA) this.rewireExternalGainToBus()
      return !!(this.sourceA || this.sourceB || this.externalGainA)
    } catch {
      return false
    }
  }

  private applyDeckGains(a: number, b: number, opts?: { instant?: boolean; tau?: number }) {
    const vol = this.masterVolume
    const instant = opts?.instant === true
    const tau = opts?.tau ?? 0.018
    const now = !instant
      ? this.ctx?.currentTime ?? this.externalGainA?.context.currentTime
      : null
    const setGain = (gain: GainNode, value: number) => {
      if (now != null && typeof gain.gain.setTargetAtTime === 'function') {
        try {
          // Without cancel, each rAF tick stacks another ramp and the
          // faders fight themselves — audible as zipper noise during mixes.
          gain.gain.cancelScheduledValues(now)
          gain.gain.setTargetAtTime(value, now, tau)
          return
        } catch {
          /* fall through */
        }
      }
      try {
        gain.gain.cancelScheduledValues?.(gain.context.currentTime)
      } catch {
        /* ignore */
      }
      gain.gain.value = value
    }

    if (this.gainA && this.gainB && this.sourceA && this.sourceB) {
      setGain(this.gainA, a * vol)
      setGain(this.gainB, b * vol)
      return
    }
    // Hybrid: deck A via external graph + deck B via Web Audio or element volume
    if (this.externalGainA) {
      setGain(this.externalGainA, a * vol)
      this.deckA.volume = 1
      if (this.gainB && this.sourceB) {
        setGain(this.gainB, b * vol)
      } else {
        this.deckB.volume = Math.max(0, Math.min(1, b * vol))
      }
      return
    }
    this.deckA.volume = Math.max(0, Math.min(1, a * vol))
    this.deckB.volume = Math.max(0, Math.min(1, b * vol))
  }

  /** Load a track onto the idle deck (preload / cue). */
  async loadIdle(
    track: MixTrackRef,
    url: string,
    startSec = 0,
    initialRate?: number
  ): Promise<void> {
    this.clearDeferredPause()
    const el = this.getIdleElement()
    const idleId: DeckId = this.active === 'a' ? 'b' : 'a'
    // Idle deck is silent — safe to tear down leftover stretch from prior mix.
    this.disposeStretchIfDeck(idleId)
    const needsReload = !urlsRoughlyEqual(el.src, url)
    this.setStatus('loading')
    if (needsReload) {
      try {
        if (!el.paused) el.pause()
      } catch {
        /* ignore */
      }
      el.src = url
      el.load()
      await waitCanPlay(el, 4000)
    } else if (el.readyState < 2) {
      await waitCanPlay(el, 2500)
    }
    try {
      el.currentTime = Math.max(0, startSec)
    } catch {
      /* ignore */
    }
    if (idleId === 'a') this.trackA = track
    else this.trackB = track
    if (typeof initialRate === 'number' && initialRate > 0) {
      this.setDeckTempo(idleId, el, initialRate, { instant: true, notify: false })
    }
    // Park silent at the cue. Playing here lets incoming run through the outro
    // and then get seeked back to phrase 1 at OUT (audible restart / off-beat).
    this.silenceIdle({ instant: true })
    if (!this.sourceB && !this.sourceA && !this.externalGainA) {
      el.volume = 0
    }
    try {
      if (!el.paused) el.pause()
    } catch {
      /* ignore */
    }
    this.setStatus(this.getActiveTrack() ? 'playing' : 'idle')
  }

  /** Ensure active deck is playing `track` at url (cold start / hard cut). */
  async loadActive(track: MixTrackRef, url: string, startSec = 0): Promise<void> {
    this.clearFade()
    this.mixLock = false
    const el = this.getActiveElement()
    this.setStatus('loading')
    if (!urlsRoughlyEqual(el.src, url)) {
      el.src = url
      el.load()
    }
    await waitCanPlay(el, 4000)
    try {
      el.currentTime = Math.max(0, startSec)
    } catch {
      /* ignore */
    }
    if (this.active === 'a') this.trackA = track
    else this.trackB = track
    this.applyDeckGains(this.active === 'a' ? 1 : 0, this.active === 'b' ? 1 : 0)
    try {
      await el.play()
    } catch {
      /* autoplay */
    }
    this.setStatus('playing')
    this.emit({ type: 'active-deck', deck: this.active, trackId: track.id })
  }

  /**
   * Cue idle + transition in one call (preferred entry for Auto DJ).
   * Skips reload when idle is already cued with the same track.
   */
  async prepareAndTransition(
    plan: MixPlan,
    incoming: MixTrackRef,
    url: string,
    opts?: StartTransitionOptions
  ): Promise<boolean> {
    if (opts?.masterVolume != null) this.setMasterVolume(opts.masterVolume)
    if (opts?.audioContext) {
      this.attachGraph(opts.audioContext)
    }
    const idle = this.getIdleTrack()
    const needLoad = !idle || idle.id !== incoming.id
    const activeForTempo = this.getActiveTrack()
    const outBpm =
      resolvePlaybackBpm(activeForTempo ?? {}, activeForTempo?.bpm) ??
      (typeof activeForTempo?.bpm === 'number' && activeForTempo.bpm > 0
        ? activeForTempo.bpm
        : 120)
    const inBpm =
      resolvePlaybackBpm(incoming, incoming.bpm) ??
      (typeof incoming.bpm === 'number' && incoming.bpm > 0 ? incoming.bpm : outBpm)
    const armedRate =
      typeof opts?.incomingRate === 'number' && opts.incomingRate > 0
        ? opts.incomingRate
        : typeof plan.rateRatio === 'number' && plan.rateRatio > 0
          ? plan.rateRatio
          : undefined
    const tempoPlan = computeTempoCrossfadePlan({
      outgoingBpm: outBpm,
      incomingBpm: inBpm,
      outgoingPlaybackRate:
        Number.isFinite(this.getActiveElement().playbackRate) &&
        this.getActiveElement().playbackRate > 0
          ? this.getActiveElement().playbackRate
          : undefined,
      incomingTargetRate: opts?.incomingTargetRate,
      style: plan.style,
      dualMasterGlide: plan.masterTempoHandoff !== false,
      mixStartRate: armedRate && Math.abs(armedRate - 1) > 0.002 ? armedRate : undefined,
    })
    if (needLoad) {
      const loadCue =
        typeof plan.resolvedIncomingSec === 'number' && Number.isFinite(plan.resolvedIncomingSec)
          ? plan.resolvedIncomingSec
          : plan.incomingStartSec
      await this.loadIdle(incoming, url, loadCue, tempoPlan.mixStartRate)
    } else {
      // Refresh cue — prefer resolved pocket cue so we don't undo lead-in chase.
      const el = this.getIdleElement()
      const targetCue =
        typeof plan.resolvedIncomingSec === 'number' && Number.isFinite(plan.resolvedIncomingSec)
          ? plan.resolvedIncomingSec
          : plan.incomingStartSec
      this.parkIdleAtCue(targetCue, tempoPlan.mixStartRate)
    }
    return this.startTransition(plan, opts?.incomingRate ?? plan.rateRatio, opts)
  }

  /**
   * Run plan: idle deck must already be loaded with incoming track.
   * Style-aware rAF fade → soft mute → pause outgoing → swap active.
   */
  async startTransition(
    plan: MixPlan,
    incomingRate = 1,
    opts?: StartTransitionOptions
  ): Promise<boolean> {
    if (this.mixLock) return false
    const outgoing = this.getActiveElement()
    const incoming = this.getIdleElement()
    const idleTrack = this.getIdleTrack()
    const activeTrack = this.getActiveTrack()
    if (!idleTrack || idleTrack.id !== plan.incomingTrackId) {
      this.emit({ type: 'error', message: 'Idle deck is not cued with incoming track' })
      return false
    }

    this.mixLock = true
    this.clearFade()
    this.setStatus('mixing')
    this.emit({ type: 'mix-started', plan })

    const remain =
      (Number.isFinite(outgoing.duration) ? outgoing.duration : 0) -
      (Number.isFinite(outgoing.currentTime) ? outgoing.currentTime : 0)
    // Slightly longer floor for Smooth so the soft-tail has room
    const minMix = plan.style === 'cut' ? 0.55 : 1.1
    const doctrineExact =
      plan.exactOverlap === true ||
      (plan.blendFromOut !== false &&
        plan.style === 'crossfade' &&
        plan.phrase1Lock !== false)
    const mixSec = doctrineExact
      ? Math.max(minMix, Math.min(plan.mixDurationSec, Math.max(minMix, remain - 0.05), 48))
      : Math.max(minMix, Math.min(plan.mixDurationSec, Math.max(minMix, remain - 0.2), 48))

    if (opts?.keyLock === false) this.setKeyLock(false)
    else if (opts?.keyLock === true) this.setKeyLock(true)

    const outDeck: DeckId = this.active
    const idleDeck: DeckId = this.active === 'a' ? 'b' : 'a'
    const outLiveRate = clampTempoRate(
      Number.isFinite(outgoing.playbackRate) && outgoing.playbackRate > 0
        ? outgoing.playbackRate
        : this.deckRates[outDeck]
    )
    this.deckRates[outDeck] = outLiveRate
    const alignBars = ALIGN_PHRASE_BARS
    const resolvedOutBpm =
      resolvePlaybackBpm(activeTrack ?? {}, activeTrack?.bpm) ??
      (typeof activeTrack?.bpm === 'number' && activeTrack.bpm > 0 ? activeTrack.bpm : 120)
    const resolvedInBpm =
      resolvePlaybackBpm(idleTrack, idleTrack.bpm) ??
      (typeof idleTrack.bpm === 'number' && idleTrack.bpm > 0 ? idleTrack.bpm : resolvedOutBpm)
    const passedRate =
      typeof incomingRate === 'number' && incomingRate > 0 && Math.abs(incomingRate - 1) > 0.002
        ? incomingRate
        : typeof plan.rateRatio === 'number' && plan.rateRatio > 0 && Math.abs(plan.rateRatio - 1) > 0.002
          ? plan.rateRatio
          : undefined
    const tempoPlan = computeTempoCrossfadePlan({
      outgoingBpm: resolvedOutBpm,
      incomingBpm: resolvedInBpm,
      outgoingPlaybackRate: outLiveRate,
      incomingTargetRate: opts?.incomingTargetRate ?? 1,
      style: plan.style,
      dualMasterGlide: plan.masterTempoHandoff !== false,
      mixStartRate: passedRate,
    })
    const mixStartRate = tempoPlan.mixStartRate
    const outDeckId: DeckId = outDeck
    const inDeckId: DeckId = idleDeck
    this.mixIntel =
      opts?.mixIntelligence ??
      (activeTrack && idleTrack
        ? buildMixIntelligence({
            outgoing: activeTrack,
            incoming: idleTrack,
            style: plan.style,
            outgoingRate: outLiveRate,
            incomingTargetRate: opts?.incomingTargetRate ?? 1,
          })
        : null)
    // Doctrine: audible blend from OUT — no delayed incoming fader.
    if (plan.blendFromOut !== false && this.mixIntel) {
      this.mixIntel = { ...this.mixIntel, incomingDelay: 0 }
    }
    this.applyMasterCompressor(plan.style === 'crossfade' ? 'smooth' : 'punch')
    if (opts?.outgoingEqBias) this.deckEqBase[outDeckId] = { ...opts.outgoingEqBias }
    else if (this.mixIntel) this.deckEqBase[outDeckId] = { ...this.mixIntel.outBias }
    if (opts?.incomingEqBias) this.deckEqBase[inDeckId] = { ...opts.incomingEqBias }
    else if (this.mixIntel) this.deckEqBase[inDeckId] = { ...this.mixIntel.inBias }

    try {
      const plannedCue =
        typeof plan.resolvedIncomingSec === 'number' && Number.isFinite(plan.resolvedIncomingSec)
          ? plan.resolvedIncomingSec
          : Math.max(0, plan.incomingStartSec)
      let cue = plannedCue
      const outBpm = resolvedOutBpm
      const inBpm = resolvedInBpm
      this.setDeckTempo(idleDeck, incoming, mixStartRate, {
        instant: true,
        onNotify: opts?.onDeckRate,
      })
      if (
        typeof outBpm === 'number' &&
        outBpm > 0 &&
        typeof inBpm === 'number' &&
        inBpm > 0
      ) {
        // Media-time phase: use base BPM only (never bpm × playbackRate).
        const align = solveAlignmentState({
          plannedIncomingSec: plannedCue,
          outgoingTimeSec: outgoing.currentTime || 0,
          outgoingBpm: outBpm,
          outgoingOffsetSec: activeTrack?.beat_grid_offset,
          outgoingSonicDna: activeTrack?.sonic_dna,
          outgoingPeaks: activeTrack?.waveformPeaks,
          outgoingDurationSec:
            activeTrack?.waveformDurationSec ??
            (Number.isFinite(outgoing.duration) ? outgoing.duration : 0),
          incomingBpm: inBpm,
          incomingOffsetSec: idleTrack.beat_grid_offset,
          incomingSonicDna: idleTrack.sonic_dna,
          incomingPeaks: idleTrack.waveformPeaks,
          incomingDurationSec:
            idleTrack.waveformDurationSec ??
            (Number.isFinite(incoming.duration) ? incoming.duration : 0),
          phraseBars: alignBars,
          dnaConfidence: plan.dnaConfidence,
          phraseLock: plan.phraseLock,
          phrase1Lock: plan.phrase1Lock !== false,
        })
        cue = align.incomingCueSec
        plan.resolvedIncomingSec = cue
        plan.dnaConfidence = align.confidence
        plan.phraseLock = align.phraseLock
      }
      try {
        // Only snap if we are not already on the parked cue — mid-intro seeks
        // sound like a restart instead of a blend.
        if (Math.abs(incoming.currentTime - cue) > 0.04) {
          incoming.currentTime = cue
        }
      } catch {
        /* ignore */
      }
      // Silence incoming before play to avoid a start click
      if (this.active === 'a') this.applyDeckGains(1, 0)
      else this.applyDeckGains(0, 1)
      if (incoming.paused) {
        await incoming.play()
        // Recover if browser paused incoming (autoplay policy / race)
        if (incoming.paused) {
          await incoming.play().catch(() => {})
        }
      }
      // play() can reset playbackRate — incoming must already match outgoing
      // before the first audible fade frame.
      this.setDeckTempo(idleDeck, incoming, mixStartRate, {
        instant: true,
        onNotify: opts?.onDeckRate,
      })
    } catch {
      this.mixLock = false
      this.setStatus('error')
      this.emit({ type: 'error', message: 'Incoming deck failed to play' })
      return false
    }

    const activeAtStart = this.active
    // Master BeatSync: phase uses base outgoing BPM; syncBpm for wall-tempo display only.
    const baseOutBpm = resolvedOutBpm
    const baseInBpm = resolvedInBpm
    const syncBpm = tempoPlan.effectiveOutBpm
    const microStrength = this.mixIntel?.microStrength ??
      (plan.style === 'crossfade' ? 0.82 : plan.style === 'filter-eq' ? 0.68 : 0.55)
    const lockUntil = beatSyncLockProgress({
      tempoGlideStart: tempoPlan.glideStart,
      dnaConfidence: plan.dnaConfidence ?? 0.5,
      holdBeatmatch: plan.holdBeatmatch !== false,
    })
    const incomingPolicy = this.mixIntel?.incomingStretch ?? resolveStretchPolicy(idleTrack, tempoPlan.mixEndRate, { mixGlide: true, incoming: true })
    const tempoSlew = incomingPolicy.tempoSlew
    const quality = createMixQualityAccumulator()
    const echoBeats = this.mixIntel?.echoDelayBeats ?? 0.5
    const echoDelaySec = (60 / Math.max(60, syncBpm)) * echoBeats
    void this.insertIncomingStretch(idleDeck, incomingPolicy, plan.harmonicSemitones ?? 0)

    const outDurSec =
      activeTrack?.waveformDurationSec ??
      (Number.isFinite(outgoing.duration) ? outgoing.duration : 0)
    const inDurSec =
      idleTrack.waveformDurationSec ??
      (Number.isFinite(incoming.duration) ? incoming.duration : 0)
    const outKickOnsets = resolveKickOnsetSec({
      sonicDna: activeTrack?.sonic_dna,
      peaks: activeTrack?.waveformPeaks,
      durationSec: outDurSec > 0 ? outDurSec : 180,
      bpm: baseOutBpm,
      offsetSec: activeTrack?.beat_grid_offset,
    })
    const inKickOnsets = resolveKickOnsetSec({
      sonicDna: idleTrack.sonic_dna,
      peaks: idleTrack.waveformPeaks,
      durationSec: inDurSec > 0 ? inDurSec : 180,
      bpm: baseInBpm,
      offsetSec: idleTrack.beat_grid_offset,
    })
    const outSnareOnsets = resolveSnareClapOnsetSec({
      sonicDna: activeTrack?.sonic_dna,
      peaks: activeTrack?.waveformPeaks,
      durationSec: outDurSec > 0 ? outDurSec : 180,
      bpm: baseOutBpm,
      offsetSec: activeTrack?.beat_grid_offset,
    })
    const inSnareOnsets = resolveSnareClapOnsetSec({
      sonicDna: idleTrack.sonic_dna,
      peaks: idleTrack.waveformPeaks,
      durationSec: inDurSec > 0 ? inDurSec : 180,
      bpm: baseInBpm,
      offsetSec: idleTrack.beat_grid_offset,
    })
    const bothFoF =
      isFourOnFloorPocket(activeTrack?.sonic_dna) && isFourOnFloorPocket(idleTrack.sonic_dna)
    let holdPhaseLock = plan.holdBeatmatch !== false
    let largePhaseStreak = 0
    let tickFrame = 0
    /** Smoothed micro-rate bias — avoids stretcher thrash from frame-to-frame phase chase. */
    let microRateBias = 1

    const ctxClock = this.ctx
    const mixStartCtx = ctxClock?.currentTime ?? null
    const started = performance.now()
    const outStartMedia = outgoing.currentTime || 0
    const phraseLoopSec = (60 / Math.max(60, baseOutBpm)) * 4 * 8

    return await new Promise<boolean>((resolve) => {
      const finish = () => {
        this.fadeRaf = null
        // Soft-kill echo send — hard zero pops through the master bus.
        this.setEchoSend(outDeckId, 0, echoDelaySec)
        // Keep stretch graph wired on the live deck; only disable formant.
        // Disconnect/reconnect here was the harsh handoff click.
        this.softenIncomingStretch()
        const report = quality.report()

        if (report.samples >= 4) {
          this.emit({
            type: 'mix-quality',
            plan,
            phaseRmsSec: report.phaseRmsSec,
            kickResidualRmsMs: report.kickResidualRmsMs,
            samples: report.samples,
          })
        }
        try {
          opts?.onProgress?.(1)
          // Ease incoming onto native tempo (no instant rate snap)
          this.setDeckTempo(idleDeck, incoming, tempoPlan.mixEndRate, {
            instant: false,
            slew: Math.max(tempoSlew, 0.05),
            onNotify: opts?.onDeckRate,
          })
          this.setDeckTempo(outDeck, outgoing, tempoPlan.outEndRate, {
            instant: false,
            slew: Math.max(tempoSlew, 0.05),
            notify: false,
          })
          this.mixIntel = null
          this.applyMasterCompressor('smooth')
        } catch {
          /* ignore */
        }
        // Mixer handoff: faders already at out≈0 / in≈1 from the last tick.
        this.active = activeAtStart === 'a' ? 'b' : 'a'
        this.confirmHandoffGains()
        this.mixLock = false
        this.setStatus('playing')
        this.emit({ type: 'mix-completed', plan, activeDeck: this.active })
        this.emit({
          type: 'active-deck',
          deck: this.active,
          trackId: this.getActiveTrack()?.id ?? null,
        })
        // Defer EQ/filter open + park until outgoing gain has settled silent.
        this.clearHandoffSettle()
        this.handoffSettling = true
        this.handoffSettleTimer = setTimeout(() => {
          this.handoffSettleTimer = null
          this.handoffSettling = false
          try {
            this.resetOutgoingDeckMixState(outDeckId, opts)
          } catch {
            /* ignore */
          }
          this.parkSilentDeck(outgoing)
          resolve(true)
        }, 120)
      }

      const tick = (now: number) => {
        const outNow = outgoing.currentTime || 0
        const mediaElapsed = outNow - outStartMedia
        let raw: number
        if (mediaElapsed > 0.015) {
          raw = Math.min(1, Math.max(0, mediaElapsed / mixSec))
        } else if (mixStartCtx != null && ctxClock) {
          raw = Math.min(1, Math.max(0, (ctxClock.currentTime - mixStartCtx) / mixSec))
        } else {
          raw = Math.min(1, Math.max(0, (now - started) / (mixSec * 1000)))
        }

        if (plan.needsOutroLoop) {
          const dur = Number.isFinite(outgoing.duration) ? outgoing.duration : 0
          if (dur > phraseLoopSec + 0.5 && dur - (outgoing.currentTime || 0) < 0.22) {
            try {
              outgoing.currentTime = Math.max(
                0,
                (outgoing.currentTime || 0) - phraseLoopSec,
              )
            } catch {
              /* ignore */
            }
          }
        }

        // Shared master clock: both decks stay beatmatched while gliding to incoming native.
        tickFrame += 1
        const effectiveLockUntil = holdPhaseLock
          ? lockUntil
          : Math.min(lockUntil, tempoPlan.glideStart)
        const rates = masterDeckRatesAt(tempoPlan, raw)
        let inRate = rates.inRate
        let outRateTarget = rates.outRate
        const tempoGlide = tempoMixProgress(tempoPlan, raw)
        const isSmoothCrossfade = plan.style === 'crossfade'
        // Dual master keeps phase chase through most of the blend; single-deck unlocks earlier.
        const inLockPhase = holdPhaseLock
          ? tempoPlan.dualMasterGlide
            ? raw < 0.92
            : raw < effectiveLockUntil
          : raw < Math.min(0.55, tempoPlan.glideStart)
        let phaseErr = 0
        let kickResidualMs = 0
        try {
          if (inLockPhase) {
            const outT = outgoing.currentTime || 0
            const inT = incoming.currentTime || 0
            phaseErr = beatPhaseErrorSec({
              outgoingTimeSec: outT,
              outgoingBpm: baseOutBpm,
              outgoingOffsetSec: activeTrack?.beat_grid_offset ?? undefined,
              incomingTimeSec: inT,
              incomingBpm: baseInBpm,
              incomingOffsetSec: idleTrack.beat_grid_offset ?? undefined,
            })

            // Kick + snare/clap pocket residual — micro seek before rate chase.
            const onsetNudge = dualOnsetResidualNudgeSec({
              outgoingTimeSec: outT,
              incomingTimeSec: inT,
              outgoingKickOnsets: outKickOnsets,
              incomingKickOnsets: inKickOnsets,
              outgoingSnareOnsets: outSnareOnsets,
              incomingSnareOnsets: inSnareOnsets,
              snareWeight: bothFoF ? 0.42 : 0.18,
              maxAbsSec: 0.018,
            })
            kickResidualMs = onsetNudge * 1000
            // Pre-arm already locked phase. Mid-mix seeks click — micro-rate only
            // after the blend is audible.
            if (raw < 0.02 && Math.abs(onsetNudge) > 0.004) {
              try {
                incoming.currentTime = Math.max(0, inT + onsetNudge)
                phaseErr = beatPhaseErrorSec({
                  outgoingTimeSec: outT,
                  outgoingBpm: baseOutBpm,
                  outgoingOffsetSec: activeTrack?.beat_grid_offset ?? undefined,
                  incomingTimeSec: incoming.currentTime || 0,
                  incomingBpm: baseInBpm,
                  incomingOffsetSec: idleTrack.beat_grid_offset ?? undefined,
                })
              } catch {
                /* ignore */
              }
            }

            const halfBeat = (60 / Math.max(60, baseOutBpm)) * 0.5
            if (Math.abs(phaseErr) > halfBeat * 0.85) {
              largePhaseStreak += 1
              if (largePhaseStreak >= 8) {
                // Phase redefine would break the phrase — degrade to TempoSync mid-blend.
                holdPhaseLock = false
              }
            } else {
              largePhaseStreak = 0
            }

            // Residual seek only before the blend is audible.
            if (holdPhaseLock && raw < 0.02) {
              const seekDelta = clampResidualSeekSec({
                phaseErrSec: phaseErr,
                bpm: baseOutBpm,
                minAbsSec: 0.022,
                maxAbsSec: 0.06,
              })
              if (seekDelta != null) {
                try {
                  incoming.currentTime = Math.max(0, (incoming.currentTime || 0) - seekDelta)
                  phaseErr = 0
                } catch {
                  /* fall through to micro */
                }
              }
            }

            // Throttle micro-rate writes (~every 4 frames); ease off once tempo glides.
            if (holdPhaseLock && tempoGlide < 0.08 && tickFrame % 4 === 0) {
              const glideDamp = 1 - tempoGlide * 0.85
              const chase =
                Math.max(0, 1 - raw / 0.92) *
                glideDamp *
                (isSmoothCrossfade ? 0.72 : 1)
              const micro = microRateCorrection({
                phaseErrorSec: phaseErr,
                bpm: rates.masterBpm,
                strength: chase * microStrength * (isSmoothCrossfade ? 0.68 : 0.82),
              })
              microRateBias = microRateBias * 0.84 + micro * 0.16
              inRate = clampTempoRate(inRate * microRateBias)
              if (tempoPlan.dualMasterGlide) {
                outRateTarget = clampTempoRate(
                  (inRate * tempoPlan.inBaseBpm) / Math.max(1e-6, tempoPlan.outBaseBpm),
                )
              }
            } else if (tempoPlan.dualMasterGlide && holdPhaseLock && tempoGlide < 0.08) {
              inRate = clampTempoRate(inRate * microRateBias)
              outRateTarget = clampTempoRate(
                (inRate * tempoPlan.inBaseBpm) / Math.max(1e-6, tempoPlan.outBaseBpm),
              )
            }
          }
          const inGlide = tempoGlide > 0
          this.setDeckTempo(idleDeck, incoming, inRate, {
            instant: !inGlide,
            slew: inGlide ? Math.max(tempoSlew, 0.012) : undefined,
            onNotify: opts?.onDeckRate,
          })
          this.setDeckTempo(outDeck, outgoing, outRateTarget, {
            instant: !inGlide,
            slew: inGlide ? Math.max(tempoSlew, 0.012) : undefined,
            notify: opts?.onDeckRate != null,
            onNotify: opts?.onDeckRate,
          })
        } catch {
          this.setDeckTempo(idleDeck, incoming, clampTempoRate(inRate), {
            onNotify: opts?.onDeckRate,
          })
        }

        const fadeProgress = raw
        const eqProgress =
          plan.style === 'crossfade' ? raw : phraseQuantizedProgress(raw)
        let gains = styleMixGains(plan.style, fadeProgress, this.mixIntel ?? undefined)
        const softTailStart = this.mixIntel?.softTailStart ??
          (plan.style === 'cut' ? 0.86 : plan.style === 'filter-eq' ? 0.84 : 0.88)
        gains = applySoftTail(gains, fadeProgress, softTailStart)

        const incomingGain = activeAtStart === 'a' ? gains.b : gains.a
        const outgoingGain = activeAtStart === 'a' ? gains.a : gains.b
        const echoAmt = (this.mixIntel?.echoSend ?? 0) * (1 - outgoingGain)
        this.setEchoSend(outDeckId, echoAmt, echoDelaySec)

        const eqCurve = intelligentDeckMixAtProgress({
          progress: eqProgress,
          style: plan.style,
          outBias: this.deckEqBase[outDeckId],
          inBias: this.deckEqBase[inDeckId],
          intel: this.mixIntel ?? undefined,
        })
        const duck =
          plan.style === 'crossfade'
            ? 0
            : (this.mixIntel?.lowDuckDb ?? 0) * incomingGain
        eqCurve.outgoing = {
          ...eqCurve.outgoing,
          low: eqCurve.outgoing.low - duck,
        }
        this.applyDeckEq(outDeckId, eqCurve.outgoing, opts)
        this.applyDeckEq(inDeckId, eqCurve.incoming, opts)

        const outFilters = deckFiltersAtProgress({
          progress: eqProgress,
          style: plan.style,
          role: 'outgoing',
          intel: this.mixIntel ?? undefined,
        })
        const inFilters = deckFiltersAtProgress({
          progress: eqProgress,
          style: plan.style,
          role: 'incoming',
          intel: this.mixIntel ?? undefined,
        })
        this.applyDeckFilters(outDeckId, outFilters, opts)
        this.applyDeckFilters(inDeckId, inFilters, opts)

        quality.push({
          phaseErrSec: phaseErr,
          kickResidualMs:
            Math.abs(kickResidualMs) > 0.05
              ? kickResidualMs
              : transientPocketNudgeSec({
                  outgoingTimeSec: outgoing.currentTime || 0,
                  incomingTimeSec: incoming.currentTime || 0,
                  outgoingPeaks: activeTrack?.waveformPeaks,
                  incomingPeaks: idleTrack.waveformPeaks,
                  outgoingDurationSec: outDurSec,
                  incomingDurationSec: inDurSec,
                }) * 1000,
        })

        // Slightly longer tau late in the mix so handoff settles without zipper.
        const gainTau = raw >= 0.88 ? 0.032 : 0.018
        if (activeAtStart === 'a') this.applyDeckGains(gains.a, gains.b, { tau: gainTau })
        else this.applyDeckGains(gains.b, gains.a, { tau: gainTau })

        try {
          opts?.onProgress?.(raw)
        } catch {
          /* ignore */
        }

        if (raw >= 1) {
          finish()
          return
        }
        this.fadeRaf = requestAnimationFrame(tick)
      }
      this.fadeRaf = requestAnimationFrame(tick)
    })
  }

  stopMix() {
    this.clearFade()
    this.clearDeferredPause()
    this.clearHandoffSettle()
    this.setEchoSend(this.active, 0, 0.25)
    this.restoreIncomingStretch()
    if (this.dormantStretch) {
      const { deck, chain } = this.dormantStretch
      this.dormantStretch = null
      this.teardownStretchChain(deck, chain)
    }
    this.mixLock = false
    // Abort: silence idle channel but keep it running (mixer style)
    const idle = this.getIdleElement()
    if (this.active === 'a') this.applyDeckGains(1, 0, { tau: 0.03 })
    else this.applyDeckGains(0, 1, { tau: 0.03 })
    this.parkSilentDeck(idle)
    this.setStatus(this.getActiveTrack() ? 'playing' : 'idle')
  }

  dispose() {
    this.clearFade()
    this.clearDeferredPause()
    this.clearHandoffSettle()
    this.restoreIncomingStretch()
    if (this.dormantStretch) {
      const { deck, chain } = this.dormantStretch
      this.dormantStretch = null
      this.teardownStretchChain(deck, chain)
    }
    this.listeners.clear()
    try {
      this.gainA?.disconnect()
      this.gainB?.disconnect()
      this.sourceA?.disconnect()
      this.sourceB?.disconnect()
      this.sumNode?.disconnect()
      this.compressor?.disconnect()
      this.delayNode?.disconnect()
      this.delaySend?.disconnect()
      this.delayTap.a?.disconnect()
      this.delayTap.b?.disconnect()
    } catch {
      /* ignore */
    }
  }
}

function waitCanPlay(el: HTMLAudioElement, timeoutMs: number): Promise<void> {
  if (el.readyState >= 2) return Promise.resolve()
  return new Promise((resolve) => {
    const done = () => {
      el.removeEventListener('canplay', done)
      el.removeEventListener('loadeddata', done)
      resolve()
    }
    el.addEventListener('canplay', done)
    el.addEventListener('loadeddata', done)
    window.setTimeout(done, timeoutMs)
  })
}

function urlsRoughlyEqual(a: string, b: string): boolean {
  if (!a || !b) return false
  if (a === b) return true
  try {
    const ua = new URL(a, typeof window !== 'undefined' ? window.location.href : 'http://local')
    const ub = new URL(b, typeof window !== 'undefined' ? window.location.href : 'http://local')
    return ua.pathname === ub.pathname
  } catch {
    return a.includes(b) || b.includes(a)
  }
}
