#!/usr/bin/env node

/**
 * Complete Setup Script
 * 
 * This script attempts to complete the entire Supabase setup
 * and provides clear instructions for manual steps
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

console.log('🚀 Complete Supabase Setup\n')
console.log('='.repeat(60))

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

// Check storage bucket
console.log('\n1. Checking storage bucket...')
const { data: buckets } = await supabase.storage.listBuckets()
const audioBucket = buckets?.find(b => b.name === 'audio-files')
if (audioBucket) {
  console.log('   ✅ Storage bucket "audio-files" exists')
} else {
  console.log('   ❌ Storage bucket missing')
}

// Check database tables
console.log('\n2. Checking database tables...')
const { error: purchasesError } = await supabase
  .from('purchases')
  .select('count')
  .limit(1)

const { error: audioFilesError } = await supabase
  .from('audio_files')
  .select('count')
  .limit(1)

if (!purchasesError && !audioFilesError) {
  console.log('   ✅ Database tables exist')
  console.log('\n✅ Setup Complete! Ready to upload files.')
  console.log('\nRun: node scripts/upload-audio-to-supabase.mjs')
  process.exit(0)
} else {
  console.log('   ❌ Database tables missing')
  console.log('\n📋 Database Schema Setup Required:')
  console.log('='.repeat(60))
  console.log('\nSupabase requires running SQL through the dashboard for security.')
  console.log('\nQuick Steps:')
  console.log('1. Open: https://supabase.com/dashboard')
  console.log('2. Select your project')
  console.log('3. Click "SQL Editor" → "New query"')
  console.log('4. Copy ALL contents from: web/supabase/schema.sql')
  console.log('5. Paste and click "Run"')
  console.log('\nOr use this direct link to SQL Editor:')
  console.log(`   ${SUPABASE_URL.replace('.co', '.co/project/_/sql/new')}`)
  console.log('\nAfter running the schema, run this script again:')
  console.log('   node scripts/complete-setup.mjs')
  console.log('='.repeat(60))
  process.exit(1)
}

