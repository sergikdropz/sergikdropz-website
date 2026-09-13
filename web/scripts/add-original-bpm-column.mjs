#!/usr/bin/env node
/**
 * Add original_bpm column to audio_files table
 * 
 * This script adds the original_bpm column if it doesn't exist
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { resolve } from 'path'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

dotenv.config({ path: resolve(__dirname, '..', '.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing Supabase environment variables!')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

async function addColumn() {
  console.log('🔧 Adding original_bpm column to audio_files table...\n')
  
  // Read the migration SQL
  const { readFileSync } = await import('fs')
  const migrationPath = join(__dirname, '..', 'supabase', 'migrations', 'add_original_bpm.sql')
  
  try {
    const migrationSQL = readFileSync(migrationPath, 'utf-8')
    
    console.log('⚠️  Supabase requires running SQL via the Dashboard SQL Editor.')
    console.log('\n📋 Please run this SQL in Supabase Dashboard:')
    console.log('='.repeat(60))
    console.log(migrationSQL)
    console.log('='.repeat(60))
    console.log('\n1. Go to: https://supabase.com/dashboard/project/utgwlgcejflqxyalnlze/sql/new')
    console.log('2. Paste the SQL above')
    console.log('3. Click "Run"')
    console.log('4. Then re-run the sync script\n')
    
    // Try to verify if column exists
    try {
      const { error } = await supabase
        .from('audio_files')
        .select('original_bpm')
        .limit(1)
      
      if (!error) {
        console.log('✅ Column already exists!')
        return true
      }
    } catch (e) {
      console.log('❌ Column does not exist - please run the migration above')
    }
    
  } catch (error) {
    console.error('Error reading migration file:', error.message)
    return false
  }
}

addColumn()
