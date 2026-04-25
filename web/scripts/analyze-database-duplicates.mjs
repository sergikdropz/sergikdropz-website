#!/usr/bin/env node

/**
 * Analyze Database for Duplicates
 * 
 * Identifies duplicate tracks in Supabase database based on:
 * - File paths (normalized)
 * - File names
 * - Title + Artist combinations
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { join } from 'path'
import dotenv from 'dotenv'

dotenv.config({ path: join(process.cwd(), '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials in .env.local')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

// Normalize file path for comparison
function normalizePath(path) {
  if (!path) return ''
  return path
    .replace(/^\/audio\//, '')
    .replace(/^\//, '')
    .replace(/\\/g, '/')
    .toLowerCase()
    .trim()
}

// Extract filename from path
function getFileName(path) {
  if (!path) return ''
  return path.split('/').pop().toLowerCase()
}

// Extract all track file paths from music library
function extractTrackPaths(items, paths = []) {
  if (!items || !Array.isArray(items)) {
    return paths
  }
  
  for (const item of items) {
    if (item.type === 'track' && item.file) {
      let localPath = item.file
      if (localPath.startsWith('http://') || localPath.startsWith('https://')) {
        const match = localPath.match(/\/storage\/v1\/object\/public\/audio-files\/(.+)$/)
        if (match) {
          localPath = decodeURIComponent(match[1])
        }
      }
      paths.push({
        id: item.id,
        title: item.title,
        artist: item.artist || 'Unknown',
        file: item.file,
        localPath: localPath.replace(/^\/audio\//, '').replace(/^\//, ''),
      })
    }
    if (item.children && Array.isArray(item.children)) {
      extractTrackPaths(item.children, paths)
    }
    if (item.tracks && Array.isArray(item.tracks)) {
      extractTrackPaths(item.tracks, paths)
    }
  }
  return paths
}

async function analyzeDuplicates() {
  console.log('🔍 Analyzing Database for Duplicates\n')
  console.log('='.repeat(70))
  console.log()

  // Get all tracks from database
  const { data: dbTracks, error: dbError } = await supabase
    .from('audio_files')
    .select('id, title, artist, file_path, file_name, file_url, created_at, waveform_data, sonic_dna')
    .order('created_at', { ascending: false })

  if (dbError) {
    console.error('❌ Failed to fetch tracks from database:', dbError.message)
    process.exit(1)
  }

  console.log(`✅ Found ${dbTracks.length} tracks in database`)
  console.log()

  // Load music library
  const musicLibraryPath = join(process.cwd(), 'data', 'music-library.json')
  let musicLibrary = null
  let libraryTracks = []
  try {
    musicLibrary = JSON.parse(readFileSync(musicLibraryPath, 'utf-8'))
    libraryTracks = extractTrackPaths(musicLibrary.folders || [])
    console.log(`✅ Found ${libraryTracks.length} tracks in music-library.json`)
    console.log()
  } catch (error) {
    console.warn('⚠️  Could not load music-library.json:', error.message)
  }

  // Analyze duplicates
  console.log('📊 Analyzing Duplicates...\n')
  console.log('='.repeat(70))
  console.log()

  // 1. Duplicates by normalized file_path
  const pathMap = new Map()
  const pathDuplicates = []

  dbTracks.forEach(track => {
    const normalizedPath = normalizePath(track.file_path || track.file_name || '')
    if (!normalizedPath) return

    if (!pathMap.has(normalizedPath)) {
      pathMap.set(normalizedPath, [])
    }
    pathMap.get(normalizedPath).push(track)
  })

  pathMap.forEach((tracks, path) => {
    if (tracks.length > 1) {
      pathDuplicates.push({ path, tracks })
    }
  })

  // 2. Duplicates by file name
  const fileNameMap = new Map()
  const fileNameDuplicates = []

  dbTracks.forEach(track => {
    const fileName = getFileName(track.file_path || track.file_name || '')
    if (!fileName) return

    if (!fileNameMap.has(fileName)) {
      fileNameMap.set(fileName, [])
    }
    fileNameMap.get(fileName).push(track)
  })

  fileNameMap.forEach((tracks, fileName) => {
    if (tracks.length > 1) {
      fileNameDuplicates.push({ fileName, tracks })
    }
  })

  // 3. Duplicates by title + artist
  const titleArtistMap = new Map()
  const titleArtistDuplicates = []

  dbTracks.forEach(track => {
    const key = `${(track.title || '').toLowerCase()}|${(track.artist || '').toLowerCase()}`
    if (!key || key === '|') return

    if (!titleArtistMap.has(key)) {
      titleArtistMap.set(key, [])
    }
    titleArtistMap.get(key).push(track)
  })

  titleArtistMap.forEach((tracks, key) => {
    if (tracks.length > 1) {
      const [title, artist] = key.split('|')
      titleArtistDuplicates.push({ title, artist, tracks })
    }
  })

  // Calculate unique counts
  const uniqueByPath = pathMap.size
  const uniqueByFileName = fileNameMap.size
  const uniqueByTitleArtist = titleArtistMap.size

  // Print results
  console.log('📈 Duplicate Analysis Results:')
  console.log('='.repeat(70))
  console.log()

  console.log(`1. Duplicates by File Path: ${pathDuplicates.length} groups`)
  if (pathDuplicates.length > 0) {
    let totalPathDups = 0
    pathDuplicates.forEach(({ path, tracks }) => {
      totalPathDups += tracks.length - 1
      console.log(`   - "${path}": ${tracks.length} duplicates`)
      if (process.argv.includes('--details') || process.argv.includes('-d')) {
        tracks.forEach((track, i) => {
          const hasWaveform = track.waveform_data && Array.isArray(track.waveform_data) && track.waveform_data.length > 0
          const hasSonicDNA = track.sonic_dna && typeof track.sonic_dna === 'object'
          console.log(`     ${i + 1}. ID: ${track.id} | ${track.title} | Created: ${new Date(track.created_at).toLocaleDateString()} | Waveform: ${hasWaveform ? '✅' : '❌'} | Sonic DNA: ${hasSonicDNA ? '✅' : '❌'}`)
        })
      }
    })
    console.log(`   Total duplicate entries: ${totalPathDups}`)
  }
  console.log()

  console.log(`2. Duplicates by File Name: ${fileNameDuplicates.length} groups`)
  if (fileNameDuplicates.length > 0) {
    let totalNameDups = 0
    fileNameDuplicates.slice(0, 20).forEach(({ fileName, tracks }) => {
      totalNameDups += tracks.length - 1
      console.log(`   - "${fileName}": ${tracks.length} duplicates`)
      if (process.argv.includes('--details') || process.argv.includes('-d')) {
        tracks.forEach((track, i) => {
          console.log(`     ${i + 1}. ID: ${track.id} | ${track.title} | Path: ${track.file_path || track.file_name}`)
        })
      }
    })
    if (fileNameDuplicates.length > 20) {
      console.log(`   ... and ${fileNameDuplicates.length - 20} more groups`)
    }
    console.log(`   Total duplicate entries: ${totalNameDups}`)
  }
  console.log()

  console.log(`3. Duplicates by Title + Artist: ${titleArtistDuplicates.length} groups`)
  if (titleArtistDuplicates.length > 0) {
    let totalTitleDups = 0
    titleArtistDuplicates.slice(0, 20).forEach(({ title, artist, tracks }) => {
      totalTitleDups += tracks.length - 1
      console.log(`   - "${title}" by "${artist}": ${tracks.length} duplicates`)
      if (process.argv.includes('--details') || process.argv.includes('-d')) {
        tracks.forEach((track, i) => {
          console.log(`     ${i + 1}. ID: ${track.id} | Path: ${track.file_path || track.file_name}`)
        })
      }
    })
    if (titleArtistDuplicates.length > 20) {
      console.log(`   ... and ${titleArtistDuplicates.length - 20} more groups`)
    }
    console.log(`   Total duplicate entries: ${totalTitleDups}`)
  }
  console.log()

  // Summary
  console.log('📊 Unique Track Counts:')
  console.log('='.repeat(70))
  console.log()
  console.log(`   Total tracks in database: ${dbTracks.length}`)
  console.log(`   Unique by file path: ${uniqueByPath}`)
  console.log(`   Unique by file name: ${uniqueByFileName}`)
  console.log(`   Unique by title + artist: ${uniqueByTitleArtist}`)
  if (libraryTracks.length > 0) {
    console.log(`   Tracks in music-library.json: ${libraryTracks.length}`)
  }
  console.log()

  const estimatedDuplicates = dbTracks.length - uniqueByPath
  console.log('='.repeat(70))
  console.log('📋 Summary:')
  console.log('='.repeat(70))
  console.log()
  console.log(`   Total database entries: ${dbTracks.length}`)
  console.log(`   Likely unique tracks: ~${uniqueByPath}`)
  console.log(`   Estimated duplicates: ${estimatedDuplicates}`)
  console.log()

  if (estimatedDuplicates > 0) {
    console.log('⚠️  Duplicates Found!')
    console.log()
    console.log('💡 Recommendation:')
    console.log(`   Consider removing ${estimatedDuplicates} duplicate entries`)
    console.log(`   This would reduce the database from ${dbTracks.length} to ~${uniqueByPath} tracks`)
    console.log()
    console.log('🔧 Next Steps:')
    console.log('   1. Review duplicates with: node scripts/analyze-database-duplicates.mjs --details')
    console.log('   2. Create a cleanup script to remove duplicates (keeping the oldest or most complete entry)')
    console.log()
  } else {
    console.log('✅ No obvious duplicates found by file path!')
    console.log('   (However, there may be duplicates with different paths but same content)')
    console.log()
  }

  return {
    totalTracks: dbTracks.length,
    uniqueByPath,
    estimatedDuplicates,
    pathDuplicates,
    fileNameDuplicates,
    titleArtistDuplicates,
  }
}

analyzeDuplicates()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n❌ Error:', error)
    process.exit(1)
  })
