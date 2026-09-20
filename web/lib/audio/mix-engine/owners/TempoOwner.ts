/**
 * TempoOwner — single authority for pair BPM + idle cue arm rates.
 * Callers should go through these helpers instead of ad-hoc rate writes.
 */

export {
  clampTempoRate,
  shouldNotifyMixUiRate,
  TEMPO_MIN,
  TEMPO_MAX,
  MIX_RATE_SLEW,
} from '../tempo'
export { resolvePairBpm, pairBpmLabelConflict } from '../auto-dj-pair'
export { resolvePlaybackBpm } from '@/lib/audio/sonic-dna-mix'
export { mixIncomingRateRatio, bpmRateRatio, normalizeBpmPair } from '../sync'
