/**
 * Map Auto DJ blend progress onto the A↔B crossfader.
 * Blend 0→1 is outgoing→incoming. Rest position follows the live deck.
 */
export function mixCrossfaderPosition(params: {
  liveDeck: 'a' | 'b'
  /** Outgoing→incoming 0→1 while blending; null when idle. */
  blendProgress?: number | null
}): number {
  const rest = params.liveDeck === 'b' ? 1 : 0
  const raw = params.blendProgress
  if (raw == null || !Number.isFinite(raw)) return rest
  const t = Math.max(0, Math.min(1, raw))
  // During a blend, `liveDeck` is still the outgoing deck.
  return params.liveDeck === 'a' ? t : 1 - t
}
