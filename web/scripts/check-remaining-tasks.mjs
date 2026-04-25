#!/usr/bin/env node

/**
 * Check Remaining Tasks Status
 * 
 * Identifies:
 * - Tracks missing waveforms
 * - Tracks missing Sonic DNA
 * - Tracks in music-library.json but not in database
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

// Load music library
const musicLibraryPath = join(process.cwd(), 'data', 'music-library.json')
let musicLibrary = null
try {
  musicLibrary = JSON.parse(readFileSync(musicLibraryPath, 'utf-8'))
} catch (error) {
  console.error('❌ Failed to load music-library.json:', error.message)
  process.exit(1)
}

// Extract all track file paths from music library
function extractTrackPaths(items, paths = []) {
  if (!items || !Array.isArray(items)) {
    return paths
  }
  
  for (const item of items) {
    if (item.type === 'track' && item.file) {
      // Extract local path from Supabase URL if needed
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

async function checkStatus() {
  console.log('📊 Checking Remaining Tasks Status\n')
  console.log('='.repeat(70))
  console.log()

  // Get all tracks from database
  const { data: dbTracks, error: dbError } = await supabase
    .from('audio_files')
    .select('id, title, file_path, file_name, waveform_data, sonic_dna, sonic_dna_status')
    .order('title')

  if (dbError) {
    console.error('❌ Failed to fetch tracks from database:', dbError.message)
    process.exit(1)
  }

  console.log(`✅ Found ${dbTracks.length} tracks in database`)
  console.log()

  // Extract tracks from music library
  const libraryTracks = extractTrackPaths(musicLibrary.folders || [])
  console.log(`✅ Found ${libraryTracks.length} tracks in music-library.json`)
  console.log()

  // Check missing waveforms
  const missingWaveforms = dbTracks.filter(track => 
    !track.waveform_data || 
    !Array.isArray(track.waveform_data) || 
    track.waveform_data.length === 0
  )

  // Check missing Sonic DNA
  const missingSonicDNA = dbTracks.filter(track => 
    !track.sonic_dna || 
    track.sonic_dna_status !== 'completed'
  )

  // Find tracks in library but not in database
  const libraryPaths = new Set(libraryTracks.map(t => t.localPath.toLowerCase()))
  const dbPaths = new Set(dbTracks.map(t => {
    const path = (t.file_path || t.file_name || '').toLowerCase()
    return path
  }))

  const notInDatabase = libraryTracks.filter(track => {
    const normalizedPath = track.localPath.toLowerCase()
    // Try to find by path or filename
    const found = dbTracks.find(db => {
      const dbPath = (db.file_path || db.file_name || '').toLowerCase()
      return dbPath === normalizedPath || 
             dbPath.includes(normalizedPath.split('/').pop()) ||
             normalizedPath.includes(dbPath.split('/').pop())
    })
    return !found
  })

  // Print results
  console.log('📊 Status Summary:')
  console.log('='.repeat(70))
  console.log()
  
  console.log(`🎵 Total tracks in database: ${dbTracks.length}`)
  console.log(`📁 Total tracks in music-library.json: ${libraryTracks.length}`)
  console.log()
  
  console.log(`📈 Waveforms:`)
  console.log(`   ✅ With waveforms: ${dbTracks.length - missingWaveforms.length}`)
  console.log(`   ⚠️  Missing waveforms: ${missingWaveforms.length}`)
  console.log()
  
  console.log(`🧬 Sonic DNA:`)
  const completedSonicDNA = dbTracks.filter(t => t.sonic_dna_status === 'completed' && t.sonic_dna)
  console.log(`   ✅ With Sonic DNA: ${completedSonicDNA.length}`)
  console.log(`   ⚠️  Missing Sonic DNA: ${missingSonicDNA.length}`)
  console.log()
  
  console.log(`📦 Tracks not in database:`)
  console.log(`   ⚠️  Missing from database: ${notInDatabase.length}`)
  console.log()

  // Show details if requested
  if (process.argv.includes('--details') || process.argv.includes('-d')) {
    if (missingWaveforms.length > 0) {
      console.log('\n📈 Tracks Missing Waveforms:')
      console.log('-'.repeat(70))
      missingWaveforms.slice(0, 20).forEach(track => {
        console.log(`   - ${track.title} (${track.file_path || track.file_name})`)
      })
      if (missingWaveforms.length > 20) {
        console.log(`   ... and ${missingWaveforms.length - 20} more`)
      }
      console.log()
    }

    if (missingSonicDNA.length > 0) {
      console.log('\n🧬 Tracks Missing Sonic DNA:')
      console.log('-'.repeat(70))
      missingSonicDNA.slice(0, 20).forEach(track => {
        console.log(`   - ${track.title} (${track.sonic_dna_status || 'pending'})`)
      })
      if (missingSonicDNA.length > 20) {
        console.log(`   ... and ${missingSonicDNA.length - 20} more`)
      }
      console.log()
    }

    if (notInDatabase.length > 0) {
      console.log('\n📦 Tracks in Library but Not in Database:')
      console.log('-'.repeat(70))
      notInDatabase.slice(0, 20).forEach(track => {
        console.log(`   - ${track.title} (${track.localPath})`)
      })
      if (notInDatabase.length > 20) {
        console.log(`   ... and ${notInDatabase.length - 20} more`)
      }
      console.log()
    }
  }

  // Print commands to fix
  console.log('🔧 Commands to Fix:')
  console.log('='.repeat(70))
  console.log()
  
  if (missingWaveforms.length > 0) {
    console.log('1. Generate missing waveforms:')
    console.log('   cd web && node scripts/analyze-music-library-complete.mjs')
    console.log()
  }
  
  if (missingSonicDNA.length > 0) {
    console.log('2. Generate missing Sonic DNA:')
    console.log('   cd web && node scripts/analyze-sonic-dna-library.mjs')
    console.log('   # OR for AI-enhanced analysis:')
    console.log('   cd web && node scripts/generate-sonic-dna-all.mjs')
    console.log()
  }
  
  if (notInDatabase.length > 0) {
    console.log('3. Upload missing tracks to Supabase:')
    console.log('   cd web && node scripts/sync-local-to-supabase.mjs')
    console.log('   # This will upload files and add them to database')
    console.log()
  }

  console.log('='.repeat(70))
  console.log()
  
  // Return counts for automation
  return {
    totalTracks: dbTracks.length,
    libraryTracks: libraryTracks.length,
    missingWaveforms: missingWaveforms.length,
    missingSonicDNA: missingSonicDNA.length,
    notInDatabase: notInDatabase.length,
    missingWaveformTracks: missingWaveforms,
    missingSonicDNATracks: missingSonicDNA,
    notInDatabaseTracks: notInDatabase,
  }
}

checkStatus()
  .then((stats) => {
    if (stats.missingWaveforms === 0 && stats.missingSonicDNA === 0 && stats.notInDatabase === 0) {
      console.log('✅ All tasks complete! No remaining work needed.')
      process.exit(0)
    } else {
      process.exit(1)
    }
  })
  .catch((error) => {
    console.error('\n❌ Error:', error)
    process.exit(1)
  })
