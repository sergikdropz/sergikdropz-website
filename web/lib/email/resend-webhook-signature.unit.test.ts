import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { verifyResendSignature } from '@/lib/email/resend-webhook-signature'

function signedHeaders(payload: string, key: Buffer | string) {
  const id = 'msg_test'
  const timestamp = String(Math.floor(Date.now() / 1000))
  const signature = createHmac('sha256', key).update(`${id}.${timestamp}.${payload}`).digest('base64')
  return new Headers({
    'svix-id': id,
    'svix-timestamp': timestamp,
    'svix-signature': `v1,${signature}`,
  })
}

describe('Resend webhook signature', () => {
  it('accepts a whsec secret whose key bytes are outside latin1-as-utf8', () => {
    const key = Buffer.from('00112233445566778899aabbccddeeff0011223344556677', 'hex')
    const secret = `whsec_${key.toString('base64')}`
    const payload = '{"type":"email.delivered"}'
    const headers = signedHeaders(payload, key)
    expect(verifyResendSignature(payload, headers, secret)).toBe(true)
  })

  it('rejects a signature made with the utf8-mangled key', () => {
    const key = Buffer.from('00112233445566778899aabbccddeeff0011223344556677', 'hex')
    const secret = `whsec_${key.toString('base64')}`
    const payload = '{"type":"email.delivered"}'
    const mangled = Buffer.from(secret.slice(6), 'base64').toString('binary')
    const headers = signedHeaders(payload, mangled)
    expect(verifyResendSignature(payload, headers, secret)).toBe(false)
  })
})
