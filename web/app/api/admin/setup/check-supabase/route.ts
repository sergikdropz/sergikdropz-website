import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
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

    const anonClient = createClient(creds.url, creds.anonKey)
    await anonClient.auth.getSession()

    const serviceClient = createClient(creds.url, creds.serviceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    const { error: serviceError } = await serviceClient
      .from('_test_connection')
      .select('*')
      .limit(1)

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
