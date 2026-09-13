import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'
import { persistVaultUnlockAsFan } from '@/lib/fan-crm'
import {
  FAN_VAULT_UNLOCK_COOKIE,
  cookieSecureFromRequest,
  fanVaultUnlockCookieDomain,
  hostnameFromRequest,
  readFanVaultUnlockToken,
  sealFanVaultUnlock,
} from '@/lib/fan-vault-unlock-cookie'
import { safeInternalPath } from '@/lib/safe-internal-path'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')
  const nextPath = safeInternalPath(request.nextUrl.searchParams.get('next')) || '/music-library'
  const host = hostnameFromRequest(request)
  const cookieDomain = fanVaultUnlockCookieDomain(host)
  const secure =
    cookieSecureFromRequest(request) ||
    (process.env.NODE_ENV === 'production' && process.env.VERCEL === '1')

  const email = readFanVaultUnlockToken(token)
  if (!email) {
    const failUrl = new URL('/music-library/unlock', request.url)
    failUrl.searchParams.set('next', nextPath)
    failUrl.searchParams.set('error', 'invalid_unlock')
    return NextResponse.redirect(failUrl)
  }

  try {
    await persistVaultUnlockAsFan(createSupabaseServerClient(), {
      email,
      displayName: null,
      source: 'vault_unlock',
      campaign: null,
    })
  } catch (e) {
    console.warn('vault unlock complete fan persist skipped:', e)
  }

  // Re-seal token server-side to extend/normalize cookie lifetime.
  const { token: freshToken, maxAgeSec } = sealFanVaultUnlock(email)
  const redirectUrl = new URL(nextPath, request.url)
  const response = NextResponse.redirect(redirectUrl)
  response.cookies.set(FAN_VAULT_UNLOCK_COOKIE, freshToken, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    maxAge: maxAgeSec,
    path: '/',
    ...(cookieDomain ? { domain: cookieDomain } : {}),
  })
  return response
}
