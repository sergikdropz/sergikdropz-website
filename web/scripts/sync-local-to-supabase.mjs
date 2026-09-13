#!/usr/bin/env node
/**
 * Sync Local Audio Files to Supabase
 * 
 * Scans local audio files and syncs them to Supabase Storage:
 * - Compares local files with Supabase Storage
 * - Uploads missing files
 * - Updates database records
 * - Preserves folder structure
 * 
 * Usage: node scripts/sync-local-to-supabase.mjs [--dry-run] [--force]
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'fs'
import { join, dirname, relative, extname, basename } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { resolve } from 'path'
import { parseFile } from 'music-metadata'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load environment variables
const envPath = resolve(__dirname, '..', '.env.local')
dotenv.config({ path: envPath })

const DRY_RUN = process.argv.includes('--dry-run')
const FORCE = process.argv.includes('--force')
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const AUDIO_DIR = join(__dirname, '..', 'public', 'audio')
const BUCKET_NAME = 'audio-files'
const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.flac', '.m4a', '.ogg', '.aac', '.m4v']

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
  localFiles: 0,
  storageFiles: 0,
  missingInStorage: [],
  missingInLocal: [],
  needsUpload: [],
  uploaded: 0,
  skipped: 0,
  errors: 0,
  totalSize: 0,
}

/**
 * Recursively scan directory for audio files
 */
function scanLocalFiles(dir, baseDir = dir, files = []) {
  if (!existsSync(dir)) {
    return files
  }
  
  try {
    const entries = readdirSync(dir, { withFileTypes: true })
    
    for (const entry of entries) {
      const fullPath = join(dir, entry.name)
      
      if (entry.isDirectory()) {
        scanLocalFiles(fullPath, baseDir, files)
      } else if (entry.isFile()) {
        const ext = extname(entry.name).toLowerCase()
        if (AUDIO_EXTENSIONS.includes(ext)) {
          const relativePath = relative(baseDir, fullPath)
          const stats = statSync(fullPath)
          files.push({
            name: entry.name,
            path: fullPath,
            relativePath: relativePath.replace(/\\/g, '/'),
            size: stats.size,
            modified: stats.mtime,
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
 * List all files in Supabase Storage recursively
 */
async function listStorageFilesRecursive(folderPath = '') {
  const files = []
  let offset = 0
  const limit = 1000
  
  while (true) {
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .list(folderPath, {
        limit,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      })
    
    if (error) {
      if (error.message.includes('not found')) {
        break // Folder doesn't exist
      }
      console.warn(`   Warning: Could not list ${folderPath}:`, error.message)
      break
    }
    
    if (!data || data.length === 0) break
    
    for (const item of data) {
      if (item.id) {
        // It's a file
        const fullPath = folderPath ? `${folderPath}/${item.name}` : item.name
        files.push({
          name: item.name,
          path: fullPath,
          size: item.metadata?.size || 0,
          updated: item.updated_at,
        })
      } else {
        // It's a folder - recursively list
        const subfolderPath = folderPath ? `${folderPath}/${item.name}` : item.name
        const subfolderFiles = await listStorageFilesRecursive(subfolderPath)
        files.push(...subfolderFiles)
      }
    }
    
    if (data.length < limit) break
    offset += limit
  }
  
  return files
}

/**
 * Extract metadata from audio file
 */
async function extractMetadata(filePath) {
  try {
    const metadata = await parseFile(filePath)
    return {
      title: metadata.common.title || basename(filePath, extname(filePath)),
      artist: metadata.common.artist || 'SERGIK',
      duration: Math.floor(metadata.format.duration || 0),
      album: metadata.common.album,
      genre: metadata.common.genre?.[0],
    }
  } catch (error) {
    return {
      title: basename(filePath, extname(filePath)),
      artist: 'SERGIK',
      duration: null,
    }
  }
}

/**
 * Upload file to Supabase
 */
async function uploadFile(localFile) {
  try {
    const fileBuffer = readFileSync(localFile.path)
    const fileName = basename(localFile.path)
    const fileExt = extname(fileName).toLowerCase().slice(1)
    
    // Determine MIME type
    const mimeTypes = {
      'mp3': 'audio/mpeg',
      'wav': 'audio/wav',
      'flac': 'audio/flac',
      'm4a': 'audio/mp4',
      'ogg': 'audio/ogg',
      'aac': 'audio/aac',
    }
    const contentType = mimeTypes[fileExt] || `audio/${fileExt}`
    
    if (DRY_RUN) {
      console.log(`   🔍 Would upload: ${localFile.relativePath} (${(localFile.size / 1024 / 1024).toFixed(2)}MB)`)
      return true
    }
    
    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(localFile.relativePath, fileBuffer, {
        contentType,
        upsert: FORCE, // Overwrite if --force flag
      })
    
    if (uploadError) {
      if (uploadError.message.includes('already exists') && !FORCE) {
        console.log(`   ⏭️  Skipped (exists): ${localFile.relativePath}`)
        stats.skipped++
        return false
      }
      throw uploadError
    }
    
    // Get public URL
    const { data: urlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(localFile.relativePath)
    
    // Extract metadata
    const metadata = await extractMetadata(localFile.path)
    
    // Check if record exists in database
    const { data: existing } = await supabase
      .from('audio_files')
      .select('id')
      .eq('file_path', localFile.relativePath)
      .maybeSingle()
    
    const fileData = {
      file_name: fileName,
      file_path: localFile.relativePath,
      file_url: urlData.publicUrl,
      title: metadata.title,
      artist: metadata.artist,
      format: fileExt.toUpperCase(),
      size_bytes: localFile.size,
      size_mb: parseFloat((localFile.size / (1024 * 1024)).toFixed(2)),
      duration_seconds: metadata.duration,
      folder_path: dirname(localFile.relativePath),
      updated_at: new Date().toISOString(),
    }
    
    if (existing) {
      // Update existing record
      const { error: updateError } = await supabase
        .from('audio_files')
        .update(fileData)
        .eq('id', existing.id)
      
      if (updateError) {
        throw new Error(`Database update failed: ${updateError.message}`)
      }
    } else {
      // Insert new record
      const { error: insertError } = await supabase
        .from('audio_files')
        .insert({
          ...fileData,
          created_at: new Date().toISOString(),
        })
      
      if (insertError) {
        throw new Error(`Database insert failed: ${insertError.message}`)
      }
    }
    
    stats.uploaded++
    stats.totalSize += localFile.size
    const sizeMB = (localFile.size / 1024 / 1024).toFixed(2)
    console.log(`   ✅ Uploaded: ${localFile.relativePath} (${sizeMB}MB)`)
    return true
    
  } catch (error) {
    console.error(`   ❌ Error uploading ${localFile.relativePath}:`, error.message)
    stats.errors++
    return false
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('🔄 Syncing local audio files to Supabase...\n')
  if (DRY_RUN) {
    console.log('⚠️  DRY RUN MODE - No changes will be made\n')
  }
  if (FORCE) {
    console.log('⚠️  FORCE MODE - Will overwrite existing files\n')
  }
  
  try {
    // Step 1: Scan local files
    console.log('📁 Scanning local audio files...')
    if (!existsSync(AUDIO_DIR)) {
      console.error(`❌ Audio directory not found: ${AUDIO_DIR}`)
      process.exit(1)
    }
    
    const localFiles = scanLocalFiles(AUDIO_DIR, AUDIO_DIR)
    stats.localFiles = localFiles.length
    console.log(`   Found ${localFiles.length} audio files locally\n`)
    
    // Step 2: List files in Supabase Storage
    console.log('📦 Scanning Supabase Storage...')
    const storageFiles = await listStorageFilesRecursive()
    stats.storageFiles = storageFiles.length
    console.log(`   Found ${storageFiles.length} files in storage\n`)
    
    // Step 3: Compare and find missing files
    console.log('🔍 Comparing files...')
    const storageMap = new Map()
    storageFiles.forEach(file => {
      storageMap.set(file.path, file)
    })
    
    const localMap = new Map()
    localFiles.forEach(file => {
      localMap.set(file.relativePath, file)
    })
    
    // Find files that need to be uploaded
    for (const localFile of localFiles) {
      const storageFile = storageMap.get(localFile.relativePath)
      
      if (!storageFile) {
        // File doesn't exist in storage
        stats.needsUpload.push(localFile)
        stats.missingInStorage.push(localFile)
      } else if (FORCE) {
        // Force mode - upload anyway
        stats.needsUpload.push(localFile)
      } else {
        // File exists - check if size matches
        if (storageFile.size !== localFile.size) {
          console.log(`   ⚠️  Size mismatch: ${localFile.relativePath} (local: ${(localFile.size / 1024 / 1024).toFixed(2)}MB, storage: ${(storageFile.size / 1024 / 1024).toFixed(2)}MB)`)
          if (FORCE) {
            stats.needsUpload.push(localFile)
          }
        }
      }
    }
    
    // Find files in storage but not local
    for (const storageFile of storageFiles) {
      if (!localMap.has(storageFile.path)) {
        stats.missingInLocal.push(storageFile)
      }
    }
    
    console.log(`   Files to upload: ${stats.needsUpload.length}`)
    console.log(`   Files missing in storage: ${stats.missingInStorage.length}`)
    console.log(`   Files missing locally: ${stats.missingInLocal.length}\n`)
    
    // Step 4: Upload missing files
    if (stats.needsUpload.length > 0) {
      console.log('📤 Uploading files...')
      console.log('-'.repeat(60))
      
      for (const file of stats.needsUpload) {
        await uploadFile(file)
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100))
      }
      
      console.log('-'.repeat(60))
    }
    
    // Print summary
    console.log('\n' + '='.repeat(60))
    console.log('📊 SYNC SUMMARY')
    console.log('='.repeat(60))
    console.log(`Local Files:           ${stats.localFiles}`)
    console.log(`Storage Files:         ${stats.storageFiles}`)
    console.log(`Uploaded:              ${stats.uploaded}`)
    console.log(`Skipped:               ${stats.skipped}`)
    console.log(`Errors:                ${stats.errors}`)
    console.log(`Missing in Storage:     ${stats.missingInStorage.length}`)
    console.log(`Missing Locally:       ${stats.missingInLocal.length}`)
    
    if (stats.totalSize > 0) {
      const totalMB = (stats.totalSize / 1024 / 1024).toFixed(2)
      console.log(`Total Uploaded:        ${totalMB}MB`)
    }
    
    if (stats.missingInStorage.length > 0 && !DRY_RUN) {
      console.log('\n✅ Files uploaded successfully!')
    } else if (stats.missingInStorage.length > 0 && DRY_RUN) {
      console.log('\n⚠️  Run without --dry-run to upload these files')
    } else {
      console.log('\n✅ Everything is in sync!')
    }
    
    if (stats.missingInLocal.length > 0) {
      console.log('\n⚠️  Files in Supabase but not locally:')
      stats.missingInLocal.slice(0, 10).forEach(file => {
        console.log(`   - ${file.path}`)
      })
      if (stats.missingInLocal.length > 10) {
        console.log(`   ... and ${stats.missingInLocal.length - 10} more`)
      }
    }
    
  } catch (error) {
    console.error('\n❌ Fatal error:', error)
    process.exit(1)
  }
}

main()
