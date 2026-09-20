/**
 * User blend-automation curves for the volume crossfader.
 * Gain shape only — EQ dials are independent. Filter/Cut/Bass-swap keep their
 * own style envelopes during Auto DJ mixes.
 */

export type BlendGainShape = 'equal-power' | 'linear' | 'late'

export type BlendAutomation = {
  /** Channel-fader law through the overlap. */
  gainShape: BlendGainShape
  /** Incoming bass stays killed until this handoff amount (0–1). */
  bassKnee: number
  /** How deep outgoing bass is cut as the blend completes. */
  bassKillDb: number
  /** Complementary mid/vocal duck on both decks. 0 = off. */
  midDuckDb: number
}

export const DEFAULT_BLEND_AUTOMATION: BlendAutomation = {
  gainShape: 'equal-power',
  bassKnee: 0.5,
  bassKillDb: 24,
  midDuckDb: 8,
}

export const BLEND_AUTOMATION_STORAGE_KEY = 'sergik.blendAutomation'
export const BLEND_AUTOMATION_EVENT = 'sergik-blend-automation'

export const GAIN_SHAPE_OPTIONS: Array<{ id: BlendGainShape; label: string; hint: string }> = [
  { id: 'equal-power', label: 'Equal power', hint: 'Constant loudness S-curve' },
  { id: 'linear', label: 'Linear', hint: 'Straight A→B fader law' },
  { id: 'late', label: 'Late', hint: 'Hold outgoing, then cut over' },
]

export const BASS_KNEE_OPTIONS: Array<{ id: string; knee: number; label: string }> = [
  { id: 'early', knee: 0.28, label: 'Early' },
  { id: 'mid', knee: 0.5, label: 'Mid' },
  { id: 'late', knee: 0.72, label: 'Late' },
]

export const BASS_KILL_OPTIONS: Array<{ id: string; db: number; label: string }> = [
  { id: 'off', db: 0, label: 'Off' },
  { id: 'soft', db: 12, label: 'Soft' },
  { id: 'full', db: 24, label: 'Full' },
]

export const MID_DUCK_OPTIONS: Array<{ id: string; db: number; label: string }> = [
  { id: 'off', db: 0, label: 'Off' },
  { id: 'light', db: 4, label: 'Light' },
  { id: 'full', db: 8, label: 'Full' },
]

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n))
}

export function normalizeBlendAutomation(raw: unknown): BlendAutomation {
  const o = raw && typeof raw === 'object' ? (raw as Partial<BlendAutomation>) : {}
  const gainShape =
    o.gainShape === 'linear' || o.gainShape === 'late' || o.gainShape === 'equal-power'
      ? o.gainShape
      : DEFAULT_BLEND_AUTOMATION.gainShape
  return {
    gainShape,
    bassKnee: clamp(
      typeof o.bassKnee === 'number' && Number.isFinite(o.bassKnee)
        ? o.bassKnee
        : DEFAULT_BLEND_AUTOMATION.bassKnee,
      0.12,
      0.88,
    ),
    bassKillDb: clamp(
      typeof o.bassKillDb === 'number' && Number.isFinite(o.bassKillDb)
        ? o.bassKillDb
        : DEFAULT_BLEND_AUTOMATION.bassKillDb,
      0,
      36,
    ),
    midDuckDb: clamp(
      typeof o.midDuckDb === 'number' && Number.isFinite(o.midDuckDb)
        ? o.midDuckDb
        : DEFAULT_BLEND_AUTOMATION.midDuckDb,
      0,
      16,
    ),
  }
}

export function readBlendAutomation(): BlendAutomation {
  if (typeof window === 'undefined') return { ...DEFAULT_BLEND_AUTOMATION }
  try {
    const raw = window.localStorage.getItem(BLEND_AUTOMATION_STORAGE_KEY)
    if (!raw) return { ...DEFAULT_BLEND_AUTOMATION }
    return normalizeBlendAutomation(JSON.parse(raw))
  } catch {
    return { ...DEFAULT_BLEND_AUTOMATION }
  }
}

export function writeBlendAutomation(next: BlendAutomation): BlendAutomation {
  const normalized = normalizeBlendAutomation(next)
  if (typeof window === 'undefined') return normalized
  try {
    window.localStorage.setItem(BLEND_AUTOMATION_STORAGE_KEY, JSON.stringify(normalized))
    window.dispatchEvent(new CustomEvent(BLEND_AUTOMATION_EVENT, { detail: normalized }))
  } catch {
    /* quota */
  }
  return normalized
}

export function patchBlendAutomation(patch: Partial<BlendAutomation>): BlendAutomation {
  return writeBlendAutomation({ ...readBlendAutomation(), ...patch })
}
