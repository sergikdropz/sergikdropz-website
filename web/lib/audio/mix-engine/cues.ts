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
