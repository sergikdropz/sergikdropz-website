import { hasUnifiedSonicDnaIntelligence } from '@/lib/audio/compose-unified-sonic-dna'
import { ensureSonicDnaReportSectionsFilled, getSonicDnaReportView } from '@/lib/audio/sonic-dna-report-sections'
import { isSonicDnaReadyForDisplay } from '@/lib/audio/sonic-dna-pipeline'
import { extractMeasured, parseSonicDna } from '@/lib/audio/sonic-dna-quality'

export type SonicDnaIntelligenceSource =
  | 'unified-intelligence'
  | 'intelligence-encyclopedia'
  | 'composed-encyclopedia'
  | null

/** True when measured intelligence + encyclopedia report layers are present. */
export function hasIntelligenceEncyclopediaCard(dna: unknown): boolean {
  const root = parseSonicDna(dna)
  if (!root || !isSonicDnaReadyForDisplay(root)) return false
  if (hasUnifiedSonicDnaIntelligence(root)) return true
  const measured = extractMeasured(root)
  const intel = measured?.intelligence
  if (!intel || typeof intel !== 'object') return false
  return Boolean(getSonicDnaReportView(root).encyclopedia)
}

export function resolveIntelligenceLoadSource(dna: unknown): SonicDnaIntelligenceSource {
  const root = parseSonicDna(dna)
  if (!root) return null
  if (hasUnifiedSonicDnaIntelligence(root)) return 'unified-intelligence'
  if (hasIntelligenceEncyclopediaCard(root)) return 'intelligence-encyclopedia'
  return null
}

/**
 * Prepare Sonic DNA for display from measured intelligence + world-genre encyclopedia.
 * Does not call AI — uses compiled knowledge cards or deterministic encyclopedia fill.
 */
export function prepareSonicDnaFromIntelligence(dna: unknown): Record<string, any> | null {
  const parsed = parseSonicDna(dna)
  if (!parsed || !isSonicDnaReadyForDisplay(parsed)) return null

  if (hasUnifiedSonicDnaIntelligence(parsed)) {
    return parsed
  }

  if (hasIntelligenceEncyclopediaCard(parsed)) {
    return parsed
  }

  try {
    const filled = ensureSonicDnaReportSectionsFilled(parsed)
    if (hasIntelligenceEncyclopediaCard(filled)) return filled
    if (isSonicDnaReadyForDisplay(filled)) return filled
  } catch {
    // fall through
  }

  return null
}

/** API response helper — classify intelligence load origin. */
export function intelligenceCardSourceLabel(dna: unknown): SonicDnaIntelligenceSource {
  const prepared = prepareSonicDnaFromIntelligence(dna)
  if (!prepared) return null
  const direct = resolveIntelligenceLoadSource(prepared)
  if (direct) return direct
  return getSonicDnaReportView(prepared).encyclopedia ? 'composed-encyclopedia' : null
}
