import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseClient } from '@/lib/supabase'
import { checkAdminStatus } from '@/lib/auth'
import { checkRateLimit, clientKeyFromRequest } from '@/lib/rate-limit'
import { markFanPasswordCredential } from '@/lib/fan-password-credential'
import { applySupabaseSessionCookies } from '@/lib/auth/apply-supabase-session-cookies'

export const dynamic = 'force-dynamic'

const WINDOW_MS = 15 * 60 * 1000
const MAX_ATTEMPTS = 20

export async function POST(request: NextRequest) {
  const rl = checkRateLimit(`fan-pw-login:${clientKeyFromRequest(request)}`, MAX_ATTEMPTS, WINDOW_MS)
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many login attempts. Try again later.' },
      {
        status: 429,
        headers: { 'Retry-After': String(rl.retryAfterSec) },
      }
    )
  }

  const body = await request.json().catch(() => ({}))
  const email = typeof body.email === 'string' ? body.email.trim() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  const rememberMe = Boolean(body.rememberMe)

  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
  }

  const supabase = createSupabaseClient()
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })

  if (error || !data.user || !data.session) {
    return NextResponse.json(
      { error: error?.message || 'Invalid email or password' },
      { status: 401 }
    )
  }

  const isAdmin = await checkAdminStatus(data.user.email || '', data.user.id)
  if (isAdmin) {
    await supabase.auth.signOut()
    return NextResponse.json(
      { error: 'Use the admin sign-in page for artist tools.' },
      { status: 403 }
    )
  }

  await markFanPasswordCredential(data.user.id)

  const res = NextResponse.json({
    ok: true,
    user: { id: data.user.id, email: data.user.email },
  })
  applySupabaseSessionCookies(res, data.session, rememberMe)
  return res
}
