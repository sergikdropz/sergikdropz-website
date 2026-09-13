#!/usr/bin/env node

/**
 * Verify that files exist in Supabase Storage
 */

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { resolve } from 'path'

// Load environment variables
config({ path: resolve(process.cwd(), '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase environment variables')
  console.error('   Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

async function checkStorage() {
  console.log('🔍 Checking Supabase Storage...\n')

  // Check audio-files bucket
  console.log('📦 Checking audio-files bucket...')
  const { data: audioFiles, error: audioError } = await supabase.storage
    .from('audio-files')
    .list('', { limit: 100 })

  if (audioError) {
    console.error(`   ❌ Error: ${audioError.message}`)
    if (audioError.message.includes('not found')) {
      console.error('   💡 Bucket "audio-files" does not exist. Create it in Supabase Dashboard.')
    }
  } else {
    console.log(`   ✅ Found ${audioFiles?.length || 0} files in audio-files bucket`)
    if (audioFiles && audioFiles.length > 0) {
      console.log('\n   Sample files:')
      audioFiles.slice(0, 10).forEach(file => {
        console.log(`      - ${file.name} (${(file.metadata?.size / 1024 / 1024).toFixed(2)} MB)`)
      })
      if (audioFiles.length > 10) {
        console.log(`      ... and ${audioFiles.length - 10} more files`)
      }
    } else {
      console.log('   ⚠️  No files found in storage!')
      console.log('   💡 Run: node scripts/upload-audio-to-supabase.mjs')
    }
  }

  // Check database records
  console.log('\n📊 Checking audio_files table...')
  const { data: dbFiles, error: dbError, count } = await supabase
    .from('audio_files')
    .select('*', { count: 'exact' })
    .limit(10)

  if (dbError) {
    console.error(`   ❌ Error: ${dbError.message}`)
    if (dbError.message.includes('relation') && dbError.message.includes('does not exist')) {
      console.error('   💡 Table "audio_files" does not exist. Run supabase/schema.sql')
    }
  } else {
    console.log(`   ✅ Found ${count || 0} records in audio_files table`)
    if (dbFiles && dbFiles.length > 0) {
      console.log('\n   Sample records:')
      dbFiles.slice(0, 5).forEach(file => {
        console.log(`      - ${file.file_name || file.file_path}`)
      })
    } else {
      console.log('   ⚠️  No records found in database!')
      console.log('   💡 Files may be in storage but not registered in database')
    }
  }

  // Summary
  console.log('\n📋 Summary:')
  const hasStorageFiles = audioFiles && audioFiles.length > 0
  const hasDbRecords = count && count > 0

  if (hasStorageFiles && hasDbRecords) {
    console.log('   ✅ Files are in Supabase Storage')
    console.log('   ✅ Files are registered in database')
    console.log('   ✅ Ready for production!')
  } else if (hasStorageFiles && !hasDbRecords) {
    console.log('   ✅ Files are in Supabase Storage')
    console.log('   ⚠️  Files not registered in database (will still work, but slower)')
  } else if (!hasStorageFiles && hasDbRecords) {
    console.log('   ⚠️  Database records exist but files missing from storage')
    console.log('   💡 Re-upload files: node scripts/upload-audio-to-supabase.mjs')
  } else {
    console.log('   ❌ No files found in Supabase!')
    console.log('   💡 Upload files: node scripts/upload-audio-to-supabase.mjs')
  }
}

checkStorage().catch(error => {
  console.error('❌ Error:', error.message)
  process.exit(1)
})
