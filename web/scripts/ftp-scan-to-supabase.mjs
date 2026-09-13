#!/usr/bin/env node

/**
 * FTP Scan and Upload to Supabase
 * 
 * This script:
 * 1. Connects to an FTP server
 * 2. Scans for audio files recursively
 * 3. Downloads files temporarily
 * 4. Uploads each audio file to Supabase Storage
 * 5. Stores file metadata in Supabase database
 * 6. Cleans up temporary files
 * 
 * Usage:
 *   node scripts/ftp-scan-to-supabase.mjs
 * 
 * Requirements:
 *   - Set FTP credentials in .env.local:
 *     FTP_HOST=ftp.example.com
 *     FTP_USER=username
 *     FTP_PASSWORD=password
 *     FTP_PORT=21 (optional, defaults to 21)
 *     FTP_SECURE=false (optional, set to true for FTPS)
 *   - Set Supabase credentials in .env.local:
 *     NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
 *     SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
 *   - Create 'audio-files' bucket in Supabase Storage
 *   - Run schema.sql in Supabase SQL Editor first
 */

import { createClient } from '@supabase/supabase-js'
import { Client } from 'basic-ftp'
import { writeFile, readFile, unlink, mkdir, stat } from 'fs/promises'
import { join, relative, extname, basename, dirname } from 'path'
import { existsSync } from 'fs'
import { parseFile } from 'music-metadata'
import { config } from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname as dirnameESM } from 'path'
import { tmpdir } from 'os'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirnameESM(__filename)

// Load environment variables
config({ path: join(__dirname, '../.env.local') })

// FTP Configuration
const FTP_HOST = process.env.FTP_HOST
const FTP_USER = process.env.FTP_USER
const FTP_PASSWORD = process.env.FTP_PASSWORD
const FTP_PORT = parseInt(process.env.FTP_PORT || '21', 10)
const FTP_SECURE = process.env.FTP_SECURE === 'true'
const FTP_ROOT_PATH = process.env.FTP_ROOT_PATH || '/' // Root path on FTP server to scan

// Supabase Configuration
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!FTP_HOST || !FTP_USER || !FTP_PASSWORD) {
  console.error('❌ Missing FTP environment variables!')
  console.error('   Add to web/.env.local:')
  console.error('   FTP_HOST=ftp.example.com')
  console.error('   FTP_USER=username')
  console.error('   FTP_PASSWORD=password')
  console.error('   FTP_PORT=21 (optional)')
  console.error('   FTP_SECURE=false (optional, set to true for FTPS)')
  console.error('   FTP_ROOT_PATH=/ (optional, root path to scan)')
  process.exit(1)
}

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing Supabase environment variables!')
  console.error('   Add to web/.env.local:')
  console.error('   NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co')
  console.error('   SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...')
  process.exit(1)
}

const BUCKET_NAME = 'audio-files'
const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.flac', '.m4a', '.ogg', '.aac', '.wma']
const MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024 // 5GB (Supabase Pro limit)
const TEMP_DIR = join(tmpdir(), 'sergik-ftp-upload')

// Statistics
const stats = {
  total: 0,
  uploaded: 0,
  skipped: 0,
  failed: 0,
  tooLarge: 0,
  totalSize: 0,
}

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

// Helper to check if file is audio
function isAudioFile(filename) {
  const ext = extname(filename).toLowerCase()
  return AUDIO_EXTENSIONS.includes(ext)
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

// Upload file to Supabase Storage
async function uploadToSupabase(localFilePath, ftpRelativePath) {
  const fileName = basename(localFilePath)
  const folderPath = dirname(ftpRelativePath) === '.' ? '' : dirname(ftpRelativePath)
  const fileExt = extname(fileName).toLowerCase().slice(1)
  
  let fileSize
  try {
    const fileStats = await stat(localFilePath)
    fileSize = fileStats.size
  } catch (error) {
    console.error(`❌ Failed to get file size: ${ftpRelativePath}`)
    stats.failed++
    return false
  }

  // Check file size
  if (fileSize > MAX_FILE_SIZE) {
    const sizeMB = (fileSize / (1024 * 1024)).toFixed(2)
    const maxMB = (MAX_FILE_SIZE / (1024 * 1024)).toFixed(0)
    console.log(`⚠️  Skipped (too large): ${ftpRelativePath} (${sizeMB}MB > ${maxMB}MB limit)`)
    stats.tooLarge++
    return false
  }

  // Check if file already exists in database
  try {
    const { data: existing } = await supabase
      .from('audio_files')
      .select('id')
      .eq('file_path', ftpRelativePath)
      .single()

    if (existing) {
      console.log(`⏭️  Skipped (already exists): ${ftpRelativePath}`)
      stats.skipped++
      return true
    }
  } catch (error) {
    // Continue if check fails
  }

  // Read file buffer
  let fileBuffer
  try {
    fileBuffer = await readFile(localFilePath)
  } catch (error) {
    console.error(`❌ Failed to read file: ${ftpRelativePath}`, error.message)
    stats.failed++
    return false
  }

  // Upload to Supabase Storage
  try {
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(ftpRelativePath, fileBuffer, {
        contentType: `audio/${fileExt}`,
        upsert: true,
      })

    if (uploadError) {
      console.error(`❌ Upload failed: ${ftpRelativePath}`, uploadError.message)
      stats.failed++
      return false
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(ftpRelativePath)

    // Extract metadata
    const metadata = await extractMetadata(localFilePath)

    // Save to database
    const { error: dbError } = await supabase
      .from('audio_files')
      .insert({
        title: metadata.title,
        artist: metadata.artist,
        file_name: fileName,
        file_path: ftpRelativePath,
        file_url: urlData.publicUrl,
        format: fileExt.toUpperCase(),
        size_bytes: fileSize,
        size_mb: parseFloat((fileSize / (1024 * 1024)).toFixed(2)),
        duration_seconds: metadata.duration,
        folder_path: folderPath,
        is_purchasable: false,
      })

    if (dbError) {
      console.error(`⚠️  Uploaded but DB insert failed: ${ftpRelativePath}`, dbError.message)
    }

    stats.uploaded++
    stats.totalSize += fileSize
    const sizeMB = (fileSize / (1024 * 1024)).toFixed(2)
    console.log(`✅ Uploaded: ${ftpRelativePath} (${sizeMB}MB)`)
    return true
  } catch (error) {
    console.error(`❌ Upload error: ${ftpRelativePath}`, error.message)
    stats.failed++
    return false
  }
}

// Recursively scan FTP directory
async function scanFtpDirectory(client, remotePath, localBasePath, relativeBasePath = '') {
  const files = []
  
  try {
    const listing = await client.list(remotePath)
    
    for (const item of listing) {
      const remoteItemPath = remotePath === '/' ? `/${item.name}` : `${remotePath}/${item.name}`
      const relativeItemPath = relativeBasePath ? `${relativeBasePath}/${item.name}` : item.name
      
      if (item.isDirectory) {
        // Recursively scan subdirectory
        await scanFtpDirectory(client, remoteItemPath, localBasePath, relativeItemPath)
      } else if (item.isFile && isAudioFile(item.name)) {
        files.push({
          remotePath: remoteItemPath,
          relativePath: relativeItemPath,
          name: item.name,
          size: item.size,
        })
      }
    }
  } catch (error) {
    console.error(`⚠️  Error scanning ${remotePath}:`, error.message)
  }
  
  return files
}

// Download file from FTP
async function downloadFile(client, remotePath, localPath) {
  try {
    // Ensure local directory exists
    const localDir = dirname(localPath)
    if (!existsSync(localDir)) {
      await mkdir(localDir, { recursive: true })
    }
    
    // Download file
    await client.downloadTo(localPath, remotePath)
    return true
  } catch (error) {
    console.error(`❌ Failed to download ${remotePath}:`, error.message)
    return false
  }
}

// Main function
async function main() {
  console.log('🚀 Starting FTP scan and upload to Supabase...\n')
  console.log(`📡 FTP Server: ${FTP_HOST}:${FTP_PORT}`)
  console.log(`👤 FTP User: ${FTP_USER}`)
  console.log(`📁 FTP Root Path: ${FTP_ROOT_PATH}`)
  console.log(`☁️  Supabase: ${SUPABASE_URL}\n`)

  // Check Supabase bucket
  const { data: buckets, error: bucketError } = await supabase.storage.listBuckets()
  if (bucketError) {
    console.error('❌ Error accessing Supabase Storage:', bucketError.message)
    process.exit(1)
  }

  const bucketExists = buckets?.some(b => b.name === BUCKET_NAME)
  if (!bucketExists) {
    console.error(`❌ Bucket '${BUCKET_NAME}' not found in Supabase Storage!`)
    console.error('   Create it in Supabase Dashboard → Storage')
    process.exit(1)
  }

  // Create temp directory
  if (!existsSync(TEMP_DIR)) {
    await mkdir(TEMP_DIR, { recursive: true })
  }

  // Connect to FTP
  const client = new Client()
  client.ftp.verbose = false // Set to true for debug output

  try {
    console.log('🔌 Connecting to FTP server...')
    await client.access({
      host: FTP_HOST,
      user: FTP_USER,
      password: FTP_PASSWORD,
      port: FTP_PORT,
      secure: FTP_SECURE,
    })
    console.log('✅ Connected to FTP server\n')

    // Change to root path if specified
    if (FTP_ROOT_PATH !== '/') {
      await client.cd(FTP_ROOT_PATH)
      console.log(`📂 Changed to directory: ${FTP_ROOT_PATH}\n`)
    }

    // Scan for audio files
    console.log('🔍 Scanning FTP server for audio files...')
    const audioFiles = await scanFtpDirectory(client, FTP_ROOT_PATH, TEMP_DIR)
    stats.total = audioFiles.length
    console.log(`📊 Found ${audioFiles.length} audio files\n`)

    if (audioFiles.length === 0) {
      console.log('ℹ️  No audio files found. Exiting.')
      await client.close()
      return
    }

    // Process each file
    console.log('📤 Starting upload process...\n')
    for (let i = 0; i < audioFiles.length; i++) {
      const file = audioFiles[i]
      const localFilePath = join(TEMP_DIR, file.relativePath)
      
      console.log(`[${i + 1}/${audioFiles.length}] Processing: ${file.relativePath}`)
      
      // Download file
      const downloaded = await downloadFile(client, file.remotePath, localFilePath)
      if (!downloaded) {
        stats.failed++
        continue
      }

      // Upload to Supabase
      await uploadToSupabase(localFilePath, file.relativePath)

      // Clean up local file
      try {
        await unlink(localFilePath)
      } catch (error) {
        // Ignore cleanup errors
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 200))
    }

    await client.close()
    console.log('\n✅ FTP connection closed')

  } catch (error) {
    console.error('❌ FTP Error:', error.message)
    if (client && !client.closed) {
      await client.close()
    }
    process.exit(1)
  }

  // Print summary
  console.log('\n' + '='.repeat(60))
  console.log('📊 Upload Summary')
  console.log('='.repeat(60))
  console.log(`Total files found: ${stats.total}`)
  console.log(`✅ Successfully uploaded: ${stats.uploaded}`)
  console.log(`⏭️  Skipped (already exists): ${stats.skipped}`)
  console.log(`⚠️  Too large: ${stats.tooLarge}`)
  console.log(`❌ Failed: ${stats.failed}`)
  console.log(`📦 Total size uploaded: ${(stats.totalSize / (1024 * 1024)).toFixed(2)} MB`)
  console.log('='.repeat(60))
}

// Run main function
main().catch(error => {
  console.error('❌ Fatal error:', error)
  process.exit(1)
})

