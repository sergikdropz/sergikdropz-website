import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Verify a Resend/Svix webhook signature.
 * `whsec_` secrets are base64 key bytes and must be used as a Buffer.
 * Treating those bytes as a binary string makes HMAC UTF-8-encode them and reject every event.
 */
export function verifyResendSignature(payload: string, headers: Headers, secret: string): boolean {
  const msgId = headers.get('svix-id') || headers.get('webhook-id')
  const timestamp = headers.get('svix-timestamp') || headers.get('webhook-timestamp')
  const signatureHeader = headers.get('svix-signature') || headers.get('webhook-signature') || ''
  if (!msgId || !timestamp || !signatureHeader) return false

  const ageSec = Math.abs(Date.now() / 1000 - Number(timestamp))
  if (!Number.isFinite(ageSec) || ageSec > 60 * 5) return false

  const trimmed = secret.trim()
  const key = trimmed.startsWith('whsec_') ? Buffer.from(trimmed.slice(6), 'base64') : trimmed
  const signed = `${msgId}.${timestamp}.${payload}`
  const expected = createHmac('sha256', key).update(signed).digest('base64')
  const candidates = signatureHeader
    .split(' ')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => (part.includes(',') ? part.split(',')[1] : part.replace(/^v1,/, '')))

  const expectedBuf = Buffer.from(expected)
  for (const candidate of candidates) {
    try {
      const got = Buffer.from(candidate)
      if (got.length === expectedBuf.length && timingSafeEqual(got, expectedBuf)) return true
    } catch {
      /* try the next signature */
    }
  }
  return false
}
