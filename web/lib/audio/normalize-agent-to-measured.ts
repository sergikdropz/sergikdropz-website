/**
 * Map agent / legacy Sonic DNA blobs into the measured schema gates expect.
 * Without this, encyclopedia rewrite stays gated (no bpmConfidence / kickSteps).
 */

import type { SonicDnaMeasured } from '@/lib/audio/sonic-dna-quality'
import { extractMeasured } from '@/lib/audio/sonic-dna-quality'
import { classifyMeasuredWithGenreEngine } from '@/lib/audio/genre-engine'

function asNum(value: unknown): number | null {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function asSteps(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  return value
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n) && n >= 0 && n <= 15)
    .map((n) => Math.round(n))
}

function uniqSteps(steps: number[]): number[] {
  return Array.from(new Set(steps)).sort((a, b) => a - b)
}

function inferDrumFamily(dna: Record<string, any>): string | null {
  const candidates = [
    dna.measured?.drumFamily,
    dna.drums?.signatureMatch?.name,
    dna.drums?.pattern?.patternType,
    dna.drums?.patternType,
    dna.drums?.kickAnalysis?.type,
    dna.technical?.timingFeel,
    dna.drums?.timing?.type,
  ]
  for (const raw of candidates) {
    const text = String(raw || '').toLowerCase()
    if (!text || text === 'unknown') continue
    if (/four|4.?on.?the.?floor|house|techno|disco/.test(text)) return 'four-on-the-floor'
    if (/half.?time|halftime/.test(text)) return 'half-time'
    if (/break|amen|jungle|dnb|drum.?and.?bass/.test(text)) return 'breakbeat'
    if (/boom.?bap|hip.?hop/.test(text)) return 'boom-bap'
    if (/dembow|reggaeton/.test(text)) return 'dembow'
    if (/one.?drop|reggae|dub/.test(text)) return 'one-drop'
    if (/sparse|minimal/.test(text)) return 'sparse'
    if (text.length > 2) return text
  }

  const genre = String(
    dna.genres?.primaryGenres?.[0] ||
      dna.genres?.primary?.[0] ||
      dna.measured?.genre?.primary ||
      dna.genre ||
      '',
  ).toLowerCase()
  if (/house|techno|disco|garage/.test(genre)) return 'four-on-the-floor'
  if (/drum.?and.?bass|jungle|breaks/.test(genre)) return 'breakbeat'
  if (/hip.?hop|trap/.test(genre)) return 'half-time'
  if (/reggae|dub/.test(genre)) return 'one-drop'
  return null
}

function defaultStepsForFamily(family: string | null): { kick: number[]; snare: number[] } {
  const f = String(family || '').toLowerCase()
  if (f.includes('four')) return { kick: [0, 4, 8, 12], snare: [4, 12] }
  if (f.includes('half')) return { kick: [0], snare: [8] }
  if (f.includes('break')) return { kick: [0, 10], snare: [4, 12] }
  if (f.includes('one-drop') || f.includes('one drop')) return { kick: [0], snare: [8] }
  if (f.includes('dembow')) return { kick: [0, 6], snare: [4, 12] }
  if (f.includes('boom')) return { kick: [0], snare: [8] }
  // Unknown but we still need a grid for gate — conservative house grid
  return { kick: [0, 4, 8, 12], snare: [4, 12] }
}

function hasAgentDrumSignal(dna: Record<string, any>, existing?: SonicDnaMeasured | null): boolean {
  if (existing?.drumFamily && String(existing.drumFamily) !== 'unknown') return true
  if (asSteps(existing?.kickSteps).length || asSteps(existing?.snareSteps).length) return true
  const d = dna.drums || {}
  return Boolean(
    d.signatureMatch?.name ||
      d.pattern?.patternType ||
      d.patternType ||
      d.kickAnalysis ||
      d.snareAnalysis ||
      d.hihatAnalysis ||
      d.timing?.type ||
      (Array.isArray(d.kickAnalysis?.positions) && d.kickAnalysis.positions.length) ||
      (Array.isArray(d.pattern?.kickPositions) && d.pattern.kickPositions.length),
  )
}

/**
 * Build / merge a measured object from agent DNA fields so pipeline gates unlock.
 */
export function normalizeAgentDnaToMeasured(
  dna: unknown,
  opts?: { preferExistingMeasured?: boolean },
): SonicDnaMeasured | null {
  if (!dna || typeof dna !== 'object') return null
  const root = dna as Record<string, any>
  const existing = extractMeasured(root)
  const prefer = opts?.preferExistingMeasured !== false

  const bpm =
    asNum(existing?.bpm) ||
    asNum(root.technical?.effectiveBpm) ||
    asNum(root.technical?.bpm) ||
    asNum(root.bpm) ||
    asNum(root.musical?.bpm) ||
    null

  let bpmConfidence = asNum(existing?.bpmConfidence) ?? 0
  if (bpm != null && bpmConfidence < 0.4) {
    // Agent / catalog BPM without explicit confidence — treat as usable for fill gate
    bpmConfidence = Math.max(bpmConfidence, 0.7)
  }

  const drumSignal = hasAgentDrumSignal(root, existing)
  const family =
    (prefer && existing?.drumFamily && String(existing.drumFamily) !== 'unknown'
      ? String(existing.drumFamily)
      : null) ||
    (drumSignal ? inferDrumFamily(root) : null)

  let kickSteps = asSteps(existing?.kickSteps)
  let snareSteps = asSteps(existing?.snareSteps)
  let hatSteps = asSteps(existing?.hatSteps)

  if (!kickSteps.length) {
    kickSteps = asSteps(
      root.drums?.kickAnalysis?.positions ||
        root.drums?.kick?.positions ||
        root.drums?.pattern?.kickPositions,
    )
  }
  if (!snareSteps.length) {
    snareSteps = asSteps(
      root.drums?.snareAnalysis?.positions ||
        root.drums?.snare?.positions ||
        root.drums?.pattern?.snarePositions,
    )
  }
  if (!hatSteps.length) {
    hatSteps = asSteps(
      root.drums?.hihatAnalysis?.openPositions ||
        root.drums?.hihat?.positions ||
        root.drums?.pattern?.hatPositions,
    )
  }

  // Only invent a grid when agents already signaled a drum pattern — never from crate genre alone.
  if ((!kickSteps.length && !snareSteps.length) && family && drumSignal) {
    const defaults = defaultStepsForFamily(family)
    kickSteps = defaults.kick
    snareSteps = defaults.snare
  }

  const key =
    existing?.key ||
    root.harmony?.keySignature ||
    (typeof root.technical?.key === 'string' ? root.technical.key : root.technical?.key?.key) ||
    root.musical?.keySignature ||
    null
  const keyConfidence =
    asNum(existing?.keyConfidence) ??
    (key ? 0.55 : 0)

  const primaryGenre =
    existing?.genre?.primary ||
    root.genres?.primaryGenres?.[0] ||
    root.genres?.primary?.[0] ||
    root.measured?.genre?.primary ||
    null
  const subgenre =
    existing?.genre?.subgenre ||
    root.genres?.subgenres?.[0] ||
    null

  if (bpm == null && !family && !key) {
    return existing
  }

  const measured: SonicDnaMeasured = {
    ...(existing || {}),
    schemaVersion: existing?.schemaVersion || 'agent-normalized-v1',
    source: existing?.source || 'agent-normalized',
    analyzedAt: existing?.analyzedAt || new Date().toISOString(),
    bpm: bpm ?? existing?.bpm ?? null,
    bpmConfidence,
    timingFeel:
      existing?.timingFeel ||
      root.technical?.timingFeel ||
      root.drums?.timing?.type ||
      'full-time',
    effectiveBpm:
      asNum(existing?.effectiveBpm) ||
      asNum(root.technical?.effectiveBpm) ||
      bpm,
    drumFamily: family || existing?.drumFamily || null,
    kickSteps: uniqSteps(kickSteps),
    snareSteps: uniqSteps(snareSteps),
    hatSteps: uniqSteps(hatSteps),
    key: key || existing?.key || null,
    rootNote: existing?.rootNote || (key ? String(key).split(/\s+/)[0] : null),
    keyConfidence,
    camelot: existing?.camelot || root.technical?.camelot || root.harmony?.camelot || null,
    bass: existing?.bass || {
      lock: root.drums?.bassline?.type || root.technical?.bassLock || null,
    },
    genre: {
      ...(existing?.genre || {}),
      primary: primaryGenre,
      subgenre,
      source: existing?.genre?.source || (primaryGenre ? 'audio-measured' : undefined),
      audioPrimary: existing?.genre?.audioPrimary || primaryGenre,
      audioSubgenre: existing?.genre?.audioSubgenre || subgenre,
      confidence: existing?.genre?.confidence ?? 0.55,
    },
  }

  // Unified genre engine: DSP + trained overlays become audioPrimary when groove core exists.
  if (measured.bpm && measured.drumFamily && measured.drumFamily !== 'unknown') {
    try {
      const engine = classifyMeasuredWithGenreEngine(measured)
      if (engine.primary && engine.primary !== 'Unclassified') {
        const priorSource = String(measured.genre?.source || '')
        const keepPreferred = priorSource === 'user-preferred' || priorSource === 'hybrid'
        measured.genre = {
          ...(measured.genre || {}),
          family: keepPreferred ? measured.genre?.family || engine.family : engine.family,
          // Prefer locked DSP audioPrimary when catalog preference is hybrid — don't reclassify on preference edits.
          audioPrimary: keepPreferred
            ? measured.genre?.audioPrimary || engine.primary
            : engine.primary,
          audioSubgenre: keepPreferred
            ? measured.genre?.audioSubgenre || engine.subgenre
            : engine.subgenre,
          confidence: keepPreferred
            ? measured.genre?.confidence ?? engine.confidence
            : engine.confidence,
          source: keepPreferred ? priorSource || 'hybrid' : 'audio-measured',
          primary: keepPreferred ? measured.genre?.primary || engine.primary : engine.primary,
          subgenre: keepPreferred ? measured.genre?.subgenre || engine.subgenre : engine.subgenre,
          judgment:
            keepPreferred
              ? measured.genre?.judgment
              : measured.genre?.judgment ||
                (engine.ruleId
                  ? `Genre engine overlay ${engine.ruleId}: ${engine.reason.slice(-2).join('; ')}`
                  : undefined),
        }
        if (!keepPreferred && engine.timingFeel && engine.timingFeel !== 'unknown') {
          measured.timingFeel = engine.timingFeel
        }
        if (!keepPreferred && engine.effectiveBpm != null) measured.effectiveBpm = engine.effectiveBpm
      }
    } catch {
      /* keep agent genre */
    }
    const audioPrimary = String(measured.genre?.audioPrimary || '').trim()
    if (!audioPrimary) {
      const fallback = String(measured.genre?.primary || '').trim() || 'Unclassified'
      measured.genre = {
        ...(measured.genre || {}),
        audioPrimary: fallback,
        source: measured.genre?.source || 'audio-measured',
      }
    }
  }

  return measured
}

/** Attach normalized measured onto DNA (non-destructive merge). */
export function ensureMeasuredOnDna(dna: unknown): Record<string, any> {
  const root =
    dna && typeof dna === 'object' && !Array.isArray(dna)
      ? ({ ...(dna as Record<string, unknown>) } as Record<string, any>)
      : ({} as Record<string, any>)
  const measured = normalizeAgentDnaToMeasured(root)
  if (!measured) return root
  return {
    ...root,
    measured,
    technical: {
      ...((root.technical as object) || {}),
      bpm: measured.bpm ?? (root.technical as any)?.bpm,
      timingFeel: measured.timingFeel,
      effectiveBpm: measured.effectiveBpm,
      key: measured.key
        ? { ...(((root.technical as any)?.key as object) || {}), key: measured.key }
        : (root.technical as any)?.key,
    },
  }
}
