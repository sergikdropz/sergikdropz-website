#!/usr/bin/env node
/**
 * Upload EP Artwork Images to Supabase Storage
 * 
 * Uploads large EP artwork images that are excluded from Vercel deployment
 * to Supabase Storage so they work in production.
 * 
 * Usage: node scripts/upload-ep-artwork-to-supabase.mjs
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'fs'
import { join, dirname, relative, extname, basename } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { resolve } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load environment variables
const envPath = resolve(__dirname, '..', '.env.local')
dotenv.config({ path: envPath })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const IMAGES_DIR = join(__dirname, '..', 'public', 'images', 'audio', 'unreleased', 'eps')
const BUCKET_NAME = 'gallery-images' // Or create 'ep-artwork' bucket

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing Supabase environment variables!')
  console.error('   Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

// Statistics
const stats = {
  scanned: 0,
  uploaded: 0,
  skipped: 0,
  errors: 0,
  totalSize: 0,
}

/**
 * Recursively scan for image files
 */
function scanImages(dir, baseDir = dir, files = []) {
  if (!existsSync(dir)) {
    return files
  }
  
  try {
    const entries = readdirSync(dir, { withFileTypes: true })
    
    for (const entry of entries) {
      const fullPath = join(dir, entry.name)
      
      if (entry.isDirectory()) {
        scanImages(fullPath, baseDir, files)
      } else if (entry.isFile()) {
        const ext = extname(entry.name).toLowerCase()
        if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) {
          const relativePath = relative(baseDir, fullPath)
          const stats = statSync(fullPath)
          files.push({
            name: entry.name,
            path: fullPath,
            relativePath: relativePath.replace(/\\/g, '/'),
            size: stats.size,
          })
        }
      }
    }
  } catch (error) {
    console.warn(`   Warning: Could not scan ${dir}:`, error.message)
  }
  
  return files
}

/**
 * Upload image to Supabase
 */
async function uploadImage(imageFile) {
  try {
    const fileBuffer = readFileSync(imageFile.path)
    const ext = extname(imageFile.name).toLowerCase()
    
    // Determine content type
    const contentTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
    }
    const contentType = contentTypes[ext] || 'image/jpeg'
    
    // Use the same path structure in Supabase
    const storagePath = `audio/unreleased/eps/${imageFile.relativePath.replace(/^images\/audio\/unreleased\/eps\//, '')}`
    
    // Check if file already exists
    const { data: existing } = await supabase.storage
      .from(BUCKET_NAME)
      .list(dirname(storagePath), {
        search: basename(storagePath),
      })
    
    if (existing && existing.some(f => f.name === basename(storagePath))) {
      console.log(`   ⏭️  Skipped (exists): ${storagePath}`)
      stats.skipped++
      return true
    }
    
    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(storagePath, fileBuffer, {
        contentType,
        upsert: true,
        cacheControl: '31536000', // 1 year cache
      })
    
    if (uploadError) {
      throw uploadError
    }
    
    // Get public URL
    const { data: urlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(storagePath)
    
    stats.uploaded++
    stats.totalSize += imageFile.size
    const sizeMB = (imageFile.size / 1024 / 1024).toFixed(2)
    console.log(`   ✅ Uploaded: ${storagePath} (${sizeMB}MB)`)
    console.log(`      URL: ${urlData.publicUrl}`)
    return true
    
  } catch (error) {
    console.error(`   ❌ Error uploading ${imageFile.relativePath}:`, error.message)
    stats.errors++
    return false
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('🖼️  Uploading EP Artwork Images to Supabase...\n')
  
  try {
    // Step 1: Scan for images
    console.log('📁 Scanning for EP artwork images...')
    if (!existsSync(IMAGES_DIR)) {
      console.error(`❌ Images directory not found: ${IMAGES_DIR}`)
      process.exit(1)
    }
    
    const imageFiles = scanImages(IMAGES_DIR, IMAGES_DIR)
    stats.scanned = imageFiles.length
    console.log(`   Found ${imageFiles.length} image files\n`)
    
    if (imageFiles.length === 0) {
      console.log('✅ No images to upload')
      return
    }
    
    // Step 2: Upload images
    console.log('📤 Uploading images...')
    console.log('-'.repeat(60))
    
    for (const imageFile of imageFiles) {
      await uploadImage(imageFile)
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    
    console.log('-'.repeat(60))
    
    // Print summary
    console.log('\n' + '='.repeat(60))
    console.log('📊 UPLOAD SUMMARY')
    console.log('='.repeat(60))
    console.log(`Scanned:              ${stats.scanned}`)
    console.log(`Uploaded:             ${stats.uploaded}`)
    console.log(`Skipped:              ${stats.skipped}`)
    console.log(`Errors:                ${stats.errors}`)
    
    if (stats.totalSize > 0) {
      const totalMB = (stats.totalSize / 1024 / 1024).toFixed(2)
      console.log(`Total Uploaded:        ${totalMB}MB`)
    }
    
    if (stats.uploaded > 0) {
      console.log('\n✅ Images uploaded successfully!')
      console.log('\n💡 Next step: Update image paths in music-library.json:')
      console.log('   node scripts/fix-image-paths.mjs --use-supabase')
    } else {
      console.log('\n✅ All images already in Supabase!')
    }
    
  } catch (error) {
    console.error('\n❌ Fatal error:', error)
    process.exit(1)
  }
}

main()
