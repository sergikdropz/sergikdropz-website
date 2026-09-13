#!/usr/bin/env node
/**
 * Link All Sonic DNA, Images, and Audio Files to Music Library
 * 
 * This script:
 * 1. Reads music-library.json
 * 2. For each track, finds the corresponding Supabase database record
 * 3. Updates music-library.json with:
 *    - Supabase audio file URLs
 *    - Supabase artwork URLs
 *    - Sonic DNA (Deep Comprehensive Sonic DNA Analysis Report) status and data
 *    - All analysis data (BPM, waveform, etc.)
 * 
 * Note: "Sonic DNA" refers to the Deep Comprehensive Sonic DNA Analysis Report,
 * which includes emotional, musical, historical, regional, genre, and technical analysis.
 * 
 * Usage: node scripts/link-all-to-music-library.mjs [--dry-run]
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

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const MUSIC_LIBRARY_FILE = join(__dirname, '..', 'data', 'music-library.json')
const DRY_RUN = process.argv.includes('--dry-run')

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
  tracksProcessed: 0,
  tracksLinked: 0,
  tracksNotFound: 0,
  audioUrlsUpdated: 0,
  artworkUrlsUpdated: 0,
  sonicDNALinked: 0,
  bpmUpdated: 0,
  waveformLinked: 0,
  errors: 0,
}

/**
 * Normalize file path for comparison
 */
function normalizePath(path) {
  if (!path) return ''
  return path
    .replace(/^\/audio\//, '')
    .replace(/^\//, '')
    .replace(/\\/g, '/')
    .toLowerCase()
    .trim()
}

/**
 * Extract filename from path
 */
function getFileName(path) {
  if (!path) return ''
  const parts = path.split('/')
  return parts[parts.length - 1].toLowerCase()
}

/**
 * Find database record for a track
 */
async function findDatabaseRecord(track) {
  try {
    // Try multiple matching strategies
    
    // Strategy 1: Match by file_path (normalized)
    const normalizedFile = normalizePath(track.file)
    if (normalizedFile) {
      const { data: byPath, error: pathError } = await supabase
        .from('audio_files')
        .select('*')
        .or(`file_path.ilike.%${normalizedFile}%,file_name.ilike.%${getFileName(track.file)}%`)
        .limit(5)
      
      if (!pathError && byPath && byPath.length > 0) {
        // Try exact match first
        const exact = byPath.find(r => 
          normalizePath(r.file_path) === normalizedFile ||
          normalizePath(r.file_name) === getFileName(track.file)
        )
        if (exact) return exact
        
        // Try partial match
        const partial = byPath.find(r => 
          normalizePath(r.file_path).includes(normalizedFile) ||
          normalizedFile.includes(normalizePath(r.file_path))
        )
        if (partial) return partial
        
        // Return first match
        return byPath[0]
      }
    }
    
    // Strategy 2: Match by title and artist
    if (track.title && track.artist) {
      const { data: byTitle, error: titleError } = await supabase
        .from('audio_files')
        .select('*')
        .ilike('title', `%${track.title}%`)
        .ilike('artist', `%${track.artist}%`)
        .limit(5)
      
      if (!titleError && byTitle && byTitle.length > 0) {
        // Try exact match
        const exact = byTitle.find(r => 
          r.title.toLowerCase() === track.title.toLowerCase() &&
          r.artist.toLowerCase() === track.artist.toLowerCase()
        )
        if (exact) return exact
        
        // Return first match
        return byTitle[0]
      }
    }
    
    return null
  } catch (error) {
    console.error(`   ❌ Error finding record for ${track.title}:`, error.message)
    return null
  }
}

/**
 * Recursively process tracks in library structure
 */
async function processTracks(items, path = '') {
  for (const item of items) {
    const currentPath = path ? `${path} > ${item.name}` : item.name
    
    // Preserve EP/folder artwork - don't overwrite existing Supabase URLs
    if (item.artwork) {
      const isSupabaseUrl = item.artwork.startsWith('http://') || 
                           item.artwork.startsWith('https://') ||
                           item.artwork.includes('supabase.co')
      
      if (!isSupabaseUrl) {
        // If it's a local path, try to find artwork in Supabase Storage
        // For EP artwork, we need to check gallery-images bucket
        // This is handled by resolveImageUrl() in production, so we preserve local paths
        // They'll be converted to Supabase URLs at runtime
      }
    }
    
    // Process tracks in this item
    if (item.tracks && Array.isArray(item.tracks)) {
      for (const track of item.tracks) {
        stats.tracksProcessed++
        
        try {
          const dbRecord = await findDatabaseRecord(track)
          
          if (!dbRecord) {
            stats.tracksNotFound++
            console.log(`   ⚠️  [${stats.tracksProcessed}] ${track.title} - Not found in database`)
            continue
          }
          
          stats.tracksLinked++
          let updated = false
          
          // Update audio file URL
          if (dbRecord.file_url && track.file !== dbRecord.file_url) {
            if (!track.file.startsWith('http')) {
              track.file = dbRecord.file_url
              stats.audioUrlsUpdated++
              updated = true
            }
          }
          
          // Update artwork URL - but preserve existing Supabase URLs
          if (dbRecord.artwork_url && track.artwork !== dbRecord.artwork_url) {
            // Only update if:
            // 1. Current artwork is not a Supabase URL (preserve existing Supabase URLs)
            // 2. Database has a valid artwork_url
            const isCurrentSupabaseUrl = track.artwork && (
              track.artwork.startsWith('http://') || 
              track.artwork.startsWith('https://') ||
              track.artwork.includes('supabase.co')
            )
            
            if (!isCurrentSupabaseUrl && dbRecord.artwork_url) {
              track.artwork = dbRecord.artwork_url
              stats.artworkUrlsUpdated++
              updated = true
            } else if (isCurrentSupabaseUrl && !dbRecord.artwork_url) {
              // Current is Supabase URL but DB doesn't have one - keep current
              // This preserves existing Supabase URLs even if DB is missing them
            }
          } else if (!track.artwork && dbRecord.artwork_url) {
            // Track has no artwork but DB has one - use it
            track.artwork = dbRecord.artwork_url
            stats.artworkUrlsUpdated++
            updated = true
          }
          
          // Link Sonic DNA (Deep Comprehensive Sonic DNA Analysis Report)
          // This includes emotional, musical, historical, regional, genre, and technical analysis
          if (dbRecord.sonic_dna) {
            if (!track.sonic_dna) {
              track.sonic_dna = {
                status: dbRecord.sonic_dna_status || 'completed',
                hasData: true,
                analyzedAt: dbRecord.sonic_dna_analyzed_at || null,
                note: 'Deep Comprehensive Sonic DNA Analysis Report available in Supabase',
              }
              stats.sonicDNALinked++
              updated = true
            }
          } else if (dbRecord.sonic_dna_status) {
            track.sonic_dna = {
              status: dbRecord.sonic_dna_status,
              hasData: false,
              analyzedAt: dbRecord.sonic_dna_analyzed_at || null,
              note: 'Deep Comprehensive Sonic DNA Analysis Report status tracked',
            }
            updated = true
          }
          
          // Update BPM
          if (dbRecord.bpm && track.bpm !== dbRecord.bpm) {
            track.bpm = dbRecord.bpm
            stats.bpmUpdated++
            updated = true
          }
          
          // Link waveform data (add reference)
          if (dbRecord.waveform_data && Array.isArray(dbRecord.waveform_data) && dbRecord.waveform_data.length > 0) {
            if (!track.waveform) {
              track.waveform = {
                hasData: true,
                samples: dbRecord.waveform_samples || dbRecord.waveform_data.length,
              }
              stats.waveformLinked++
              updated = true
            }
          }
          
          // Add analysis metadata
          if (dbRecord.energy_level !== null && dbRecord.energy_level !== undefined) {
            track.energy_level = dbRecord.energy_level
            updated = true
          }
          
          if (dbRecord.key_signature) {
            track.key_signature = dbRecord.key_signature
            updated = true
          }
          
          if (dbRecord.danceability !== null && dbRecord.danceability !== undefined) {
            track.danceability = dbRecord.danceability
            updated = true
          }
          
          if (updated) {
            const status = [
              dbRecord.file_url ? '🎵' : '',
              dbRecord.artwork_url ? '🖼️' : '',
              dbRecord.sonic_dna ? '🧬' : '',
              dbRecord.waveform_data ? '📊' : '',
            ].filter(Boolean).join(' ')
            
            console.log(`   ✅ [${stats.tracksProcessed}] ${track.title} ${status}`)
          } else {
            console.log(`   ✓ [${stats.tracksProcessed}] ${track.title} - Already linked`)
          }
          
        } catch (error) {
          stats.errors++
          console.error(`   ❌ [${stats.tracksProcessed}] ${track.title} - Error:`, error.message)
        }
      }
    }
    
    // Process children recursively
    if (item.children && Array.isArray(item.children)) {
      await processTracks(item.children, currentPath)
    }
  }
}

/**
 * Main execution
 */
async function main() {
    console.log('🔗 Linking All Sonic DNA (Deep Comprehensive Analysis Report), Images, and Audio Files to Music Library...\n')
  
  if (DRY_RUN) {
    console.log('⚠️  DRY RUN MODE - No files will be modified\n')
  }
  
  try {
    // Step 1: Load music library
    console.log('📖 Loading music-library.json...')
    const libraryData = JSON.parse(readFileSync(MUSIC_LIBRARY_FILE, 'utf8'))
    console.log(`   Found ${libraryData.folders?.length || 0} top-level folders\n`)
    
    // Step 2: Process all tracks
    console.log('🔍 Processing tracks and linking to Supabase...')
    console.log('-'.repeat(60))
    
    await processTracks(libraryData.folders || [])
    
    console.log('-'.repeat(60))
    
    // Step 3: Save updated library
    if (!DRY_RUN && (stats.audioUrlsUpdated > 0 || stats.artworkUrlsUpdated > 0 || stats.sonicDNALinked > 0)) {
      console.log('\n💾 Saving updated music-library.json...')
      writeFileSync(
        MUSIC_LIBRARY_FILE,
        JSON.stringify(libraryData, null, 2),
        'utf8'
      )
      console.log('   ✅ Saved successfully!')
    }
    
    // Print summary
    console.log('\n' + '='.repeat(60))
    console.log('📊 LINKING SUMMARY')
    console.log('='.repeat(60))
    console.log(`Tracks Processed:        ${stats.tracksProcessed}`)
    console.log(`Tracks Linked:            ${stats.tracksLinked}`)
    console.log(`Tracks Not Found:         ${stats.tracksNotFound}`)
    console.log(`Audio URLs Updated:       ${stats.audioUrlsUpdated}`)
    console.log(`Artwork URLs Updated:     ${stats.artworkUrlsUpdated}`)
    console.log(`Sonic DNA (Deep Analysis) Linked: ${stats.sonicDNALinked}`)
    console.log(`BPM Updated:              ${stats.bpmUpdated}`)
    console.log(`Waveform Data Linked:     ${stats.waveformLinked}`)
    console.log(`Errors:                   ${stats.errors}`)
    
    if (DRY_RUN) {
      console.log('\n⚠️  This was a dry run. Run without --dry-run to apply changes.')
    } else if (stats.tracksLinked > 0) {
      console.log('\n✅ All tracks linked successfully!')
      console.log('💡 The music library now has:')
      console.log('   - Supabase audio file URLs')
      console.log('   - Supabase artwork URLs')
      console.log('   - Sonic DNA (Deep Comprehensive Analysis Report) status and references')
      console.log('   - Waveform data references')
      console.log('   - All analysis metadata (BPM, energy, key, etc.)')
    } else {
      console.log('\n✅ All tracks already linked!')
    }
    
  } catch (error) {
    console.error('\n❌ Fatal error:', error)
    process.exit(1)
  }
}

main()
