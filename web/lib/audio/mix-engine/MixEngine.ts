/**
 * Dual-deck mix runtime — real DJ mixer model.
 *
 * Both decks stay "on". Channel faders (gains) do the work; we never pause
 * a deck at handoff. Pause only when loading a new track onto the idle deck.
 * Active deck is which channel drives the UI playhead — not a hard cutover.
 */

import {
  applySoftTail,
  equalPowerGains,
  intelligentDeckMixAtProgress,
  styleMixGains,
  type FilterMixEqGains,
} from './curves'
import { echoSendAtProgress, handoffSettleMs } from './blend-smooth'
import { deckFiltersAtProgress, type DeckFilterState } from './filters'
import { buildMixIntelligence, type MixIntelligence } from './mix-intelligence'
import { ALIGN_PHRASE_BARS } from './plan-from-dna'
import {
  applyVinylBendToDeckRates,
  beatPhaseErrorSec,
  filterPhaseErrorSec,
  gridAlignSeekDelta,
  phaseChaseStrength,
  settleVinylBend,
  smoothVinylBend,
  vinylBendTickInterval,
} from './sync'
import { solveAlignmentState } from './alignment'
import {
  createDriftAlignState,
  driftAlignRate,
  estimateDrift,
  fuseBlendError,
  pushDriftSample,
} from './drift-align'
import { resolveStretchPolicy } from './stretch-policy'
import type { DeckStretchChain } from './stretch-engine'
import { dualOnsetResidualNudgeSec, measureOnsetPocketResidual, transientPocketNudgeSec } from './transient-align'
import {
  resolveKickOnsetSec,
  resolveSnareClapOnsetSec,
  storedKickOnsetCount,
} from './kick-onsets'
import { isFourOnFloorPocket } from './mix-techniques'
import { createMixQualityAccumulator } from './mix-quality'
import { clampResidualSeekSec, exactOverlapDurationSec } from './phrase-mix-doctrine'
import { mediaUrlsRoughlyEqual } from '../media-src'
import {
  createIntegratedMediaClock,
  integrateMediaSec,
  sampleOverlapClock,
  snapshotIntegratedMedia,
} from './overlap-clock'
import {
  resolvePreAudibleNudge,
  measurePairPhaseErr,
  PRE_AUDIBLE_LOCK_SEC,
} from './pre-audible-nudge'
import {
  canEnter,
  canEnterFire,
  type BlendStage,
} from './blend-pipeline'
import { resolvePlaybackBpm } from '@/lib/audio/sonic-dna-mix'
import {
  applyDeckTempo,
  clampTempoRate,
  computeTempoCrossfadePlan,
  configureKeyLock,
  masterDeckRatesAt,
  TEMPO_RATE_WRITE_EPSILON,
} from './tempo'
import {
  incomingBufferMediaTime,
  nextSharedClockWhen,
  syncElementToSharedClock,
} from './shared-clock'
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
  private playheadRaf: number | null = null
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
  private pendingIncomingBuffer: AudioBuffer | null = null
  /** Last pre-arm nudge reported a lock — do not re-solve/restart at OUT. */
  private idlePreArmLocked = false
  private blendStage: BlendStage = 'idle'
  private pendingBlendPlan: MixPlan | null = null
  /** Last user XF (0 = all A, 1 = all B). Null = Auto DJ / live-only gains. */
  private lastManualXf: number | null = null
  /** When true, user owns deck gains even during Auto DJ mixLock. */
  private manualXfOverride = false
  private deckBuffer: Record<
    DeckId,
    {
      src: AudioBufferSourceNode | null
      buffer: AudioBuffer
      mediaSec: number
      rateAtCtx: number
      paused?: boolean
    } | null
  > = { a: null, b: null }

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

  /** Decode-ahead buffer for sample-accurate incoming start on the shared clock. */
  armIncomingBuffer(buffer: AudioBuffer | null) {
    this.pendingIncomingBuffer = buffer
  }

  hasBufferClock(deck?: DeckId): boolean {
    if (deck) return this.deckBuffer[deck] != null
    return this.deckBuffer[this.active] != null
  }

  /** Incoming BufferSource is armed or already running on the idle deck. */
  hasIncomingReady(): boolean {
    const idle: DeckId = this.active === 'a' ? 'b' : 'a'
    return this.deckBuffer[idle] != null || this.pendingIncomingBuffer != null
  }

  getBlendStage(): BlendStage {
    return this.blendStage
  }

  private tryEnterStage(next: BlendStage): boolean {
    if (this.blendStage === next) return true
    if (!canEnter(this.blendStage, next)) return false
    this.blendStage = next
    return true
  }

  /** Force idle on abort / dispose. */
  private resetBlendStage() {
    this.blendStage = 'idle'
    this.pendingBlendPlan = null
    this.idlePreArmLocked = false
  }

  enterPlan(plan?: MixPlan | null): boolean {
    if (this.blendStage === 'overlap' || this.blendStage === 'fire') return false
    if (this.blendStage === 'preArm') {
      if (plan) this.pendingBlendPlan = plan
      return true
    }
    if (this.blendStage === 'handoff' && !this.tryEnterStage('plan')) return false
    if (this.blendStage === 'idle' && !this.tryEnterStage('plan')) return false
    if (plan) this.pendingBlendPlan = plan
    return this.blendStage === 'plan'
  }

  async enterPreArm(
    plan: MixPlan,
    incoming: MixTrackRef,
    url: string,
    rate?: number,
  ): Promise<boolean> {
    if (this.mixLock || this.blendStage === 'overlap' || this.blendStage === 'fire') {
      return false
    }
    if (this.blendStage === 'handoff' && !this.tryEnterStage('plan')) return false
    if (this.blendStage === 'idle' && !this.tryEnterStage('plan')) return false
    if (this.blendStage !== 'preArm' && !this.tryEnterStage('preArm')) return false
    this.pendingBlendPlan = plan
    const loadCue =
      typeof plan.resolvedIncomingSec === 'number' && Number.isFinite(plan.resolvedIncomingSec)
        ? plan.resolvedIncomingSec
        : plan.incomingStartSec
    await this.loadIdle(incoming, url, loadCue, rate)
    return this.blendStage === 'preArm'
  }

  canEnterFire(): boolean {
    return canEnterFire(this.blendStage, {
      hasIncomingReady: this.hasIncomingReady(),
      preArmLocked: this.idlePreArmLocked,
    }).ok
  }

  async enterFire(
    plan?: MixPlan,
    incomingRate?: number,
    opts?: StartTransitionOptions,
  ): Promise<boolean> {
    const use = plan ?? this.pendingBlendPlan
    if (!use) return false
    const gate = canEnterFire(this.blendStage, {
      hasIncomingReady: this.hasIncomingReady(),
      preArmLocked: this.idlePreArmLocked,
    })
    if (!gate.ok) return false
    if (!this.tryEnterStage('fire')) return false
    this.pendingBlendPlan = use
    return this.startTransition(use, incomingRate ?? use.rateRatio, opts)
  }

  getActiveMediaTime(): number {
    return this.getDeckMediaTime(this.active)
  }

  getDeckMediaTime(deck?: DeckId): number {
    const d = deck ?? this.active
    return this.deckMediaTime(d, d === 'a' ? this.deckA : this.deckB)
  }

  getDeckDuration(deck?: DeckId): number {
    const d = deck ?? this.active
    const slot = this.deckBuffer[d]
    if (slot) return slot.buffer.duration
    const el = d === 'a' ? this.deckA : this.deckB
    return Number.isFinite(el.duration) && el.duration > 0 ? el.duration : 0
  }

  stampActiveElementTime() {
    this.stampDeckElement(this.active)
  }

  seekActiveMedia(sec: number) {
    this.seekDeckMedia(this.active, sec)
  }

  seekDeckMedia(deck: DeckId, sec: number) {
    const el = deck === 'a' ? this.deckA : this.deckB
    const t = Math.max(0, sec)
    const slot = this.deckBuffer[deck]
    if (slot) {
      this.startDeckBuffer(deck, el, slot.buffer, t, this.deckRates[deck])
      this.stampDeckElement(deck)
      return
    }
    try {
      el.currentTime = t
    } catch {
      /* ignore */
    }
  }

  private deckMediaTime(deck: DeckId, el: HTMLAudioElement): number {
    const slot = this.deckBuffer[deck]
    if (slot?.paused || (slot && !slot.src)) return slot.mediaSec
    if (slot && this.ctx) {
      return incomingBufferMediaTime({
        cueSec: slot.mediaSec,
        startCtx: slot.rateAtCtx,
        nowCtx: this.ctx.currentTime,
        rate: this.deckRates[deck],
      })
    }
    return el.currentTime || 0
  }

  private snapshotDeckBufferMedia(deck: DeckId) {
    const slot = this.deckBuffer[deck]
    if (!slot || slot.paused || !slot.src || !this.ctx) return
    slot.mediaSec = incomingBufferMediaTime({
      cueSec: slot.mediaSec,
      startCtx: slot.rateAtCtx,
      nowCtx: this.ctx.currentTime,
      rate: this.deckRates[deck],
    })
    slot.rateAtCtx = this.ctx.currentTime
  }

  private stampDeckElement(deck: DeckId) {
    const el = deck === 'a' ? this.deckA : this.deckB
    if (!this.deckBuffer[deck]) return
    try {
      el.currentTime = this.deckMediaTime(deck, el)
    } catch {
      /* ignore */
    }
  }

  private startPlayheadStamp() {
    if (this.playheadRaf != null) return
    const tick = () => {
      if (!this.deckBuffer[this.active]) {
        this.playheadRaf = null
        return
      }
      this.stampDeckElement(this.active)
      this.playheadRaf = requestAnimationFrame(tick)
    }
    this.playheadRaf = requestAnimationFrame(tick)
  }

  private stopPlayheadStamp() {
    if (this.playheadRaf != null) {
      cancelAnimationFrame(this.playheadRaf)
      this.playheadRaf = null
    }
  }

  private stopDeckBuffer(deck: DeckId) {
    const slot = this.deckBuffer[deck]
    if (!slot) return
    if (deck === this.active) this.stopPlayheadStamp()
    if (slot.src) {
      try {
        slot.src.onended = null
      } catch {
        /* ignore */
      }
      try {
        slot.src.stop()
      } catch {
        /* ignore */
      }
      try {
        slot.src.disconnect()
      } catch {
        /* ignore */
      }
    }
    this.deckBuffer[deck] = null
  }

  private startDeckBuffer(
    deck: DeckId,
    el: HTMLAudioElement,
    buffer: AudioBuffer,
    cue: number,
    rate: number,
  ): boolean {
    const ctx = this.ctx
    const hpf = deck === 'a' ? this.hpfA : this.hpfB
    if (!ctx || !hpf || cue >= buffer.duration) return false
    this.stopDeckBuffer(deck)
    try {
      el.pause()
    } catch {
      /* ignore */
    }
    const src = ctx.createBufferSource()
    src.buffer = buffer
    src.playbackRate.value = rate
    src.connect(hpf)
    const when = nextSharedClockWhen(ctx)
    try {
      src.start(when, Math.max(0, cue))
    } catch {
      try {
        src.disconnect()
      } catch {
        /* ignore */
      }
      return false
    }
    this.deckBuffer[deck] = {
      src,
      buffer,
      mediaSec: cue,
      rateAtCtx: when,
      paused: false,
    }
    src.onended = () => {
      if (this.deckBuffer[deck]?.src === src) this.deckBuffer[deck] = null
    }
    return true
  }

  private startIncomingBuffer(
    deck: DeckId,
    incoming: HTMLAudioElement,
    cue: number,
    rate: number,
  ): boolean {
    const existing = this.deckBuffer[deck]
    if (existing) {
      const t = this.deckMediaTime(deck, incoming)
      if (Math.abs(t - cue) <= PRE_AUDIBLE_LOCK_SEC) return true
      return this.startDeckBuffer(deck, incoming, existing.buffer, cue, rate)
    }
    const buffer = this.pendingIncomingBuffer
    if (!buffer) return false
    return this.startDeckBuffer(deck, incoming, buffer, cue, rate)
  }

  /** Pause the live BufferSource without swapping back to HTMLAudio. */
  pauseActiveClock(): boolean {
    const deck = this.active
    const slot = this.deckBuffer[deck]
    if (!slot || slot.paused) return !!slot
    this.snapshotDeckBufferMedia(deck)
    this.stampDeckElement(deck)
    this.stopPlayheadStamp()
    if (slot.src) {
      try {
        slot.src.onended = null
      } catch {
        /* ignore */
      }
      try {
        slot.src.stop()
      } catch {
        /* ignore */
      }
      try {
        slot.src.disconnect()
      } catch {
        /* ignore */
      }
    }
    slot.src = null
    slot.paused = true
    return true
  }

  /** Resume a paused BufferSource on the same shared clock. */
  resumeActiveClock(): boolean {
    const deck = this.active
    const slot = this.deckBuffer[deck]
    if (!slot) return false
    if (!slot.paused && slot.src) {
      this.startPlayheadStamp()
      return true
    }
    const el = this.getActiveElement()
    const ok = this.startDeckBuffer(deck, el, slot.buffer, slot.mediaSec, this.deckRates[deck])
    if (ok) this.startPlayheadStamp()
    return ok
  }

  private disposeIncomingBuffer(opts?: { resumeElement?: HTMLAudioElement; deck?: DeckId }) {
    const deck = opts?.deck
    if (deck) {
      const media = this.deckMediaTime(deck, deck === 'a' ? this.deckA : this.deckB)
      this.stopDeckBuffer(deck)
      const el = opts?.resumeElement
      if (el) {
        try {
          el.currentTime = Math.max(0, media)
        } catch {
          /* ignore */
        }
      }
      return
    }
    this.stopDeckBuffer('a')
    this.stopDeckBuffer('b')
  }

  private incomingMediaTime(el: HTMLAudioElement): number {
    const deck: DeckId = el === this.deckA ? 'a' : 'b'
    return this.deckMediaTime(deck, el)
  }

  /**
   * Audition incoming at beatmatch for N bars, then park silent.
   * Does not start a full mix.
   */
  async previewIncoming(opts?: { bars?: number; rate?: number }): Promise<boolean> {
    if (this.mixLock) return false
    const incoming = this.getIdleElement()
    const idleDeck: DeckId = this.active === 'a' ? 'b' : 'a'
    const idleTrack = this.getIdleTrack()
    if (!idleTrack || incoming.readyState < 2) return false
    const bpm =
      resolvePlaybackBpm(idleTrack, idleTrack.bpm) ??
      (typeof idleTrack.bpm === 'number' && idleTrack.bpm > 0 ? idleTrack.bpm : 120)
    const bars = opts?.bars && opts.bars > 0 ? opts.bars : 4
    const durMs = ((60 / Math.max(60, bpm)) * 4 * bars) * 1000
    const cue = Math.max(0, incoming.currentTime || 0)
    if (typeof opts?.rate === 'number' && opts.rate > 0) {
      this.setDeckTempo(idleDeck, incoming, opts.rate, { instant: true, notify: false })
    }
    if (this.active === 'a') this.applyDeckGains(0.88, 0.32, { tau: 0.03 })
    else this.applyDeckGains(0.32, 0.88, { tau: 0.03 })
    try {
      if (incoming.paused) await incoming.play()
    } catch {
      return false
    }
    await new Promise((r) => setTimeout(r, Math.min(durMs, 16000)))
    if (this.mixLock) return true
    if (this.active === 'a') this.applyDeckGains(1, 0, { tau: 0.04 })
    else this.applyDeckGains(0, 1, { tau: 0.04 })
    try {
      incoming.pause()
      incoming.currentTime = cue
    } catch {
      /* ignore */
    }
    return true
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
    this.snapshotDeckBufferMedia(deck)
    this.deckRates[deck] = applied
    const slot = this.deckBuffer[deck]
    if (slot?.src) {
      try {
        slot.src.playbackRate.value = applied
      } catch {
        /* ignore */
      }
    }
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

  /**
   * Point the engine at a deck. The live song stays where it is unless
   * `force` is set (true cold start / user picked a new track).
   */
  setActiveDeck(deck: DeckId, opts?: { force?: boolean }) {
    if (this.active === deck) return
    if (!opts?.force) {
      if (this.mixLock || this.handoffSettling || this.status === 'mixing') return
      // Any on-air track stays on its deck, including during idle precue
      // (`loadIdle` briefly sets status to `loading`).
      if (this.getActiveTrack()) return
    }
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
      const instant = this.handoffSettling
      if (this.lastManualXf != null) {
        const { a, b } = equalPowerGains(this.lastManualXf)
        this.applyDeckGains(a, b, instant ? { instant: true } : undefined)
        return
      }
      // Scale both channel faders without resetting crossfader position:
      // active channel full, silent channel stays at 0 (both decks still "on")
      this.applyDeckGains(
        this.active === 'a' ? 1 : 0,
        this.active === 'b' ? 1 : 0,
        instant ? { instant: true } : undefined,
      )
    }
  }

  /**
   * Manual crossfader. 0 = all A, 1 = all B (equal-power).
   * Blocked during Auto DJ blend unless {@link setManualXfOverride} is on.
   */
  setManualCrossfade(progress: number, opts?: { instant?: boolean }) {
    if (this.mixLock && !this.manualXfOverride) return
    const p = Math.max(0, Math.min(1, progress))
    this.lastManualXf = p
    const { a, b } = equalPowerGains(p)
    this.applyDeckGains(a, b, { instant: opts?.instant !== false, tau: 0.018 })
  }

  /**
   * Let the user drive XF while Auto DJ keeps tempo/EQ/handoff.
   * Blend ticks skip automated channel gains when override is on.
   */
  setManualXfOverride(enabled: boolean) {
    this.manualXfOverride = enabled
    if (!enabled && this.lastManualXf != null && !this.mixLock) {
      this.lastManualXf = null
    }
  }

  isManualXfOverride(): boolean {
    return this.manualXfOverride
  }

  /** Leave manual XF — restore live-only gains when not blending. */
  clearManualCrossfade() {
    this.lastManualXf = null
    this.manualXfOverride = false
    if (this.mixLock) return
    this.applyDeckGains(this.active === 'a' ? 1 : 0, this.active === 'b' ? 1 : 0, {
      instant: true,
    })
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
    // Must validate nodes BEFORE disconnect — otherwise MES has no sink and stalls.
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

  /**
   * Re-wire MediaElementSources after a broken graph (orphan gain / AC glitch).
   * Safe to call from a playback freeze watchdog.
   */
  forceReconnectMediaSources(): boolean {
    const ctx = this.ctx
    if (!ctx) return false
    this.deckChainAttached.a = false
    this.deckChainAttached.b = false
    let ok = false
    if (this.sourceA && this.gainA) {
      this.connectDeckChain(this.sourceA, 'a', this.gainA, ctx)
      ok = this.deckChainAttached.a || ok
    }
    if (this.sourceB && this.gainB) {
      this.connectDeckChain(this.sourceB, 'b', this.gainB, ctx)
      ok = this.deckChainAttached.b || ok
    }
    if (this.externalGainA) {
      ok = this.rewireExternalGainToBus() || ok
    }
    // Ensure active deck is audible after reconnect.
    if (this.active === 'a') this.applyDeckGains(1, 0, { instant: true })
    else this.applyDeckGains(0, 1, { instant: true })
    return ok
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
    const idleDeck: DeckId = this.active === 'a' ? 'b' : 'a'
    const cue = Math.max(0, cueSec)
    this.silenceIdle({ instant: true })
    if (typeof rate === 'number' && rate > 0) this.lockIdleTempo(rate)
    const slot = this.deckBuffer[idleDeck]
    if (slot) {
      const t = this.deckMediaTime(idleDeck, el)
      if (Math.abs(t - cue) > 0.35) {
        this.startDeckBuffer(idleDeck, el, slot.buffer, cue, this.deckRates[idleDeck])
      }
      return
    }
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
    const idleDeck: DeckId = this.active === 'a' ? 'b' : 'a'
    this.silenceIdle({ instant: true })
    if (typeof rate === 'number' && rate > 0) this.lockIdleTempo(rate)
    const cue = this.deckMediaTime(idleDeck, el)
    if (this.pendingIncomingBuffer && this.ctx && !this.deckBuffer[idleDeck]) {
      this.startDeckBuffer(
        idleDeck,
        el,
        this.pendingIncomingBuffer,
        cue,
        this.deckRates[idleDeck],
      )
      return
    }
    if (this.deckBuffer[idleDeck]) return
    try {
      if (el.paused) void el.play().catch(() => {})
    } catch {
      /* mix start will retry */
    }
  }

  /**
   * Nudge the silent incoming deck onto the live master phase.
   * Call every Auto DJ tick after warmIdle — never parkIdleAtCue after this
   * (park pauses and throws the lock away).
   */
  nudgeIdleToMaster(params: {
    outgoingTimeSec: number
    outgoingBpm: number
    outgoingOffsetSec?: number | null
    incomingBpm: number
    incomingOffsetSec?: number | null
    incomingRate?: number
    /** Prefer lattice snap matching the phase-meter window. */
    gridAlign?: 'beat' | 'bar' | 'phrase'
    gridPhraseBars?: number
    beatsPerBar?: number
  }): { phaseErrSec: number; locked: boolean } {
    if (this.mixLock) return { phaseErrSec: 0, locked: false }
    const incoming = this.getIdleElement()
    const idleDeck: DeckId = this.active === 'a' ? 'b' : 'a'
    this.silenceIdle({ instant: true })
    if (typeof params.incomingRate === 'number' && params.incomingRate > 0) {
      this.lockIdleTempo(params.incomingRate)
    }
    if (this.pendingIncomingBuffer && this.ctx && !this.deckBuffer[idleDeck]) {
      this.startDeckBuffer(
        idleDeck,
        incoming,
        this.pendingIncomingBuffer,
        this.incomingMediaTime(incoming),
        this.deckRates[idleDeck],
      )
    }
    if (!this.deckBuffer[idleDeck] && incoming.paused) {
      try {
        void incoming.play().catch(() => {})
      } catch {
        /* autoplay */
      }
    }
    const inT = this.incomingMediaTime(incoming)
    const phaseErrSec = measurePairPhaseErr({
      outgoingTimeSec: params.outgoingTimeSec,
      outgoingBpm: params.outgoingBpm,
      outgoingOffsetSec: params.outgoingOffsetSec,
      incomingTimeSec: inT,
      incomingBpm: params.incomingBpm,
      incomingOffsetSec: params.incomingOffsetSec,
    })

    // Phase-meter lattice: snap idle onto outgoing beat / bar / phrase before vinyl chase.
    if (params.gridAlign) {
      const gridDelta = gridAlignSeekDelta({
        outgoingTimeSec: params.outgoingTimeSec,
        outgoingBpm: params.outgoingBpm,
        outgoingOffsetSec: params.outgoingOffsetSec ?? undefined,
        incomingTimeSec: inT,
        incomingBpm: params.incomingBpm,
        incomingOffsetSec: params.incomingOffsetSec ?? undefined,
        grid: params.gridAlign,
        phraseBars: params.gridPhraseBars,
        beatsPerBar: params.beatsPerBar,
      })
      if (Math.abs(gridDelta) > PRE_AUDIBLE_LOCK_SEC) {
        const nextSec = Math.max(0, inT - gridDelta)
        const slot = this.deckBuffer[idleDeck]
        if (slot) {
          this.startDeckBuffer(idleDeck, incoming, slot.buffer, nextSec, this.deckRates[idleDeck])
        } else {
          try {
            incoming.currentTime = nextSec
          } catch {
            /* ignore */
          }
        }
        this.idlePreArmLocked = true
        return { phaseErrSec: 0, locked: true }
      }
    }

    const nudge = resolvePreAudibleNudge({
      phaseErrSec,
      bpm: params.outgoingBpm,
      silent: true,
    })
    if (nudge.seekDeltaSec != null) {
      const nextSec = Math.max(0, inT - nudge.seekDeltaSec)
      const slot = this.deckBuffer[idleDeck]
      if (slot) {
        this.startDeckBuffer(idleDeck, incoming, slot.buffer, nextSec, this.deckRates[idleDeck])
      } else {
        try {
          incoming.currentTime = nextSec
        } catch {
          /* ignore */
        }
      }
      this.idlePreArmLocked = true
      return { phaseErrSec: 0, locked: true }
    }
    if (nudge.bendMultiplier !== 1) {
      const base =
        typeof params.incomingRate === 'number' && params.incomingRate > 0
          ? params.incomingRate
          : this.deckRates[idleDeck]
      this.setDeckTempo(idleDeck, incoming, base * nudge.bendMultiplier, {
        instant: true,
        notify: false,
      })
    }
    this.idlePreArmLocked = nudge.locked
    return { phaseErrSec: nudge.phaseErrSec, locked: nudge.locked }
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
    const opts = settled ? { tau: 0.028 } : { tau: 0.045 }
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
    this.idlePreArmLocked = false
    const idleId: DeckId = this.active === 'a' ? 'b' : 'a'
    // Never load the on-air song onto the other deck — that pause/reload glitch.
    if (this.getActiveTrack()?.id === track.id) return
    const el = this.getIdleElement()
    this.pendingIncomingBuffer = null
    this.stopDeckBuffer(idleId)
    // Idle deck is silent — safe to tear down leftover stretch from prior mix.
    this.disposeStretchIfDeck(idleId)
    const needsReload = !mediaUrlsRoughlyEqual(el.currentSrc || el.src, url)
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
    this.stopPlayheadStamp()
    this.stopDeckBuffer(this.active)
    const el = this.getActiveElement()
    this.setStatus('loading')
    if (!mediaUrlsRoughlyEqual(el.currentSrc || el.src, url)) {
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
    this.enterPlan(plan)
    if (needLoad) {
      await this.enterPreArm(plan, incoming, url, tempoPlan.mixStartRate)
    } else {
      // Already cued — do not park/pause. That throws away the pre-audible lock.
      // Snap only when unlocked and the playhead is outside the 8ms lock window.
      const el = this.getIdleElement()
      const idleDeck: DeckId = this.active === 'a' ? 'b' : 'a'
      const targetCue =
        typeof plan.resolvedIncomingSec === 'number' && Number.isFinite(plan.resolvedIncomingSec)
          ? plan.resolvedIncomingSec
          : plan.incomingStartSec
      this.silenceIdle({ instant: true })
      this.lockIdleTempo(tempoPlan.mixStartRate)
      const nowT = this.deckMediaTime(idleDeck, el)
      if (!this.idlePreArmLocked && Math.abs(nowT - targetCue) > PRE_AUDIBLE_LOCK_SEC) {
        const slot = this.deckBuffer[idleDeck]
        if (slot) {
          this.startDeckBuffer(idleDeck, el, slot.buffer, Math.max(0, targetCue), tempoPlan.mixStartRate)
        } else {
          try {
            el.currentTime = Math.max(0, targetCue)
          } catch {
            /* ignore */
          }
        }
      }
      if (this.blendStage === 'plan' || this.blendStage === 'idle') {
        this.tryEnterStage('preArm')
      }
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
    if (this.blendStage !== 'fire' && this.blendStage !== 'overlap') {
      if (!this.tryEnterStage('fire')) return false
    }
    const outgoing = this.getActiveElement()
    const incoming = this.getIdleElement()
    const idleTrack = this.getIdleTrack()
    const activeTrack = this.getActiveTrack()
    if (!idleTrack || idleTrack.id !== plan.incomingTrackId) {
      this.emit({ type: 'error', message: 'Idle deck is not cued with incoming track' })
      this.tryEnterStage('idle')
      return false
    }

    this.mixLock = true
    if (!this.manualXfOverride) this.lastManualXf = null
    this.tryEnterStage('overlap')
    this.clearFade()
    this.setStatus('mixing')
    this.emit({ type: 'mix-started', plan })

    const outDeckEarly: DeckId = this.active
    const remain =
      this.getDeckDuration(outDeckEarly) - this.getDeckMediaTime(outDeckEarly)
    // Slightly longer floor for Smooth so the soft-tail has room
    const minMix = plan.style === 'cut' ? 0.55 : 1.1
    const doctrineExact =
      plan.exactOverlap === true ||
      (plan.blendFromOut !== false &&
        plan.style === 'crossfade' &&
        plan.phrase1Lock !== false)
    const mixSec = doctrineExact
      ? exactOverlapDurationSec(plan.mixDurationSec)
      : Math.max(minMix, Math.min(plan.mixDurationSec, Math.max(minMix, remain - 0.2), 48))

    if (opts?.keyLock === false) this.setKeyLock(false)
    else if (opts?.keyLock === true) this.setKeyLock(true)

    const outDeck: DeckId = this.active
    const idleDeck: DeckId = this.active === 'a' ? 'b' : 'a'
    const outLiveRate = clampTempoRate(
      this.deckBuffer[outDeck]
        ? this.deckRates[outDeck]
        : Number.isFinite(outgoing.playbackRate) && outgoing.playbackRate > 0
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
    // Cut still slaps on frame 0. Smooth keeps a small incoming delay so
    // mids don't talk over the outgoing downbeat.
    if (plan.blendFromOut !== false && this.mixIntel && plan.style === 'cut') {
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
      const alreadyOnBuffer = this.deckBuffer[idleDeck] != null
      const mediaNow = this.incomingMediaTime(incoming)
      if (alreadyOnBuffer && this.idlePreArmLocked) {
        // Pre-arm already locked to the live master. Re-solving here would
        // rewrite the cue and restart the buffer — late/early incoming.
        cue = mediaNow
        plan.resolvedIncomingSec = cue
      } else if (
        typeof outBpm === 'number' &&
        outBpm > 0 &&
        typeof inBpm === 'number' &&
        inBpm > 0
      ) {
        // Media-time phase: use base BPM only (never bpm × playbackRate).
        const align = solveAlignmentState({
          plannedIncomingSec: plannedCue,
          outgoingTimeSec: this.getDeckMediaTime(outDeck),
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
      this.idlePreArmLocked = false
      if (!alreadyOnBuffer) {
        try {
          // Only snap if we are not already on the parked cue — mid-intro seeks
          // sound like a restart instead of a blend.
          if (Math.abs(mediaNow - cue) > 0.04) {
            incoming.currentTime = cue
          }
        } catch {
          /* ignore */
        }
      }
      // Silence incoming before play to avoid a start click
      if (this.active === 'a') this.applyDeckGains(1, 0, { tau: 0.012 })
      else this.applyDeckGains(0, 1, { tau: 0.012 })
      const ctx = this.ctx ?? opts?.audioContext ?? null
      if (ctx && !this.ctx) this.ctx = ctx
      const startedOnBuffer = this.startIncomingBuffer(idleDeck, incoming, cue, mixStartRate)
      if (!startedOnBuffer) {
        if (ctx) {
          await syncElementToSharedClock({
            element: incoming,
            cueSec: cue,
            ctx,
            rate: mixStartRate,
          })
        } else if (incoming.paused) {
          await incoming.play()
          if (incoming.paused) {
            await incoming.play().catch(() => {})
          }
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
      this.resetBlendStage()
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
    const allowVinylBend = plan.vinylBend !== false
    const allowKickCorrect = plan.kickCorrect !== false
    const gridAlign =
      plan.gridAlign === 'beat' || plan.gridAlign === 'bar' || plan.gridAlign === 'phrase'
        ? plan.gridAlign
        : null
    let largePhaseStreak = 0
    let prevAbsPhaseErr = 0
    let filteredPhaseErr = 0
    let phaseFilterPrimed = false
    let tickFrame = 0
    /** Smoothed incoming-only vinyl bend — never copied onto the master deck. */
    let microRateBias = 1
    const driftAlign = createDriftAlignState()

    const ctxClock = this.ctx
    const mixStartCtx = ctxClock?.currentTime ?? null
    const started = performance.now()
    const outStartMedia = this.getDeckMediaTime(outDeck)
    const phraseLoopSec = (60 / Math.max(60, baseOutBpm)) * 4 * 8
    const overlapBars = Math.max(2, plan.overlapBars || 8)
    let outClock = createIntegratedMediaClock(
      outStartMedia,
      mixStartCtx ?? 0,
      outLiveRate,
    )
    let lastCtxSec: number | null = mixStartCtx

    return await new Promise<boolean>((resolve) => {
      const finish = () => {
        this.fadeRaf = null
        // Keep the incoming BufferSource running — swapping back to HTMLAudio
        // is the mix-end stop. Stamp the paused element for the playhead only.
        this.stampDeckElement(idleDeck)
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
        this.tryEnterStage('handoff')
        this.setStatus('playing')
        this.startPlayheadStamp()
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
          this.tryEnterStage('idle')
          resolve(true)
        }, handoffSettleMs(syncBpm))
      }

      const readOutgoingMedia = () => {
        if (this.deckBuffer[outDeck] && ctxClock) {
          return this.getDeckMediaTime(outDeck)
        }
        // Mix lattice = ctx integral only. HTMLAudio currentTime jitter was
        // smearing bar-aligned fades / EQ even when phase chase was tight.
        if (ctxClock && outClock.rateAtCtx > 0) {
          return integrateMediaSec(outClock, ctxClock.currentTime)
        }
        return this.getDeckMediaTime(outDeck)
      }

      const tick = (now: number) => {
        const outNow = readOutgoingMedia()
        let mediaElapsed = outNow - outStartMedia
        // First frames / test harness: HTMLAudio may not have moved yet.
        // Use ctx or wall time so the lattice still advances.
        if (mediaElapsed < 0.015) {
          if (mixStartCtx != null && ctxClock) {
            mediaElapsed = Math.max(
              mediaElapsed,
              (ctxClock.currentTime - mixStartCtx) * Math.max(0.5, outClock.rate),
            )
          } else {
            mediaElapsed = Math.max(mediaElapsed, (now - started) / 1000)
          }
        }
        const overlap = sampleOverlapClock({
          mediaElapsedSec: mediaElapsed,
          bpm: baseOutBpm,
          mixSec,
          overlapBars,
        })
        const raw = overlap.raw
        const fadeProgress = overlap.fade
        const eqProgress = overlap.eq
        const tempoProgress = overlap.tempo

        if (plan.needsOutroLoop) {
          const dur = this.getDeckDuration(outDeck)
          if (dur > phraseLoopSec + 0.5 && dur - outNow < 0.22) {
            this.seekDeckMedia(outDeck, Math.max(0, outNow - phraseLoopSec))
            outClock = createIntegratedMediaClock(
              this.getDeckMediaTime(outDeck),
              ctxClock?.currentTime ?? outClock.rateAtCtx,
              outClock.rate,
            )
          }
        }

        // Shared master clock: both decks stay beatmatched while gliding to incoming native.
        tickFrame += 1
        const rates = masterDeckRatesAt(tempoPlan, tempoProgress)
        let inRate = rates.inRate
        let outRateTarget = rates.outRate
        // Hold BeatSync through the whole overlap; TempoSync unlocks at the glide.
        const inLockPhase = holdPhaseLock
          ? raw < 0.999
          : raw < Math.min(0.55, tempoPlan.glideStart)
        let phaseErr = 0
        let kickResidualMs = 0
        try {
          if (inLockPhase) {
            const outT = outNow
            const inT = this.incomingMediaTime(incoming)
            phaseErr = beatPhaseErrorSec({
              outgoingTimeSec: outT,
              outgoingBpm: baseOutBpm,
              outgoingOffsetSec: activeTrack?.beat_grid_offset ?? undefined,
              incomingTimeSec: inT,
              incomingBpm: baseInBpm,
              incomingOffsetSec: idleTrack.beat_grid_offset ?? undefined,
            })

            // Kick + snare/clap pocket residual — micro seek before rate chase.
            const onsetPocket = allowKickCorrect
              ? measureOnsetPocketResidual({
                  outgoingTimeSec: outT,
                  incomingTimeSec: inT,
                  outgoingKickOnsets: outKickOnsets,
                  incomingKickOnsets: inKickOnsets,
                  outgoingSnareOnsets: outSnareOnsets,
                  incomingSnareOnsets: inSnareOnsets,
                })
              : { kickSec: null as number | null, clapSec: null as number | null }
            const onsetNudge = allowKickCorrect
              ? dualOnsetResidualNudgeSec({
                  outgoingTimeSec: outT,
                  incomingTimeSec: inT,
                  outgoingKickOnsets: outKickOnsets,
                  incomingKickOnsets: inKickOnsets,
                  outgoingSnareOnsets: outSnareOnsets,
                  incomingSnareOnsets: inSnareOnsets,
                  snareWeight: bothFoF ? 0.42 : 0.18,
                  maxAbsSec: 0.018,
                })
              : 0
            const pocketLead =
              Math.abs(onsetPocket.kickSec ?? 0) >= Math.abs(onsetPocket.clapSec ?? 0)
                ? onsetPocket.kickSec
                : onsetPocket.clapSec
            kickResidualMs = (pocketLead ?? onsetNudge) * 1000
            // Pre-arm already locked phase. Mid-mix seeks click — micro-rate only
            // after the blend is audible.
            if (
              allowKickCorrect &&
              raw < 0.02 &&
              Math.abs(pocketLead ?? onsetNudge) > 0.004 &&
              !this.deckBuffer[idleDeck]
            ) {
              try {
                incoming.currentTime = Math.max(0, inT + (pocketLead ?? onsetNudge))
                phaseErr = beatPhaseErrorSec({
                  outgoingTimeSec: outT,
                  outgoingBpm: baseOutBpm,
                  outgoingOffsetSec: activeTrack?.beat_grid_offset ?? undefined,
                  incomingTimeSec: this.incomingMediaTime(incoming),
                  incomingBpm: baseInBpm,
                  incomingOffsetSec: idleTrack.beat_grid_offset ?? undefined,
                })
              } catch {
                /* ignore */
              }
            }

            const halfBeat = (60 / Math.max(60, baseOutBpm)) * 0.5
            const absErr = Math.abs(phaseErr)
            if (absErr > halfBeat * 0.85) {
              largePhaseStreak += 1
              const closing = absErr < prevAbsPhaseErr - 0.0004
              // ~600ms of unrecoverable half-beat error → TempoSync. Keep chasing if closing.
              if (!closing && largePhaseStreak >= 36) {
                holdPhaseLock = false
              }
            } else {
              largePhaseStreak = 0
            }
            prevAbsPhaseErr = absErr

            // Grid modes: seek-snap incoming onto the outgoing lattice.
            // HTMLAudio only before the blend is loud; buffer sources can snap later.
            if (holdPhaseLock && gridAlign) {
              const phraseBarsForGrid =
                typeof plan.gridPhraseBars === 'number' && plan.gridPhraseBars > 0
                  ? plan.gridPhraseBars
                  : 8
              const gridDelta = gridAlignSeekDelta({
                outgoingTimeSec: outT,
                outgoingBpm: baseOutBpm,
                outgoingOffsetSec: activeTrack?.beat_grid_offset ?? undefined,
                incomingTimeSec: this.incomingMediaTime(incoming),
                incomingBpm: baseInBpm,
                incomingOffsetSec: idleTrack.beat_grid_offset ?? undefined,
                grid: gridAlign,
                phraseBars: phraseBarsForGrid,
              })
              const absGrid = Math.abs(gridDelta)
              const beatSecGrid = 60 / Math.max(60, baseOutBpm)
              const canGridSeek = raw < 0.08 || this.deckBuffer[idleDeck] != null
              const everyGrid = absGrid > 0.02 ? 4 : 16
              const maxBeats =
                gridAlign === 'phrase'
                  ? phraseBarsForGrid * 4
                  : gridAlign === 'bar'
                    ? 4
                    : 1
              if (
                canGridSeek &&
                tickFrame % everyGrid === 0 &&
                absGrid > 0.008 &&
                absGrid < beatSecGrid * maxBeats
              ) {
                const nextSec = Math.max(0, this.incomingMediaTime(incoming) - gridDelta)
                const slot = this.deckBuffer[idleDeck]
                if (slot) {
                  this.startDeckBuffer(idleDeck, incoming, slot.buffer, nextSec, this.deckRates[idleDeck])
                  phaseErr = 0
                } else {
                  try {
                    incoming.currentTime = nextSec
                    phaseErr = 0
                  } catch {
                    /* fall through */
                  }
                }
              }
            }

            // Residual seek only before the blend is audible.
            if (holdPhaseLock && allowVinylBend && raw < 0.02) {
              const silentNudge = resolvePreAudibleNudge({
                phaseErrSec: phaseErr,
                bpm: baseOutBpm,
                silent: true,
              })
              const seekDelta = silentNudge.seekDeltaSec
                ?? clampResidualSeekSec({
                    phaseErrSec: phaseErr,
                    bpm: baseOutBpm,
                    minAbsSec: 0.022,
                    maxAbsSec: 0.06,
                  })
              if (seekDelta != null) {
                const nextSec = Math.max(0, this.incomingMediaTime(incoming) - seekDelta)
                const slot = this.deckBuffer[idleDeck]
                if (slot) {
                  this.startDeckBuffer(idleDeck, incoming, slot.buffer, nextSec, this.deckRates[idleDeck])
                  phaseErr = 0
                } else {
                  try {
                    incoming.currentTime = nextSec
                    phaseErr = 0
                  } catch {
                    /* fall through to micro */
                  }
                }
              }
            }

            if (!phaseFilterPrimed) {
              filteredPhaseErr = phaseErr
              phaseFilterPrimed = true
            } else {
              filteredPhaseErr = filterPhaseErrorSec(filteredPhaseErr, phaseErr)
            }
            phaseErr = filteredPhaseErr

            const beatSec = 60 / Math.max(60, baseOutBpm)
            const fused = fuseBlendError({
              gridPhaseSec: phaseErr,
              kickResidualSec: allowKickCorrect ? onsetPocket.kickSec : null,
              clapResidualSec: allowKickCorrect ? onsetPocket.clapSec : null,
              beatSec,
              allowClap: bothFoF,
              trustOnsets:
                allowKickCorrect &&
                storedKickOnsetCount(activeTrack?.sonic_dna, outDurSec) >= 4 &&
                storedKickOnsetCount(idleTrack.sonic_dna, inDurSec) >= 4,
            })
            const chaseErr = fused.errorSec
            const tSec = ctxClock?.currentTime ?? now / 1000
            pushDriftSample(driftAlign, tSec, chaseErr)
            const drift = estimateDrift(driftAlign.samples)

            // Incoming-only PI vinyl bend for the whole overlap. Outgoing stays
            // on the shared master so relative rate can close residual phase.
            if (holdPhaseLock && allowVinylBend) {
              const errNow = Math.abs(chaseErr)
              const walking = Math.abs(drift.driftRate) >= 0.002
              const every = walking || errNow > 0.004 ? 1 : vinylBendTickInterval(errNow)
              if (tickFrame % every === 0) {
                const dtSec =
                  lastCtxSec == null
                    ? 1 / 60
                    : Math.max(0.008, Math.min(0.08, tSec - lastCtxSec))
                lastCtxSec = tSec
                driftAlign.lastTSec = tSec
                const chase = phaseChaseStrength(raw) * microStrength
                const aligned = driftAlignRate({
                  errorSec: chaseErr,
                  driftRate: drift.driftRate,
                  integralSec: driftAlign.integralSec,
                  bpm: baseOutBpm,
                  strength: chase,
                  dtSec,
                  silent: raw < 0.02,
                })
                driftAlign.integralSec = aligned.nextIntegralSec
                microRateBias = smoothVinylBend(microRateBias, aligned.multiplier, errNow)
                microRateBias = settleVinylBend(microRateBias, errNow)
              }
              const bent = applyVinylBendToDeckRates({
                outRate: outRateTarget,
                inRate,
                microMultiplier: microRateBias,
              })
              inRate = clampTempoRate(bent.inRate)
              outRateTarget = bent.outRate
            }
          }
          // Instant shared-master rates — per-deck slew split effective BPM.
          if (ctxClock && !this.deckBuffer[outDeck]) {
            outClock = snapshotIntegratedMedia(outClock, ctxClock.currentTime, outRateTarget)
          }
          this.setDeckTempo(idleDeck, incoming, inRate, {
            instant: true,
            onNotify: opts?.onDeckRate,
          })
          this.setDeckTempo(outDeck, outgoing, outRateTarget, {
            instant: true,
            notify: opts?.onDeckRate != null,
            onNotify: opts?.onDeckRate,
          })
        } catch {
          this.setDeckTempo(idleDeck, incoming, clampTempoRate(inRate), {
            onNotify: opts?.onDeckRate,
          })
        }

        let gains = styleMixGains(plan.style, fadeProgress, this.mixIntel ?? undefined)
        // Smooth is one equal-power curve — no second tail cliff.
        if (plan.style !== 'crossfade') {
          const softTailStart = this.mixIntel?.softTailStart ??
            (plan.style === 'cut' ? 0.86 : 0.84)
          gains = applySoftTail(gains, fadeProgress, softTailStart)
        }

        const incomingGain = activeAtStart === 'a' ? gains.b : gains.a
        const outgoingGain = activeAtStart === 'a' ? gains.a : gains.b
        const beatSec = 60 / Math.max(60, baseOutBpm)
        const echoAmt = echoSendAtProgress({
          echoSend: this.mixIntel?.echoSend ?? 0,
          outgoingGain,
          progress: fadeProgress,
          mixSec,
          beatSec,
        })
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
                  outgoingTimeSec: outNow,
                  incomingTimeSec: this.incomingMediaTime(incoming),
                  outgoingPeaks: activeTrack?.waveformPeaks,
                  incomingPeaks: idleTrack.waveformPeaks,
                  outgoingDurationSec: outDurSec,
                  incomingDurationSec: inDurSec,
                }) * 1000,
        })

        // Slightly longer tau late in the mix so handoff settles without zipper.
        const gainTau = plan.style === 'crossfade'
          ? raw >= 0.88 ? 0.04 : 0.024
          : raw >= 0.88 ? 0.032 : 0.018
        if (this.manualXfOverride && this.lastManualXf != null) {
          const { a, b } = equalPowerGains(this.lastManualXf)
          this.applyDeckGains(a, b, { tau: gainTau })
        } else if (activeAtStart === 'a') {
          this.applyDeckGains(gains.a, gains.b, { tau: gainTau })
        } else {
          this.applyDeckGains(gains.b, gains.a, { tau: gainTau })
        }

        this.stampDeckElement(idleDeck)
        try {
          opts?.onProgress?.(raw)
        } catch {
          /* ignore */
        }

        if (overlap.done) {
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
    this.stopPlayheadStamp()
    this.disposeIncomingBuffer()
    this.setEchoSend(this.active, 0, 0.25)
    this.restoreIncomingStretch()
    if (this.dormantStretch) {
      const { deck, chain } = this.dormantStretch
      this.dormantStretch = null
      this.teardownStretchChain(deck, chain)
    }
    this.mixLock = false
    this.resetBlendStage()
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
    this.stopPlayheadStamp()
    this.disposeIncomingBuffer()
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

