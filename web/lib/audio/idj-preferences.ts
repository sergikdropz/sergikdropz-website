/**
 * iDJ (manual dual-deck) — enablement + per-track memory cues.
 * Separate from Auto DJ so collapsing the player does not lose the mode.
 */

import { HOT_CUE_SLOTS, type HotCueSlot, type HotCueSlots } from './hot-cues'

export const IDJ_ENABLED_STORAGE_KEY = 'idjEnabled'
export const IDJ_MEMORY_CUES_KEY = 'sergik-idj-cues-v1'
export const IDJ_CONFIG_STORAGE_KEY = 'idjSettings'
export const IDJ_ACTIVE_CUE_KEY = 'sergik-idj-active-cue-v1'

export type IDJDeckId = 'a' | 'b'

export type IDJContinuousPlay = Record<IDJDeckId, boolean>

export type IDJConfig = {
  /** When a deck finishes, load the next queue neighbor and keep playing. */
  continuousPlay: IDJContinuousPlay
  /** Snap waveform pointer / SET / hot cues to the visible beat grid. */
  snapToGrid: boolean
  /** CUE seeks then plays. Off seeks and pauses (CDJ-style). */
  cueJumpPlay: boolean
  /** New track on a deck starts at its memory cue when one exists. */
  startOnCue: boolean
}

export const DEFAULT_IDJ_CONFIG: IDJConfig = {
  continuousPlay: { a: false, b: false },
  snapToGrid: true,
  cueJumpPlay: false,
  startOnCue: true,
}

/** Accepts the current per-deck object or the legacy global boolean. */
export function normalizeContinuousPlay(value: unknown): IDJContinuousPlay {
  if (value === true) return { a: true, b: true }
  if (value && typeof value === 'object') {
    const rec = value as Record<string, unknown>
    return {
      a: rec.a === true,
      b: rec.b === true,
    }
  }
  return { a: false, b: false }
}

function storage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null
    return localStorage
  } catch {
    return null
  }
}

export function readIDJEnabledFromStorage(): boolean {
  const store = storage()
  if (!store) return false
  try {
    return store.getItem(IDJ_ENABLED_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function readIDJConfigFromStorage(): IDJConfig {
  const store = storage()
  if (!store) return { ...DEFAULT_IDJ_CONFIG }
  try {
    const raw = store.getItem(IDJ_CONFIG_STORAGE_KEY)
    if (!raw) return { ...DEFAULT_IDJ_CONFIG }
    const parsed = JSON.parse(raw) as Partial<IDJConfig>
    return {
      continuousPlay: normalizeContinuousPlay(parsed.continuousPlay),
      snapToGrid: parsed.snapToGrid !== false,
      cueJumpPlay: parsed.cueJumpPlay === true,
      startOnCue: parsed.startOnCue !== false,
    }
  } catch {
    return { ...DEFAULT_IDJ_CONFIG }
  }
}

export function writeIDJConfigToStorage(config: IDJConfig): void {
  const store = storage()
  if (!store) return
  try {
    store.setItem(IDJ_CONFIG_STORAGE_KEY, JSON.stringify(config))
  } catch {
    /* ignore quota */
  }
}

export function writeIDJEnabledToStorage(enabled: boolean): void {
  const store = storage()
  if (!store) return
  try {
    store.setItem(IDJ_ENABLED_STORAGE_KEY, enabled ? '1' : '0')
  } catch {
    // ignore quota errors
  }
}

export function readIDJMemoryCues(): Record<string, number> {
  const store = storage()
  if (!store) return {}
  try {
    const raw = store.getItem(IDJ_MEMORY_CUES_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (!parsed || typeof parsed !== 'object') return {}
    const out: Record<string, number> = {}
    for (const [id, value] of Object.entries(parsed)) {
      if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
        out[id] = value
      }
    }
    return out
  } catch {
    return {}
  }
}

export function writeIDJMemoryCue(trackId: string, timeSec: number): Record<string, number> {
  const store = storage()
  const all = readIDJMemoryCues()
  if (!trackId) return all
  all[trackId] = timeSec
  if (!store) return all
  try {
    store.setItem(IDJ_MEMORY_CUES_KEY, JSON.stringify(all))
  } catch {
    /* ignore */
  }
  return all
}

export function clearIDJMemoryCue(trackId: string): Record<string, number> {
  const store = storage()
  const all = readIDJMemoryCues()
  if (!trackId) return all
  delete all[trackId]
  if (!store) return all
  try {
    store.setItem(IDJ_MEMORY_CUES_KEY, JSON.stringify(all))
  } catch {
    /* ignore */
  }
  return all
}

export type IDJActiveCue =
  | { kind: 'memory' }
  | { kind: 'hot'; slot: HotCueSlot }
  | { kind: 'track'; id: string }

export type IDJActiveCueMap = Record<IDJDeckId, Record<string, IDJActiveCue>>

export function emptyIDJActiveCueMap(): IDJActiveCueMap {
  return { a: {}, b: {} }
}

export function parseIDJActiveCue(value: unknown): IDJActiveCue | null {
  if (!value || typeof value !== 'object') return null
  const rec = value as Record<string, unknown>
  if (rec.kind === 'memory') return { kind: 'memory' }
  if (rec.kind === 'hot') {
    const slot = Number(rec.slot)
    if ((HOT_CUE_SLOTS as readonly number[]).includes(slot)) {
      return { kind: 'hot', slot: slot as HotCueSlot }
    }
  }
  if (rec.kind === 'track' && typeof rec.id === 'string' && rec.id.trim()) {
    return { kind: 'track', id: rec.id.trim() }
  }
  return null
}

export function sameIDJActiveCue(
  a: IDJActiveCue | null | undefined,
  b: IDJActiveCue | null | undefined,
): boolean {
  if (!a || !b) return !a && !b
  if (a.kind !== b.kind) return false
  if (a.kind === 'hot' && b.kind === 'hot') return a.slot === b.slot
  if (a.kind === 'track' && b.kind === 'track') return a.id === b.id
  return true
}

export function idjActiveCueKey(cue: IDJActiveCue | null | undefined): string {
  if (!cue) return ''
  if (cue.kind === 'memory') return 'memory'
  if (cue.kind === 'hot') return `hot-${cue.slot}`
  return `track-${cue.id}`
}

function readDeckActiveMap(raw: unknown): Record<string, IDJActiveCue> {
  if (!raw || typeof raw !== 'object') return {}
  const out: Record<string, IDJActiveCue> = {}
  for (const [trackId, value] of Object.entries(raw as Record<string, unknown>)) {
    const parsed = parseIDJActiveCue(value)
    if (parsed) out[trackId] = parsed
  }
  return out
}

export function readIDJActiveCues(): IDJActiveCueMap {
  const store = storage()
  if (!store) return emptyIDJActiveCueMap()
  try {
    const raw = store.getItem(IDJ_ACTIVE_CUE_KEY)
    if (!raw) return emptyIDJActiveCueMap()
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (!parsed || typeof parsed !== 'object') return emptyIDJActiveCueMap()
    return {
      a: readDeckActiveMap(parsed.a),
      b: readDeckActiveMap(parsed.b),
    }
  } catch {
    return emptyIDJActiveCueMap()
  }
}

export function writeIDJActiveCue(
  deck: IDJDeckId,
  trackId: string,
  cue: IDJActiveCue | null,
): IDJActiveCueMap {
  const all = readIDJActiveCues()
  if (!trackId) return all
  if (!cue) delete all[deck][trackId]
  else all[deck][trackId] = cue
  const store = storage()
  if (!store) return all
  try {
    store.setItem(IDJ_ACTIVE_CUE_KEY, JSON.stringify(all))
  } catch {
    /* ignore */
  }
  return all
}

export function resolveIDJActiveCue(input: {
  active?: IDJActiveCue | null
  memorySec?: number | null
  hotSlots?: HotCueSlots | null
  trackCues?: Array<{ id: string; label: string; timeSec: number }> | null
}): { cue: IDJActiveCue; timeSec: number; label: string } | null {
  const memorySec = input.memorySec
  const hotSlots = input.hotSlots
  const trackCues = input.trackCues
  const tryCue = (cue: IDJActiveCue | null | undefined) => {
    if (!cue) return null
    if (cue.kind === 'memory') {
      if (typeof memorySec === 'number' && Number.isFinite(memorySec) && memorySec >= 0) {
        return { cue, timeSec: memorySec, label: 'Memory / SET' }
      }
      return null
    }
    if (cue.kind === 'hot') {
      const timeSec = hotSlots?.[cue.slot]
      if (typeof timeSec === 'number' && Number.isFinite(timeSec) && timeSec >= 0) {
        return { cue, timeSec, label: `Hot ${cue.slot}` }
      }
      return null
    }
    const found = trackCues?.find((item) => item.id === cue.id)
    if (found && Number.isFinite(found.timeSec) && found.timeSec >= 0) {
      return { cue, timeSec: found.timeSec, label: found.label }
    }
    return null
  }
  return tryCue(input.active) ?? tryCue({ kind: 'memory' })
}
