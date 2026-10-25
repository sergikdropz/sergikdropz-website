/**
 * Visual look for story / reel video, feed squares, and story stills.
 * A format (vinyl, sleeve, artwork, card, background) plus aesthetic, background, and accent.
 */

import { peaksFromWaveformBody } from '@/lib/audio/waveform-peaks-source'
import type { PromoCardFormat, PromoCardMode } from '@/lib/studio/promo-cards'
import { canvasReboundUnit, type CanvasDriftPose } from '@/lib/studio/spotify-canvas'

export const STORY_SUBJECTS = [
  { id: 'background', label: 'Background', hint: 'Full-bleed cover, no disc or card' },
  { id: 'vinyl', label: 'Vinyl', hint: 'Spinning disc' },
  { id: 'sleeve', label: 'Sleeve', hint: 'Jacket with the disc sliding out' },
  { id: 'artwork', label: 'Artwork', hint: 'Framed cover' },
  { id: 'card', label: 'Card', hint: 'Printed promo card' },
] as const

export const STORY_AESTHETICS = [
  { id: 'midnight', label: 'Midnight' },
  { id: 'neon', label: 'Neon' },
  { id: 'cream', label: 'Cream' },
  { id: 'gold', label: 'Gold' },
  { id: 'ink', label: 'Ink' },
  { id: 'film', label: 'Film' },
] as const

export const STORY_BACKGROUNDS = [
  { id: 'album', label: 'Album artwork' },
  { id: 'blur', label: 'Blur cover' },
  { id: 'solid', label: 'Solid' },
  { id: 'gradient', label: 'Gradient' },
  { id: 'wash', label: 'Color wash' },
] as const

export const STORY_MOTIONS = [
  { id: 'still', label: 'Still' },
  { id: 'pan', label: 'Pan' },
  { id: 'rise', label: 'Rise' },
  { id: 'sweep', label: 'Sweep' },
  { id: 'zoom', label: 'Zoom' },
  { id: 'pull', label: 'Pull' },
  { id: 'pulse', label: 'Pulse' },
  { id: 'drift', label: 'Drift' },
  { id: 'tilt', label: 'Tilt' },
  { id: 'turn', label: 'Turn' },
] as const

export const STORY_MOTION_SPEEDS = [
  { id: 'slow', label: 'Slow' },
  { id: 'steady', label: 'Steady' },
  { id: 'fast', label: 'Fast' },
] as const

export const STORY_MOTION_DIRECTIONS = [
  { id: 'forward', label: 'Forward' },
  { id: 'reverse', label: 'Reverse' },
] as const

export const STORY_MOTION_DEPTHS = [
  { id: 'soft', label: 'Soft' },
  { id: 'full', label: 'Full' },
  { id: 'wide', label: 'Wide' },
] as const

/** How the 8-bar tape is colored. Accent follows the look; the others are player-style views. */
export const STORY_TAPE_VIEWS = [
  { id: 'accent', label: 'Accent' },
  { id: 'spectrum', label: 'Spectrum' },
  { id: 'drums', label: 'Drums' },
  { id: 'energy', label: 'Energy' },
] as const

export const STORY_TAPE_PLATES = [
  { id: 'clear', label: 'Clear' },
  { id: 'ink', label: 'Black' },
] as const

/** How solid the Available on bar is. Clear lets the cover show through. */
export const STORY_STORES_PLATES = [
  { id: 'solid', label: 'Solid' },
  { id: 'soft', label: 'Soft' },
  { id: 'clear', label: 'Clear' },
] as const

/** Ink on the Available on bar. Auto follows the aesthetic. */
export const STORY_STORES_INKS = [
  { id: 'auto', label: 'Auto' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
] as const

export const STORY_ACCENTS = [
  { id: 'violet', label: 'Violet', hex: '#a78bfa' },
  { id: 'cyan', label: 'Cyan', hex: '#22d3ee' },
  { id: 'amber', label: 'Amber', hex: '#fbbf24' },
  { id: 'rose', label: 'Rose', hex: '#fb7185' },
  { id: 'emerald', label: 'Emerald', hex: '#34d399' },
  { id: 'ivory', label: 'Ivory', hex: '#f5f5f4' },
] as const

export type StorySubject = (typeof STORY_SUBJECTS)[number]['id']
export type StoryAesthetic = (typeof STORY_AESTHETICS)[number]['id']
export type StoryBackground = (typeof STORY_BACKGROUNDS)[number]['id']
export type StoryMotion = (typeof STORY_MOTIONS)[number]['id']
export type StoryMotionSpeed = (typeof STORY_MOTION_SPEEDS)[number]['id']
export type StoryMotionDirection = (typeof STORY_MOTION_DIRECTIONS)[number]['id']
export type StoryMotionDepth = (typeof STORY_MOTION_DEPTHS)[number]['id']
export type StoryTapeView = (typeof STORY_TAPE_VIEWS)[number]['id']
export type StoryTapePlate = (typeof STORY_TAPE_PLATES)[number]['id']
export type StoryStoresPlate = (typeof STORY_STORES_PLATES)[number]['id']
export type StoryStoresInk = (typeof STORY_STORES_INKS)[number]['id']
export type StoryAccentId = (typeof STORY_ACCENTS)[number]['id'] | 'custom' | 'artwork' | 'gradient' | 'dual'

export type StoryLook = {
  subject: StorySubject
  aesthetic: StoryAesthetic
  background: StoryBackground
  accent: StoryAccentId
  /** `#rrggbb` when accent is `custom`, `artwork`, `gradient`, or the first dual-tone stop. */
  accentHex?: string
  /** Second stop when accent is `dual` or `gradient`. */
  accentHex2?: string
  /** Pre-save vs out-now copy on the look. */
  mode: PromoCardMode
  /** Square feed frame or 9:16 story frame. */
  frame: PromoCardFormat
  /** Cover motion when the background is album artwork. */
  motion: StoryMotion
  /** Second cover move, played with `motion`. Still never pairs. */
  motion2?: StoryMotion
  /** How many times the move plays across the 15s clip. */
  motionSpeed: StoryMotionSpeed
  /** Which way the selected move travels. */
  motionDirection: StoryMotionDirection
  /** How far the cover travels. */
  motionDepth: StoryMotionDepth
  /** Speed for `motion2`. Falls back to `motionSpeed` until the second move is tuned. */
  motion2Speed?: StoryMotionSpeed
  /** Direction for `motion2`. */
  motion2Direction?: StoryMotionDirection
  /** Travel for `motion2`. */
  motion2Depth?: StoryMotionDepth
  /** Color language for the 8-bar tape. */
  tape: StoryTapeView
  /** Draw the tape. Off centers the disc or artwork. */
  tapeOn: boolean
  /** Promo-card “Available on” strip along the bottom. */
  storesOn: boolean
  /** Solid, translucent, or no fill behind the store icons. */
  storesPlate: StoryStoresPlate
  /** Auto follows the aesthetic. Light and dark force the icon ink. */
  storesInk: StoryStoresInk
  /** Draw sergikdropz.com under the store icons. */
  storesSite: boolean
  /** Beat and bar lines across the tape. */
  tapeGrid: boolean
  /** Soft bloom on the peaks. */
  tapeGlow: boolean
  /** Clear lets the artwork show through. Ink is the black player lane. */
  tapePlate: StoryTapePlate
}

export const DEFAULT_STORY_LOOK: StoryLook = {
  subject: 'vinyl',
  aesthetic: 'midnight',
  background: 'album',
  accent: 'violet',
  mode: 'outnow',
  frame: 'story',
  motion: 'still',
  motionSpeed: 'steady',
  motionDirection: 'forward',
  motionDepth: 'full',
  tape: 'accent',
  tapeOn: true,
  storesOn: false,
  storesPlate: 'solid',
  storesInk: 'auto',
  storesSite: true,
  tapeGrid: true,
  tapeGlow: false,
  tapePlate: 'clear',
}

type AestheticBase = {
  light: boolean
  bg: string
  bg2: string
  ink: string
  muted: string
  disc: string
  panel: string
  veil: string
  grain: boolean
}

const AESTHETIC_BASE: Record<StoryAesthetic, AestheticBase> = {
  midnight: {
    light: false,
    bg: '#0b0b0d',
    bg2: '#1c1230',
    ink: '#fafafa',
    muted: 'rgba(255,255,255,0.72)',
    disc: '#0c0c0e',
    panel: 'rgba(255,255,255,0.06)',
    veil: 'rgba(0,0,0,0.35)',
    grain: false,
  },
  neon: {
    light: false,
    bg: '#07010f',
    bg2: '#2a0a45',
    ink: '#f8f5ff',
    muted: 'rgba(226,232,255,0.78)',
    disc: '#120818',
    panel: 'rgba(255,255,255,0.05)',
    veil: 'rgba(8,0,20,0.42)',
    grain: false,
  },
  cream: {
    light: true,
    bg: '#f3eee4',
    bg2: '#e4d3b8',
    ink: '#1c1917',
    muted: '#57534e',
    disc: '#161311',
    panel: '#fffdf8',
    veil: 'rgba(243,238,228,0.78)',
    grain: false,
  },
  gold: {
    light: false,
    bg: '#140e07',
    bg2: '#4a3414',
    ink: '#f8e7c0',
    muted: 'rgba(232,214,176,0.8)',
    disc: '#1a140c',
    panel: 'rgba(232,197,107,0.08)',
    veil: 'rgba(20,12,4,0.4)',
    grain: false,
  },
  ink: {
    light: false,
    bg: '#050505',
    bg2: '#1c1c1c',
    ink: '#fafafa',
    muted: 'rgba(255,255,255,0.66)',
    disc: '#000000',
    panel: '#0e0e0e',
    veil: 'rgba(0,0,0,0.5)',
    grain: false,
  },
  film: {
    light: false,
    bg: '#1a120c',
    bg2: '#5a3a22',
    ink: '#f6ead7',
    muted: 'rgba(243,230,208,0.78)',
    disc: '#1c140e',
    panel: 'rgba(255,236,210,0.06)',
    veil: 'rgba(40,22,10,0.38)',
    grain: true,
  },
}

export type StoryPaint = AestheticBase & {
  subject: StorySubject
  background: StoryBackground
  accent: string
  wash: string
  accentVeil: string
  groove: string
  mat: string
  ctaFill: string
  ctaInk: string
  ctaStroke: string
  progress: string
  progressTrack: string
  /** Second accent stop. Set for the dual-tone gradient. */
  accentEnd: string | null
}

function isId<T extends string>(value: unknown, ids: readonly T[]): value is T {
  return typeof value === 'string' && (ids as readonly string[]).includes(value)
}

export function normalizeHex(value: unknown): string | null {
  const raw = typeof value === 'string' ? value.trim() : ''
  if (!/^#[0-9a-fA-F]{6}$/.test(raw)) return null
  return raw.toLowerCase()
}

export function storyAccentHex(
  look: Pick<StoryLook, 'accent' | 'accentHex'>,
  artworkHex?: string | null,
): string {
  if (look.accent === 'artwork') return normalizeHex(artworkHex) || normalizeHex(look.accentHex) || '#a78bfa'
  if (look.accent === 'custom' || look.accent === 'dual' || look.accent === 'gradient') return normalizeHex(look.accentHex) || '#a78bfa'
  return STORY_ACCENTS.find((item) => item.id === look.accent)?.hex || '#a78bfa'
}

export function hexToRgba(hex: string, alpha: number): string {
  const safe = normalizeHex(hex) || '#a78bfa'
  const n = parseInt(safe.slice(1), 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  const a = Math.max(0, Math.min(1, alpha))
  return `rgba(${r},${g},${b},${a})`
}

function storyCampaign(
  input?: Partial<StoryLook> | null,
): Pick<
  StoryLook,
  | 'mode'
  | 'frame'
  | 'motion'
  | 'motion2'
  | 'motionSpeed'
  | 'motionDirection'
  | 'motionDepth'
  | 'motion2Speed'
  | 'motion2Direction'
  | 'motion2Depth'
  | 'tape'
  | 'tapeOn'
  | 'storesOn'
  | 'storesPlate'
  | 'storesInk'
  | 'storesSite'
  | 'tapeGrid'
  | 'tapeGlow'
  | 'tapePlate'
> {
  const mode =
    input?.mode === 'presave' || input?.mode === 'outnow' || input?.mode === 'coming'
      ? input.mode
      : DEFAULT_STORY_LOOK.mode
  const frame = input?.frame === 'square' || input?.frame === 'story' ? input.frame : DEFAULT_STORY_LOOK.frame
  const motionIds = STORY_MOTIONS.map((item) => item.id)
  const motion = isId(input?.motion, motionIds) ? input.motion : DEFAULT_STORY_LOOK.motion
  const motion2 =
    motion !== 'still' &&
    isId(input?.motion2, motionIds) &&
    input.motion2 !== 'still' &&
    input.motion2 !== motion
      ? input.motion2
      : undefined
  const speedIds = STORY_MOTION_SPEEDS.map((item) => item.id)
  const depthIds = STORY_MOTION_DEPTHS.map((item) => item.id)
  const motionSpeed = isId(input?.motionSpeed, speedIds) ? input.motionSpeed : DEFAULT_STORY_LOOK.motionSpeed
  const motionDirection = input?.motionDirection === 'reverse' ? 'reverse' : DEFAULT_STORY_LOOK.motionDirection
  const motionDepth = isId(input?.motionDepth, depthIds) ? input.motionDepth : DEFAULT_STORY_LOOK.motionDepth
  const motion2Speed = isId(input?.motion2Speed, speedIds) ? input.motion2Speed : motionSpeed
  const motion2Direction =
    input?.motion2Direction === 'forward' || input?.motion2Direction === 'reverse'
      ? input.motion2Direction
      : motionDirection
  const motion2Depth = isId(input?.motion2Depth, depthIds) ? input.motion2Depth : motionDepth
  const tape = isId(input?.tape, STORY_TAPE_VIEWS.map((item) => item.id)) ? input.tape : DEFAULT_STORY_LOOK.tape
  const tapePlate = input?.tapePlate === 'ink' ? 'ink' : DEFAULT_STORY_LOOK.tapePlate
  return {
    mode,
    frame,
    motion,
    ...(motion2
      ? { motion2, motion2Speed, motion2Direction, motion2Depth }
      : {}),
    motionSpeed,
    motionDirection,
    motionDepth,
    tape,
    tapeOn: input?.tapeOn === false ? false : DEFAULT_STORY_LOOK.tapeOn,
    storesOn: input?.storesOn === true,
    storesPlate: isId(input?.storesPlate, STORY_STORES_PLATES.map((item) => item.id))
      ? input.storesPlate
      : DEFAULT_STORY_LOOK.storesPlate,
    storesInk: isId(input?.storesInk, STORY_STORES_INKS.map((item) => item.id))
      ? input.storesInk
      : DEFAULT_STORY_LOOK.storesInk,
    storesSite: input?.storesSite === false ? false : DEFAULT_STORY_LOOK.storesSite,
    tapeGrid: input?.tapeGrid === false ? false : DEFAULT_STORY_LOOK.tapeGrid,
    tapeGlow: input?.tapeGlow === true,
    tapePlate,
  }
}

/** One travel cycle matches the 15s story / reel. Rebound so the clip can loop. */
export const STORY_MOTION_DURATION_SEC = 15

/** Cover pose for the 15s clip. `rotate` is degrees. `lean` is a −1…1 yaw that foreshortens the picture. */
export type StoryMotionPose = CanvasDriftPose & { rotate: number; lean?: number }

/** Motions currently on. Still is exclusive. */
export function storySelectedMotions(look: Pick<StoryLook, 'motion' | 'motion2'>): StoryMotion[] {
  if (look.motion === 'still') return ['still']
  if (look.motion2 && look.motion2 !== 'still' && look.motion2 !== look.motion) return [look.motion, look.motion2]
  return [look.motion]
}

/** Toggle a motion. At most two, and Still clears the pair. A third pick replaces the second. */
export function storyMotionSelection(
  look: Pick<StoryLook, 'motion' | 'motion2'>,
  next: StoryMotion,
): { motion: StoryMotion; motion2?: StoryMotion } {
  if (next === 'still') return { motion: 'still', motion2: undefined }
  const selected = storySelectedMotions(look).filter((id) => id !== 'still')
  if (selected.includes(next)) {
    const rest = selected.filter((id) => id !== next)
    return rest[0] ? { motion: rest[0], motion2: undefined } : { motion: 'still', motion2: undefined }
  }
  if (selected.length === 0) return { motion: next, motion2: undefined }
  return { motion: selected[0]!, motion2: next }
}

function storyMotionDirectionFor(motion: StoryMotion): Array<{ id: StoryMotionDirection; label: string }> {
  if (motion === 'pan' || motion === 'sweep' || motion === 'turn') {
    return [
      { id: 'forward', label: 'Right' },
      { id: 'reverse', label: 'Left' },
    ]
  }
  if (motion === 'rise') {
    return [
      { id: 'forward', label: 'Up' },
      { id: 'reverse', label: 'Down' },
    ]
  }
  if (motion === 'zoom' || motion === 'pulse') {
    return [
      { id: 'forward', label: 'In' },
      { id: 'reverse', label: 'Out' },
    ]
  }
  if (motion === 'pull') {
    return [
      { id: 'forward', label: 'Out' },
      { id: 'reverse', label: 'In' },
    ]
  }
  if (motion === 'tilt') {
    return [
      { id: 'forward', label: 'Clockwise' },
      { id: 'reverse', label: 'Counter' },
    ]
  }
  return [
    { id: 'forward', label: 'Forward' },
    { id: 'reverse', label: 'Back' },
  ]
}

export function storyMotionDirectionOptions(
  motion: StoryMotion,
  motion2?: StoryMotion | null,
): Array<{ id: StoryMotionDirection; label: string }> {
  const primary = storyMotionDirectionFor(motion)
  if (!motion2 || motion2 === 'still' || motion2 === motion) return primary
  const secondary = storyMotionDirectionFor(motion2)
  const same =
    primary[0]?.label === secondary[0]?.label && primary[1]?.label === secondary[1]?.label
  if (same) return primary
  return [
    { id: 'forward', label: 'Forward' },
    { id: 'reverse', label: 'Reverse' },
  ]
}

/** Pulse grid: half note, the beat, or eighth notes. Other moves keep Slow / Steady / Fast. */
export function storyMotionSpeedOptions(
  motion: StoryMotion,
  motion2?: StoryMotion | null,
): Array<{ id: StoryMotionSpeed; label: string }> {
  const paired = motion2 && motion2 !== 'still' && motion2 !== motion
  if (motion === 'pulse' && !paired) {
    return [
      { id: 'slow', label: 'Half' },
      { id: 'steady', label: 'Beat' },
      { id: 'fast', label: '8ths' },
    ]
  }
  return STORY_MOTION_SPEEDS.map((item) => ({ id: item.id, label: item.label }))
}

export function storyPulseClockLabel(bpm?: number | null): string {
  const safe = typeof bpm === 'number' && bpm >= 40 && bpm <= 220 ? Math.round(bpm) : 124
  return `On the beat · ${safe} BPM`
}

export type StoryMotionTune = Partial<
  Pick<StoryLook, 'motionSpeed' | 'motionDirection' | 'motionDepth'>
> & {
  bpm?: number | null
  /** Absolute track time. Pulse locks to the file-start beat grid. */
  timeSec?: number
  /** Full-track amplitude. Pulse reads only the attack of each beat. */
  peaks?: number[] | null
  /** 0–1 energy below 100 Hz. When set, this sets how hard each beat hits. */
  sub?: number[] | null
  trackDurationSec?: number | null
}

/** Quarter-note length, doubled for half notes and halved for eighths. */
export function storyPulseIntervalSec(
  bpm?: number | null,
  speed: StoryMotionSpeed = 'steady',
): number {
  const safe = typeof bpm === 'number' && bpm >= 40 && bpm <= 220 ? bpm : 124
  const quarter = 60 / safe
  if (speed === 'slow') return quarter * 2
  if (speed === 'fast') return quarter / 2
  return quarter
}

const PULSE_ATTACK_SEC = 0.03
/** Sub-100 Hz kick body: the cover is back near rest before the next beat. */
const PULSE_DECAY_SEC = 0.1

/** 0 at the beat grid, 1 at the end of the 30ms attack, then a short decay. */
export function storyPulseHit(timeSec: number, intervalSec: number): number {
  const interval = intervalSec > 0.05 ? intervalSec : 0.48
  const t = Number.isFinite(timeSec) ? timeSec : 0
  const phase = ((t % interval) + interval) % interval
  if (phase <= PULSE_ATTACK_SEC) return phase / PULSE_ATTACK_SEC
  return Math.exp(-3.4 * ((phase - PULSE_ATTACK_SEC) / PULSE_DECAY_SEC))
}

/** Clip-relative elapsed that lands on the kick attack, so a still shows the punch. */
export function storyPulsePreviewElapsed(
  bpm?: number | null,
  speed: StoryMotionSpeed = 'steady',
  timeOriginSec = 0,
): number {
  const interval = storyPulseIntervalSec(bpm, speed)
  const origin = Math.max(0, Number.isFinite(timeOriginSec) ? timeOriginSec : 0)
  const into = ((origin % interval) + interval) % interval
  let delta = PULSE_ATTACK_SEC - into
  if (delta < 0.008) delta += interval
  return delta
}

function sampleSeries(
  timeSec: number,
  series: number[] | null | undefined,
  durationSec: number | null | undefined,
): number | null {
  if (!series || series.length < 2) return null
  const dur = typeof durationSec === 'number' && durationSec > 0 ? durationSec : 0
  if (!(dur > 0)) return null
  const idx = (Math.max(0, Math.min(dur, timeSec)) / dur) * (series.length - 1)
  const a = Math.floor(idx)
  const b = Math.min(series.length - 1, a + 1)
  const u = idx - a
  return Math.max(0, Math.min(1, Math.abs((series[a] || 0) * (1 - u) + (series[b] || 0) * u)))
}

/** How hard this beat hits. Sub-100 Hz wins; otherwise the peak in the kick window. */
function storyPulseEnergy(timeSec: number, intervalSec: number, tune?: StoryMotionTune): number {
  const series = tune?.sub && tune.sub.length >= 2 ? tune.sub : tune?.peaks
  if (!series || !(tune?.trackDurationSec && tune.trackDurationSec > 0)) return 1
  const interval = intervalSec > 0.05 ? intervalSec : 0.48
  const phase = ((timeSec % interval) + interval) % interval
  const beatStart = timeSec - phase
  let max = 0
  for (let i = 0; i < 4; i++) {
    const level = sampleSeries(beatStart + (0.07 * i) / 3, series, tune.trackDurationSec)
    if (level != null && level > max) max = level
  }
  return 0.22 + 0.78 * max
}

function pulsePose(timeSec: number, tune?: StoryMotionTune): StoryMotionPose {
  const speed = tune?.motionSpeed === 'slow' || tune?.motionSpeed === 'fast' ? tune.motionSpeed : 'steady'
  const interval = storyPulseIntervalSec(tune?.bpm, speed)
  const hit = storyPulseHit(timeSec, interval)
  const energy = storyPulseEnergy(timeSec, interval, tune)
  const depth = tune?.motionDepth === 'soft' ? 0.55 : tune?.motionDepth === 'wide' ? 1.35 : 1
  const punch = 0.14 * depth * hit * energy
  const rest = 1.1
  const scale = tune?.motionDirection === 'reverse' ? rest - punch : rest + punch
  return { tx: 0, ty: 0, scale, rotate: 0 }
}

export function albumMotionPose(
  motion: StoryMotion,
  elapsedSec: number,
  durationSec = STORY_MOTION_DURATION_SEC,
  tune?: StoryMotionTune,
): StoryMotionPose {
  if (motion === 'pulse') return pulsePose(tune?.timeSec ?? elapsedSec, tune)
  const speed = tune?.motionSpeed === 'slow' || tune?.motionSpeed === 'fast' ? tune.motionSpeed : 'steady'
  const span = speed === 'fast' ? durationSec / 2 : speed === 'slow' ? durationSec * 2 : durationSec
  let u = canvasReboundUnit(elapsedSec, span)
  if (tune?.motionDirection === 'reverse') u = 1 - u
  const pose = storyMotionPoseAt(motion, u)
  const gain = tune?.motionDepth === 'soft' ? 0.6 : tune?.motionDepth === 'wide' ? 1.2 : 1
  if (gain === 1) return pose
  return {
    tx: pose.tx * gain,
    ty: pose.ty * gain,
    rotate: pose.rotate * gain,
    scale: 1 + (pose.scale - 1) * gain,
    lean: (pose.lean || 0) * gain,
  }
}

/** Play one or two cover moves as a single pose. Scale and lean stay inside the frame. */
export function albumMotionsPose(
  motion: StoryMotion,
  elapsedSec: number,
  durationSec = STORY_MOTION_DURATION_SEC,
  tune?: StoryMotionTune,
  motion2?: StoryMotion | null,
  tune2?: StoryMotionTune,
): StoryMotionPose {
  const primary = albumMotionPose(motion, elapsedSec, durationSec, tune)
  if (!motion2 || motion2 === 'still' || motion2 === motion) return primary
  const secondary = albumMotionPose(motion2, elapsedSec, durationSec, tune2 ? { ...tune, ...tune2 } : tune)
  const lean = Math.max(-1, Math.min(1, (primary.lean || 0) + (secondary.lean || 0)))
  return {
    tx: primary.tx + secondary.tx,
    ty: primary.ty + secondary.ty,
    rotate: primary.rotate + secondary.rotate,
    scale: Math.max(1, Math.min(1.85, 1 + (primary.scale - 1) + (secondary.scale - 1))),
    ...(lean ? { lean } : {}),
  }
}

function storyMotionPoseAt(motion: StoryMotion, u: number): StoryMotionPose {
  if (motion === 'pan') return { tx: -8 + 16 * u, ty: -1.5 + 3 * u, scale: 1.22, rotate: 0 }
  if (motion === 'rise') return { tx: 1 - 2 * u, ty: 9 - 18 * u, scale: 1.24, rotate: 0 }
  if (motion === 'sweep') return { tx: -14 + 28 * u, ty: 1 - 2 * u, scale: 1.32, rotate: 0 }
  if (motion === 'zoom') return { tx: 0, ty: 0, scale: 1.04 + 0.34 * u, rotate: 0 }
  if (motion === 'pull') return { tx: 0, ty: 0, scale: 1.42 - 0.34 * u, rotate: 0 }
  if (motion === 'drift') return { tx: -5 + 10 * u, ty: 4 - 8 * u, scale: 1.12 + 0.24 * u, rotate: 0 }
  if (motion === 'tilt') return { tx: -2 + 4 * u, ty: 1 - 2 * u, scale: 1.28, rotate: -4 + 8 * u }
  if (motion === 'turn') return { tx: 0, ty: -1 + 2 * u, scale: 1.22, rotate: -2.5 + 5 * u, lean: -0.72 + 1.44 * u }
  return { tx: 0, ty: 0, scale: 1, rotate: 0 }
}

/** Eight spectrum bars. Peaks travel left to right with elapsed time. */
export function spectrumBarLevels(elapsedSec: number, count = 8): number[] {
  const t = Number.isFinite(elapsedSec) ? Math.max(0, elapsedSec) : 0
  const bars = Math.max(1, Math.round(count))
  return Array.from({ length: bars }, (_, i) => {
    const travel = t * 3.4 - i * 0.78
    const a = 0.5 + 0.5 * Math.sin(travel)
    const b = 0.5 + 0.5 * Math.sin(travel * 1.7 + i * 0.42)
    return Math.round((0.16 + 0.84 * (a * 0.62 + b * 0.38)) * 1000) / 1000
  })
}

/** Visible tape is 8 bars of 4/4. Playhead stays centered so history scrolls off the left. */
export const STORY_TAPE_BARS = 8

export function storyTapeWindow(
  timeSec: number,
  bpm?: number | null,
  durationSec?: number | null,
): { startSec: number; endSec: number; spanSec: number; playheadSec: number; bpm: number } {
  const safeBpm = typeof bpm === 'number' && bpm >= 40 && bpm <= 220 ? bpm : 124
  const barSec = (60 / safeBpm) * 4
  const spanSec = STORY_TAPE_BARS * barSec
  const dur =
    typeof durationSec === 'number' && durationSec > spanSec ? durationSec : Math.max(spanSec, timeSec + spanSec)
  const playheadSec = Math.max(0, Math.min(dur, Number.isFinite(timeSec) ? timeSec : 0))
  let startSec = playheadSec - spanSec / 2
  if (startSec < 0) startSec = 0
  if (startSec + spanSec > dur) startSec = Math.max(0, dur - spanSec)
  return { startSec, endSec: startSec + spanSec, spanSec, playheadSec, bpm: safeBpm }
}

/** Waveform API body → tape peaks. Follows the storage redirect, which is a raw array. */
export function storyTapePeaksFromBody(body: unknown): number[] | null {
  return compactWaveformPeaks(peaksFromWaveformBody(body))
}

/** Keep a full-track peak tape small enough to paint on every story frame. */
export function compactWaveformPeaks(raw: unknown, columns = 900): number[] | null {
  if (!Array.isArray(raw)) return null
  const nums = raw.map((value) => Math.abs(Number(value))).filter((value) => Number.isFinite(value))
  if (nums.length < 32) return null
  let peak = 0.001
  for (const value of nums) if (value > peak) peak = value
  const scale = peak > 1.5 ? peak : 1
  const target = Math.max(64, Math.round(columns))
  if (nums.length <= target) return nums.map((value) => Math.min(1, value / scale))
  const out: number[] = []
  const step = nums.length / target
  for (let i = 0; i < target; i++) {
    const start = Math.floor(i * step)
    const end = Math.min(nums.length, Math.max(start + 1, Math.floor((i + 1) * step)))
    let max = 0
    for (let j = start; j < end; j++) if (nums[j]! > max) max = nums[j]!
    out.push(Math.min(1, max / scale))
  }
  return out
}

export function normalizeStoryLook(input?: Partial<StoryLook> | null): StoryLook {
  const subject = isId(input?.subject, STORY_SUBJECTS.map((item) => item.id))
    ? input.subject
    : DEFAULT_STORY_LOOK.subject
  const aesthetic = isId(input?.aesthetic, STORY_AESTHETICS.map((item) => item.id))
    ? input.aesthetic
    : DEFAULT_STORY_LOOK.aesthetic
  const background = isId(input?.background, STORY_BACKGROUNDS.map((item) => item.id))
    ? input.background
    : DEFAULT_STORY_LOOK.background
  const campaign = storyCampaign(input)
  if (input?.accent === 'artwork') {
    const accentHex = normalizeHex(input.accentHex)
    return accentHex
      ? { subject, aesthetic, background, accent: 'artwork', accentHex, ...campaign }
      : { subject, aesthetic, background, accent: 'artwork', ...campaign }
  }
  if (input?.accent === 'dual' || input?.accent === 'gradient') {
    return {
      subject,
      aesthetic,
      background,
      accent: input.accent,
      accentHex: normalizeHex(input.accentHex) || '#a78bfa',
      accentHex2: normalizeHex(input.accentHex2) || '#22d3ee',
      ...campaign,
    }
  }
  if (input?.accent === 'custom') {
    const accentHex = normalizeHex(input.accentHex)
    if (accentHex) return { subject, aesthetic, background, accent: 'custom', accentHex, ...campaign }
  }
  const accent = isId(
    input?.accent,
    STORY_ACCENTS.map((item) => item.id)
  )
    ? input.accent
    : DEFAULT_STORY_LOOK.accent
  return { subject, aesthetic, background, accent, ...campaign }
}

export function resolveStoryPaint(
  input?: Partial<StoryLook> | null,
  artworkHex?: string | null,
): StoryPaint {
  const look = normalizeStoryLook(input)
  const base = AESTHETIC_BASE[look.aesthetic]
  const accent = storyAccentHex(look, artworkHex)
  const accentEnd =
    look.accent === 'dual' || look.accent === 'gradient' ? normalizeHex(look.accentHex2) || '#22d3ee' : null
  const groove =
    look.aesthetic === 'ink'
      ? 'rgba(255,255,255,0.16)'
      : look.aesthetic === 'neon' || look.aesthetic === 'gold'
        ? hexToRgba(accent, 0.34)
        : 'rgba(255,255,255,0.07)'
  return {
    ...base,
    subject: look.subject,
    background: look.background,
    accent,
    wash: hexToRgba(accent, 0.62),
    accentVeil: hexToRgba(accent, base.light ? 0.1 : 0.16),
    groove,
    mat: base.light ? '#fffdf8' : '#161616',
    ctaFill: base.light ? '#1c1917' : 'rgba(255,255,255,0.1)',
    ctaInk: base.light ? '#fafaf9' : base.ink,
    ctaStroke: accent,
    progress: accent,
    progressTrack: base.light ? 'rgba(28,25,23,0.16)' : 'rgba(255,255,255,0.22)',
    accentEnd,
  }
}

export function storySubjectLabel(subject: StorySubject): string {
  return STORY_SUBJECTS.find((item) => item.id === subject)?.label || 'Vinyl'
}

export function storyAestheticLabel(aesthetic: StoryAesthetic): string {
  return STORY_AESTHETICS.find((item) => item.id === aesthetic)?.label || 'Midnight'
}

export function storyBackgroundLabel(background: StoryBackground): string {
  return STORY_BACKGROUNDS.find((item) => item.id === background)?.label || 'Album artwork'
}

export function storyAccentLabel(look: Pick<StoryLook, 'accent' | 'accentHex'>): string {
  if (look.accent === 'custom') return 'Custom'
  if (look.accent === 'artwork') return 'Artwork'
  if (look.accent === 'gradient') return 'Artwork gradient'
  if (look.accent === 'dual') return 'Dual tone'
  return STORY_ACCENTS.find((item) => item.id === look.accent)?.label || 'Violet'
}

export function storyLookLabel(input?: Partial<StoryLook> | null): string {
  const look = normalizeStoryLook(input)
  return `${storySubjectLabel(look.subject)} · ${storyAestheticLabel(look.aesthetic)}`
}

export function storyLookDetail(input?: Partial<StoryLook> | null): string {
  const look = normalizeStoryLook(input)
  return `${storyLookLabel(look)} · ${storyBackgroundLabel(look.background)} · ${storyAccentLabel(look)}`
}

export function storyLookSlug(input?: Partial<StoryLook> | null): string {
  const look = normalizeStoryLook(input)
  const motion =
    look.background === 'album' && look.motion !== 'still'
      ? `-${look.motion}${look.motion2 ? `-${look.motion2}` : ''}`
      : ''
  return `${look.subject}-${look.aesthetic}-${look.background}${motion}`
}
