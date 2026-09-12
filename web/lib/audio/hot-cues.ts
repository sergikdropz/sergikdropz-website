export const HOT_CUE_STORAGE_KEY = 'sergik-hotcues-v1'
export const HOT_CUE_SLOTS = [1, 2, 3, 4, 5, 6, 7, 8] as const
export type HotCueSlot = (typeof HOT_CUE_SLOTS)[number]
export type HotCueSlots = Partial<Record<HotCueSlot, number>>

function storage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null
    return localStorage
  } catch {
    return null
  }
}

function readAll(): Record<string, Record<string, unknown>> {
  const store = storage()
  if (!store) return {}
  try {
    const raw = store.getItem(HOT_CUE_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    return parsed as Record<string, Record<string, unknown>>
  } catch {
    return {}
  }
}

function writeAll(all: Record<string, Record<string, unknown>>): void {
  const store = storage()
  if (!store) return
  try {
    store.setItem(HOT_CUE_STORAGE_KEY, JSON.stringify(all))
  } catch {
    /* ignore quota */
  }
}

export function readHotCueSlots(trackId: string | null | undefined): HotCueSlots {
  if (!trackId) return {}
  const map = readAll()[trackId]
  if (!map || typeof map !== 'object') return {}
  const out: HotCueSlots = {}
  for (const slot of HOT_CUE_SLOTS) {
    const value = map[String(slot)]
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      out[slot] = value
    }
  }
  return out
}

export function writeHotCueSlot(
  trackId: string,
  slot: HotCueSlot,
  timeSec: number,
): HotCueSlots {
  if (!trackId || !Number.isFinite(timeSec) || timeSec < 0) return readHotCueSlots(trackId)
  const all = readAll()
  const nextMap = { ...(all[trackId] || {}), [String(slot)]: timeSec }
  all[trackId] = nextMap
  writeAll(all)
  return readHotCueSlots(trackId)
}

function persistTrackSlots(
  trackId: string,
  nextMap: Record<string, unknown>,
): HotCueSlots {
  const all = readAll()
  const kept: Record<string, unknown> = {}
  for (const slot of HOT_CUE_SLOTS) {
    const value = nextMap[String(slot)]
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      kept[String(slot)] = value
    }
  }
  if (Object.keys(kept).length === 0) delete all[trackId]
  else all[trackId] = kept
  writeAll(all)
  return readHotCueSlots(trackId)
}

export function clearHotCueSlot(trackId: string, slot: HotCueSlot): HotCueSlots {
  if (!trackId) return {}
  const current = { ...(readAll()[trackId] || {}) }
  delete current[String(slot)]
  return persistTrackSlots(trackId, current)
}

export function clearAllHotCueSlots(trackId: string): HotCueSlots {
  if (!trackId) return {}
  const all = readAll()
  delete all[trackId]
  writeAll(all)
  return {}
}

export function hasAnyHotCue(slots: HotCueSlots | null | undefined): boolean {
  if (!slots) return false
  return HOT_CUE_SLOTS.some((slot) => typeof slots[slot] === 'number')
}
