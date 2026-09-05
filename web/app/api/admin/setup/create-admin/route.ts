import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createAdminUser } from '@/lib/admin/createAdminUser'
import { gateAdminPublicSetup, resolveSetupSupabaseCredentials } from '@/lib/auth/admin-setup-gate'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const gate = gateAdminPublicSetup(request)
    if (!gate.ok) return gate.response

    const body = await request.json()
    const { email, password } = body

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 }
      )
    }

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
