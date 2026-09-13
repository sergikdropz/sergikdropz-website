import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  IDJ_ACTIVE_CUE_KEY,
  IDJ_CONFIG_STORAGE_KEY,
  IDJ_ENABLED_STORAGE_KEY,
  IDJ_MEMORY_CUES_KEY,
  DEFAULT_IDJ_CONFIG,
  idjActiveCueKey,
  normalizeContinuousPlay,
  readIDJActiveCues,
  readIDJEnabledFromStorage,
  readIDJConfigFromStorage,
  readIDJMemoryCues,
  resolveIDJActiveCue,
  writeIDJActiveCue,
  writeIDJEnabledToStorage,
  writeIDJConfigToStorage,
  writeIDJMemoryCue,
  clearIDJMemoryCue,
} from './idj-preferences'

function installMemoryStorage() {
  const store = new Map<string, string>()
  const memory: Storage = {
    get length() {
      return store.size
    },
    clear() {
      store.clear()
    },
    getItem(key) {
      return store.has(key) ? store.get(key)! : null
    },
    key(index) {
      return [...store.keys()][index] ?? null
    },
    removeItem(key) {
      store.delete(key)
    },
    setItem(key, value) {
      store.set(key, String(value))
    },
  }
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: memory,
  })
}

describe('idj-preferences', () => {
  beforeEach(() => {
    installMemoryStorage()
  })

  afterEach(() => {
    localStorage.removeItem(IDJ_ENABLED_STORAGE_KEY)
    localStorage.removeItem(IDJ_MEMORY_CUES_KEY)
    localStorage.removeItem(IDJ_CONFIG_STORAGE_KEY)
    localStorage.removeItem(IDJ_ACTIVE_CUE_KEY)
  })

  it('persists enablement', () => {
    expect(readIDJEnabledFromStorage()).toBe(false)
    writeIDJEnabledToStorage(true)
    expect(readIDJEnabledFromStorage()).toBe(true)
    writeIDJEnabledToStorage(false)
    expect(readIDJEnabledFromStorage()).toBe(false)
  })

  it('stores a memory cue per track', () => {
    const next = writeIDJMemoryCue('track-a', 12.5)
    expect(next['track-a']).toBe(12.5)
    expect(readIDJMemoryCues()['track-a']).toBe(12.5)
    writeIDJMemoryCue('track-a', 4)
    expect(readIDJMemoryCues()['track-a']).toBe(4)
  })

  it('persists mixer settings with snap on by default', () => {
    expect(readIDJConfigFromStorage()).toEqual(DEFAULT_IDJ_CONFIG)
    writeIDJConfigToStorage({
      continuousPlay: { a: true, b: false },
      snapToGrid: false,
      cueJumpPlay: true,
      startOnCue: false,
    })
    expect(readIDJConfigFromStorage()).toEqual({
      continuousPlay: { a: true, b: false },
      snapToGrid: false,
      cueJumpPlay: true,
      startOnCue: false,
    })
  })

  it('defaults cue jump to pause and start-on-cue on', () => {
    expect(DEFAULT_IDJ_CONFIG.cueJumpPlay).toBe(false)
    expect(DEFAULT_IDJ_CONFIG.startOnCue).toBe(true)
    localStorage.setItem(
      IDJ_CONFIG_STORAGE_KEY,
      JSON.stringify({ continuousPlay: { a: false, b: false }, snapToGrid: true }),
    )
    expect(readIDJConfigFromStorage().cueJumpPlay).toBe(false)
    expect(readIDJConfigFromStorage().startOnCue).toBe(true)
  })

  it('migrates a legacy global continuousPlay flag to both decks', () => {
    localStorage.setItem(
      IDJ_CONFIG_STORAGE_KEY,
      JSON.stringify({ continuousPlay: true, snapToGrid: true }),
    )
    expect(readIDJConfigFromStorage()).toEqual({
      continuousPlay: { a: true, b: true },
      snapToGrid: true,
      cueJumpPlay: false,
      startOnCue: true,
    })
  })

  it('normalizes missing or invalid continuousPlay values to both off', () => {
    expect(normalizeContinuousPlay(undefined)).toEqual({ a: false, b: false })
    expect(normalizeContinuousPlay({ a: true })).toEqual({ a: true, b: false })
  })

  it('clears a memory cue', () => {
    writeIDJMemoryCue('track-a', 12.5)
    writeIDJMemoryCue('track-b', 3)
    const next = clearIDJMemoryCue('track-a')
    expect(next['track-a']).toBeUndefined()
    expect(readIDJMemoryCues()['track-a']).toBeUndefined()
    expect(readIDJMemoryCues()['track-b']).toBe(3)
  })

  it('stores the CUE button assignment per deck and track', () => {
    writeIDJActiveCue('b', 'track-a', { kind: 'hot', slot: 5 })
    expect(readIDJActiveCues().b['track-a']).toEqual({ kind: 'hot', slot: 5 })
    expect(idjActiveCueKey({ kind: 'hot', slot: 5 })).toBe('hot-5')
    writeIDJActiveCue('b', 'track-a', null)
    expect(readIDJActiveCues().b['track-a']).toBeUndefined()
  })

  it('resolves the selected cue and falls back to memory', () => {
    expect(
      resolveIDJActiveCue({
        active: { kind: 'hot', slot: 2 },
        memorySec: 12,
        hotSlots: { 2: 44 },
        trackCues: [{ id: 'drop', label: 'Drop', timeSec: 64 }],
      }),
    ).toEqual({ cue: { kind: 'hot', slot: 2 }, timeSec: 44, label: 'Hot 2' })
    expect(
      resolveIDJActiveCue({
        active: { kind: 'hot', slot: 2 },
        memorySec: 12,
        hotSlots: {},
      }),
    ).toEqual({ cue: { kind: 'memory' }, timeSec: 12, label: 'Memory / SET' })
    expect(
      resolveIDJActiveCue({
        active: { kind: 'track', id: 'drop' },
        trackCues: [{ id: 'drop', label: 'Drop', timeSec: 64 }],
      }),
    ).toEqual({ cue: { kind: 'track', id: 'drop' }, timeSec: 64, label: 'Drop' })
  })
})
