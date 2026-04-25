#!/usr/bin/env node

/**
 * Retry Script: Upload Failed Audio Files to Supabase Storage
 * 
 * This script retries uploading specific files that failed due to size limits.
 * It uses upsert mode to overwrite any partial uploads.
 * 
 * Usage:
 *   node scripts/retry-failed-uploads.mjs
 * 
 * Requirements:
 *   - Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 *   - Ensure Supabase bucket limit is set to at least 5GB (Pro plan)
 */

import { createClient } from '@supabase/supabase-js'
import { readFile, stat } from 'fs/promises'
import { join, relative, extname, basename, dirname } from 'path'
import { existsSync } from 'fs'
import { parseFile } from 'music-metadata'
import { config } from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname as dirnameESM } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirnameESM(__filename)

// Load environment variables
config({ path: join(__dirname, '../.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing Supabase environment variables!')
  console.error('   Add to web/.env.local:')
  console.error('   NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co')
  console.error('   SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

const AUDIO_DIR = join(process.cwd(), 'public', 'audio')
const BUCKET_NAME = 'audio-files'

// List of failed files to retry
const FAILED_FILES = [
  'unreleased/Playlists/Deep n Funky/JIMII x Sergik - dublin.wav',
  'unreleased/Playlists/Deep n Funky/SERGIK - 24_7 VIP 1.wav',
  'unreleased/Playlists/Deep n Funky/SERGIK - 24_7 VIP 2.wav',
  'unreleased/Playlists/Deep n Funky/SERGIK - Air It Out.wav',
  'unreleased/Playlists/Deep n Funky/SERGIK - All The Vibes.wav',
  'unreleased/Playlists/Deep n Funky/SERGIK - Back to The Basics (Instrumental).wav',
  'unreleased/Playlists/Deep n Funky/SERGIK - Back to The Basics.wav',
]

// Stats
let stats = {
  total: 0,
  uploaded: 0,
  skipped: 0,
  errors: 0,
  totalSize: 0,
}

// Get file size in MB
async function getFileSizeMB(filePath) {
  try {
    const stats = await stat(filePath)
    return (stats.size / (1024 * 1024)).toFixed(2)
  } catch {
    return 0
  }
}

// Extract metadata from audio file
async function extractMetadata(filePath) {
  try {
    const metadata = await parseFile(filePath)
    return {
      title: metadata.common.title || basename(filePath, extname(filePath)),
      artist: metadata.common.artist || 'SERGIK',
      duration: metadata.format.duration ? Math.round(metadata.format.duration) : null,
    }
  } catch (error) {
    return {
      title: basename(filePath, extname(filePath)),
      artist: 'SERGIK',
      duration: null,
    }
  }
}

// Upload file to Supabase Storage with retry logic
async function uploadFile(relativePath) {
  const filePath = join(AUDIO_DIR, relativePath)
  
  if (!existsSync(filePath)) {
    console.error(`❌ File not found: ${filePath}`)
    stats.errors++
    return
  }

  const fileName = basename(filePath)
  const folderPath = dirname(relativePath)
  const fileExt = extname(fileName).toLowerCase().slice(1)
  const fileStats = await stat(filePath)
  const fileSize = fileStats.size
  const sizeMB = (fileSize / (1024 * 1024)).toFixed(2)

  console.log(`\n📤 Attempting upload: ${relativePath} (${sizeMB}MB)`)

  // Check if file already exists in database
  const { data: existing } = await supabase
    .from('audio_files')
    .select('id, file_path')
    .eq('file_path', relativePath)
    .single()

  if (existing) {
    console.log(`⏭️  Skipped (already exists in database): ${relativePath}`)
    stats.skipped++
    return
  }

  try {
    // Check if file exists in storage
    const { data: storageFile } = await supabase.storage
      .from(BUCKET_NAME)
      .list(folderPath === '.' ? '' : folderPath, {
        limit: 1000,
        search: fileName,
      })

    const existsInStorage = storageFile?.some(f => f.name === fileName)

    if (existsInStorage) {
      console.log(`⚠️  File exists in storage, will overwrite: ${relativePath}`)
    }

    // Read file
    console.log(`📖 Reading file...`)
    const fileBuffer = await readFile(filePath)
    
    // Upload to Supabase Storage with upsert to overwrite any partial uploads
    console.log(`☁️  Uploading to Supabase Storage...`)
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(relativePath, fileBuffer, {
        contentType: `audio/${fileExt}`,
        upsert: true, // Overwrite if exists (handles partial uploads)
        cacheControl: '3600',
      })

    if (uploadError) {
      // Check if it's a size limit error
      if (uploadError.message.includes('exceeded the maximum allowed size') || 
          uploadError.message.includes('too large')) {
        console.error(`❌ File too large for Supabase bucket limit: ${relativePath}`)
        console.error(`   File size: ${sizeMB}MB`)
        console.error(`   Action: Increase the file size limit in Supabase Dashboard:`)
        console.error(`   1. Go to Storage → Settings → Global file size limit`)
        console.error(`   2. Set to at least ${Math.ceil(fileSize / (1024 * 1024))}MB (or 5120MB for Pro plan)`)
        console.error(`   3. Also check Storage → Buckets → audio-files → Edit → File size limit`)
      }
      throw uploadError
    }

    console.log(`✅ Uploaded to storage: ${relativePath}`)

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(relativePath)

    // Extract metadata
    console.log(`🎵 Extracting metadata...`)
    const metadata = await extractMetadata(filePath)

    // Insert or update in database
    console.log(`💾 Saving to database...`)
    const { error: dbError } = await supabase
      .from('audio_files')
      .upsert({
        title: metadata.title,
        artist: metadata.artist,
        file_name: fileName,
        file_path: relativePath,
        file_url: urlData.publicUrl,
        format: fileExt.toUpperCase(),
        size_bytes: fileSize,
        size_mb: parseFloat((fileSize / (1024 * 1024)).toFixed(2)),
        duration_seconds: metadata.duration,
        folder_path: folderPath === '.' ? '' : folderPath,
        is_purchasable: false,
      }, {
        onConflict: 'file_path',
      })

    if (dbError) {
      throw dbError
    }

    stats.uploaded++
    stats.totalSize += fileSize
    console.log(`✅ Successfully uploaded: ${relativePath} (${sizeMB}MB)`)
  } catch (error) {
    stats.errors++
    console.error(`❌ Error uploading ${relativePath}:`, error.message)
    if (error.message.includes('exceeded')) {
      console.error(`\n💡 Tip: Make sure your Supabase bucket file size limit is set correctly.`)
      console.error(`   Current file size: ${sizeMB}MB`)
    }
  }
}

// Main function
async function main() {
  console.log('🔄 Retrying failed audio file uploads to Supabase...\n')
  console.log(`📁 Audio directory: ${AUDIO_DIR}`)
  console.log(`☁️  Bucket: ${BUCKET_NAME}`)
  console.log(`📋 Files to retry: ${FAILED_FILES.length}\n`)

  if (!existsSync(AUDIO_DIR)) {
    console.error(`❌ Audio directory not found: ${AUDIO_DIR}`)
    process.exit(1)
  }

  // Check if bucket exists
  const { data: buckets, error: bucketError } = await supabase.storage.listBuckets()
  
  if (bucketError) {
    console.error('❌ Error accessing Supabase Storage:', bucketError.message)
    process.exit(1)
  }

  const bucketExists = buckets.some(b => b.name === BUCKET_NAME)
  if (!bucketExists) {
    console.error(`❌ Bucket '${BUCKET_NAME}' not found!`)
    console.error('   Create it in Supabase Dashboard → Storage')
    process.exit(1)
  }

  const startTime = Date.now()

  // Retry each failed file
  for (const relativePath of FAILED_FILES) {
    stats.total++
    await uploadFile(relativePath)
    // Small delay between uploads to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000))
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1)

  console.log('\n' + '='.repeat(50))
  console.log('📊 Retry Summary:')
  console.log('='.repeat(50))
  console.log(`Total files retried: ${stats.total}`)
  console.log(`✅ Successfully uploaded: ${stats.uploaded}`)
  console.log(`⏭️  Skipped: ${stats.skipped}`)
  console.log(`❌ Errors: ${stats.errors}`)
  console.log(`📦 Total size uploaded: ${(stats.totalSize / (1024 * 1024)).toFixed(2)} MB`)
  console.log(`⏱️  Duration: ${duration}s`)
  console.log('='.repeat(50))

  if (stats.errors > 0) {
    console.log('\n⚠️  Some files still failed to upload.')
    console.log('   Check the errors above and ensure:')
    console.log('   1. Supabase bucket file size limit is set correctly')
    console.log('   2. Global file size limit in Supabase Dashboard is sufficient')
    console.log('   3. You have a Pro plan (required for files >50MB)')
    process.exit(1)
  } else {
    console.log('\n🎉 All files uploaded successfully!')
  }
}

main().catch(console.error)

