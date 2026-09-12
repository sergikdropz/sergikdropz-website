import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  HOT_CUE_STORAGE_KEY,
  hasAnyHotCue,
  readHotCueSlots,
  writeHotCueSlot,
  clearHotCueSlot,
  clearAllHotCueSlots,
} from './hot-cues'

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

describe('hot-cues', () => {
  beforeEach(() => {
    installMemoryStorage()
  })

  afterEach(() => {
    localStorage.removeItem(HOT_CUE_STORAGE_KEY)
  })

  it('returns empty slots for a missing track', () => {
    expect(readHotCueSlots('track-a')).toEqual({})
    expect(hasAnyHotCue({})).toBe(false)
  })

  it('persists a slot and ignores invalid times', () => {
    expect(writeHotCueSlot('track-a', 2, 12.5)).toEqual({ 2: 12.5 })
    expect(readHotCueSlots('track-a')).toEqual({ 2: 12.5 })
    expect(hasAnyHotCue(readHotCueSlots('track-a'))).toBe(true)
    writeHotCueSlot('track-a', 1, Number.NaN)
    expect(readHotCueSlots('track-a')).toEqual({ 2: 12.5 })
  })

  it('stores slots beyond the original 1–4 bank', () => {
    expect(writeHotCueSlot('track-a', 8, 91)).toEqual({ 8: 91 })
    expect(readHotCueSlots('track-a')).toEqual({ 8: 91 })
  })

  it('deletes one slot and clears the rest', () => {
    writeHotCueSlot('track-a', 1, 4)
    writeHotCueSlot('track-a', 3, 16)
    expect(clearHotCueSlot('track-a', 1)).toEqual({ 3: 16 })
    expect(readHotCueSlots('track-a')).toEqual({ 3: 16 })
    expect(clearAllHotCueSlots('track-a')).toEqual({})
    expect(readHotCueSlots('track-a')).toEqual({})
    expect(hasAnyHotCue(readHotCueSlots('track-a'))).toBe(false)
  })
})
