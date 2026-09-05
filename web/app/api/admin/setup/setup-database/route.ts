import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAdminSetupSql } from '@/lib/admin/getAdminSetupSql'
import { gateAdminPublicSetup, resolveSetupSupabaseCredentials } from '@/lib/auth/admin-setup-gate'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const gate = gateAdminPublicSetup(request)
    if (!gate.ok) return gate.response

    const body = await request.json().catch(() => ({}))
    const creds = resolveSetupSupabaseCredentials(body)
    if (!creds.ok) {
      return NextResponse.json({ error: creds.error }, { status: 400 })
    }

    const supabase = createClient(creds.url, creds.serviceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    const { error: checkError } = await supabase.from('admins').select('id').limit(1)

    if (checkError) {
      const errorMsg = checkError.message.toLowerCase()
      const isTableNotFound =
        errorMsg.includes('does not exist') ||
        errorMsg.includes('relation') ||
        errorMsg.includes('could not find the table') ||
        errorMsg.includes('schema cache')

      if (isTableNotFound) {
        const setupSQL = await getAdminSetupSql()
        try {
          const response = await fetch(`${creds.url}/rest/v1/rpc/exec_sql`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              apikey: creds.serviceKey,
              Authorization: `Bearer ${creds.serviceKey}`,
            },
            body: JSON.stringify({ sql: setupSQL }),
          })

          if (!response.ok) {
            return NextResponse.json({
              success: false,
              requiresManualSetup: true,
              sql: setupSQL,
              message: 'Please run the SQL in Supabase SQL Editor. Click "Copy SQL" below.',
            })
          }
        } catch {
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
