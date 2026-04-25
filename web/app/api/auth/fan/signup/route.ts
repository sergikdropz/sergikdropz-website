import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseClient } from '@/lib/supabase'
import { checkRateLimit, clientKeyFromRequest } from '@/lib/rate-limit'
import { safeInternalPath } from '@/lib/safe-internal-path'
import { fanAuthBaseUrl } from '@/lib/fan-magic-link'
import { markFanPasswordCredential } from '@/lib/fan-password-credential'
import { applySupabaseSessionCookies } from '@/lib/auth/apply-supabase-session-cookies'

export const dynamic = 'force-dynamic'

const WINDOW_MS = 60 * 60 * 1000
const MAX_ATTEMPTS = 10

function validPassword(pw: string): boolean {
  return typeof pw === 'string' && pw.length >= 8 && pw.length <= 128
}

export async function POST(request: NextRequest) {
  const rl = checkRateLimit(`fan-signup:${clientKeyFromRequest(request)}`, MAX_ATTEMPTS, WINDOW_MS)
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many sign-up attempts. Try again later.' },
      {
        status: 429,
        headers: { 'Retry-After': String(rl.retryAfterSec) },
      }
    )
  }

  const body = await request.json().catch(() => ({}))
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : undefined
  const nextRaw = typeof body.next === 'string' ? body.next : '/fan/account'
  const nextPath = safeInternalPath(nextRaw) || '/fan/account'
  const rememberMe = Boolean(body.rememberMe)

  if (!email.includes('@')) {
    return NextResponse.json({ error: 'Valid email is required' }, { status: 400 })
  }
  if (!validPassword(password)) {
    return NextResponse.json(
      { error: 'Password must be at least 8 characters.' },
      { status: 400 }
    )
  }

  const base = fanAuthBaseUrl(request)
  const emailRedirectTo = `${base}/auth/callback?next=${encodeURIComponent(nextPath)}`

  const supabase = createSupabaseClient()
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo,
      data: displayName ? { display_name: displayName } : undefined,
    },
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  if (data.session && data.user?.id) {
    await markFanPasswordCredential(data.user.id)
    const res = NextResponse.json({
      ok: true,
      session: true,
      message: 'Account created. You are signed in.',
    })
    applySupabaseSessionCookies(res, data.session, rememberMe)
    return res
  }

  return NextResponse.json({
    ok: true,
    needsEmailConfirm: true,
    message:
      'Check your email to confirm your address, then sign in with your password to use the shop.',
  })
}
