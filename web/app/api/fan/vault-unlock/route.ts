import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'
import { GOOGLE_VAULT_SOURCE, persistVaultUnlockAsFan } from '@/lib/fan-crm'
import { checkRateLimit, clientKeyFromRequest } from '@/lib/rate-limit'
import {
  FAN_VAULT_UNLOCK_COOKIE,
  cookieSecureFromRequest,
  fanVaultUnlockCookieDomain,
  hostnameFromRequest,
  sealFanVaultUnlock,
} from '@/lib/fan-vault-unlock-cookie'
import { profileFromGoogleIdToken } from '@/lib/auth/google-id-profile'
import { profileFromGoogleAccessToken, youtubeOAuthClientId } from '@/lib/youtube/subscribe-gate'

export const dynamic = 'force-dynamic'

const WINDOW_MS = 15 * 60 * 1000
const MAX_ATTEMPTS = 30

function normalizeEmail(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim().toLowerCase()
  if (!s.includes('@') || s.length > 320) return null
  return s
}

export async function POST(request: NextRequest) {
  try {
    const rl = checkRateLimit(`vault-unlock:${clientKeyFromRequest(request)}`, MAX_ATTEMPTS, WINDOW_MS)
    if (!rl.ok) {
      return NextResponse.json(
        { error: 'Too many attempts. Try again later.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
      )
    }

    const body = await request.json().catch(() => ({}))
    let email = normalizeEmail(body.email)
    let googleName: string | null = null
    let signedInWithGoogle = false
    if (!email && typeof body.credential === 'string') {
      const profile = await profileFromGoogleIdToken(body.credential, youtubeOAuthClientId())
      if (profile) {
        email = profile.email
        googleName = profile.name
        signedInWithGoogle = true
      }
    }
    if (!email && typeof body.accessToken === 'string') {
      const profile = await profileFromGoogleAccessToken(body.accessToken)
      if (profile) {
        email = profile.email
        googleName = profile.name
        signedInWithGoogle = true
      }
    }
    if (!email) {
      return NextResponse.json({ error: 'Valid email is required' }, { status: 400 })
    }

    const typedName =
      typeof body.displayName === 'string' ? body.displayName.trim().slice(0, 120) || null : null
    const displayName = typedName || googleName
    const typedSource = typeof body.source === 'string' ? body.source.trim().slice(0, 64) || null : null
    const source = signedInWithGoogle ? GOOGLE_VAULT_SOURCE : typedSource
    const campaign = typeof body.campaign === 'string' ? body.campaign.trim().slice(0, 64) || null : null

    // CRM is best-effort: write `fans` (FansAdmin) + `fan_leads` (unlock timestamps).
    // The httpOnly unlock cookie is what grants vault listen access.
    try {
      await persistVaultUnlockAsFan(createSupabaseServerClient(), {
        email,
        displayName,
        source,
        campaign,
      })
    } catch (e) {
      console.warn('vault unlock fan persist skipped:', e)
    }

    const { token, maxAgeSec } = sealFanVaultUnlock(email)
    const host = hostnameFromRequest(request)
    const cookieDomain = fanVaultUnlockCookieDomain(host)
    const secure =
      cookieSecureFromRequest(request) ||
      (process.env.NODE_ENV === 'production' && process.env.VERCEL === '1')

    const res = NextResponse.json({ ok: true })
    res.cookies.set(FAN_VAULT_UNLOCK_COOKIE, token, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      maxAge: maxAgeSec,
      path: '/',
      ...(cookieDomain ? { domain: cookieDomain } : {}),
    })
    return res
  } catch (e) {
    console.error('vault-unlock:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
