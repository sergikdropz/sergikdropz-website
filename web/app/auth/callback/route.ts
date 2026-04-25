import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { safeInternalPath } from '@/lib/safe-internal-path'
import { createSupabaseServerClient } from '@/lib/supabase'

function redirectWithCookies(
  request: NextRequest,
  accessToken: string,
  refreshToken: string,
  destination: string
) {
  const url = new URL(destination, request.url)
  const response = NextResponse.redirect(url)
  const maxAge = 60 * 60 * 24 * 30
  response.cookies.set('sb-auth-token', accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge,
    path: '/',
  })
  response.cookies.set('sb-refresh-token', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge,
    path: '/',
  })
  response.cookies.set('sb-auth-remember', '1', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge,
    path: '/',
  })
  return response
}

/**
 * Magic link / email OTP completion. Add this URL to Supabase Auth redirect allow list:
 * `${SITE_URL}/auth/callback`
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl
  const nextRaw = url.searchParams.get('next')
  const next = safeInternalPath(nextRaw) || '/fan/account'

  const code = url.searchParams.get('code')
  const token_hash = url.searchParams.get('token_hash')
  const type = url.searchParams.get('type')

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !anon) {
    return NextResponse.redirect(new URL('/fan/login?error=config', request.url))
  }

  const supabase = createClient(supabaseUrl, anon)

  let access_token: string | null = null
  let refresh_token: string | null = null

  if (token_hash && type) {
    const { data, error } = await supabase.auth.verifyOtp({
      type: type as 'email' | 'signup' | 'magiclink',
      token_hash,
    })
    if (error || !data.session) {
      console.error('verifyOtp:', error?.message)
      return NextResponse.redirect(new URL('/fan/login?error=verify', request.url))
    }
    access_token = data.session.access_token
    refresh_token = data.session.refresh_token
  } else if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (error || !data.session) {
      console.error('exchangeCodeForSession:', error?.message)
      return NextResponse.redirect(new URL('/fan/login?error=session', request.url))
    }
    access_token = data.session.access_token
    refresh_token = data.session.refresh_token
  } else {
    return NextResponse.redirect(new URL('/fan/login?error=missing_token', request.url))
  }

  if (!access_token || !refresh_token) {
    return NextResponse.redirect(new URL('/fan/login?error=no_session', request.url))
  }

  try {
    const server = createSupabaseServerClient()
    const { data: userData } = await supabase.auth.getUser(access_token)
    const uid = userData.user?.id
    const email = userData.user?.email?.toLowerCase()
    if (uid && email) {
      await server
        .from('fan_leads')
        .update({ linked_user_id: uid, updated_at: new Date().toISOString() })
        .eq('email', email)
    }
  } catch (e) {
    console.warn('fan_leads link (non-fatal):', e)
  }

  return redirectWithCookies(request, access_token, refresh_token, next)
}
