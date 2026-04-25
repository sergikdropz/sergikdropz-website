import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'

/**
 * Diagnostic endpoint to check Supabase configuration in production
 * GET /api/supabase-check
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  const checks: Record<string, any> = {
    environment: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
  }

  // Check environment variables
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  checks.envVars = {
    NEXT_PUBLIC_SUPABASE_URL: supabaseUrl ? '✅ Set' : '❌ Missing',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: supabaseAnonKey ? '✅ Set' : '❌ Missing',
    SUPABASE_SERVICE_ROLE_KEY: supabaseServiceKey ? '✅ Set' : '❌ Missing',
  }

  // Try to create Supabase client
  let clientError = null
  let connectionTest = null
  try {
    const supabase = createSupabaseServerClient()
    
    // Test database connection
    const { data, error } = await supabase
      .from('audio_files')
      .select('count')
      .limit(1)
      .maybeSingle()
    
    if (error) {
      clientError = error.message
    } else {
      connectionTest = '✅ Connected'
    }

    // Test storage connection
    const { data: storageData, error: storageError } = await supabase.storage
      .from('audio-files')
      .list('', { limit: 1 })
    
    checks.storage = storageError 
      ? `❌ Error: ${storageError.message}` 
      : '✅ Connected'
    
  } catch (error: any) {
    clientError = error.message
  }

  checks.database = clientError ? `❌ Error: ${clientError}` : connectionTest || '⚠️ Not tested'

  // Check if files exist in storage
  if (supabaseUrl && !clientError) {
    try {
      const supabase = createSupabaseServerClient()
      const { data: files, error } = await supabase.storage
        .from('audio-files')
        .list('', { limit: 10 })
      
      checks.filesInStorage = error
        ? `❌ Error: ${error.message}`
        : files && files.length > 0
          ? `✅ Found ${files.length} files (showing first 10)`
          : '⚠️ No files found in storage'
      
      if (files && files.length > 0) {
        checks.sampleFiles = files.slice(0, 5).map(f => f.name)
      }
    } catch (error: any) {
      checks.filesInStorage = `❌ Error: ${error.message}`
    }
  }

  // Check database records
  if (supabaseUrl && !clientError) {
    try {
      const supabase = createSupabaseServerClient()
      const { count, error } = await supabase
        .from('audio_files')
        .select('*', { count: 'exact', head: true })
      
      checks.databaseRecords = error
        ? `❌ Error: ${error.message}`
        : count !== null
          ? `✅ Found ${count} records in audio_files table`
          : '⚠️ No records found'
    } catch (error: any) {
      checks.databaseRecords = `❌ Error: ${error.message}`
    }
  }

  return NextResponse.json(checks, {
    headers: {
      'Content-Type': 'application/json',
    },
  })
}
