#!/usr/bin/env node

/**
 * Upload gallery images to Supabase Storage
 * Creates a 'gallery-images' bucket and uploads all images from public/images/gallery/
 */

import { createClient } from '@supabase/supabase-js'
import { readFile, readdir } from 'fs/promises'
import { join, extname, basename } from 'path'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

dotenv.config({ path: join(__dirname, '..', '.env.local') })

const BUCKET_NAME = 'gallery-images'
const GALLERY_DIR = join(__dirname, '..', 'public', 'images', 'gallery')

// Supported image formats
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif']

async function createBucketIfNeeded(supabase) {
  // Check if bucket exists
  const { data: buckets, error: listError } = await supabase.storage.listBuckets()
  
  if (listError) {
    throw new Error(`Failed to list buckets: ${listError.message}`)
  }

  const bucketExists = buckets?.some(b => b.name === BUCKET_NAME)

  if (!bucketExists) {
    console.log(`📦 Creating bucket: ${BUCKET_NAME}...`)
    const { error: createError } = await supabase.storage.createBucket(BUCKET_NAME, {
      public: true,
      fileSizeLimit: 52428800, // 50MB
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
    })

    if (createError) {
      throw new Error(`Failed to create bucket: ${createError.message}`)
    }
    console.log(`✅ Bucket created: ${BUCKET_NAME}`)
  } else {
    console.log(`✅ Bucket exists: ${BUCKET_NAME}`)
  }
}

function getContentType(ext) {
  const types = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
  }
  return types[ext.toLowerCase()] || 'image/jpeg'
}

async function uploadImage(supabase, filePath, fileName) {
  try {
    const fileBuffer = await readFile(filePath)
    const ext = extname(fileName)
    const contentType = getContentType(ext)

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(fileName, fileBuffer, {
        contentType,
        upsert: true, // Overwrite if exists
        cacheControl: '31536000', // 1 year cache
      })

    if (error) {
      throw error
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(fileName)

    return urlData.publicUrl
  } catch (error) {
    throw new Error(`Failed to upload ${fileName}: ${error.message}`)
  }
}

async function main() {
  console.log('🖼️  Uploading Gallery Images to Supabase Storage\n')
  console.log('='.repeat(60))

  // Initialize Supabase
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

  // Create bucket if needed
  await createBucketIfNeeded(supabase)

  // Read all files from gallery directory
  console.log(`\n📂 Reading gallery directory: ${GALLERY_DIR}`)
  const files = await readdir(GALLERY_DIR)
  const imageFiles = files.filter(file => 
    IMAGE_EXTENSIONS.some(ext => file.toLowerCase().endsWith(ext))
  )

  console.log(`✅ Found ${imageFiles.length} image files\n`)

  if (imageFiles.length === 0) {
    console.log('⚠️  No images found. Exiting.')
    process.exit(0)
  }

  // Upload statistics
  const stats = {
    total: imageFiles.length,
    uploaded: 0,
    failed: 0,
    skipped: 0,
  }

  // Upload each image
  for (const fileName of imageFiles) {
    const filePath = join(GALLERY_DIR, fileName)
    
    try {
      process.stdout.write(`📤 Uploading: ${fileName}... `)
      const publicUrl = await uploadImage(supabase, filePath, fileName)
      console.log(`✅ ${publicUrl}`)
      stats.uploaded++
    } catch (error) {
      console.log(`❌ ${error.message}`)
      stats.failed++
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60))
  console.log('📊 Upload Summary\n')
  console.log(`   Total: ${stats.total}`)
  console.log(`   ✅ Uploaded: ${stats.uploaded}`)
  console.log(`   ❌ Failed: ${stats.failed}`)
  console.log('\n🎉 Gallery images are now in Supabase Storage!')
  console.log('💡 Update BackgroundImages component to use Supabase URLs')
  console.log('='.repeat(60) + '\n')
}

main().catch(error => {
  console.error('\n❌ Fatal error:', error)
  process.exit(1)
})


