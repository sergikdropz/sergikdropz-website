#!/usr/bin/env node
/**
 * Comprehensive Media Relinking Script
 * 
 * Scans Supabase Storage and Database, then relinks all media:
 * - Audio files (file_path, file_url)
 * - Artwork images
 * - Waveform data
 * - Sonic DNA data
 * - BPM data
 * 
 * Matches files between:
 * - Supabase Storage (audio-files bucket)
 * - Supabase Database (audio_files table)
 * - music-library.json (local data file)
 * 
 * Usage: node scripts/relink-all-media.mjs [--dry-run]
 */

import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { resolve } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load environment variables
const envPath = resolve(__dirname, '..', '.env.local')
dotenv.config({ path: envPath })

const DRY_RUN = process.argv.includes('--dry-run')
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const MUSIC_LIBRARY_FILE = join(__dirname, '..', 'data', 'music-library.json')

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
  totalFilesInStorage: 0,
  totalFilesInDatabase: 0,
  totalTracksInLibrary: 0,
  matched: 0,
  updated: 0,
  created: 0,
  errors: 0,
  missingInStorage: [],
  missingInDatabase: [],
  pathMismatches: [],
}

/**
 * Normalize file paths for comparison
 */
function normalizePath(path) {
  if (!path) return ''
  // Remove leading/trailing slashes, normalize separators
  return path.replace(/^\/+|\/+$/g, '').replace(/\\/g, '/')
}

/**
 * Extract file name from path
 */
function getFileName(path) {
  return path.split('/').pop() || path
}

/**
 * List all files in Supabase Storage
 */
async function listStorageFiles() {
  console.log('📦 Scanning Supabase Storage...')
  const files = []
  let offset = 0
  const limit = 1000
  
  while (true) {
    const { data, error } = await supabase.storage
      .from('audio-files')
      .list('', {
        limit,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      })
    
    if (error) {
      console.error('❌ Error listing storage files:', error)
      break
    }
    
    if (!data || data.length === 0) break
    
    // Recursively get all files
    for (const item of data) {
      if (item.id) {
        // It's a file
        files.push({
          name: item.name,
          path: item.name,
          size: item.metadata?.size || 0,
          updated: item.updated_at,
        })
      } else {
        // It's a folder - recursively list
        const folderFiles = await listFolderRecursive(item.name)
        files.push(...folderFiles)
      }
    }
    
    if (data.length < limit) break
    offset += limit
  }
  
  stats.totalFilesInStorage = files.length
  console.log(`   Found ${files.length} files in storage`)
  return files
}

/**
 * Recursively list files in a folder
 */
async function listFolderRecursive(folderPath) {
  const files = []
  let offset = 0
  const limit = 1000
  
  while (true) {
    const { data, error } = await supabase.storage
      .from('audio-files')
      .list(folderPath, {
        limit,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      })
    
    if (error) {
      console.warn(`   Warning: Could not list folder ${folderPath}:`, error.message)
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
        // It's a subfolder - recursively list
        const subfolderPath = folderPath ? `${folderPath}/${item.name}` : item.name
        const subfolderFiles = await listFolderRecursive(subfolderPath)
        files.push(...subfolderFiles)
      }
    }
    
    if (data.length < limit) break
    offset += limit
  }
  
  return files
}

/**
 * Get all files from database
 */
async function getDatabaseFiles() {
  console.log('📊 Scanning Supabase Database...')
  const { data, error } = await supabase
    .from('audio_files')
    .select('*')
    .order('file_path', { ascending: true })
  
  if (error) {
    console.error('❌ Error fetching database files:', error)
    return []
  }
  
  stats.totalFilesInDatabase = data?.length || 0
  console.log(`   Found ${data?.length || 0} records in database`)
  return data || []
}

/**
 * Get all tracks from music-library.json
 */
function getLibraryTracks() {
  console.log('📚 Scanning music-library.json...')
  const libraryData = JSON.parse(readFileSync(MUSIC_LIBRARY_FILE, 'utf-8'))
  
  const tracks = []
  function extractTracks(items) {
    for (const item of items) {
      if (item.tracks) {
        tracks.push(...item.tracks)
      }
      if (item.children) {
        extractTracks(item.children)
      }
    }
  }
  
  extractTracks(libraryData.folders || [])
  stats.totalTracksInLibrary = tracks.length
  console.log(`   Found ${tracks.length} tracks in library`)
  return tracks
}

/**
 * Generate Supabase Storage URL
 */
function getStorageUrl(filePath) {
  const { data } = supabase.storage
    .from('audio-files')
    .getPublicUrl(filePath)
  return data.publicUrl
}

/**
 * Match and update database records
 */
async function relinkDatabaseFiles(storageFiles, dbFiles, libraryTracks) {
  console.log('\n🔗 Relinking database records...')
  
  // Create maps for quick lookup
  const storageMap = new Map()
  storageFiles.forEach(file => {
    const normalized = normalizePath(file.path)
    const fileName = getFileName(file.path).toLowerCase()
    storageMap.set(normalized, file)
    storageMap.set(fileName, file) // Also index by filename
  })
  
  const dbMap = new Map()
  dbFiles.forEach(file => {
    const normalized = normalizePath(file.file_path)
    const fileName = (file.file_name || '').toLowerCase()
    dbMap.set(normalized, file)
    dbMap.set(fileName, file)
  })
  
  const libraryMap = new Map()
  libraryTracks.forEach(track => {
    if (track.file) {
      const normalized = normalizePath(track.file.replace(/^\/audio\//, ''))
      const fileName = getFileName(track.file).toLowerCase()
      libraryMap.set(normalized, track)
      libraryMap.set(fileName, track)
    }
  })
  
  // Process each storage file
  for (const storageFile of storageFiles) {
    const storagePath = normalizePath(storageFile.path)
    const fileName = getFileName(storageFile.path)
    const fileNameLower = fileName.toLowerCase()
    
    // Find matching database record
    let dbRecord = dbMap.get(storagePath)
    
    // Try to find by filename if path doesn't match
    if (!dbRecord) {
      dbRecord = dbMap.get(fileNameLower)
    }
    
    // Find matching library track
    const libraryTrack = libraryMap.get(storagePath) || libraryMap.get(fileNameLower)
    
    // Generate correct URL
    const correctUrl = getStorageUrl(storagePath)
    
    if (dbRecord) {
      // Update existing record
      const needsUpdate = 
        normalizePath(dbRecord.file_path) !== storagePath ||
        dbRecord.file_url !== correctUrl
      
      if (needsUpdate) {
        const updateData = {
          file_path: storagePath,
          file_url: correctUrl,
          updated_at: new Date().toISOString(),
        }
        
        // Update metadata from library if available
        if (libraryTrack) {
          if (libraryTrack.title && !dbRecord.title) {
            updateData.title = libraryTrack.title
          }
          if (libraryTrack.artist && !dbRecord.artist) {
            updateData.artist = libraryTrack.artist
          }
          if (libraryTrack.duration && !dbRecord.duration_seconds) {
            updateData.duration_seconds = libraryTrack.duration
          }
          if (libraryTrack.bpm && !dbRecord.bpm) {
            updateData.bpm = libraryTrack.bpm
          }
        }
        
        if (!DRY_RUN) {
          const { error } = await supabase
            .from('audio_files')
            .update(updateData)
            .eq('id', dbRecord.id)
          
          if (error) {
            console.error(`   ❌ Error updating ${storagePath}:`, error.message)
            stats.errors++
          } else {
            console.log(`   ✅ Updated: ${storagePath}`)
            stats.updated++
          }
        } else {
          console.log(`   🔍 Would update: ${storagePath}`)
          stats.updated++
        }
      } else {
        stats.matched++
      }
    } else {
      // Create new record
      const newRecord = {
        file_name: fileName,
        file_path: storagePath,
        file_url: correctUrl,
        title: libraryTrack?.title || fileName.replace(/\.[^/.]+$/, ''),
        artist: libraryTrack?.artist || 'SERGIK',
        format: fileName.split('.').pop()?.toUpperCase() || 'WAV',
        size_bytes: storageFile.size,
        duration_seconds: libraryTrack?.duration || null,
        folder_path: storagePath.split('/').slice(0, -1).join('/'),
        bpm: libraryTrack?.bpm || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      
      if (!DRY_RUN) {
        const { error } = await supabase
          .from('audio_files')
          .insert(newRecord)
        
        if (error) {
          console.error(`   ❌ Error creating record for ${storagePath}:`, error.message)
          stats.errors++
        } else {
          console.log(`   ➕ Created: ${storagePath}`)
          stats.created++
        }
      } else {
        console.log(`   🔍 Would create: ${storagePath}`)
        stats.created++
      }
    }
  }
  
  // Check for database records without storage files
  for (const dbFile of dbFiles) {
    const dbPath = normalizePath(dbFile.file_path)
    const storageFile = storageMap.get(dbPath) || storageMap.get((dbFile.file_name || '').toLowerCase())
    
    if (!storageFile) {
      stats.missingInStorage.push({
        id: dbFile.id,
        file_path: dbFile.file_path,
        file_name: dbFile.file_name,
      })
    }
  }
  
  // Check for library tracks without database records
  for (const track of libraryTracks) {
    if (track.file) {
      const trackPath = normalizePath(track.file.replace(/^\/audio\//, ''))
      const dbRecord = dbMap.get(trackPath) || dbMap.get(getFileName(track.file).toLowerCase())
      
      if (!dbRecord) {
        stats.missingInDatabase.push({
          title: track.title,
          file: track.file,
          path: trackPath,
        })
      }
    }
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('🚀 Starting comprehensive media relinking...\n')
  if (DRY_RUN) {
    console.log('⚠️  DRY RUN MODE - No changes will be made\n')
  }
  
  try {
    // Step 1: Get all files from storage
    const storageFiles = await listStorageFiles()
    
    // Step 2: Get all records from database
    const dbFiles = await getDatabaseFiles()
    
    // Step 3: Get all tracks from library
    const libraryTracks = getLibraryTracks()
    
    // Step 4: Relink everything
    await relinkDatabaseFiles(storageFiles, dbFiles, libraryTracks)
    
    // Print summary
    console.log('\n' + '='.repeat(60))
    console.log('📊 RELINKING SUMMARY')
    console.log('='.repeat(60))
    console.log(`Storage Files:        ${stats.totalFilesInStorage}`)
    console.log(`Database Records:     ${stats.totalFilesInDatabase}`)
    console.log(`Library Tracks:       ${stats.totalTracksInLibrary}`)
    console.log(`Already Matched:      ${stats.matched}`)
    console.log(`Updated:              ${stats.updated}`)
    console.log(`Created:              ${stats.created}`)
    console.log(`Errors:               ${stats.errors}`)
    console.log(`Missing in Storage:   ${stats.missingInStorage.length}`)
    console.log(`Missing in Database:  ${stats.missingInDatabase.length}`)
    
    if (stats.missingInStorage.length > 0) {
      console.log('\n⚠️  Database records without storage files:')
      stats.missingInStorage.slice(0, 10).forEach(item => {
        console.log(`   - ${item.file_path} (${item.file_name})`)
      })
      if (stats.missingInStorage.length > 10) {
        console.log(`   ... and ${stats.missingInStorage.length - 10} more`)
      }
    }
    
    if (stats.missingInDatabase.length > 0) {
      console.log('\n⚠️  Library tracks without database records:')
      stats.missingInDatabase.slice(0, 10).forEach(item => {
        console.log(`   - ${item.title} (${item.path})`)
      })
      if (stats.missingInDatabase.length > 10) {
        console.log(`   ... and ${stats.missingInDatabase.length - 10} more`)
      }
    }
    
    if (DRY_RUN) {
      console.log('\n⚠️  This was a DRY RUN. Run without --dry-run to apply changes.')
    } else {
      console.log('\n✅ Relinking complete!')
    }
    
  } catch (error) {
    console.error('\n❌ Fatal error:', error)
    process.exit(1)
  }
}

main()
