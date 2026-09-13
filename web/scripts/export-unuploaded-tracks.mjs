#!/usr/bin/env node
/**
 * Export Unuploaded Tracks to Knowledge Base
 * 
 * Collects all WAV files that are NOT yet in the database
 * and exports them to a knowledge base for future uploads.
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'fs'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join, basename } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

dotenv.config({ path: join(__dirname, '..', '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

/**
 * Normalize filename for matching
 */
function normalizeFilename(filename) {
  return filename
    .toLowerCase()
    .replace(/\.wav$/i, '')
    .replace(/[_\-\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s]/g, '')
    .trim()
}

/**
 * Parse track info from filename
 */
function parseTrackInfo(filename) {
  const name = filename.replace(/\.wav$/i, '')
  
  // Try to extract artist and title
  let artist = 'SERGIK'
  let title = name
  
  // Common patterns: "Artist - Title", "Artist x Artist - Title"
  const dashMatch = name.match(/^(.+?)\s*[-–]\s*(.+)$/)
  if (dashMatch) {
    const beforeDash = dashMatch[1].trim()
    const afterDash = dashMatch[2].trim()
    
    // Check if before dash looks like an artist name
    if (beforeDash.toLowerCase().includes('sergik') || 
        beforeDash.toLowerCase().includes('x ') ||
        beforeDash.match(/^[A-Z][a-z]+(\s+[A-Z][a-z]+)*$/)) {
      artist = beforeDash
      title = afterDash
    }
  }
  
  // Extract collaborators
  const collabs = []
  const collabMatch = name.match(/\b(x|feat\.?|ft\.?)\s+(\w+)/gi)
  if (collabMatch) {
    collabMatch.forEach(m => {
      const parts = m.split(/x|feat\.?|ft\.?/i)
      if (parts[1]) collabs.push(parts[1].trim())
    })
  }
  
  // Detect version info
  let version = null
  const versionMatch = name.match(/\b(v\d+|vip|remix|edit|master|premaster|instrumental|dub)\b/i)
  if (versionMatch) {
    version = versionMatch[1]
  }
  
  return { artist, title, collaborators: collabs, version, originalFilename: filename }
}

/**
 * Calculate similarity between two strings
 */
function similarity(s1, s2) {
  const longer = s1.length > s2.length ? s1 : s2
  const shorter = s1.length > s2.length ? s2 : s1
  if (longer.length === 0) return 1.0
  if (s1 === s2) return 1.0
  if (longer.includes(shorter)) return shorter.length / longer.length + 0.3
  return 0
}

async function main() {
  console.log('📦 Exporting Unuploaded Tracks to Knowledge Base')
  console.log('═'.repeat(60))
  console.log('')

  // Read all WAV files
  const wavContent = readFileSync('/tmp/all_sergik_wavs_unique.txt', 'utf-8')
  const fileEntries = wavContent.trim().split('\n').map(line => {
    const [date, filepath] = line.split('|')
    const filename = basename(filepath)
    return { 
      date, 
      filepath, 
      filename, 
      normalized: normalizeFilename(filename),
      ...parseTrackInfo(filename)
    }
  })

  console.log(`Loaded ${fileEntries.length} WAV files from filesystem\n`)

  // Get all tracks from database
  const { data: tracks } = await supabase
    .from('music_library_tracks')
    .select('id, title, file_url')

  console.log(`Found ${tracks?.length || 0} tracks in database\n`)

  // Create normalized title set for matching
  const dbTitles = new Set()
  tracks?.forEach(t => {
    dbTitles.add(normalizeFilename(t.title))
    // Also add without common prefixes
    const withoutPrefix = normalizeFilename(t.title).replace(/^sergik\s*/i, '').trim()
    dbTitles.add(withoutPrefix)
  })

  // Find unmatched files
  const unmatched = []
  const matched = []

  for (const file of fileEntries) {
    let isMatched = false
    
    // Check direct match
    if (dbTitles.has(file.normalized)) {
      isMatched = true
    } else {
      // Check fuzzy match
      for (const dbTitle of dbTitles) {
        if (similarity(file.normalized, dbTitle) > 0.8) {
          isMatched = true
          break
        }
      }
    }

    if (isMatched) {
      matched.push(file)
    } else {
      unmatched.push(file)
    }
  }

  console.log(`Matched to database: ${matched.length}`)
  console.log(`NOT in database: ${unmatched.length}\n`)

  // Sort unmatched by date
  unmatched.sort((a, b) => a.date.localeCompare(b.date))

  // Create knowledge base data
  const kbData = {
    generated_at: new Date().toISOString(),
    total_files_scanned: fileEntries.length,
    matched_to_database: matched.length,
    pending_upload: unmatched.length,
    tracks: unmatched.map(f => ({
      title: f.title,
      artist: f.artist,
      collaborators: f.collaborators,
      version: f.version,
      creation_date: f.date,
      year: parseInt(f.date.split('-')[0]),
      filename: f.filename,
      filepath: f.filepath,
      status: 'pending_upload'
    }))
  }

  // Group by year for summary
  const byYear = {}
  unmatched.forEach(f => {
    const year = f.date.split('-')[0]
    byYear[year] = (byYear[year] || 0) + 1
  })

  // Save to knowledge base
  const kbPath = join(__dirname, '..', '..', 'kb', 'pending-track-uploads.json')
  writeFileSync(kbPath, JSON.stringify(kbData, null, 2))

  console.log('═'.repeat(60))
  console.log('📊 EXPORT SUMMARY')
  console.log('═'.repeat(60))
  console.log(`Total WAV files:        ${fileEntries.length}`)
  console.log(`Already in database:    ${matched.length}`)
  console.log(`Pending upload:         ${unmatched.length}`)
  console.log('')
  console.log('Pending uploads by year:')
  Object.keys(byYear).sort().forEach(year => {
    console.log(`  ${year}: ${byYear[year]}`)
  })
  console.log('')
  console.log(`Knowledge base saved to: ${kbPath}`)
  console.log('═'.repeat(60))

  // Show sample of pending tracks
  console.log('\nSample pending tracks:')
  unmatched.slice(0, 15).forEach(f => {
    console.log(`  ${f.date} | ${f.title}`)
  })
  if (unmatched.length > 15) {
    console.log(`  ... and ${unmatched.length - 15} more`)
  }

  console.log('\n✅ Export complete!')
}

main().catch(console.error)
