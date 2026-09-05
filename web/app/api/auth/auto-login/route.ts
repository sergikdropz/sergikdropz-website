import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseClient } from '@/lib/supabase'
import { checkAdminStatus } from '@/lib/auth'
import { applySupabaseSessionCookies } from '@/lib/auth/apply-supabase-session-cookies'
import { resolveDevAutoLoginCredentials } from '@/lib/auth/dev-auto-login'

export const dynamic = 'force-dynamic'

function formatAuthError(message: string): string {
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|network/i.test(message)) {
    return 'Cannot reach Supabase. Check that your project is active and NEXT_PUBLIC_SUPABASE_URL in web/.env.local is correct.'
  }
  return message
}

function productionBlocked() {
  return NextResponse.json(
    { error: 'Auto-login disabled in production' },
    { status: 403 }
  )
}

async function signInAdmin(email: string, password: string) {
  const supabase = createSupabaseClient()
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return { error: formatAuthError(error.message), status: 401 as const }
  }
  if (!data.user || !data.session) {
    return { error: 'Authentication failed', status: 401 as const }
  }

  const isAdmin = await checkAdminStatus(email, data.user.id)
  if (!isAdmin) {
    await supabase.auth.signOut()
    return { error: 'Access denied. Admin privileges required.', status: 403 as const }
  }

  return {
    user: { id: data.user.id, email: data.user.email },
    session: data.session,
  }
}

function jsonWithSession(
  payload: { success: true; user: { id: string; email?: string | null }; session: { access_token: string; refresh_token: string } }
) {
  const response = NextResponse.json(payload)
  applySupabaseSessionCookies(response, payload.session, true)
  return response
}

/**
 * GET /api/auth/auto-login
 * Development helper: sign in with ADMIN_AUTO_LOGIN_* / E2E_ADMIN_* and redirect to /admin.
 */
export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') return productionBlocked()

  const creds = resolveDevAutoLoginCredentials()
  if (!creds) {
    return NextResponse.redirect(new URL('/admin/login?error=auto-login-not-configured', request.url))
  }

  const result = await signInAdmin(creds.email, creds.password)
  if ('error' in result) {
    const loginUrl = new URL('/admin/login', request.url)
    loginUrl.searchParams.set('error', result.error ?? 'auto-login-failed')
    return NextResponse.redirect(loginUrl)
  }

  const response = new NextResponse(null, {
    status: 307,
    headers: { Location: '/admin' },
  })
  applySupabaseSessionCookies(response, result.session, true)
  return response
}

/**
 * POST /api/auth/auto-login
 * Development helper. `{ fromEnv: true }` (or empty body) uses env credentials.
 * Explicit email/password still accepted in development for URL auto-login.
 */
export async function POST(request: NextRequest) {
  try {
    if (process.env.NODE_ENV === 'production') return productionBlocked()

    let email = ''
    let password = ''
    let fromEnv = false

    try {
      const body = await request.json()
      email = typeof body?.email === 'string' ? body.email.trim() : ''
      password = typeof body?.password === 'string' ? body.password : ''
      fromEnv = body?.fromEnv === true
    } catch {
      fromEnv = true
    }

    if (fromEnv || !email || !password) {
      const creds = resolveDevAutoLoginCredentials()
      if (!creds) {
        return NextResponse.json(
          {
            error:
              'Dev auto-login is not configured. Set ADMIN_AUTO_LOGIN_EMAIL and ADMIN_AUTO_LOGIN_PASSWORD (or E2E_ADMIN_*) in web/.env.local.',
          },
          { status: 400 }
        )
      }
      email = creds.email
      password = creds.password
    }

    const result = await signInAdmin(email, password)
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return jsonWithSession({
      success: true,
      user: result.user,
      session: result.session,
    })
  } catch (error: unknown) {
    console.error('Auto-login error:', error)
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json(
      { error: formatAuthError(message) },
      { status: /fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|network/i.test(message) ? 503 : 500 }
    )
  }
}
