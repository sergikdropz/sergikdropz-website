#!/usr/bin/env node

/**
 * Automated Setup Guide
 * 
 * This script provides a step-by-step guide for what needs to be done
 * and attempts to automate what's possible
 */

import { existsSync, readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

console.log('🚀 Automated Supabase Setup Guide\n')
console.log('='.repeat(60))

// Check current status
const envPath = join(__dirname, '../.env.local')
const hasEnv = existsSync(envPath)
const envContent = hasEnv ? readFileSync(envPath, 'utf-8') : ''

const hasSupabaseUrl = envContent.includes('NEXT_PUBLIC_SUPABASE_URL')
const hasSupabaseAnon = envContent.includes('NEXT_PUBLIC_SUPABASE_ANON_KEY')
const hasSupabaseService = envContent.includes('SUPABASE_SERVICE_ROLE_KEY')

console.log('\n📊 Current Status:')
console.log('='.repeat(60))
console.log(`Environment file: ${hasEnv ? '✅ Exists' : '❌ Missing'}`)
console.log(`Supabase URL: ${hasSupabaseUrl ? '✅ Configured' : '❌ Not set'}`)
console.log(`Supabase Anon Key: ${hasSupabaseAnon ? '✅ Configured' : '❌ Not set'}`)
console.log(`Supabase Service Key: ${hasSupabaseService ? '✅ Configured' : '❌ Not set'}`)

if (hasSupabaseUrl && hasSupabaseAnon && hasSupabaseService) {
  console.log('\n✅ Supabase is configured!')
  console.log('\n📋 Next Steps (Manual - requires Supabase Dashboard):')
  console.log('='.repeat(60))
  console.log('\n1. Set up Database Schema:')
  console.log('   - Go to: https://supabase.com/dashboard')
  console.log('   - Select your project')
  console.log('   - Click "SQL Editor" in left sidebar')
  console.log('   - Click "New query"')
  console.log('   - Open file: web/supabase/schema.sql')
  console.log('   - Copy ALL contents')
  console.log('   - Paste into SQL Editor')
  console.log('   - Click "Run" (or Cmd/Ctrl + Enter)')
  console.log('   - Wait for "Success" message')
  
  console.log('\n2. Create Storage Bucket:')
  console.log('   - In Supabase Dashboard, click "Storage"')
  console.log('   - Click "Create a new bucket"')
  console.log('   - Name: audio-files')
  console.log('   - Public bucket: YES ✅')
  console.log('   - Click "Create bucket"')
  
  console.log('\n3. Test Connection:')
  console.log('   Run: node scripts/test-supabase-connection.mjs')
  
  console.log('\n4. Upload Audio Files:')
  console.log('   Run: node scripts/upload-audio-to-supabase.mjs')
  
} else {
  console.log('\n❌ Supabase not fully configured yet')
  console.log('\n📋 Setup Steps:')
  console.log('='.repeat(60))
  console.log('\nSTEP 1: Create Supabase Account (if needed)')
  console.log('   - Go to: https://supabase.com')
  console.log('   - Click "Start your project"')
  console.log('   - Sign up with GitHub or email')
  console.log('   - Create new project')
  console.log('   - Wait 2-3 minutes for setup')
  
  console.log('\nSTEP 2: Get API Keys')
  console.log('   - In Supabase Dashboard, click ⚙️ Settings')
  console.log('   - Click "API" in settings menu')
  console.log('   - Copy these 3 values:')
  console.log('     1. Project URL (https://xxxxx.supabase.co)')
  console.log('     2. anon public key (starts with eyJ...)')
  console.log('     3. service_role key (starts with eyJ...)')
  
  console.log('\nSTEP 3: Configure Environment Variables')
  console.log('   Run: node scripts/setup-supabase.mjs')
  console.log('   OR manually edit web/.env.local and add:')
  console.log('   NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co')
  console.log('   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...')
  console.log('   SUPABASE_SERVICE_ROLE_KEY=eyJ...')
  
  console.log('\nSTEP 4: Continue with database and storage setup (see above)')
}

console.log('\n' + '='.repeat(60))
console.log('\n💡 Quick Commands:')
console.log('   Setup:        node scripts/setup-supabase.mjs')
console.log('   Test:         node scripts/test-supabase-connection.mjs')
console.log('   Upload:       node scripts/upload-audio-to-supabase.mjs')
console.log('   This guide:   node scripts/auto-setup-guide.mjs')
console.log('\n')

