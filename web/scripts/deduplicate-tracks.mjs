#!/usr/bin/env node

/**
 * Deduplicates tracks in music-library.json and/or database
 * Ensures "All Tracks" is the source of truth and other folders reference tracks by ID
 * Syncs folder structure to backend for Music Library Admin and Sonic DNA Analysis
 * Links artwork across tracks with the same name (even in different playlists)
 * 
 * This script works with:
 * - JSON structure: Ensures "All Tracks" contains all unique tracks, other folders reference them
 * - Database structure (music_library_tracks): Ensures no duplicate track records exist, all unique tracks are in "All Tracks"
 * - Audio files (audio_files): Deduplicates audio files used by Sonic DNA admin, preserves best Sonic DNA data
 * - Folder structure sync: Syncs folder hierarchy to backend tables for admin interfaces
 * - Artwork linking: Shares artwork across tracks with the same name (normalized title matching)
 * 
 * When deduplicating audio_files:
 * - Keeps the file with the best Sonic DNA data (completed > processing > pending)
 * - Preserves waveform data and metadata
 * - Updates music_library_tracks references to point to the kept file
 * 
 * When syncing folder structure:
 * - Updates music_library_tracks.metadata with folder paths
 * - Updates audio_files.folder_path to match folder structure
 * - Ensures both Music Library Admin and Sonic DNA Admin reflect the same folder structure
 * - Builds folder path hierarchy from music_library_folders table
 * 
 * When linking artwork:
 * - Groups tracks by normalized title (case-insensitive, special chars removed)
 * - Finds tracks with the same name across all playlists/folders
 * - Links artwork from tracks that have it to tracks that don't
 * - Works across JSON, music_library_tracks, and audio_files tables
 * 
 * Usage:
 *   node scripts/deduplicate-tracks.mjs [--fix] [--database]
 * 
 * Examples:
 *   # Analyze JSON only (dry run)
 *   node scripts/deduplicate-tracks.mjs
 * 
 *   # Fix JSON duplicates
 *   node scripts/deduplicate-tracks.mjs --fix
 * 
 *   # Analyze JSON + Database (dry run)
 *   node scripts/deduplicate-tracks.mjs --database
 * 
 *   # Fix both JSON and Database duplicates + sync folder structure + link artwork
 *   node scripts/deduplicate-tracks.mjs --fix --database
 * 
 * Options:
 *   --fix, -f      Apply fixes (default: dry run)
 *   --database, -d Also check and fix database duplicates:
 *                  - music_library_tracks table (music library structure)
 *                  - audio_files table (Sonic DNA admin structure)
 *                  - Folder structure sync (Music Library Admin & Sonic DNA Admin)
 *                  - Artwork linking (same track name across playlists)
 *                  Requires Supabase setup
 */

import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

// Try to load environment variables and Supabase (optional)
let createClient = null
try {
  // Load environment variables
  const dotenvModule = await import('dotenv')
  dotenvModule.default.config({ path: join(process.cwd(), '.env.local') })
} catch {
  // dotenv not available, that's okay - will use process.env directly
}

try {
  // Load Supabase client
  const supabaseModule = await import('@supabase/supabase-js')
  createClient = supabaseModule.createClient
} catch {
  // Supabase not available, database mode won't work
  console.warn('⚠️  @supabase/supabase-js not available. Database mode disabled.')
}

const DATA_FILE = join(process.cwd(), 'data', 'music-library.json')
const FIX_MODE = process.argv.includes('--fix') || process.argv.includes('-f')
const DATABASE_MODE = process.argv.includes('--database') || process.argv.includes('-d')
const DRY_RUN = !FIX_MODE

// Create Supabase client for database operations
function createSupabaseClient() {
  if (!createClient) {
    return null
  }
  
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    return null
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

console.log('🔍 Analyzing track duplicates...')
if (DATABASE_MODE) {
  console.log('📊 Mode: JSON + Database')
} else {
  console.log('📁 Mode: JSON only')
}
console.log(`📁 Reading: ${DATA_FILE}`)
console.log(`Mode: ${DRY_RUN ? '🔍 DRY RUN (use --fix to apply changes)' : '✏️  FIX MODE'}\n`)

// Read the current structure
const data = JSON.parse(readFileSync(DATA_FILE, 'utf8'))

// Track statistics
const stats = {
  totalTracks: 0,
  uniqueTracks: 0,
  duplicatesByFile: [],
  duplicatesById: [],
  tracksInAllTracks: 0,
  tracksInOtherFolders: 0,
  fixedReferences: 0,
  removedDuplicates: 0,
}

// Normalize file path for comparison
function normalizePath(path) {
  if (!path) return ''
  return path
    .replace(/^https?:\/\//, '')
    .replace(/\/+/g, '/')
    .toLowerCase()
    .trim()
}

// Find Discography folder
function findDiscography(items) {
  for (const item of items) {
    if (item.id === 'folder-discography' && item.name === 'Discography') {
      return item
    }
    if (item.children && Array.isArray(item.children)) {
      const found = findDiscography(item.children)
      if (found) return found
    }
  }
  return null
}

// Recursively collect all tracks with their location
function collectTracksWithLocation(items, path = '') {
  const tracks = []
  
  function extractTracks(items, currentPath) {
    if (!items || !Array.isArray(items)) return
    
    items.forEach(item => {
      const itemPath = currentPath ? `${currentPath} > ${item.name || item.id}` : (item.name || item.id)
      
      // Collect tracks directly in this item
      if (item.tracks && Array.isArray(item.tracks)) {
        item.tracks.forEach(track => {
          tracks.push({
            track,
            location: itemPath,
            folderId: item.id,
            folderName: item.name,
            isAllTracks: item.id === 'folder-all-tracks',
          })
        })
      }
      
      // Recursively process children
      if (item.children && Array.isArray(item.children)) {
        extractTracks(item.children, itemPath)
      }
    })
  }
  
  extractTracks(items, path)
  return tracks
}

// Find "All Tracks" folder
const discographyFolder = findDiscography(data.folders)
if (!discographyFolder) {
  console.error('❌ Discography folder not found!')
  process.exit(1)
}

const allTracksFolder = discographyFolder.children?.find(
  child => child.id === 'folder-all-tracks' || child.name === 'All Tracks'
)

if (!allTracksFolder) {
  console.error('❌ "All Tracks" folder not found!')
  console.log('💡 Run: node scripts/add-all-tracks-folder.mjs first')
  process.exit(1)
}

console.log('📊 Collecting all tracks from library...')
const allTracksWithLocation = collectTracksWithLocation(data.folders)
stats.totalTracks = allTracksWithLocation.length
stats.tracksInAllTracks = allTracksFolder.tracks?.length || 0

console.log(`\n📈 Statistics:`)
console.log(`   Total tracks found: ${stats.totalTracks}`)
console.log(`   Tracks in "All Tracks": ${stats.tracksInAllTracks}`)

// Group tracks by normalized file path
const tracksByFile = new Map()
allTracksWithLocation.forEach(({ track, location, folderId, folderName, isAllTracks }) => {
  const normalizedFile = normalizePath(track.file)
  if (!normalizedFile) return
  
  if (!tracksByFile.has(normalizedFile)) {
    tracksByFile.set(normalizedFile, [])
  }
  tracksByFile.get(normalizedFile).push({
    track,
    location,
    folderId,
    folderName,
    isAllTracks,
  })
})

// Group tracks by ID
const tracksById = new Map()
allTracksWithLocation.forEach(({ track, location, folderId, folderName, isAllTracks }) => {
  if (!track.id) return
  
  if (!tracksById.has(track.id)) {
    tracksById.set(track.id, [])
  }
  tracksById.get(track.id).push({
    track,
    location,
    folderId,
    folderName,
    isAllTracks,
  })
})

// Find duplicates by file path (excluding valid playlist references)
console.log(`\n🔍 Analyzing duplicates by file path...`)
tracksByFile.forEach((tracks, file) => {
  if (tracks.length > 1) {
    // Check if this is a valid reference (track in "All Tracks" + playlists) vs real duplicate
    const inAllTracks = tracks.some(t => t.isAllTracks)
    const inOtherFolders = tracks.filter(t => !t.isAllTracks)
    
    // If track is in "All Tracks" and also in other folders, that's expected (playlist references)
    // Only count as duplicate if:
    // 1. Track appears multiple times NOT in "All Tracks" (duplicate in playlists)
    // 2. Track appears multiple times in "All Tracks" itself (real duplicate)
    if (inAllTracks && inOtherFolders.length > 0) {
      // This is a valid reference structure - track in "All Tracks" referenced by playlists
      // Only count if there are duplicates within "All Tracks" or within other folders
      const duplicatesInAllTracks = tracks.filter(t => t.isAllTracks).length > 1
      const duplicateFilesInOtherFolders = new Set(inOtherFolders.map(t => normalizePath(t.track.file))).size < inOtherFolders.length
      
      if (duplicatesInAllTracks || duplicateFilesInOtherFolders) {
        stats.duplicatesByFile.push({ file, tracks, isRealDuplicate: true })
      }
    } else {
      // No "All Tracks" reference - this is a real duplicate
      stats.duplicatesByFile.push({ file, tracks, isRealDuplicate: true })
    }
  }
})

// Find duplicates by ID (excluding valid playlist references)
console.log(`🔍 Analyzing duplicates by track ID...`)
tracksById.forEach((tracks, id) => {
  if (tracks.length > 1) {
    const inAllTracks = tracks.some(t => t.isAllTracks)
    const inOtherFolders = tracks.filter(t => !t.isAllTracks)
    
    if (inAllTracks && inOtherFolders.length > 0) {
      // Valid reference - only count if duplicates within folders
      const duplicatesInAllTracks = tracks.filter(t => t.isAllTracks).length > 1
      if (duplicatesInAllTracks) {
        stats.duplicatesById.push({ id, tracks, isRealDuplicate: true })
      }
    } else {
      // Real duplicate
      stats.duplicatesById.push({ id, tracks, isRealDuplicate: true })
    }
  }
})

// Count unique tracks
stats.uniqueTracks = tracksByFile.size

// Count real duplicates (excluding valid playlist references)
const realDuplicatesByFile = stats.duplicatesByFile.filter(d => d.isRealDuplicate !== false)
const realDuplicatesById = stats.duplicatesById.filter(d => d.isRealDuplicate !== false)

console.log(`\n📊 Duplicate Analysis:`)
console.log(`   Unique tracks (by file): ${stats.uniqueTracks}`)
console.log(`   Total occurrences across all folders: ${stats.totalTracks}`)
console.log(`   Real duplicate groups (by file): ${realDuplicatesByFile.length}`)
console.log(`   Real duplicate groups (by ID): ${realDuplicatesById.length}`)
if (realDuplicatesByFile.length === 0 && realDuplicatesById.length === 0) {
  console.log(`   ✅ No real duplicates found! Tracks in playlists are valid references to "All Tracks".`)
}

// Report duplicates by file
if (stats.duplicatesByFile.length > 0) {
  console.log(`\n⚠️  Found ${stats.duplicatesByFile.length} duplicate groups (by file path):`)
  stats.duplicatesByFile.forEach(({ file, tracks }, index) => {
    console.log(`\n   ${index + 1}. File: ${file.substring(0, 80)}${file.length > 80 ? '...' : ''}`)
    console.log(`      Found ${tracks.length} times:`)
    tracks.forEach(({ track, location, isAllTracks }, i) => {
      const marker = isAllTracks ? '⭐' : '  '
      console.log(`      ${marker} ${i + 1}. "${track.title}" by ${track.artist}`)
      console.log(`         Location: ${location}`)
      console.log(`         ID: ${track.id}`)
    })
  })
}

// Report duplicates by ID
if (stats.duplicatesById.length > 0) {
  console.log(`\n⚠️  Found ${stats.duplicatesById.length} duplicate groups (by track ID):`)
  stats.duplicatesById.forEach(({ id, tracks }, index) => {
    console.log(`\n   ${index + 1}. ID: ${id}`)
    console.log(`      Found ${tracks.length} times:`)
    tracks.forEach(({ track, location, isAllTracks }, i) => {
      const marker = isAllTracks ? '⭐' : '  '
      console.log(`      ${marker} ${i + 1}. "${track.title}" by ${track.artist}`)
      console.log(`         Location: ${location}`)
      console.log(`         File: ${track.file?.substring(0, 60)}${track.file?.length > 60 ? '...' : ''}`)
    })
  })
}

// Check if "All Tracks" has all unique tracks
const allTracksFileSet = new Set()
allTracksFolder.tracks?.forEach(track => {
  const normalizedFile = normalizePath(track.file)
  if (normalizedFile) {
    allTracksFileSet.add(normalizedFile)
  }
})

const missingFromAllTracks = []
tracksByFile.forEach((tracks, file) => {
  if (!allTracksFileSet.has(file)) {
    // Find the best track to add (prefer one from "All Tracks" location, or first one)
    const bestTrack = tracks.find(t => t.isAllTracks) || tracks[0]
    missingFromAllTracks.push({ file, track: bestTrack.track })
  }
})

if (missingFromAllTracks.length > 0) {
  console.log(`\n⚠️  Found ${missingFromAllTracks.length} tracks missing from "All Tracks":`)
  missingFromAllTracks.slice(0, 10).forEach(({ track }, index) => {
    console.log(`   ${index + 1}. "${track.title}" by ${track.artist}`)
  })
  if (missingFromAllTracks.length > 10) {
    console.log(`   ... and ${missingFromAllTracks.length - 10} more`)
  }
}

// Fix mode: Deduplicate and reorganize
if (FIX_MODE) {
  console.log(`\n🔧 Starting deduplication process...`)
  
  // Step 1: Build master track map from "All Tracks"
  const masterTrackMap = new Map()
  const masterTracksById = new Map()
  
  if (allTracksFolder.tracks && Array.isArray(allTracksFolder.tracks)) {
    allTracksFolder.tracks.forEach(track => {
      const normalizedFile = normalizePath(track.file)
      if (normalizedFile) {
        masterTrackMap.set(normalizedFile, track)
      }
      if (track.id) {
        masterTracksById.set(track.id, track)
      }
    })
  }
  
  // Step 2: Add missing tracks to "All Tracks"
  missingFromAllTracks.forEach(({ track }) => {
    const normalizedFile = normalizePath(track.file)
    if (normalizedFile && !masterTrackMap.has(normalizedFile)) {
      masterTrackMap.set(normalizedFile, track)
      if (!allTracksFolder.tracks) {
        allTracksFolder.tracks = []
      }
      allTracksFolder.tracks.push(track)
      stats.fixedReferences++
      console.log(`   ✅ Added to "All Tracks": "${track.title}"`)
    }
  })
  
  // Step 3: Remove duplicates from other folders and replace with references
  function deduplicateFolder(folder) {
    if (!folder.tracks || !Array.isArray(folder.tracks)) return
    
    const deduplicatedTracks = []
    const seenFiles = new Set()
    const seenIds = new Set()
    
    folder.tracks.forEach(track => {
      const normalizedFile = normalizePath(track.file)
      const trackId = track.id
      
      // Skip if this is the "All Tracks" folder
      if (folder.id === 'folder-all-tracks') {
        // Still deduplicate within "All Tracks" itself
        if (normalizedFile && seenFiles.has(normalizedFile)) {
          stats.removedDuplicates++
          return // Skip duplicate
        }
        if (trackId && seenIds.has(trackId)) {
          stats.removedDuplicates++
          return // Skip duplicate
        }
        seenFiles.add(normalizedFile)
        if (trackId) seenIds.add(trackId)
        deduplicatedTracks.push(track)
        return
      }
      
      // For other folders, check if track exists in "All Tracks"
      const masterTrack = normalizedFile ? masterTrackMap.get(normalizedFile) : null
      const masterTrackById = trackId ? masterTracksById.get(trackId) : null
      
      if (masterTrack || masterTrackById) {
        // Use the master track reference (from "All Tracks")
        const referenceTrack = masterTrack || masterTrackById
        
        // Check if we already added this track to this folder
        const refNormalizedFile = normalizePath(referenceTrack.file)
        const refId = referenceTrack.id
        
        if (refNormalizedFile && seenFiles.has(refNormalizedFile)) {
          stats.removedDuplicates++
          return // Skip duplicate
        }
        if (refId && seenIds.has(refId)) {
          stats.removedDuplicates++
          return // Skip duplicate
        }
        
        seenFiles.add(refNormalizedFile)
        if (refId) seenIds.add(refId)
        deduplicatedTracks.push(referenceTrack)
        
        if (track !== referenceTrack) {
          stats.fixedReferences++
        }
      } else {
        // Track not in "All Tracks" - add it to master and keep it here
        if (normalizedFile) {
          masterTrackMap.set(normalizedFile, track)
          if (trackId) {
            masterTracksById.set(trackId, track)
          }
          // Also add to "All Tracks"
          if (!allTracksFolder.tracks) {
            allTracksFolder.tracks = []
          }
          allTracksFolder.tracks.push(track)
          stats.fixedReferences++
        }
        
        // Check for duplicates within this folder
        if (normalizedFile && seenFiles.has(normalizedFile)) {
          stats.removedDuplicates++
          return
        }
        if (trackId && seenIds.has(trackId)) {
          stats.removedDuplicates++
          return
        }
        
        seenFiles.add(normalizedFile)
        if (trackId) seenIds.add(trackId)
        deduplicatedTracks.push(track)
      }
    })
    
    folder.tracks = deduplicatedTracks
  }
  
  // Step 4: Recursively process all folders
  function processFolders(items) {
    if (!items || !Array.isArray(items)) return
    
    items.forEach(item => {
      deduplicateFolder(item)
      if (item.children && Array.isArray(item.children)) {
        processFolders(item.children)
      }
    })
  }
  
  processFolders(data.folders)
  
  // Step 5: Ensure "All Tracks" has no duplicates
  deduplicateFolder(allTracksFolder)
  
  // Step 6: Sort "All Tracks" by title for consistency
  if (allTracksFolder.tracks) {
    allTracksFolder.tracks.sort((a, b) => {
      const titleA = (a.title || '').toLowerCase()
      const titleB = (b.title || '').toLowerCase()
      return titleA.localeCompare(titleB)
    })
  }
  
  // Write back to file
  writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8')
  
  console.log(`\n✅ Deduplication complete!`)
  console.log(`\n📊 Summary:`)
  console.log(`   Tracks added to "All Tracks": ${missingFromAllTracks.length}`)
  console.log(`   Duplicate tracks removed: ${stats.removedDuplicates}`)
  console.log(`   Track references fixed: ${stats.fixedReferences}`)
  console.log(`   Final track count in "All Tracks": ${allTracksFolder.tracks?.length || 0}`)
  console.log(`\n💾 Saved to: ${DATA_FILE}`)
} else {
  console.log(`\n💡 To fix duplicates, run:`)
  console.log(`   node scripts/deduplicate-tracks.mjs --fix`)
}

// ============================================
// ARTWORK LINKING (JSON - Always runs)
// ============================================
console.log(`\n${'='.repeat(70)}`)
console.log('🖼️  ARTWORK LINKING (JSON)')
console.log('='.repeat(70))

try {
  // Normalize track title for matching
  const normalizeTitle = (title) => {
    if (!title) return ''
    return title
      .toLowerCase()
      .trim()
      .replace(/[^\w\s]/g, '') // Remove special characters
      .replace(/\s+/g, ' ') // Normalize whitespace
  }
  
  // Link artwork in JSON structure
  console.log(`\n📁 Linking artwork in JSON structure...`)
  const jsonDataForArtwork = JSON.parse(readFileSync(DATA_FILE, 'utf8'))
  
  // Collect all tracks with their artwork
  const tracksByTitle = new Map()
  
  function collectTracks(items) {
    if (!items || !Array.isArray(items)) return
    
    items.forEach(item => {
      if (item.tracks && Array.isArray(item.tracks)) {
        item.tracks.forEach(track => {
          const normalizedTitle = normalizeTitle(track.title)
          if (normalizedTitle) {
            if (!tracksByTitle.has(normalizedTitle)) {
              tracksByTitle.set(normalizedTitle, [])
            }
            tracksByTitle.get(normalizedTitle).push({
              track,
              hasArtwork: !!(track.artwork || track.artwork_url),
              artwork: track.artwork || track.artwork_url,
            })
          }
        })
      }
      
      if (item.children && Array.isArray(item.children)) {
        collectTracks(item.children)
      }
    })
  }
  
  collectTracks(jsonDataForArtwork.folders)
  
  // Find tracks with same title and link artwork
  let jsonArtworkLinked = 0
  const titleGroups = []
  
  tracksByTitle.forEach((tracks, normalizedTitle) => {
    if (tracks.length > 1) {
      const withArtwork = tracks.filter(t => t.hasArtwork)
      const withoutArtwork = tracks.filter(t => !t.hasArtwork)
      
      if (withArtwork.length > 0 && withoutArtwork.length > 0) {
        // Use the first artwork found
        const artworkToShare = withArtwork[0].artwork
        titleGroups.push({
          title: normalizedTitle,
          total: tracks.length,
          withArtwork: withArtwork.length,
          withoutArtwork: withoutArtwork.length,
          artwork: artworkToShare,
        })
        
        if (FIX_MODE) {
          // Update tracks without artwork
          function updateTracksInItems(items) {
            if (!items || !Array.isArray(items)) return
            
            items.forEach(item => {
              if (item.tracks && Array.isArray(item.tracks)) {
                item.tracks.forEach(track => {
                  const trackNormalizedTitle = normalizeTitle(track.title)
                  if (trackNormalizedTitle === normalizedTitle && !track.artwork && !track.artwork_url) {
                    track.artwork = artworkToShare
                    jsonArtworkLinked++
                  }
                })
              }
              
              if (item.children && Array.isArray(item.children)) {
                updateTracksInItems(item.children)
              }
            })
          }
          
          updateTracksInItems(jsonDataForArtwork.folders)
        }
      }
    }
  })
  
  if (FIX_MODE && jsonArtworkLinked > 0) {
    writeFileSync(DATA_FILE, JSON.stringify(jsonDataForArtwork, null, 2), 'utf8')
    console.log(`   ✅ Linked artwork to ${jsonArtworkLinked} tracks in JSON`)
  } else if (titleGroups.length > 0) {
    console.log(`   Found ${titleGroups.length} track groups that can share artwork`)
    titleGroups.slice(0, 10).forEach((group, index) => {
      console.log(`   ${index + 1}. "${group.title}": ${group.withoutArtwork} tracks need artwork`)
    })
    if (titleGroups.length > 10) {
      console.log(`   ... and ${titleGroups.length - 10} more groups`)
    }
    if (!FIX_MODE) {
      console.log(`\n💡 To link artwork, run:`)
      console.log(`   node scripts/deduplicate-tracks.mjs --fix`)
    }
  } else {
    console.log(`   ✅ All tracks with the same name already have artwork linked`)
  }
} catch (error) {
  console.error(`\n❌ Error during artwork linking: ${error.message}`)
}

// Database deduplication (if --database flag is set)
if (DATABASE_MODE) {
  console.log(`\n${'='.repeat(70)}`)
  console.log('🗄️  DATABASE DEDUPLICATION')
  console.log('='.repeat(70))
  
  if (!createClient) {
    console.log('\n⚠️  Cannot use database mode. @supabase/supabase-js is not available.')
    console.log('   Install it with: npm install @supabase/supabase-js')
  } else {
    const supabase = createSupabaseClient()
    if (!supabase) {
      console.log('\n⚠️  Cannot connect to database. Missing Supabase environment variables.')
      console.log('   Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local')
    } else {
    console.log('\n📊 Analyzing database tracks...')
    
    try {
      // Get all tracks from database
      const { data: dbTracks, error: dbError } = await supabase
        .from('music_library_tracks')
        .select('*')
        .order('created_at_timestamp', { ascending: true })
      
      if (dbError) {
        console.error(`❌ Error fetching tracks: ${dbError.message}`)
      } else if (!dbTracks || dbTracks.length === 0) {
        console.log('   ℹ️  No tracks found in database')
      } else {
        console.log(`   Found ${dbTracks.length} tracks in database`)
        
        // Get "All Tracks" folder ID
        const { data: allTracksFolder } = await supabase
          .from('music_library_folders')
          .select('id')
          .eq('id', 'folder-all-tracks')
          .maybeSingle()
        
        if (!allTracksFolder) {
          console.log('   ⚠️  "All Tracks" folder not found in database')
          console.log('   💡 Run: node scripts/add-all-tracks-folder.mjs first')
        } else {
          // Group tracks by normalized file_url
          const tracksByFile = new Map()
          dbTracks.forEach(track => {
            const normalizedFile = normalizePath(track.file_url)
            if (!normalizedFile) return
            
            if (!tracksByFile.has(normalizedFile)) {
              tracksByFile.set(normalizedFile, [])
            }
            tracksByFile.get(normalizedFile).push(track)
          })
          
          // Find duplicates (same file_url, different folder_id or different records)
          const duplicateGroups = []
          tracksByFile.forEach((tracks, file) => {
            if (tracks.length > 1) {
              // Check if any are in "All Tracks"
              const inAllTracks = tracks.filter(t => t.folder_id === 'folder-all-tracks')
              const inOtherFolders = tracks.filter(t => t.folder_id !== 'folder-all-tracks')
              
              if (inAllTracks.length > 0 && inOtherFolders.length > 0) {
                // Valid: track in "All Tracks" and referenced in other folders
                // But in database, tracks can only have one folder_id, so these are duplicates
                duplicateGroups.push({ file, tracks, type: 'cross-folder' })
              } else if (inAllTracks.length > 1) {
                // Duplicate within "All Tracks"
                duplicateGroups.push({ file, tracks, type: 'all-tracks-duplicate' })
              } else if (inOtherFolders.length > 1) {
                // Duplicate in other folders
                duplicateGroups.push({ file, tracks, type: 'other-folders-duplicate' })
              }
            }
          })
          
          console.log(`\n📊 Database Duplicate Analysis:`)
          console.log(`   Total tracks: ${dbTracks.length}`)
          console.log(`   Unique tracks (by file): ${tracksByFile.size}`)
          console.log(`   Duplicate groups: ${duplicateGroups.length}`)
          
          if (duplicateGroups.length > 0) {
            console.log(`\n⚠️  Found ${duplicateGroups.length} duplicate groups:`)
            duplicateGroups.slice(0, 10).forEach((group, index) => {
              console.log(`\n   ${index + 1}. File: ${group.file.substring(0, 60)}${group.file.length > 60 ? '...' : ''}`)
              console.log(`      Type: ${group.type}`)
              console.log(`      Found ${group.tracks.length} times:`)
              group.tracks.forEach((track, i) => {
                const inAllTracks = track.folder_id === 'folder-all-tracks' ? '⭐' : '  '
                console.log(`      ${inAllTracks} ${i + 1}. "${track.title}" | Folder: ${track.folder_id || 'none'} | ID: ${track.id}`)
              })
            })
            if (duplicateGroups.length > 10) {
              console.log(`   ... and ${duplicateGroups.length - 10} more`)
            }
            
            if (FIX_MODE) {
              console.log(`\n🔧 Fixing database duplicates...`)
              
              let dbStats = {
                movedToAllTracks: 0,
                removedDuplicates: 0,
                errors: 0,
              }
              
              for (const group of duplicateGroups) {
                // Keep the best track (prefer one in "All Tracks", or oldest)
                const sortedTracks = [...group.tracks].sort((a, b) => {
                  if (a.folder_id === 'folder-all-tracks' && b.folder_id !== 'folder-all-tracks') return -1
                  if (a.folder_id !== 'folder-all-tracks' && b.folder_id === 'folder-all-tracks') return 1
                  return new Date(a.created_at_timestamp || 0) - new Date(b.created_at_timestamp || 0)
                })
                
                const keepTrack = sortedTracks[0]
                const removeTracks = sortedTracks.slice(1)
                
                // Ensure keepTrack is in "All Tracks"
                if (keepTrack.folder_id !== 'folder-all-tracks') {
                  const { error: updateError } = await supabase
                    .from('music_library_tracks')
                    .update({ folder_id: 'folder-all-tracks' })
                    .eq('id', keepTrack.id)
                  
                  if (updateError) {
                    console.error(`   ❌ Error moving track ${keepTrack.id} to "All Tracks": ${updateError.message}`)
                    dbStats.errors++
                  } else {
                    dbStats.movedToAllTracks++
                    console.log(`   ✅ Moved to "All Tracks": "${keepTrack.title}"`)
                  }
                }
                
                // Delete duplicate tracks
                for (const trackToRemove of removeTracks) {
                  const { error: deleteError } = await supabase
                    .from('music_library_tracks')
                    .delete()
                    .eq('id', trackToRemove.id)
                  
                  if (deleteError) {
                    console.error(`   ❌ Error deleting duplicate ${trackToRemove.id}: ${deleteError.message}`)
                    dbStats.errors++
                  } else {
                    dbStats.removedDuplicates++
                    console.log(`   🗑️  Removed duplicate: "${trackToRemove.title}" (kept: "${keepTrack.title}")`)
                  }
                }
              }
              
              console.log(`\n📊 Database Fix Summary:`)
              console.log(`   Tracks moved to "All Tracks": ${dbStats.movedToAllTracks}`)
              console.log(`   Duplicate tracks removed: ${dbStats.removedDuplicates}`)
              if (dbStats.errors > 0) {
                console.log(`   Errors: ${dbStats.errors}`)
              }
            } else {
              console.log(`\n💡 To fix database duplicates, run:`)
              console.log(`   node scripts/deduplicate-tracks.mjs --fix --database`)
            }
          } else {
            console.log(`   ✅ No duplicates found in database!`)
          }
        }
      }
    } catch (error) {
      console.error(`\n❌ Error during database analysis: ${error.message}`)
    }
    
    // ============================================
    // AUDIO_FILES TABLE DEDUPLICATION (Sonic DNA Admin)
    // ============================================
    console.log(`\n${'='.repeat(70)}`)
    console.log('🎵 AUDIO_FILES DEDUPLICATION (Sonic DNA Admin)')
    console.log('='.repeat(70))
    
    try {
      // Get all audio files from database
      const { data: audioFiles, error: audioError } = await supabase
        .from('audio_files')
        .select('*')
        .order('created_at', { ascending: true })
      
      if (audioError) {
        console.error(`❌ Error fetching audio files: ${audioError.message}`)
      } else if (!audioFiles || audioFiles.length === 0) {
        console.log('   ℹ️  No audio files found in database')
      } else {
        console.log(`   Found ${audioFiles.length} audio files in database`)
        
        // Group audio files by normalized file_url or file_path
        const filesByUrl = new Map()
        const filesByPath = new Map()
        
        audioFiles.forEach(file => {
          const normalizedUrl = normalizePath(file.file_url)
          const normalizedPath = normalizePath(file.file_path)
          
          if (normalizedUrl) {
            if (!filesByUrl.has(normalizedUrl)) {
              filesByUrl.set(normalizedUrl, [])
            }
            filesByUrl.get(normalizedUrl).push(file)
          }
          
          if (normalizedPath) {
            if (!filesByPath.has(normalizedPath)) {
              filesByPath.set(normalizedPath, [])
            }
            filesByPath.get(normalizedPath).push(file)
          }
        })
        
        // Find duplicates (combine both URL and path matches)
        const duplicateGroups = []
        const processedIds = new Set()
        
        filesByUrl.forEach((files, url) => {
          if (files.length > 1 && !processedIds.has(files[0].id)) {
            files.forEach(f => processedIds.add(f.id))
            duplicateGroups.push({ identifier: url, files, type: 'file_url' })
          }
        })
        
        filesByPath.forEach((files, path) => {
          if (files.length > 1) {
            const unprocessed = files.filter(f => !processedIds.has(f.id))
            if (unprocessed.length > 1) {
              unprocessed.forEach(f => processedIds.add(f.id))
              duplicateGroups.push({ identifier: path, files: unprocessed, type: 'file_path' })
            }
          }
        })
        
        console.log(`\n📊 Audio Files Duplicate Analysis:`)
        console.log(`   Total audio files: ${audioFiles.length}`)
        console.log(`   Unique by URL: ${filesByUrl.size}`)
        console.log(`   Unique by path: ${filesByPath.size}`)
        console.log(`   Duplicate groups: ${duplicateGroups.length}`)
        
        if (duplicateGroups.length > 0) {
          console.log(`\n⚠️  Found ${duplicateGroups.length} duplicate groups:`)
          duplicateGroups.slice(0, 10).forEach((group, index) => {
            console.log(`\n   ${index + 1}. ${group.type}: ${group.identifier.substring(0, 60)}${group.identifier.length > 60 ? '...' : ''}`)
            console.log(`      Found ${group.files.length} times:`)
            group.files.forEach((file, i) => {
              const hasSonicDNA = file.sonic_dna ? '🧬' : '  '
              const hasWaveform = file.waveform_data ? '📊' : '  '
              console.log(`      ${hasSonicDNA}${hasWaveform} ${i + 1}. "${file.title}" | ID: ${file.id}`)
              console.log(`         Created: ${new Date(file.created_at).toLocaleDateString()}`)
              if (file.sonic_dna_status) {
                console.log(`         Sonic DNA: ${file.sonic_dna_status}`)
              }
            })
          })
          if (duplicateGroups.length > 10) {
            console.log(`   ... and ${duplicateGroups.length - 10} more`)
          }
          
          if (FIX_MODE) {
            console.log(`\n🔧 Fixing audio_files duplicates...`)
            
            let audioStats = {
              kept: 0,
              removedDuplicates: 0,
              updatedReferences: 0,
              errors: 0,
            }
            
            for (const group of duplicateGroups) {
              // Score each file to determine which to keep
              const scoredFiles = group.files.map(file => {
                let score = 0
                
                // Prefer files with Sonic DNA
                if (file.sonic_dna && typeof file.sonic_dna === 'object') {
                  score += 100
                  // Bonus for completed Sonic DNA
                  if (file.sonic_dna_status === 'completed') score += 50
                }
                
                // Prefer files with waveform data
                if (file.waveform_data && Array.isArray(file.waveform_data) && file.waveform_data.length > 0) {
                  score += 30
                }
                
                // Prefer files with more metadata
                if (file.bpm) score += 10
                if (file.key_signature) score += 10
                if (file.energy_level) score += 10
                if (file.danceability) score += 10
                
                // Prefer older files (original)
                score += 5
                
                return { file, score }
              })
              
              // Sort by score (highest first), then by created_at (oldest first)
              scoredFiles.sort((a, b) => {
                if (b.score !== a.score) {
                  return b.score - a.score
                }
                return new Date(a.file.created_at) - new Date(b.file.created_at)
              })
              
              const keepFile = scoredFiles[0].file
              const removeFiles = scoredFiles.slice(1).map(s => s.file)
              
              // Update music_library_tracks that reference removed files
              for (const removeFile of removeFiles) {
                // Find all music_library_tracks that reference this audio_file_id
                const { data: linkedTracks } = await supabase
                  .from('music_library_tracks')
                  .select('id')
                  .eq('audio_file_id', removeFile.id)
                
                if (linkedTracks && linkedTracks.length > 0) {
                  // Update them to reference the kept file
                  const { error: updateError } = await supabase
                    .from('music_library_tracks')
                    .update({ audio_file_id: keepFile.id })
                    .eq('audio_file_id', removeFile.id)
                  
                  if (updateError) {
                    console.error(`   ❌ Error updating references for ${removeFile.id}: ${updateError.message}`)
                    audioStats.errors++
                  } else {
                    audioStats.updatedReferences += linkedTracks.length
                    console.log(`   🔗 Updated ${linkedTracks.length} music_library_tracks to reference kept file`)
                  }
                }
                
                // Delete the duplicate audio file
                const { error: deleteError } = await supabase
                  .from('audio_files')
                  .delete()
                  .eq('id', removeFile.id)
                
                if (deleteError) {
                  console.error(`   ❌ Error deleting duplicate ${removeFile.id}: ${deleteError.message}`)
                  audioStats.errors++
                } else {
                  audioStats.removedDuplicates++
                  console.log(`   🗑️  Removed duplicate: "${removeFile.title}" (kept: "${keepFile.title}")`)
                }
              }
              
              audioStats.kept++
            }
            
            console.log(`\n📊 Audio Files Fix Summary:`)
            console.log(`   Files kept: ${audioStats.kept}`)
            console.log(`   Duplicate files removed: ${audioStats.removedDuplicates}`)
            console.log(`   music_library_tracks references updated: ${audioStats.updatedReferences}`)
            if (audioStats.errors > 0) {
              console.log(`   Errors: ${audioStats.errors}`)
            }
          } else {
            console.log(`\n💡 To fix audio_files duplicates, run:`)
            console.log(`   node scripts/deduplicate-tracks.mjs --fix --database`)
          }
        } else {
          console.log(`   ✅ No duplicates found in audio_files table!`)
        }
      }
    } catch (error) {
      console.error(`\n❌ Error during audio_files analysis: ${error.message}`)
    }
    
    // ============================================
    // FOLDER STRUCTURE SYNC (Music Library Admin & Sonic DNA)
    // ============================================
    console.log(`\n${'='.repeat(70)}`)
    console.log('📁 FOLDER STRUCTURE SYNC')
    console.log('='.repeat(70))
    
    try {
      // Get all folders from database
      const { data: allFolders, error: foldersError } = await supabase
        .from('music_library_folders')
        .select('*')
        .order('display_order', { ascending: true })
      
      if (foldersError) {
        console.error(`❌ Error fetching folders: ${foldersError.message}`)
      } else if (!allFolders || allFolders.length === 0) {
        console.log('   ℹ️  No folders found in database')
      } else {
        console.log(`   Found ${allFolders.length} folders in database`)
        
        // Build folder path map (folder_id -> full path)
        const folderPathMap = new Map()
        const folderNameMap = new Map()
        
        // Build folder hierarchy
        const buildFolderPath = (folderId, path = []) => {
          const folder = allFolders.find(f => f.id === folderId)
          if (!folder) return path
          
          const newPath = [folder, ...path]
          if (folder.parent_id) {
            return buildFolderPath(folder.parent_id, newPath)
          }
          return newPath
        }
        
        allFolders.forEach(folder => {
          const path = buildFolderPath(folder.id)
          const pathString = path.map(f => f.name).join(' > ')
          folderPathMap.set(folder.id, pathString)
          folderNameMap.set(folder.id, folder.name)
        })
        
        console.log(`   Built folder path map for ${folderPathMap.size} folders`)
        
        // Update music_library_tracks with folder paths
        console.log(`\n🔄 Syncing folder structure to music_library_tracks...`)
        let tracksUpdated = 0
        let audioFilesUpdated = 0
        
        const { data: allTracks, error: tracksError } = await supabase
          .from('music_library_tracks')
          .select('id, folder_id, metadata')
        
        if (tracksError) {
          console.error(`   ❌ Error fetching tracks: ${tracksError.message}`)
        } else if (allTracks && allTracks.length > 0) {
          for (const track of allTracks) {
            if (track.folder_id && folderPathMap.has(track.folder_id)) {
              const folderPath = folderPathMap.get(track.folder_id)
              const folderName = folderNameMap.get(track.folder_id)
              
              // Update track metadata with folder path
              const currentMetadata = track.metadata || {}
              const updatedMetadata = {
                ...currentMetadata,
                folder_path: folderPath,
                folder_name: folderName,
                folder_id: track.folder_id,
              }
              
              const { error: updateError } = await supabase
                .from('music_library_tracks')
                .update({ metadata: updatedMetadata })
                .eq('id', track.id)
              
              if (updateError) {
                console.error(`   ❌ Error updating track ${track.id}: ${updateError.message}`)
              } else {
                tracksUpdated++
              }
            }
          }
          
          console.log(`   ✅ Updated ${tracksUpdated} tracks with folder paths`)
        }
        
        // Update audio_files with folder paths based on music_library_tracks
        console.log(`\n🔄 Syncing folder structure to audio_files...`)
        const { data: linkedTracks, error: linkedError } = await supabase
          .from('music_library_tracks')
          .select('audio_file_id, folder_id, metadata')
          .not('audio_file_id', 'is', null)
        
        if (linkedError) {
          console.error(`   ❌ Error fetching linked tracks: ${linkedError.message}`)
        } else if (linkedTracks && linkedTracks.length > 0) {
          for (const track of linkedTracks) {
            if (track.audio_file_id && track.folder_id && folderPathMap.has(track.folder_id)) {
              const folderPath = folderPathMap.get(track.folder_id)
              
              // Extract folder path from metadata or build from folder structure
              let folderPathValue = folderPath
              
              // For "All Tracks", use a special path
              if (track.folder_id === 'folder-all-tracks') {
                folderPathValue = 'All Tracks'
              } else {
                // Extract the last folder name for folder_path field
                const pathParts = folderPath.split(' > ')
                folderPathValue = pathParts[pathParts.length - 1] || folderPath
              }
              
              // Update audio_file with folder_path
              const { error: updateError } = await supabase
                .from('audio_files')
                .update({ 
                  folder_path: folderPathValue,
                  metadata: {
                    ...(track.metadata || {}),
                    folder_path: folderPath,
                    folder_id: track.folder_id,
                  }
                })
                .eq('id', track.audio_file_id)
              
              if (updateError) {
                console.error(`   ❌ Error updating audio_file ${track.audio_file_id}: ${updateError.message}`)
              } else {
                audioFilesUpdated++
              }
            }
          }
          
          console.log(`   ✅ Updated ${audioFilesUpdated} audio_files with folder paths`)
        }
        
        // Summary
        console.log(`\n📊 Folder Structure Sync Summary:`)
        console.log(`   Folders in database: ${allFolders.length}`)
        console.log(`   Folder paths mapped: ${folderPathMap.size}`)
        console.log(`   music_library_tracks updated: ${tracksUpdated}`)
        console.log(`   audio_files updated: ${audioFilesUpdated}`)
        
        if (FIX_MODE) {
          console.log(`\n✅ Folder structure synced to backend!`)
          console.log(`   - music_library_tracks metadata updated with folder paths`)
          console.log(`   - audio_files folder_path updated to match folder structure`)
          console.log(`   - Both admin interfaces now reflect the same folder structure`)
        } else {
          console.log(`\n💡 To sync folder structure, run:`)
          console.log(`   node scripts/deduplicate-tracks.mjs --fix --database`)
        }
      }
    } catch (error) {
      console.error(`\n❌ Error during folder structure sync: ${error.message}`)
    }
    
    // ============================================
    // ARTWORK LINKING (Database - Same Track Name Across Playlists)
    // ============================================
    console.log(`\n${'='.repeat(70)}`)
    console.log('🖼️  ARTWORK LINKING (Database)')
    console.log('='.repeat(70))
    
    try {
      // Normalize track title for matching (same function as JSON section)
      const normalizeTitle = (title) => {
        if (!title) return ''
        return title
          .toLowerCase()
          .trim()
          .replace(/[^\w\s]/g, '') // Remove special characters
          .replace(/\s+/g, ' ') // Normalize whitespace
      }
      
      // Link artwork in database (music_library_tracks)
      console.log(`\n🗄️  Linking artwork in music_library_tracks...`)
      const { data: dbTracks, error: dbTracksError } = await supabase
        .from('music_library_tracks')
        .select('id, title, artwork_url')
      
      if (dbTracksError) {
        console.error(`   ❌ Error fetching tracks: ${dbTracksError.message}`)
      } else if (dbTracks && dbTracks.length > 0) {
        // Group by normalized title
        const dbTracksByTitle = new Map()
        
        dbTracks.forEach(track => {
          const normalizedTitle = normalizeTitle(track.title)
          if (normalizedTitle) {
            if (!dbTracksByTitle.has(normalizedTitle)) {
              dbTracksByTitle.set(normalizedTitle, [])
            }
            dbTracksByTitle.get(normalizedTitle).push(track)
          }
        })
        
        let dbArtworkLinked = 0
        
        for (const [normalizedTitle, tracks] of dbTracksByTitle.entries()) {
          if (tracks.length > 1) {
            const withArtwork = tracks.filter(t => t.artwork_url)
            const withoutArtwork = tracks.filter(t => !t.artwork_url)
            
            if (withArtwork.length > 0 && withoutArtwork.length > 0) {
              const artworkToShare = withArtwork[0].artwork_url
              
              if (FIX_MODE) {
                // Update tracks without artwork
                for (const track of withoutArtwork) {
                  const { error } = await supabase
                    .from('music_library_tracks')
                    .update({ artwork_url: artworkToShare })
                    .eq('id', track.id)
                  
                  if (!error) {
                    dbArtworkLinked++
                  }
                }
              }
            }
          }
        }
        
        if (FIX_MODE) {
          console.log(`   ✅ Linked artwork to ${dbArtworkLinked} tracks in music_library_tracks`)
        } else {
          const groupsNeedingArtwork = Array.from(dbTracksByTitle.entries())
            .filter(([_, tracks]) => {
              const withArtwork = tracks.filter(t => t.artwork_url)
              const withoutArtwork = tracks.filter(t => !t.artwork_url)
              return tracks.length > 1 && withArtwork.length > 0 && withoutArtwork.length > 0
            })
          if (groupsNeedingArtwork.length > 0) {
            console.log(`   Found ${groupsNeedingArtwork.length} track groups that can share artwork`)
          }
        }
      }
      
      // Link artwork in audio_files (Sonic DNA Admin)
      console.log(`\n🎵 Linking artwork in audio_files...`)
      const { data: audioFiles, error: audioFilesError } = await supabase
        .from('audio_files')
        .select('id, title, artwork_url')
      
      if (audioFilesError) {
        console.error(`   ❌ Error fetching audio files: ${audioFilesError.message}`)
      } else if (audioFiles && audioFiles.length > 0) {
        // Group by normalized title
        const audioFilesByTitle = new Map()
        
        audioFiles.forEach(file => {
          const normalizedTitle = normalizeTitle(file.title)
          if (normalizedTitle) {
            if (!audioFilesByTitle.has(normalizedTitle)) {
              audioFilesByTitle.set(normalizedTitle, [])
            }
            audioFilesByTitle.get(normalizedTitle).push(file)
          }
        })
        
        let audioArtworkLinked = 0
        
        for (const [normalizedTitle, files] of audioFilesByTitle.entries()) {
          if (files.length > 1) {
            const withArtwork = files.filter(f => f.artwork_url)
            const withoutArtwork = files.filter(f => !f.artwork_url)
            
            if (withArtwork.length > 0 && withoutArtwork.length > 0) {
              const artworkToShare = withArtwork[0].artwork_url
              
              if (FIX_MODE) {
                // Update files without artwork
                for (const file of withoutArtwork) {
                  const { error } = await supabase
                    .from('audio_files')
                    .update({ artwork_url: artworkToShare })
                    .eq('id', file.id)
                  
                  if (!error) {
                    audioArtworkLinked++
                  }
                }
              }
            }
          }
        }
        
        if (FIX_MODE) {
          console.log(`   ✅ Linked artwork to ${audioArtworkLinked} tracks in audio_files`)
        } else {
          const groupsNeedingArtwork = Array.from(audioFilesByTitle.entries())
            .filter(([_, files]) => {
              const withArtwork = files.filter(f => f.artwork_url)
              const withoutArtwork = files.filter(f => !f.artwork_url)
              return files.length > 1 && withArtwork.length > 0 && withoutArtwork.length > 0
            })
          if (groupsNeedingArtwork.length > 0) {
            console.log(`   Found ${groupsNeedingArtwork.length} audio file groups that can share artwork`)
          }
        }
      }
      
      // Summary
      if (FIX_MODE) {
        console.log(`\n📊 Database Artwork Linking Summary:`)
        console.log(`   music_library_tracks updated: ${dbArtworkLinked}`)
        console.log(`   audio_files updated: ${audioArtworkLinked}`)
        console.log(`\n✅ Artwork linked across all database tracks with the same name!`)
      } else {
        console.log(`\n💡 To link artwork in database, run:`)
        console.log(`   node scripts/deduplicate-tracks.mjs --fix --database`)
      }
    } catch (error) {
      console.error(`\n❌ Error during artwork linking: ${error.message}`)
    }
    }
  }
}

console.log(`\n✅ Analysis complete!`)
