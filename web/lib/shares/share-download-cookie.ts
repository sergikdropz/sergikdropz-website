import { createHmac, timingSafeEqual } from 'crypto'
import type { NextRequest, NextResponse } from 'next/server'

export const SHARE_DOWNLOAD_COOKIE = 'sergik_dl'
const MAX_AGE_SEC = 60 * 60 * 24 * 14

export function shareDownloadSecret(): string {
  const configured = process.env.SHARE_DOWNLOAD_SECRET || process.env.FAN_VAULT_UNLOCK_SECRET
  if (configured && configured.length >= 16) return configured
  if (process.env.NODE_ENV !== 'production') return 'dev-share-download-secret-min-16'
  throw new Error('SHARE_DOWNLOAD_SECRET or FAN_VAULT_UNLOCK_SECRET must be set (min 16 chars)')
}

function sign(body: string): string {
  return createHmac('sha256', shareDownloadSecret()).update(body).digest('base64url')
}

export function sealShareDownloadCookie(email: string, grantId: string): { token: string; maxAgeSec: number } {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE_SEC
  const emailPart = Buffer.from(email.trim().toLowerCase(), 'utf8').toString('base64url')
  const body = `${emailPart}.${grantId}.${exp}`
  return { token: `${body}.${sign(body)}`, maxAgeSec: MAX_AGE_SEC }
}

export function readShareDownloadCookie(
  token: string | undefined | null,
): { email: string; grantId: string } | null {
  if (!token) return null
  const parts = token.split('.')
  if (parts.length !== 4) return null
  const [emailPart, grantId, expStr, sig] = parts
  if (!emailPart || !grantId || !expStr || !sig) return null
  const exp = Number(expStr)
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return null
  const body = `${emailPart}.${grantId}.${expStr}`
  const expected = sign(body)
  try {
    const a = Buffer.from(sig)
    const b = Buffer.from(expected)
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  } catch {
    return null
  }
  let email = ''
  try {
    email = Buffer.from(emailPart, 'base64url').toString('utf8').trim().toLowerCase()
  } catch {
    return null
  }
  if (!email.includes('@') || email.length > 320) return null
  return { email, grantId }
}

export function shareDownloadCookieOptions(request: NextRequest, maxAgeSec: number) {
  const proto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase()
  const secure = proto ? proto === 'https' : request.nextUrl.protocol === 'https:'
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure,
    path: '/',
    maxAge: maxAgeSec,
  }
}

export function applyShareDownloadCookie(
  response: NextResponse,
  request: NextRequest,
  email: string,
  grantId: string,
) {
  const sealed = sealShareDownloadCookie(email, grantId)
  response.cookies.set(
    SHARE_DOWNLOAD_COOKIE,
    sealed.token,
    shareDownloadCookieOptions(request, sealed.maxAgeSec),
  )
}
