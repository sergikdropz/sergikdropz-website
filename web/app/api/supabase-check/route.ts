import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/auth/route-policy'
import { createSupabaseServerClient } from '@/lib/supabase'

/**
 * Admin-only diagnostic endpoint for Supabase configuration.
 * GET /api/supabase-check
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  const checks: Record<string, unknown> = {
    environment: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  checks.envVars = {
    NEXT_PUBLIC_SUPABASE_URL: supabaseUrl ? 'Set' : 'Missing',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: supabaseAnonKey ? 'Set' : 'Missing',
    SUPABASE_SERVICE_ROLE_KEY: supabaseServiceKey ? 'Set' : 'Missing',
  }

  let clientError: string | null = null
  let connectionTest: string | null = null
  try {
    const supabase = createSupabaseServerClient()

    const { error } = await supabase.from('audio_files').select('id').limit(1).maybeSingle()

    if (error) {
      clientError = error.message
    } else {
      connectionTest = 'Connected'
    }

    const { error: storageError } = await supabase.storage.from('audio-files').list('', { limit: 1 })

    checks.storage = storageError ? `Error: ${storageError.message}` : 'Connected'
  } catch (error: unknown) {
    clientError = error instanceof Error ? error.message : 'Unknown error'
  }

  checks.database = clientError ? `Error: ${clientError}` : connectionTest || 'Not tested'

  return NextResponse.json(checks, {
    headers: { 'Cache-Control': 'no-store' },
  })
}
