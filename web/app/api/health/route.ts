import { NextResponse } from 'next/server'
import { createSupabaseClient } from '@/lib/supabase'

/**
 * Health check endpoint for Docker and monitoring
 * GET /api/health
 * 
 * Checks:
 * - Basic service status
 * - Supabase database connection
 * - Supabase storage connection
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

  // Check Supabase connection
  try {
    const supabase = createSupabaseClient()
    
    // Test database connection
    const { error: dbError } = await supabase
      .from('audio_files')
      .select('count')
      .limit(1)

    health.checks.database = dbError ? 'error' : 'ok'
    if (dbError) {
      health.status = 'degraded'
    }

    // Test storage connection
    const { error: storageError } = await supabase.storage
      .from('audio-files')
      .list('', { limit: 1 })

    health.checks.storage = storageError ? 'error' : 'ok'
    if (storageError) {
      health.status = 'degraded'
    }
  } catch (error: any) {
    health.status = 'degraded'
    health.checks.database = 'error'
    health.checks.storage = 'error'
    health.error = error.message
  }

  const statusCode = health.status === 'ok' ? 200 : 503

  return NextResponse.json(health, { status: statusCode })
}

