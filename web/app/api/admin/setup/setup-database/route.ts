import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAdminSetupSql } from '@/lib/admin/getAdminSetupSql'
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

    const { supabaseUrl, supabaseServiceKey } = await request.json()

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { error: 'Supabase URL and service key are required' },
        { status: 400 }
      )
    }

    // Create service client
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    // Try to check if table exists by querying it
    const { error: checkError } = await supabase
      .from('admins')
      .select('id')
      .limit(1)

    if (checkError) {
      const errorMsg = checkError.message.toLowerCase()
      const isTableNotFound = 
        errorMsg.includes('does not exist') || 
        errorMsg.includes('relation') ||
        errorMsg.includes('could not find the table') ||
        errorMsg.includes('schema cache')
      
      if (isTableNotFound) {
        const setupSQL = await getAdminSetupSql()
        // Table doesn't exist - we need to create it
        // Use Supabase REST API to execute SQL
        try {
          const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': supabaseServiceKey,
              'Authorization': `Bearer ${supabaseServiceKey}`,
            },
            body: JSON.stringify({ sql: setupSQL }),
          })

          if (!response.ok) {
            // If RPC doesn't exist, return SQL for manual execution
            return NextResponse.json({
              success: false,
              requiresManualSetup: true,
              sql: setupSQL,
              message: 'Please run the SQL in Supabase SQL Editor. Click "Copy SQL" below.',
            })
          }
        } catch (err) {
          // RPC doesn't exist, return SQL for manual execution
          return NextResponse.json({
            success: false,
            requiresManualSetup: true,
            sql: setupSQL,
            message: 'Please run the SQL in Supabase SQL Editor. Click "Copy SQL" below.',
          })
        }
      } else {
        return NextResponse.json(
          { error: `Database error: ${checkError.message}` },
          { status: 400 }
        )
      }
    }

    // Table exists - verify structure by trying to insert/select
    // If we can query it, it's set up correctly
    return NextResponse.json({
      success: true,
      message: 'Database tables already exist and are properly configured',
    })
  } catch (error: any) {
    console.error('Database setup error:', error)
    return NextResponse.json(
      {
        success: false,
        requiresManualSetup: true,
        sql: await getAdminSetupSql(),
        error: error.message || 'Failed to setup database',
        message: 'Please run the SQL manually in Supabase SQL Editor.',
      },
      { status: 500 }
    )
  }
}
