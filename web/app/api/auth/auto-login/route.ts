import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseClient, createSupabaseServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * POST /api/auth/auto-login
 * Auto-login endpoint for development/testing
 * Only works in development mode or with valid credentials
 */
export async function POST(request: NextRequest) {
  try {
    // Only allow in development or with proper authentication
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        { error: 'Auto-login disabled in production' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { email, password } = body

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

    // Check if user is admin
    const adminEmails = process.env.ADMIN_EMAILS?.split(',') || []
    const isAdmin = adminEmails.includes(email)

    // Also check database for admin status
    let dbAdminCheck = false
    try {
      const supabaseServer = createSupabaseServerClient()
      const { data: adminData } = await supabaseServer
        .from('admins')
        .select('id')
        .eq('user_id', data.user.id)
        .eq('active', true)
        .single()
      
      dbAdminCheck = !!adminData
    } catch (e) {
      // Table might not exist, that's okay
    }

    if (!isAdmin && !dbAdminCheck) {
      await supabase.auth.signOut()
      return NextResponse.json(
        { error: 'Access denied. Admin privileges required.' },
        { status: 403 }
      )
    }

    // Create response with session
    const response = NextResponse.json({
      success: true,
      user: {
        id: data.user.id,
        email: data.user.email,
      },
    })

    // Set auth token in cookie (30 days for auto-login)
    if (data.session?.access_token) {
      response.cookies.set('sb-auth-token', data.session.access_token, {
        httpOnly: true,
        secure: (process.env.NODE_ENV as string) === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 30, // 30 days
        path: '/',
      })
    }

    return response
  } catch (error: any) {
    console.error('Auto-login error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
