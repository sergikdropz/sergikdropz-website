import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'

const VERSION = 'v1'

function sealKey(): Buffer {
  const secret =
    process.env.NEXTAUTH_SECRET ||
    process.env.CRON_SECRET ||
    process.env.FAN_VAULT_UNLOCK_SECRET ||
    ''
  if (secret.length < 16) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('NEXTAUTH_SECRET must be set before storing Meta page tokens')
    }
    return createHash('sha256').update('dev-meta-token-seal-min-16').digest()
  }
  return createHash('sha256').update(secret).digest()
}

/** AES-256-GCM envelope. Safe to store in settings JSON; never sent to the browser. */
export function sealMetaToken(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', sealKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [VERSION, iv.toString('base64url'), tag.toString('base64url'), ciphertext.toString('base64url')].join(
    '.'
  )
}

export function openMetaToken(sealed: string): string | null {
  const [version, ivPart, tagPart, dataPart] = String(sealed || '').split('.')
  if (version !== VERSION || !ivPart || !tagPart || !dataPart) return null
  try {
    const decipher = createDecipheriv('aes-256-gcm', sealKey(), Buffer.from(ivPart, 'base64url'))
    decipher.setAuthTag(Buffer.from(tagPart, 'base64url'))
    const plain = Buffer.concat([decipher.update(Buffer.from(dataPart, 'base64url')), decipher.final()])
    const value = plain.toString('utf8').trim()
    return value || null
  } catch {
    return null
  }
}
