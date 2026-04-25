import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseClient } from '@/lib/supabase'
import { checkAdminStatus } from '@/lib/auth'
import { checkRateLimit, clientKeyFromRequest } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

const LOGIN_WINDOW_MS = 15 * 60 * 1000
const LOGIN_MAX_ATTEMPTS = 20

export async function POST(request: NextRequest) {
  try {
    const rl = checkRateLimit(
      `login:${clientKeyFromRequest(request)}`,
      LOGIN_MAX_ATTEMPTS,
      LOGIN_WINDOW_MS
    )
    if (!rl.ok) {
      return NextResponse.json(
        { error: 'Too many login attempts. Try again later.' },
        {
          status: 429,
          headers: { 'Retry-After': String(rl.retryAfterSec) },
        }
      )
    }

    const { email, password, rememberMe } = await request.json()

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      )
    }

    const supabase = createSupabaseClient()
    
    // Sign in the user
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 401 }
      )
    }

    if (!data.user) {
      return NextResponse.json(
        { error: 'Authentication failed' },
        { status: 401 }
      )
    }

    const isAdmin = await checkAdminStatus(email, data.user.id)
    if (!isAdmin) {
      // Sign out the user if they're not an admin
      await supabase.auth.signOut()
      return NextResponse.json(
        { error: 'Access denied. Admin privileges required.' },
        { status: 403 }
      )
    }

    // Create response with session
    const response = NextResponse.json({
      user: {
        id: data.user.id,
        email: data.user.email,
      },
      session: data.session,
    })

    // Set auth tokens in cookies
    // If rememberMe is true, set cookies for 30 days, otherwise 7 days
    if (data.session?.access_token && data.session?.refresh_token) {
      const maxAge = rememberMe 
        ? 60 * 60 * 24 * 30 // 30 days for "Remember me"
        : 60 * 60 * 24 * 7  // 7 days default
      
      response.cookies.set('sb-auth-token', data.session.access_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge,
        path: '/',
      })
      response.cookies.set('sb-refresh-token', data.session.refresh_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge,
        path: '/',
      })
      response.cookies.set('sb-auth-remember', rememberMe ? '1' : '0', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge,
        path: '/',
      })
    }

    return response
  } catch (error: any) {
    console.error('Login error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
