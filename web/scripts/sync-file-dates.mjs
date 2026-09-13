#!/usr/bin/env node
/**
 * Sync File Creation Dates to Database
 * 
 * Reads actual file creation dates from the filesystem and
 * updates the database tracks with accurate dates.
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join, basename } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

dotenv.config({ path: join(__dirname, '..', '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

/**
 * Normalize a filename for matching
 */
function normalizeFilename(filename) {
  return filename
    .toLowerCase()
    .replace(/\.wav$/i, '')
    .replace(/\.(mp3|aiff|flac|m4a)$/i, '')
    .replace(/^\.\//g, '')
    .replace(/[_\-\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s]/g, '')
    .trim()
}

/**
 * Normalize a track title for matching
 */
function normalizeTitle(title) {
  return title
    .toLowerCase()
    .replace(/[_\-\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s]/g, '')
    .trim()
}

/**
 * Calculate similarity between two strings
 */
function similarity(s1, s2) {
  const longer = s1.length > s2.length ? s1 : s2
  const shorter = s1.length > s2.length ? s2 : s1
  
  if (longer.length === 0) return 1.0
  
  // Check for exact match
  if (s1 === s2) return 1.0
  
  // Check if one contains the other
  if (longer.includes(shorter)) return shorter.length / longer.length + 0.3
  
  // Levenshtein distance
  const costs = []
  for (let i = 0; i <= s1.length; i++) {
    let lastValue = i
    for (let j = 0; j <= s2.length; j++) {
      if (i === 0) {
        costs[j] = j
      } else if (j > 0) {
        let newValue = costs[j - 1]
        if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1
        }
        costs[j - 1] = lastValue
        lastValue = newValue
      }
    }
    if (i > 0) costs[s2.length] = lastValue
  }
  
  return (longer.length - costs[s2.length]) / longer.length
}

async function main() {
  console.log('📁 Syncing File Creation Dates to Database')
  console.log('═'.repeat(60))
  console.log('')

  // Read the dates file
  const datesContent = readFileSync('/tmp/sergik_wav_dates.txt', 'utf-8')
  const fileEntries = datesContent.trim().split('\n').map(line => {
    const [date, filepath] = line.split('|')
    const filename = basename(filepath)
    return { date, filepath, filename, normalized: normalizeFilename(filename) }
  })

  console.log(`Loaded ${fileEntries.length} file dates from filesystem\n`)

  // Get all tracks from database
  const { data: tracks, error } = await supabase
    .from('music_library_tracks')
    .select('id, title, file_url, date, year, metadata')

  if (error) {
    console.error('Error fetching tracks:', error.message)
    process.exit(1)
  }

  console.log(`Found ${tracks?.length || 0} tracks in database\n`)

  // Create normalized title map
  const trackMap = new Map()
  tracks?.forEach(t => {
    const normalized = normalizeTitle(t.title)
    trackMap.set(normalized, t)
    
    // Also add without artist prefix
    const withoutPrefix = normalized.replace(/^sergik\s*[\-x]\s*/i, '').trim()
    if (withoutPrefix !== normalized) {
      trackMap.set(withoutPrefix, t)
    }
  })

  const stats = {
    total: fileEntries.length,
    matched: 0,
    updated: 0,
    notFound: 0,
    errors: 0
  }

  const unmatched = []
  const matches = []

  // Match files to tracks
  for (const file of fileEntries) {
    let bestMatch = null
    let bestScore = 0

    // Try direct normalized match first
    if (trackMap.has(file.normalized)) {
      bestMatch = trackMap.get(file.normalized)
      bestScore = 1.0
    } else {
      // Try fuzzy matching
      for (const [normalizedTitle, track] of trackMap.entries()) {
        const score = similarity(file.normalized, normalizedTitle)
        if (score > bestScore && score > 0.7) {
          bestScore = score
          bestMatch = track
        }
      }
    }

    if (bestMatch && bestScore > 0.7) {
      matches.push({ file, track: bestMatch, score: bestScore })
    } else {
      unmatched.push(file.filename)
    }
  }

  console.log(`Matched ${matches.length} files to tracks\n`)
  console.log('Updating tracks with file creation dates...\n')

  // Update tracks with file dates
  for (const { file, track, score } of matches) {
    stats.matched++

    // Parse the date
    const [year, month, day] = file.date.split('-').map(Number)

    // Update metadata
    const updatedMetadata = {
      ...(track.metadata || {}),
      file_creation_date: file.date,
      file_path_matched: file.filepath,
      match_score: score,
      date_source: 'filesystem'
    }

    // Apply update
    const { error: updateError } = await supabase
      .from('music_library_tracks')
      .update({
        date: file.date,
        year: year,
        metadata: updatedMetadata
      })
      .eq('id', track.id)

    if (updateError) {
      console.error(`  ❌ Error updating "${track.title}":`, updateError.message)
      stats.errors++
    } else {
      stats.updated++
      process.stdout.write('.')
    }
  }

  stats.notFound = fileEntries.length - matches.length

  console.log('\n')
  console.log('═'.repeat(60))
  console.log('📊 SYNC SUMMARY')
  console.log('═'.repeat(60))
  console.log(`Total files scanned:    ${stats.total}`)
  console.log(`Matched to tracks:      ${stats.matched}`)
  console.log(`Updated in database:    ${stats.updated}`)
  console.log(`No match found:         ${stats.notFound}`)
  console.log(`Errors:                 ${stats.errors}`)
  console.log('═'.repeat(60))

  if (unmatched.length > 0 && unmatched.length <= 30) {
    console.log('\nUnmatched files:')
    unmatched.forEach(f => console.log('  - ' + f))
  } else if (unmatched.length > 30) {
    console.log(`\n${unmatched.length} files could not be matched`)
  }

  console.log('\n✅ File date sync complete!')
}

main().catch(console.error)
