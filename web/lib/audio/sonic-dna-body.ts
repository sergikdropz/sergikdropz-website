/** API envelope `{ sonicDNA }` or the stored Sonic DNA object itself. */
export function sonicDnaFromBody(body: unknown): unknown {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  const rec = body as Record<string, unknown>
  if (rec.sonicDNA && typeof rec.sonicDNA === 'object') return rec.sonicDNA
  if (rec.measured || rec.genres || rec.comprehensive || rec.emotional || rec.summary) return body
  return null
}
