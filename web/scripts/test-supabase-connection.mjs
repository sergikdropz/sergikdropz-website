#!/usr/bin/env node

/**
 * Test Supabase Connection Script
 * 
 * This script tests your Supabase connection and verifies setup
 * 
 * Usage:
 *   node scripts/test-supabase-connection.mjs
 */

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load environment variables
config({ path: join(__dirname, '../.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

console.log('🔍 Testing Supabase Connection...\n')

// Check environment variables
console.log('1. Checking environment variables...')
if (!SUPABASE_URL) {
  console.log('   ❌ NEXT_PUBLIC_SUPABASE_URL not set')
  process.exit(1)
}
if (!SUPABASE_ANON_KEY) {
  console.log('   ❌ NEXT_PUBLIC_SUPABASE_ANON_KEY not set')
  process.exit(1)
}
if (!SUPABASE_SERVICE_KEY) {
  console.log('   ❌ SUPABASE_SERVICE_ROLE_KEY not set')
  process.exit(1)
}
console.log('   ✅ All environment variables set')

// Test connection
console.log('\n2. Testing Supabase connection...')
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

// Test database
console.log('\n3. Testing database connection...')
try {
  const { data, error } = await supabase
    .from('audio_files')
    .select('count')
    .limit(1)

  if (error) {
    if (error.message.includes('relation') || error.message.includes('does not exist')) {
      console.log('   ⚠️  Database tables not found')
      console.log('   💡 Run schema.sql in Supabase SQL Editor')
    } else {
      console.log('   ❌ Database error:', error.message)
    }
  } else {
    console.log('   ✅ Database connection successful')
  }
} catch (error) {
  console.log('   ❌ Database connection failed:', error.message)
}

// Test storage
console.log('\n4. Testing storage connection...')
try {
  const { data: buckets, error: bucketError } = await supabase.storage.listBuckets()
  
  if (bucketError) {
    console.log('   ❌ Storage error:', bucketError.message)
  } else {
    const audioBucket = buckets.find(b => b.name === 'audio-files')
    if (audioBucket) {
      console.log('   ✅ Storage bucket "audio-files" found')
      
      // Test listing files
      const { data: files, error: listError } = await supabase.storage
        .from('audio-files')
        .list('', { limit: 1 })
      
      if (listError) {
        console.log('   ⚠️  Cannot list files:', listError.message)
      } else {
        console.log(`   ✅ Can access storage (${files?.length || 0} files found)`)
      }
    } else {
      console.log('   ⚠️  Storage bucket "audio-files" not found')
      console.log('   💡 Create bucket in Supabase Dashboard → Storage')
    }
  }
} catch (error) {
  console.log('   ❌ Storage connection failed:', error.message)
}

// Summary
console.log('\n' + '='.repeat(50))
console.log('📊 Connection Test Summary:')
console.log('='.repeat(50))
console.log(`Supabase URL: ${SUPABASE_URL ? '✅ Set' : '❌ Missing'}`)
console.log(`Anon Key: ${SUPABASE_ANON_KEY ? '✅ Set' : '❌ Missing'}`)
console.log(`Service Key: ${SUPABASE_SERVICE_KEY ? '✅ Set' : '❌ Missing'}`)
console.log('='.repeat(50))

console.log('\n💡 Next steps:')
console.log('   1. If tables missing: Run schema.sql in Supabase SQL Editor')
console.log('   2. If bucket missing: Create "audio-files" bucket in Storage')
console.log('   3. Run: node scripts/upload-audio-to-supabase.mjs')

