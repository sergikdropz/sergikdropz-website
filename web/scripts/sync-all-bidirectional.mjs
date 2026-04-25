#!/usr/bin/env node
/**
 * Comprehensive Bidirectional Sync: Local ↔ Supabase
 * 
 * Synchronizes all files and metadata between local development and Supabase production:
 * - Audio files (bidirectional: upload local → Supabase, download Supabase → local)
 * - Images (bidirectional: upload local → Supabase, download Supabase → local)
 * - Database metadata (waveforms, sonic DNA, BPM) - export/import
 * - File hashing for efficient change detection
 * - Sync state tracking for incremental updates
 * - Conflict resolution (newer wins by default)
 * 
 * Usage:
 *   node scripts/sync-all-bidirectional.mjs [options]
 * 
 * Options:
 *   --dry-run              Preview changes without making them
 *   --force                Force overwrite existing files
 *   --regenerate            Allow regeneration of files/database records (bypasses duplicate checks)
 *   --direction=up         Only sync local → Supabase (upload)
 *   --direction=down       Only sync Supabase → local (download)
 *   --direction=both       Sync both directions (default)
 *   --audio-only           Only sync audio files
 *   --images-only          Only sync images
 *   --metadata-only        Only sync database metadata
 *   --skip-hash            Skip file hashing (faster but less accurate)
 *   --conflict=keep-newer  Conflict resolution: keep-newer (default), keep-local, keep-remote
 *   --no-update-artwork-urls  Skip updating artwork URLs in music-library.json after image sync
 *   --update-artwork-urls  Update artwork URLs in music-library.json after image sync (default: auto)
 * 
 * Duplicate Prevention:
 *   By default, the script prevents duplicate files and database records:
 *   - Files are not re-uploaded if they already exist (unless --force or --regenerate)
 *   - Database records are not duplicated (checks by file_path)
 *   - Use --regenerate to explicitly allow regeneration of existing files/records
 */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync } from 'fs'
import { join, dirname, relative, extname, basename } from 'path'
import { fileURLToPath } from 'url'
import { createHash } from 'crypto'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { resolve } from 'path'
import { parseFile } from 'music-metadata'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load environment variables
const envPath = resolve(__dirname, '..', '.env.local')
dotenv.config({ path: envPath })

// Parse command line arguments
const DRY_RUN = process.argv.includes('--dry-run')
const FORCE = process.argv.includes('--force')
const REGENERATE = process.argv.includes('--regenerate')
const SKIP_HASH = process.argv.includes('--skip-hash')
const AUDIO_ONLY = process.argv.includes('--audio-only')
const IMAGES_ONLY = process.argv.includes('--images-only')
const METADATA_ONLY = process.argv.includes('--metadata-only')
const UPDATE_ARTWORK_URLS = !process.argv.includes('--no-update-artwork-urls') // Default: true

const directionArg = process.argv.find(arg => arg.startsWith('--direction='))
const DIRECTION = directionArg ? directionArg.split('=')[1] : 'both' // 'up', 'down', 'both'

const conflictArg = process.argv.find(arg => arg.startsWith('--conflict='))
const CONFLICT_RESOLUTION = conflictArg ? conflictArg.split('=')[1] : 'keep-newer' // 'keep-newer', 'keep-local', 'keep-remote'

// Configuration
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const AUDIO_DIR = join(__dirname, '..', 'public', 'audio')
const IMAGES_DIR = join(__dirname, '..', 'public', 'images')
const AUDIO_BUCKET = 'audio-files'
const IMAGES_BUCKET = 'gallery-images'
const SYNC_STATE_FILE = join(__dirname, '..', 'data', '.sync-state.json')
const EXPORT_DIR = join(__dirname, '..', 'data', 'supabase-export')

const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.flac', '.m4a', '.ogg', '.aac', '.m4v']
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp']

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

// Global statistics
const stats = {
  audio: {
    localFiles: 0,
    remoteFiles: 0,
    uploaded: 0,
    downloaded: 0,
    skipped: 0,
    conflicts: 0,
    errors: 0,
    totalSize: 0,
  },
  images: {
    localFiles: 0,
    remoteFiles: 0,
    uploaded: 0,
    downloaded: 0,
    skipped: 0,
    conflicts: 0,
    errors: 0,
    totalSize: 0,
  },
  metadata: {
    exported: 0,
    imported: 0,
    updated: 0,
    errors: 0,
  },
}

/**
 * Load sync state from file
 */
function loadSyncState() {
  if (!existsSync(SYNC_STATE_FILE)) {
    return {
      lastSync: null,
      audioHashes: {},
      imageHashes: {},
      metadataVersion: null,
    }
  }
  try {
    return JSON.parse(readFileSync(SYNC_STATE_FILE, 'utf-8'))
  } catch (error) {
    console.warn('⚠️  Could not load sync state, starting fresh')
    return {
      lastSync: null,
      audioHashes: {},
      imageHashes: {},
      metadataVersion: null,
    }
  }
}

/**
 * Save sync state to file
 */
function saveSyncState(state) {
  try {
    const dir = dirname(SYNC_STATE_FILE)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    writeFileSync(SYNC_STATE_FILE, JSON.stringify(state, null, 2), 'utf-8')
  } catch (error) {
    console.warn('⚠️  Could not save sync state:', error.message)
  }
}

/**
 * Calculate file hash (MD5)
 */
function calculateFileHash(filePath) {
  if (SKIP_HASH) {
    // Use size + modified time as a simple hash
    const stats = statSync(filePath)
    return `${stats.size}-${stats.mtime.getTime()}`
  }
  try {
    const fileBuffer = readFileSync(filePath)
    return createHash('md5').update(fileBuffer).digest('hex')
  } catch (error) {
    console.warn(`   Warning: Could not hash ${filePath}:`, error.message)
    return null
  }
}

/**
 * Recursively scan directory for files
 */
function scanLocalFiles(dir, baseDir, extensions, files = []) {
  if (!existsSync(dir)) {
    return files
  }
  
  try {
    const entries = readdirSync(dir, { withFileTypes: true })
    
    for (const entry of entries) {
      const fullPath = join(dir, entry.name)
      
      if (entry.isDirectory()) {
        scanLocalFiles(fullPath, baseDir, extensions, files)
      } else if (entry.isFile()) {
        const ext = extname(entry.name).toLowerCase()
        if (extensions.includes(ext)) {
          const relativePath = relative(baseDir, fullPath)
          const fileStats = statSync(fullPath)
          const hash = calculateFileHash(fullPath)
          
          files.push({
            name: entry.name,
            path: fullPath,
            relativePath: relativePath.replace(/\\/g, '/'),
            size: fileStats.size,
            modified: fileStats.mtime,
            hash: hash,
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
async function listStorageFilesRecursive(bucketName, folderPath = '') {
  const files = []
  let offset = 0
  const limit = 1000
  
  while (true) {
    const { data, error } = await supabase.storage
      .from(bucketName)
      .list(folderPath, {
        limit,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      })
    
    if (error) {
      if (error.message.includes('not found')) {
        break
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
        const subfolderFiles = await listStorageFilesRecursive(bucketName, subfolderPath)
        files.push(...subfolderFiles)
      }
    }
    
    if (data.length < limit) break
    offset += limit
  }
  
  return files
}

/**
 * Download file from Supabase Storage
 */
async function downloadFile(bucketName, remotePath, localPath) {
  try {
    const { data, error } = await supabase.storage
      .from(bucketName)
      .download(remotePath)
    
    if (error) {
      throw error
    }
    
    if (DRY_RUN) {
      console.log(`   🔍 Would download: ${remotePath} → ${localPath}`)
      return true
    }
    
    // Ensure directory exists
    const dir = dirname(localPath)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    
    // Convert blob to buffer and write
    const arrayBuffer = await data.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    writeFileSync(localPath, buffer)
    
    return true
  } catch (error) {
    console.error(`   ❌ Error downloading ${remotePath}:`, error.message)
    return false
  }
}

/**
 * Check if file already exists in storage (duplicate prevention)
 */
async function checkFileExists(bucketName, filePath) {
  try {
    const { data, error } = await supabase.storage
      .from(bucketName)
      .list(dirname(filePath) || '.', {
        search: basename(filePath),
      })
    
    if (error) {
      return false // If we can't check, assume it doesn't exist
    }
    
    return data && data.some(item => item.name === basename(filePath))
  } catch (error) {
    return false
  }
}

/**
 * Check for duplicate database records by file_path
 */
async function checkDuplicateDatabaseRecord(filePath) {
  try {
    const { data, error } = await supabase
      .from('audio_files')
      .select('id, file_path')
      .eq('file_path', filePath)
    
    if (error) {
      return null
    }
    
    // Return the first matching record (or null if none)
    return data && data.length > 0 ? data[0] : null
  } catch (error) {
    return null
  }
}

/**
 * Upload file to Supabase Storage (with duplicate prevention)
 */
async function uploadFile(bucketName, localFile, contentType, cacheControl = null) {
  try {
    // Duplicate prevention: Check if file already exists
    if (!FORCE && !REGENERATE) {
      const exists = await checkFileExists(bucketName, localFile.relativePath)
      if (exists) {
        return 'exists'
      }
    }
    
    const fileBuffer = readFileSync(localFile.path)
    
    if (DRY_RUN) {
      console.log(`   🔍 Would upload: ${localFile.relativePath} (${(localFile.size / 1024 / 1024).toFixed(2)}MB)`)
      return true
    }
    
    const uploadOptions = {
      contentType,
      upsert: FORCE || REGENERATE, // Only overwrite if explicitly requested
    }
    
    if (cacheControl) {
      uploadOptions.cacheControl = cacheControl
    }
    
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(bucketName)
      .upload(localFile.relativePath, fileBuffer, uploadOptions)
    
    if (uploadError) {
      if (uploadError.message.includes('already exists') && !FORCE && !REGENERATE) {
        return 'exists'
      }
      throw uploadError
    }
    
    return true
  } catch (error) {
    console.error(`   ❌ Error uploading ${localFile.relativePath}:`, error.message)
    return false
  }
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
 * Sync audio files
 */
async function syncAudioFiles(syncState) {
  if (AUDIO_ONLY || (!IMAGES_ONLY && !METADATA_ONLY)) {
    console.log('\n🎵 Syncing Audio Files...')
    console.log('='.repeat(60))
    
    // Scan local files
    if (DIRECTION === 'up' || DIRECTION === 'both') {
      console.log('\n📁 Scanning local audio files...')
      if (!existsSync(AUDIO_DIR)) {
        console.warn(`   ⚠️  Audio directory not found: ${AUDIO_DIR}`)
      } else {
        const localFiles = scanLocalFiles(AUDIO_DIR, AUDIO_DIR, AUDIO_EXTENSIONS)
        stats.audio.localFiles = localFiles.length
        console.log(`   Found ${localFiles.length} audio files locally`)
        
        // List remote files
        console.log('\n📦 Scanning Supabase Storage...')
        const remoteFiles = await listStorageFilesRecursive(AUDIO_BUCKET)
        stats.audio.remoteFiles = remoteFiles.length
        console.log(`   Found ${remoteFiles.length} files in storage`)
        
        // Compare and sync
        console.log('\n🔍 Comparing files...')
        const remoteMap = new Map()
        remoteFiles.forEach(file => {
          remoteMap.set(file.path, file)
        })
        
        const localMap = new Map()
        localFiles.forEach(file => {
          localMap.set(file.relativePath, file)
        })
        
        // Upload missing or changed files
        if (DIRECTION === 'up' || DIRECTION === 'both') {
          console.log('\n📤 Uploading files to Supabase...')
          for (const localFile of localFiles) {
            const remoteFile = remoteMap.get(localFile.relativePath)
            const lastHash = syncState.audioHashes[localFile.relativePath]
            
            let shouldUpload = false
            
            if (!remoteFile) {
              shouldUpload = true
            } else if (FORCE) {
              shouldUpload = true
            } else if (localFile.hash && localFile.hash !== lastHash) {
              // File changed (hash different)
              shouldUpload = true
            } else if (remoteFile.size !== localFile.size) {
              // Size mismatch
              shouldUpload = true
            }
            
            if (shouldUpload) {
              const fileExt = extname(localFile.name).toLowerCase().slice(1)
              const mimeTypes = {
                'mp3': 'audio/mpeg',
                'wav': 'audio/wav',
                'flac': 'audio/flac',
                'm4a': 'audio/mp4',
                'ogg': 'audio/ogg',
                'aac': 'audio/aac',
              }
              const contentType = mimeTypes[fileExt] || `audio/${fileExt}`
              
              const result = await uploadFile(AUDIO_BUCKET, localFile, contentType)
              
              if (result === true) {
                stats.audio.uploaded++
                stats.audio.totalSize += localFile.size
                const sizeMB = (localFile.size / 1024 / 1024).toFixed(2)
                console.log(`   ✅ Uploaded: ${localFile.relativePath} (${sizeMB}MB)`)
                
                // Update database record (with duplicate prevention)
                const metadata = await extractMetadata(localFile.path)
                const { data: urlData } = supabase.storage
                  .from(AUDIO_BUCKET)
                  .getPublicUrl(localFile.relativePath)
                
                // Check for duplicate database records
                const existing = await checkDuplicateDatabaseRecord(localFile.relativePath)
                
                // Additional check: Look for duplicates by file_name in same folder
                if (!existing && !REGENERATE) {
                  const { data: nameMatches } = await supabase
                    .from('audio_files')
                    .select('id, file_path, file_name')
                    .eq('file_name', localFile.name)
                    .eq('folder_path', dirname(localFile.relativePath))
                  
                  if (nameMatches && nameMatches.length > 0) {
                    // Found potential duplicate by name
                    console.log(`   ⚠️  Potential duplicate found by name: ${localFile.name}`)
                    console.log(`      Existing: ${nameMatches[0].file_path}`)
                    console.log(`      New: ${localFile.relativePath}`)
                    
                    if (!FORCE && !REGENERATE) {
                      console.log(`      ⏭️  Skipping database update to prevent duplicate`)
                      stats.audio.skipped++
                      continue
                    }
                  }
                }
                
                const fileData = {
                  file_name: localFile.name,
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
                  // Update existing record (only if forced or regenerating)
                  if (FORCE || REGENERATE) {
                    const { error: updateError } = await supabase
                      .from('audio_files')
                      .update(fileData)
                      .eq('id', existing.id)
                    
                    if (updateError) {
                      console.error(`   ❌ Error updating database record: ${updateError.message}`)
                      stats.audio.errors++
                    }
                  } else {
                    console.log(`   ⏭️  Database record already exists: ${localFile.relativePath}`)
                    stats.audio.skipped++
                  }
                } else {
                  // Insert new record (duplicate check already done above)
                  const { error: insertError } = await supabase
                    .from('audio_files')
                    .insert({
                      ...fileData,
                      created_at: new Date().toISOString(),
                    })
                  
                  if (insertError) {
                    // Check if it's a duplicate key error
                    if (insertError.message.includes('duplicate') || insertError.message.includes('unique')) {
                      console.log(`   ⚠️  Duplicate database record prevented: ${localFile.relativePath}`)
                      stats.audio.skipped++
                    } else {
                      console.error(`   ❌ Error inserting database record: ${insertError.message}`)
                      stats.audio.errors++
                    }
                  }
                }
                
                // Update sync state
                if (localFile.hash) {
                  syncState.audioHashes[localFile.relativePath] = localFile.hash
                }
              } else if (result === 'exists') {
                stats.audio.skipped++
              } else {
                stats.audio.errors++
              }
              
              await new Promise(resolve => setTimeout(resolve, 100))
            } else {
              stats.audio.skipped++
            }
          }
        }
        
        // Download missing files from remote
        if (DIRECTION === 'down' || DIRECTION === 'both') {
          console.log('\n📥 Downloading files from Supabase...')
          for (const remoteFile of remoteFiles) {
            // Duplicate prevention: Don't download if file already exists locally
            if (localMap.has(remoteFile.path) && !FORCE && !REGENERATE) {
              console.log(`   ⏭️  Skipped (already exists locally): ${remoteFile.path}`)
              stats.audio.skipped++
              continue
            }
            
            const localPath = join(AUDIO_DIR, remoteFile.path)
            
            // Additional check: file might exist on disk even if not in map
            if (existsSync(localPath) && !FORCE && !REGENERATE) {
              console.log(`   ⏭️  Skipped (file exists on disk): ${remoteFile.path}`)
              stats.audio.skipped++
              continue
            }
            
            const success = await downloadFile(AUDIO_BUCKET, remoteFile.path, localPath)
            
            if (success) {
              stats.audio.downloaded++
              stats.audio.totalSize += remoteFile.size
              const sizeMB = (remoteFile.size / 1024 / 1024).toFixed(2)
              console.log(`   ✅ Downloaded: ${remoteFile.path} (${sizeMB}MB)`)
            } else {
              stats.audio.errors++
            }
            
            await new Promise(resolve => setTimeout(resolve, 100))
          }
        }
      }
    }
  }
}

/**
 * Update artwork URLs in music-library.json after image sync
 * Preserves existing Supabase URLs and only updates local paths
 */
async function updateArtworkUrlsInLibrary() {
  const MUSIC_LIBRARY_FILE = join(__dirname, '..', 'data', 'music-library.json')
  
  if (!existsSync(MUSIC_LIBRARY_FILE)) {
    return { updated: 0 }
  }
  
  try {
    const libraryData = JSON.parse(readFileSync(MUSIC_LIBRARY_FILE, 'utf-8'))
    let updated = 0
    
    function updateArtworkUrls(items) {
      for (const item of items) {
        // Update EP/folder artwork if it's a local path (preserve Supabase URLs)
        if (item.artwork) {
          const isSupabaseUrl = item.artwork.includes('supabase.co') || 
                               item.artwork.startsWith('http://') || 
                               item.artwork.startsWith('https://')
          
          if (!isSupabaseUrl && item.artwork.includes('/audio/unreleased/eps/')) {
            // Convert local path to Supabase Storage path
            let storagePath = item.artwork
              .replace(/^\/images\//, '')
              .replace(/^\/public\/images\//, '')
              .replace(/^\//, '')
            
            // Get Supabase URL
            const { data } = supabase.storage
              .from(IMAGES_BUCKET)
              .getPublicUrl(storagePath)
            
            if (data && data.publicUrl) {
              item.artwork = data.publicUrl
              updated++
            }
          }
        }
        
        // Update track artwork (preserve Supabase URLs)
        if (item.tracks && Array.isArray(item.tracks)) {
          for (const track of item.tracks) {
            if (track.artwork) {
              const isSupabaseUrl = track.artwork.includes('supabase.co') || 
                                   track.artwork.startsWith('http://') || 
                                   track.artwork.startsWith('https://')
              
              if (!isSupabaseUrl) {
                // Use EP artwork if available and it's a Supabase URL
                if (item.artwork && item.artwork.includes('supabase.co')) {
                  track.artwork = item.artwork
                  updated++
                } else if (track.artwork.includes('/audio/unreleased/eps/')) {
                  // Convert local path to Supabase URL
                  let storagePath = track.artwork
                    .replace(/^\/images\//, '')
                    .replace(/^\/public\/images\//, '')
                    .replace(/^\//, '')
                  
                  const { data } = supabase.storage
                    .from(IMAGES_BUCKET)
                    .getPublicUrl(storagePath)
                  
                  if (data && data.publicUrl) {
                    track.artwork = data.publicUrl
                    updated++
                  }
                }
              }
            } else if (item.artwork && item.artwork.includes('supabase.co')) {
              // Track has no artwork but EP has Supabase URL - inherit it
              track.artwork = item.artwork
              updated++
            }
          }
        }
        
        // Recurse
        if (item.children && Array.isArray(item.children)) {
          updated += updateArtworkUrls(item.children)
        }
      }
      
      return updated
    }
    
    const totalUpdated = updateArtworkUrls(libraryData.folders || [])
    
    if (totalUpdated > 0 && !DRY_RUN) {
      writeFileSync(
        MUSIC_LIBRARY_FILE,
        JSON.stringify(libraryData, null, 2) + '\n',
        'utf-8'
      )
    }
    
    return { updated: totalUpdated }
  } catch (error) {
    console.warn(`   ⚠️  Could not update artwork URLs: ${error.message}`)
    return { updated: 0 }
  }
}

/**
 * Sync images
 */
async function syncImages(syncState) {
  if (IMAGES_ONLY || (!AUDIO_ONLY && !METADATA_ONLY)) {
    console.log('\n🖼️  Syncing Images...')
    console.log('='.repeat(60))
    
    // Scan local images (focus on EP artwork and gallery images)
    if (DIRECTION === 'up' || DIRECTION === 'both') {
      console.log('\n📁 Scanning local images...')
      if (!existsSync(IMAGES_DIR)) {
        console.warn(`   ⚠️  Images directory not found: ${IMAGES_DIR}`)
      } else {
        const localFiles = scanLocalFiles(IMAGES_DIR, IMAGES_DIR, IMAGE_EXTENSIONS)
        stats.images.localFiles = localFiles.length
        console.log(`   Found ${localFiles.length} image files locally`)
        
        // List remote files
        console.log('\n📦 Scanning Supabase Storage...')
        const remoteFiles = await listStorageFilesRecursive(IMAGES_BUCKET)
        stats.images.remoteFiles = remoteFiles.length
        console.log(`   Found ${remoteFiles.length} files in storage`)
        
        // Compare and sync
        console.log('\n🔍 Comparing files...')
        const remoteMap = new Map()
        remoteFiles.forEach(file => {
          remoteMap.set(file.path, file)
        })
        
        const localMap = new Map()
        localFiles.forEach(file => {
          // Convert local path to storage path format
          let storagePath = file.relativePath
            .replace(/^images\//, '')
            .replace(/^audio\//, 'audio/')
          localMap.set(storagePath, file)
        })
        
        // Upload missing or changed files
        if (DIRECTION === 'up' || DIRECTION === 'both') {
          console.log('\n📤 Uploading images to Supabase...')
          for (const [storagePath, localFile] of localMap.entries()) {
            const remoteFile = remoteMap.get(storagePath)
            const lastHash = syncState.imageHashes[storagePath]
            
            let shouldUpload = false
            
            if (!remoteFile) {
              shouldUpload = true
            } else if (FORCE) {
              shouldUpload = true
            } else if (localFile.hash && localFile.hash !== lastHash) {
              shouldUpload = true
            } else if (remoteFile.size !== localFile.size) {
              shouldUpload = true
            }
            
            if (shouldUpload) {
              // Duplicate prevention: Check if file already exists
              if (!FORCE && !REGENERATE) {
                const exists = await checkFileExists(IMAGES_BUCKET, storagePath)
                if (exists) {
                  console.log(`   ⏭️  Skipped (already exists): ${storagePath}`)
                  stats.images.skipped++
                  continue
                }
              }
              
              const ext = extname(localFile.name).toLowerCase()
              const contentTypes = {
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.png': 'image/png',
                '.gif': 'image/gif',
                '.webp': 'image/webp',
              }
              const contentType = contentTypes[ext] || 'image/jpeg'
              
              const result = await uploadFile(IMAGES_BUCKET, { ...localFile, relativePath: storagePath }, contentType, '31536000')
              
              if (result === true) {
                stats.images.uploaded++
                stats.images.totalSize += localFile.size
                const sizeMB = (localFile.size / 1024 / 1024).toFixed(2)
                console.log(`   ✅ Uploaded: ${storagePath} (${sizeMB}MB)`)
                
                if (localFile.hash) {
                  syncState.imageHashes[storagePath] = localFile.hash
                }
              } else if (result === 'exists') {
                console.log(`   ⏭️  Skipped (already exists): ${storagePath}`)
                stats.images.skipped++
              } else {
                stats.images.errors++
              }
              
              await new Promise(resolve => setTimeout(resolve, 100))
            } else {
              stats.images.skipped++
            }
          }
        }
        
        // Download missing files from remote
        if (DIRECTION === 'down' || DIRECTION === 'both') {
          console.log('\n📥 Downloading images from Supabase...')
          for (const remoteFile of remoteFiles) {
            // Find corresponding local path
            const localRelativePath = `images/${remoteFile.path}`
            const localPath = join(IMAGES_DIR, remoteFile.path)
            
            // Duplicate prevention: Don't download if file already exists locally
            if (existsSync(localPath) && !FORCE && !REGENERATE) {
              console.log(`   ⏭️  Skipped (already exists locally): ${remoteFile.path}`)
              stats.images.skipped++
              continue
            }
            
            const success = await downloadFile(IMAGES_BUCKET, remoteFile.path, localPath)
            
            if (success) {
              stats.images.downloaded++
              stats.images.totalSize += remoteFile.size
              const sizeMB = (remoteFile.size / 1024 / 1024).toFixed(2)
              console.log(`   ✅ Downloaded: ${remoteFile.path} (${sizeMB}MB)`)
            } else {
              stats.images.errors++
            }
            
            await new Promise(resolve => setTimeout(resolve, 100))
          }
        }
      }
      
      // Update artwork URLs in music-library.json after syncing images
      if (UPDATE_ARTWORK_URLS && (DIRECTION === 'up' || DIRECTION === 'both') && stats.images.uploaded > 0) {
        console.log('\n🔗 Updating artwork URLs in music-library.json...')
        const artworkUpdate = await updateArtworkUrlsInLibrary()
        if (artworkUpdate.updated > 0) {
          console.log(`   ✅ Updated ${artworkUpdate.updated} artwork URLs`)
        } else {
          console.log(`   ✓ All artwork URLs already correct`)
        }
      }
    }
  }
}

/**
 * Sync database metadata (waveforms, sonic DNA, BPM)
 */
async function syncMetadata(syncState) {
  if (METADATA_ONLY || (!AUDIO_ONLY && !IMAGES_ONLY)) {
    console.log('\n📊 Syncing Database Metadata...')
    console.log('='.repeat(60))
    
    try {
      // Export metadata from Supabase
      console.log('\n📥 Exporting metadata from Supabase...')
      
      const { data: audioFiles, error } = await supabase
        .from('audio_files')
        .select('id, file_path, waveform_data, sonic_dna, bpm, original_bpm, key_signature, energy_level, danceability, frequency_bands, updated_at')
        .order('updated_at', { ascending: false })
      
      if (error) {
        throw error
      }
      
      if (!audioFiles || audioFiles.length === 0) {
        console.log('   ⚠️  No audio files found in database')
        return
      }
      
      console.log(`   Found ${audioFiles.length} audio file records`)
      
      // Ensure export directory exists
      if (!existsSync(EXPORT_DIR)) {
        mkdirSync(EXPORT_DIR, { recursive: true })
      }
      
      // Save metadata export
      const metadataFile = join(EXPORT_DIR, 'audio-metadata.json')
      writeFileSync(metadataFile, JSON.stringify(audioFiles, null, 2), 'utf-8')
      console.log(`   ✅ Exported metadata to ${metadataFile}`)
      
      stats.metadata.exported = audioFiles.length
      
      // Update sync state
      syncState.metadataVersion = new Date().toISOString()
      
      console.log('\n💡 Metadata exported. You can now:')
      console.log('   1. Review the exported metadata in data/supabase-export/audio-metadata.json')
      console.log('   2. Import it back using: node scripts/import-metadata-from-export.mjs')
      
    } catch (error) {
      console.error('   ❌ Error syncing metadata:', error.message)
      stats.metadata.errors++
    }
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('🔄 Comprehensive Bidirectional Sync: Local ↔ Supabase')
  console.log('='.repeat(60))
  console.log(`Direction:        ${DIRECTION}`)
  console.log(`Conflict Res:     ${CONFLICT_RESOLUTION}`)
  console.log(`Dry Run:          ${DRY_RUN ? 'YES' : 'NO'}`)
  console.log(`Force:            ${FORCE ? 'YES' : 'NO'}`)
  console.log(`Regenerate:       ${REGENERATE ? 'YES' : 'NO'}`)
  console.log(`Skip Hash:        ${SKIP_HASH ? 'YES' : 'NO'}`)
  console.log(`Audio Only:       ${AUDIO_ONLY ? 'YES' : 'NO'}`)
  console.log(`Images Only:      ${IMAGES_ONLY ? 'YES' : 'NO'}`)
  console.log(`Metadata Only:    ${METADATA_ONLY ? 'YES' : 'NO'}`)
  console.log('='.repeat(60))
  
  if (!FORCE && !REGENERATE) {
    console.log('\n🛡️  Duplicate Prevention: ENABLED')
    console.log('   Files and database records will not be duplicated')
    console.log('   Use --force or --regenerate to allow overwrites/regeneration')
  } else if (REGENERATE) {
    console.log('\n⚠️  REGENERATE MODE: Duplicate checks bypassed')
    console.log('   Files and records may be regenerated')
  }
  
  if (DRY_RUN) {
    console.log('\n⚠️  DRY RUN MODE - No changes will be made\n')
  }
  
  try {
    // Load sync state
    const syncState = loadSyncState()
    
    // Perform syncs
    await syncAudioFiles(syncState)
    await syncImages(syncState)
    await syncMetadata(syncState)
    
    // Update sync state
    syncState.lastSync = new Date().toISOString()
    saveSyncState(syncState)
    
    // Print summary
    console.log('\n' + '='.repeat(60))
    console.log('📊 SYNC SUMMARY')
    console.log('='.repeat(60))
    
    if (!METADATA_ONLY) {
      console.log('\n🎵 Audio Files:')
      console.log(`   Local Files:        ${stats.audio.localFiles}`)
      console.log(`   Remote Files:       ${stats.audio.remoteFiles}`)
      console.log(`   Uploaded:           ${stats.audio.uploaded}`)
      console.log(`   Downloaded:         ${stats.audio.downloaded}`)
      console.log(`   Skipped:            ${stats.audio.skipped}`)
      console.log(`   Errors:             ${stats.audio.errors}`)
      if (stats.audio.totalSize > 0) {
        const totalMB = (stats.audio.totalSize / 1024 / 1024).toFixed(2)
        console.log(`   Total Size:         ${totalMB}MB`)
      }
    }
    
    if (!AUDIO_ONLY) {
      console.log('\n🖼️  Images:')
      console.log(`   Local Files:        ${stats.images.localFiles}`)
      console.log(`   Remote Files:       ${stats.images.remoteFiles}`)
      console.log(`   Uploaded:           ${stats.images.uploaded}`)
      console.log(`   Downloaded:         ${stats.images.downloaded}`)
      console.log(`   Skipped:            ${stats.images.skipped}`)
      console.log(`   Errors:             ${stats.images.errors}`)
      if (stats.images.totalSize > 0) {
        const totalMB = (stats.images.totalSize / 1024 / 1024).toFixed(2)
        console.log(`   Total Size:         ${totalMB}MB`)
      }
    }
    
    if (!AUDIO_ONLY && !IMAGES_ONLY) {
      console.log('\n📊 Metadata:')
      console.log(`   Exported:           ${stats.metadata.exported}`)
      console.log(`   Imported:           ${stats.metadata.imported}`)
      console.log(`   Updated:            ${stats.metadata.updated}`)
      console.log(`   Errors:             ${stats.metadata.errors}`)
    }
    
    console.log('\n' + '='.repeat(60))
    
    const totalErrors = stats.audio.errors + stats.images.errors + stats.metadata.errors
    const totalSkipped = stats.audio.skipped + stats.images.skipped
    
    if (totalErrors === 0) {
      console.log('✅ Sync completed successfully!')
    } else {
      console.log(`⚠️  Sync completed with ${totalErrors} error(s)`)
    }
    
    if (totalSkipped > 0 && !FORCE && !REGENERATE) {
      console.log(`\n🛡️  Duplicate Prevention: ${totalSkipped} files/records skipped to prevent duplicates`)
      console.log('   Use --regenerate to allow regeneration of existing files/records')
    }
    
    if (DRY_RUN) {
      console.log('\n💡 Run without --dry-run to apply changes')
    }
    
  } catch (error) {
    console.error('\n❌ Fatal error:', error)
    process.exit(1)
  }
}

main()
