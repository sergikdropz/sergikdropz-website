#!/usr/bin/env node

/**
 * Create Storage Bucket via Supabase API
 * 
 * This script creates the audio-files storage bucket
 */

import { createClient } from '@supabase/supabase-js'
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

const BUCKET_NAME = 'audio-files'

console.log('📦 Creating storage bucket...\n')

try {
  // Check if bucket already exists
  const { data: buckets, error: listError } = await supabase.storage.listBuckets()
  
  if (listError) {
    console.error('❌ Error listing buckets:', listError.message)
    process.exit(1)
  }

  const existingBucket = buckets.find(b => b.name === BUCKET_NAME)
  
  if (existingBucket) {
    console.log(`✅ Bucket "${BUCKET_NAME}" already exists!`)
    console.log(`   Public: ${existingBucket.public ? 'Yes ✅' : 'No ⚠️'}`)
    
    if (!existingBucket.public) {
      console.log('\n⚠️  Bucket is not public. Making it public...')
      // Note: Supabase JS client doesn't have a direct method to update bucket settings
      // This would need to be done via the dashboard or REST API
      console.log('   Please set bucket to public in Supabase Dashboard → Storage')
    }
    process.exit(0)
  }

  // Create bucket
  console.log(`Creating bucket "${BUCKET_NAME}"...`)
  const { data, error } = await supabase.storage.createBucket(BUCKET_NAME, {
    public: true,
    fileSizeLimit: 52428800, // 50MB (free tier limit)
    allowedMimeTypes: ['audio/mpeg', 'audio/wav', 'audio/flac', 'audio/mp4', 'audio/x-m4a', 'audio/ogg', 'audio/aac'],
  })

  if (error) {
    if (error.message.includes('already exists')) {
      console.log('✅ Bucket already exists')
    } else {
      console.error('❌ Error creating bucket:', error.message)
      console.log('\n📋 Manual Setup:')
      console.log('='.repeat(60))
      console.log('1. Go to: https://supabase.com/dashboard')
      console.log('2. Select your project')
      console.log('3. Click "Storage" in left sidebar')
      console.log('4. Click "Create a new bucket"')
      console.log(`5. Name: ${BUCKET_NAME}`)
      console.log('6. Public bucket: YES ✅')
      console.log('7. Click "Create bucket"')
      console.log('='.repeat(60))
      process.exit(1)
    }
  } else {
    console.log(`✅ Bucket "${BUCKET_NAME}" created successfully!`)
    console.log('   Public: Yes ✅')
  }

} catch (error) {
  console.error('❌ Error:', error.message)
  process.exit(1)
}

