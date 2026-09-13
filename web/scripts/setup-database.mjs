#!/usr/bin/env node

/**
 * Setup Database Schema via Supabase API
 * 
 * This script attempts to create the database schema programmatically
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { config } from 'dotenv'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

config({ path: join(__dirname, '../.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing Supabase environment variables')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

// Read schema file
const schemaPath = join(__dirname, '../supabase/schema.sql')
const schema = readFileSync(schemaPath, 'utf-8')

console.log('📊 Setting up database schema...\n')

// Note: Supabase doesn't allow running arbitrary SQL via the JS client for security
// We need to use the REST API or SQL Editor
// Let's try using the REST API to execute SQL

try {
  // Split schema into individual statements
  const statements = schema
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--') && !s.startsWith('/*'))

  console.log(`Found ${statements.length} SQL statements`)
  console.log('\n⚠️  Note: Supabase requires running SQL via the Dashboard SQL Editor')
  console.log('   for security reasons. This script will verify the setup.\n')

  // Check if tables exist
  console.log('Checking if tables exist...')
  
  const { data: purchasesTable, error: purchasesError } = await supabase
    .from('purchases')
    .select('count')
    .limit(1)

  const { data: audioFilesTable, error: audioFilesError } = await supabase
    .from('audio_files')
    .select('count')
    .limit(1)

  if (!purchasesError && !audioFilesError) {
    console.log('✅ Tables already exist!')
    process.exit(0)
  }

  console.log('❌ Tables not found')
  console.log('\n📋 Manual Setup Required:')
  console.log('='.repeat(60))
  console.log('1. Go to: https://supabase.com/dashboard')
  console.log('2. Select your project')
  console.log('3. Click "SQL Editor" in left sidebar')
  console.log('4. Click "New query"')
  console.log('5. Open file: web/supabase/schema.sql')
  console.log('6. Copy ALL contents')
  console.log('7. Paste into SQL Editor')
  console.log('8. Click "Run" (or Cmd/Ctrl + Enter)')
  console.log('='.repeat(60))

} catch (error) {
  console.error('Error:', error.message)
  process.exit(1)
}

