import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
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

    const { supabaseUrl, supabaseAnonKey, supabaseServiceKey } = await request.json()

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
      return NextResponse.json(
        { error: 'All Supabase credentials are required' },
        { status: 400 }
      )
    }

    // Test connection with anon key
    const anonClient = createClient(supabaseUrl, supabaseAnonKey)
    const { error: anonError } = await anonClient.auth.getSession()

    // Test connection with service key
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    // Try a simple query to verify service key works
    const { error: serviceError } = await serviceClient
      .from('_test_connection')
      .select('*')
      .limit(1)

    // The error is expected if table doesn't exist, but connection should work
    // Check for various error messages that indicate the table doesn't exist
    if (serviceError) {
      const errorMsg = serviceError.message.toLowerCase()
      const isTableNotFound = 
        errorMsg.includes('relation') || 
        errorMsg.includes('does not exist') ||
        errorMsg.includes('could not find the table') ||
        errorMsg.includes('schema cache')
      
      if (!isTableNotFound) {
        return NextResponse.json(
          { error: `Service key validation failed: ${serviceError.message}` },
          { status: 400 }
        )
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Successfully connected to Supabase',
    })
  } catch (error: any) {
    console.error('Supabase connection check error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to connect to Supabase' },
      { status: 500 }
    )
  }
}
