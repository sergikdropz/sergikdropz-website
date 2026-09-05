import { NextResponse } from 'next/server'
import { createSupabaseClient, isLocalHomeSupabase } from '@/lib/supabase'
import { supabaseIsReachable } from '@/lib/supabaseReachability'

export const dynamic = 'force-dynamic'

/**
 * Health check endpoint for Docker and monitoring
 * GET /api/health
 *
 * Checks:
 * - Basic service status
 * - Supabase / home-server database connection
 * - Storage (skipped on home-server gateway — no Storage service)
 */
export async function GET() {
  const health: {
    status: string
    timestamp: string
    service: string
    checks: {
      database: string
      storage: string
    }
    error?: string
  } = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'sergik-web',
    checks: {
      database: 'unknown',
      storage: 'unknown',
    },
  }

  try {
    const reachable = await supabaseIsReachable()
    if (!reachable) {
      health.status = 'degraded'
      health.checks.database = 'error'
      health.checks.storage = 'error'
      health.error =
        'Supabase host unreachable (check project status and NEXT_PUBLIC_SUPABASE_URL)'
      return NextResponse.json(health, {
        status: 503,
        headers: { 'Cache-Control': 'no-store' },
      })
    }

    const supabase = createSupabaseClient()

    const { error: dbError } = await supabase
      .from('audio_files')
      .select('id', { head: true, count: 'exact' })

    health.checks.database = dbError ? 'error' : 'ok'
    if (dbError) {
      health.status = 'degraded'
      health.error = dbError.message
    }

    if (isLocalHomeSupabase()) {
      // Home gateway has no Storage API — vault media is local / AUDIO_BASE_URL
      health.checks.storage = 'skipped'
    } else {
      const { error: storageError } = await supabase.storage
        .from('audio-files')
        .list('', { limit: 1 })

      health.checks.storage = storageError ? 'error' : 'ok'
      if (storageError) {
        health.status = 'degraded'
      }
    }
  } catch (error: any) {
    health.status = 'degraded'
    health.checks.database = 'error'
    health.checks.storage = 'error'
    health.error = error.message
  }

  const statusCode = health.status === 'ok' ? 200 : 503

  return NextResponse.json(health, {
    status: statusCode,
    headers: {
      'Cache-Control': 'no-store',
    },
  })
}
