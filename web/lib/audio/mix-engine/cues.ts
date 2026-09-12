/**
 * Labeled mix cues from Sonic DNA + player hot-cue bank.
 */

export type MixCueRole = 'mix-in' | 'mix-out' | 'loop-in' | 'drop' | 'generic'

export type MixCue = {
  timeSec: number
  role: MixCueRole
  label?: string
}

function roleFromLabel(raw: string | undefined): MixCueRole {
  const s = String(raw || '').trim().toLowerCase()
  if (!s) return 'generic'
  if (/(mix[-\s]?out|outro|^out$)/.test(s)) return 'mix-out'
  if (/(mix[-\s]?in|intro|^in$)/.test(s)) return 'mix-in'
  if (/(loop)/.test(s)) return 'loop-in'
  if (/(drop|breakdown|break)/.test(s)) return 'drop'
  return 'generic'
}

function pushCue(out: MixCue[], timeSec: unknown, label?: string) {
  const t = Number(timeSec)
  if (!Number.isFinite(t) || t < 0) return
  out.push({ timeSec: t, role: roleFromLabel(label), label })
}

/** Parse mix-in / mix-out / loop / drop cues from DNA + optional player bank. */
export function parseMixCues(
  sonicDna: unknown,
  extra?: Array<{ timeSec?: number; time?: number; label?: string } | number> | null,
): MixCue[] {
  const out: MixCue[] = []
  if (sonicDna && typeof sonicDna === 'object') {
    const root = sonicDna as Record<string, unknown>
    const raw = root.hotCues ?? root.hot_cues ?? root.cues
    if (Array.isArray(raw)) {
      for (const item of raw) {
        if (typeof item === 'number') pushCue(out, item)
        else if (item && typeof item === 'object') {
          const o = item as Record<string, unknown>
          pushCue(out, o.timeSec ?? o.time ?? o.t, typeof o.label === 'string' ? o.label : undefined)
        }
      }
    }
  }
  if (Array.isArray(extra)) {
    for (const item of extra) {
      if (typeof item === 'number') pushCue(out, item)
      else if (item) pushCue(out, item.timeSec ?? item.time, item.label)
    }
  }
  out.sort((a, b) => a.timeSec - b.timeSec)
  return out
}

export function cueByRole(cues: MixCue[], role: MixCueRole): MixCue | null {
  return cues.find((c) => c.role === role) ?? null
}

function slotFromLabel(label: string | undefined): number | null {
  const s = String(label || '').trim().toLowerCase()
  const match = s.match(/(?:hot(?:\s*cue)?\s*)?([1-4])\b/)
  if (!match) return null
  return Number(match[1])
}

/** Player bank first, then DNA hot-cue list (labeled or 1-based index). */
export function resolveHotCueTime(
  sonicDna: unknown,
  extra: Array<{ timeSec?: number; time?: number; label?: string } | number> | null | undefined,
  slot: 1 | 2 | 3 | 4,
): number | null {
  if (Array.isArray(extra)) {
    for (const item of extra) {
      if (typeof item === 'number') continue
      if (!item) continue
      const labeled = slotFromLabel(item.label)
      const t = Number(item.timeSec ?? item.time)
      if (labeled === slot && Number.isFinite(t) && t >= 0) return t
    }
    const byIndex = extra[slot - 1]
    if (typeof byIndex === 'number' && Number.isFinite(byIndex) && byIndex >= 0) return byIndex
    if (byIndex && typeof byIndex === 'object' && !byIndex.label) {
      const t = Number(byIndex.timeSec ?? byIndex.time)
      if (Number.isFinite(t) && t >= 0) return t
    }
  }
  if (sonicDna && typeof sonicDna === 'object') {
    const raw = (sonicDna as Record<string, unknown>).hotCues
      ?? (sonicDna as Record<string, unknown>).hot_cues
    if (Array.isArray(raw)) {
      for (const item of raw) {
        if (!item || typeof item !== 'object') continue
        const o = item as Record<string, unknown>
        const labeled = slotFromLabel(typeof o.label === 'string' ? o.label : undefined)
        const t = Number(o.timeSec ?? o.time ?? o.t)
        if (labeled === slot && Number.isFinite(t) && t >= 0) return t
      }
      const byIndex = raw[slot - 1]
      if (typeof byIndex === 'number' && Number.isFinite(byIndex) && byIndex >= 0) return byIndex
    }
  }
  return null
}

export type DeckJumpCueId = 'mix-in' | 'mix-out' | 'drop' | 'loop-in' | 'first-downbeat'

export type DeckJumpCue = {
  id: DeckJumpCueId
  label: string
  timeSec: number
}

const JUMP_CUE_LABELS: Record<DeckJumpCueId, string> = {
  'mix-in': 'Mix-in',
  'mix-out': 'Mix-out',
  drop: 'Drop',
  'loop-in': 'Loop in',
  'first-downbeat': 'First downbeat',
}

const JUMP_CUE_ORDER: DeckJumpCueId[] = [
  'first-downbeat',
  'mix-in',
  'drop',
  'loop-in',
  'mix-out',
]

/** DNA / grid jump targets for the iDJ cue menu (not user-writable). */
export function listDeckJumpCues(input: {
  sonicDna?: unknown
  beatGridOffsetSec?: number | null
}): DeckJumpCue[] {
  const parsed = parseMixCues(input.sonicDna)
  const byRole = new Map<DeckJumpCueId, number>()
  const offset = Number(input.beatGridOffsetSec)
  if (Number.isFinite(offset) && offset >= 0) {
    byRole.set('first-downbeat', offset)
  }
  for (const role of ['mix-in', 'mix-out', 'drop', 'loop-in'] as const) {
    const found = cueByRole(parsed, role)
    if (found) byRole.set(role, found.timeSec)
  }
  return JUMP_CUE_ORDER.flatMap((id) => {
    const timeSec = byRole.get(id)
    if (typeof timeSec !== 'number') return []
    return [{ id, label: JUMP_CUE_LABELS[id], timeSec }]
  })
}
