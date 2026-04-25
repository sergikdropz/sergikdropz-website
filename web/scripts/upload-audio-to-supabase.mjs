#!/usr/bin/env node

/**
 * Migration Script: Upload Audio Files to Supabase Storage
 * 
 * This script:
 * 1. Scans web/public/audio/ directory
 * 2. Uploads each audio file to Supabase Storage
 * 3. Stores file metadata in Supabase database
 * 4. Preserves folder structure
 * 
 * Usage:
 *   node scripts/upload-audio-to-supabase.mjs
 * 
 * Requirements:
 *   - Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 *   - Create 'audio-files' bucket in Supabase Storage
 *   - Run schema.sql in Supabase SQL Editor first
 */

import { createClient } from '@supabase/supabase-js'
import { readdir, stat, readFile } from 'fs/promises'
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

// Create fetch wrapper with timeout
function createFetchWithTimeout(timeoutMs = 10 * 60 * 1000) {
  return async (url, options = {}) => {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
    
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      })
      return response
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error('Request timeout')
      }
      throw error
    } finally {
      clearTimeout(timeoutId)
    }
  }
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
  global: {
    fetch: createFetchWithTimeout(10 * 60 * 1000), // 10 minutes timeout
  },
})

const AUDIO_DIR = join(process.cwd(), 'public', 'audio')
const BUCKET_NAME = 'audio-files'
const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.flac', '.m4a', '.ogg', '.aac']

// Supabase file size limit
// Free tier: 50MB default
// Pro plan: Up to 5GB per file (standard uploads) or 50GB (resumable/S3 uploads)
// Set MAX_FILE_SIZE_MB in .env.local to match your Supabase dashboard settings
// Default: 5120MB (5GB) for Pro plans
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE_MB || '5120') * 1024 * 1024 // Default 5GB for Pro plans

// Stats
let stats = {
  total: 0,
  uploaded: 0,
  skipped: 0,
  errors: 0,
  tooLarge: 0,
  totalSize: 0,
}

// Helper to check if file is audio
function isAudioFile(filename) {
  const ext = extname(filename).toLowerCase()
  return AUDIO_EXTENSIONS.includes(ext)
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
async function uploadFile(filePath, retries = 5) {
  const relativePath = relative(AUDIO_DIR, filePath)
  const fileName = basename(filePath)
  const folderPath = dirname(relativePath)
  const fileExt = extname(fileName).toLowerCase().slice(1)
  const fileStats = await stat(filePath)
  const fileSize = fileStats.size

  // Check file size before attempting upload
  if (fileSize > MAX_FILE_SIZE) {
    const sizeMB = (fileSize / (1024 * 1024)).toFixed(2)
    const maxMB = (MAX_FILE_SIZE / (1024 * 1024)).toFixed(0)
    console.log(`⚠️  Skipped (too large): ${relativePath} (${sizeMB}MB > ${maxMB}MB limit)`)
    stats.tooLarge++
    return
  }

  // Check if file already exists in database
  try {
    const { data: existing } = await supabase
      .from('audio_files')
      .select('id')
      .eq('file_path', relativePath)
      .single()

    if (existing) {
      console.log(`⏭️  Skipped (already exists): ${relativePath}`)
      stats.skipped++
      return
    }
  } catch (error) {
    // Continue if check fails
  }

  // Check if file exists in storage (with retry)
  let fileExistsInStorage = false
  for (let checkAttempt = 0; checkAttempt < 3; checkAttempt++) {
    try {
      const { data: storageFiles, error: listError } = await supabase.storage
        .from(BUCKET_NAME)
        .list(folderPath === '.' ? '' : folderPath, {
          search: fileName,
          limit: 1000
        })

      if (!listError && storageFiles && storageFiles.some(f => f.name === fileName)) {
        fileExistsInStorage = true
        break
      }
      if (!listError) break // Successfully checked, file doesn't exist
    } catch (error) {
      if (checkAttempt === 2) {
        // Last attempt failed, continue anyway
        break
      }
      await new Promise(resolve => setTimeout(resolve, 1000 * (checkAttempt + 1)))
    }
  }

  if (fileExistsInStorage) {
    // File exists in storage, just add to database
    try {
      const { data: urlData } = supabase.storage
        .from(BUCKET_NAME)
        .getPublicUrl(relativePath)
      
      const metadata = await extractMetadata(filePath)
      const { error: dbError } = await supabase
        .from('audio_files')
        .insert({
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
        })

      if (!dbError) {
        stats.uploaded++
        stats.totalSize += fileSize
        const sizeMB = await getFileSizeMB(filePath)
        console.log(`✅ Added to DB (exists in storage): ${relativePath} (${sizeMB}MB)`)
      }
    } catch (error) {
      // Continue to upload if DB insert fails
    }
    return
  }

  // Read file once before retry loop
  let fileBuffer
  try {
    fileBuffer = await readFile(filePath)
  } catch (error) {
    stats.errors++
    console.error(`❌ Error reading file ${relativePath}:`, error.message)
    return
  }

  // Retry upload with exponential backoff
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // Determine correct MIME type
      const mimeTypes = {
        'mp3': 'audio/mpeg',
        'wav': 'audio/wav',
        'flac': 'audio/flac',
        'm4a': 'audio/mp4',
        'ogg': 'audio/ogg',
        'aac': 'audio/aac',
      }
      const contentType = mimeTypes[fileExt] || `audio/${fileExt}`

      // Upload to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(relativePath, fileBuffer, {
          contentType: contentType,
          upsert: false,
        })

      if (uploadError) {
        if (uploadError.message.includes('already exists') || uploadError.message.includes('duplicate')) {
          console.log(`⏭️  Skipped (exists in storage): ${relativePath}`)
          stats.skipped++
          return
        }
        if (uploadError.message.includes('exceeded the maximum allowed size')) {
          const sizeMB = (fileSize / (1024 * 1024)).toFixed(2)
          console.log(`⚠️  Skipped (too large): ${relativePath} (${sizeMB}MB)`)
          stats.tooLarge++
          return
        }
        // For other errors, throw to trigger retry
        throw uploadError
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from(BUCKET_NAME)
        .getPublicUrl(relativePath)

      // Extract metadata
      const metadata = await extractMetadata(filePath)

      // Insert into database (with retry)
      let dbSuccess = false
      for (let dbAttempt = 0; dbAttempt < 3; dbAttempt++) {
        const { error: dbError } = await supabase
          .from('audio_files')
          .insert({
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
          })

        if (!dbError) {
          dbSuccess = true
          break
        }
        if (dbAttempt < 2) {
          await new Promise(resolve => setTimeout(resolve, 1000 * (dbAttempt + 1)))
        }
      }

      if (!dbSuccess) {
        console.log(`⚠️  Uploaded but DB insert failed: ${relativePath} (file is in storage)`)
      }

      stats.uploaded++
      stats.totalSize += fileSize
      const sizeMB = await getFileSizeMB(filePath)
      console.log(`✅ Uploaded: ${relativePath} (${sizeMB}MB)`)
      return // Success, exit retry loop
    } catch (error) {
      const isLastAttempt = attempt === retries
      const errorMsg = error.message || String(error)
      const isNetworkError = 
        errorMsg.includes('fetch failed') || 
        errorMsg.includes('ECONNRESET') ||
        errorMsg.includes('ETIMEDOUT') ||
        errorMsg.includes('timeout') ||
        errorMsg.includes('network') ||
        errorMsg.includes('ENOTFOUND') ||
        errorMsg.includes('ECONNREFUSED') ||
        (error.code && ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED'].includes(error.code))
      
      if (isLastAttempt) {
        stats.errors++
        if (isNetworkError) {
          console.error(`❌ Error uploading ${relativePath}: Network error (tried ${retries} times)`)
        } else {
          console.error(`❌ Error uploading ${relativePath}:`, errorMsg.substring(0, 100))
        }
        return
      }
      
      // Wait before retry (exponential backoff: 2s, 4s, 8s, 16s, 32s)
      const waitTime = Math.min(2000 * Math.pow(2, attempt - 1), 30000)
      if (isNetworkError) {
        console.log(`   ⏳ Retrying ${relativePath} (attempt ${attempt + 1}/${retries}) in ${waitTime/1000}s...`)
        await new Promise(resolve => setTimeout(resolve, waitTime))
      } else {
        // Non-network error, don't retry
        stats.errors++
        console.error(`❌ Error uploading ${relativePath}:`, errorMsg.substring(0, 100))
        return
      }
    }
  }
}

// Recursively scan directory
async function scanDirectory(dir) {
  const entries = await readdir(dir, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = join(dir, entry.name)

    if (entry.isDirectory()) {
      await scanDirectory(fullPath)
    } else if (entry.isFile() && isAudioFile(entry.name)) {
      stats.total++
      await uploadFile(fullPath)
      // Delay to avoid rate limiting (longer for large files)
      const fileSize = (await stat(fullPath)).size
      const delay = fileSize > 50 * 1024 * 1024 ? 500 : 200 // 500ms for files >50MB, 200ms otherwise
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
}

// Main function
async function main() {
  console.log('🚀 Starting audio file upload to Supabase...\n')
  console.log(`📁 Scanning: ${AUDIO_DIR}`)
  console.log(`☁️  Bucket: ${BUCKET_NAME}`)
  console.log(`📏 Max file size: ${(MAX_FILE_SIZE / (1024 * 1024)).toFixed(0)}MB\n`)

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

  try {
    await scanDirectory(AUDIO_DIR)
  } catch (error) {
    console.error('❌ Fatal error:', error)
    process.exit(1)
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1)

  console.log('\n' + '='.repeat(50))
  console.log('📊 Upload Summary:')
  console.log('='.repeat(50))
  console.log(`Total files found: ${stats.total}`)
  console.log(`✅ Uploaded: ${stats.uploaded}`)
  console.log(`⏭️  Skipped: ${stats.skipped}`)
  console.log(`⚠️  Too large: ${stats.tooLarge}`)
  console.log(`❌ Errors: ${stats.errors}`)
  console.log(`📦 Total size uploaded: ${(stats.totalSize / (1024 * 1024 * 1024)).toFixed(2)} GB`)
  console.log(`⏱️  Duration: ${duration}s`)
  console.log(`📏 Max file size limit: ${(MAX_FILE_SIZE / (1024 * 1024)).toFixed(0)}MB`)
  console.log('='.repeat(50))

  if (stats.tooLarge > 0) {
    console.log('\n⚠️  Some files were too large to upload (>50MB).')
    console.log(`   Options:`)
    console.log(`   1. Compress WAV files to MP3/FLAC (recommended)`)
    console.log(`   2. Upgrade to Supabase Pro ($25/month) for 5GB file limit`)
    console.log(`   3. Use alternative storage (AWS S3, Backblaze B2) for large files`)
  }

  if (stats.errors > 0 && stats.errors < stats.total * 0.5) {
    console.log('\n⚠️  Some files failed to upload (network/timeout issues).')
    console.log(`   You can re-run this script to retry failed uploads.`)
    console.log(`   Files that succeeded won't be re-uploaded.`)
  } else if (stats.errors > 0) {
    console.log('\n❌ Many files failed to upload. This might indicate:')
    console.log(`   - Network connectivity issues`)
    console.log(`   - Supabase rate limiting`)
    console.log(`   - File size issues`)
    console.log(`   Try running the script again later.`)
    process.exit(1)
  } else if (stats.tooLarge > 0) {
    console.log('\n✅ All eligible files uploaded! (Some files were skipped due to size)')
  } else {
    console.log('\n🎉 All files uploaded successfully!')
  }
}

main().catch(console.error)

