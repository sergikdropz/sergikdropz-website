import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createAdminUser } from '@/lib/admin/createAdminUser'
import { checkRateLimit, clientKeyFromRequest } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

const SETUP_WINDOW_MS = 60 * 60 * 1000
const SETUP_MAX_PER_HOUR = 40

export async function POST(request: NextRequest) {
  try {
    if (process.env.ADMIN_PUBLIC_SETUP_DISABLED === '1') {
      return NextResponse.json({ error: 'Admin setup is disabled.' }, { status: 403 })
    }

    const rl = checkRateLimit(
      `admin-setup:${clientKeyFromRequest(request)}`,
      SETUP_MAX_PER_HOUR,
      SETUP_WINDOW_MS
    )
    if (!rl.ok) {
      return NextResponse.json(
        { error: 'Too many setup requests. Try again later.' },
        {
          status: 429,
          headers: { 'Retry-After': String(rl.retryAfterSec) },
        }
      )
    }

    const { email, password, supabaseUrl, supabaseAnonKey, supabaseServiceKey } = await request.json()

    if (!email || !password || !supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
      return NextResponse.json(
        { error: 'All fields are required' },
        { status: 400 }
      )
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 }
      )
    }

    // Create service client (has admin privileges)
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    const created = await createAdminUser(supabase, email, password)

    return NextResponse.json({
      success: true,
      message: created.message,
      userId: created.userId,
    })
  } catch (error: any) {
    console.error('Create admin error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create admin user' },
      { status: 500 }
    )
  }
}
