#!/usr/bin/env node
/**
 * Ensure All Artwork URLs Are Present
 * 
 * Comprehensive script to ensure all EP and track artwork URLs are:
 * 1. Present in music-library.json
 * 2. Point to correct Supabase URLs
 * 3. Inherited from EP to tracks if missing
 * 4. Protected from being overwritten
 * 
 * Usage: node scripts/ensure-all-artwork.mjs
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
const BUCKET_NAME = 'gallery-images'

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing Supabase environment variables!')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

// EP artwork mapping
const EP_ARTWORK_MAP = {
  'Are We Awake': 'audio/unreleased/eps/SERGIK - Are We Awake/64804719-FCBB-4F62-B570-DC695D1DC699.PNG',
  'Daze': 'audio/unreleased/eps/SERGIK - Daze/89D09194-956E-422F-A040-8A9DEC10C3DD.PNG',
  'In The Streets': 'audio/unreleased/eps/SERGIK - In The Streets/1FF2EF20-92A7-4FF6-8850-6FA3987CAC74.png',
  'Inspire': 'audio/unreleased/eps/SERGIK - Inspire/720426BD-0BE7-4582-A072-2E014DB9E2BC.PNG',
  'Soul Candy': 'audio/unreleased/eps/SERGIK - Soul Candy/57A67CAB-0A23-4AB6-AE83-C840B0E0D3E4.jpeg',
  'FTP': 'audio/unreleased/eps/SERGIK - FTP/4A8196B2-EDF9-4BBF-A685-D754C455A2A0.jpeg',
  'Staying A Vibe': 'audio/unreleased/eps/SERGIK - Staying A Vibe/CD9B1141-992E-405C-B73D-CF3D2A6BF02E.jpeg',
  'Vice & Virtues': 'audio/unreleased/eps/SERGIK - Vice & Virtues/500CD048-AAA0-47EA-8F4F-4ED2A5D18A1E.jpeg',
  'Utopia': 'audio/unreleased/eps/SERGIK - Utopia/IMG_2622.jpeg',
  'The World Dont Stop': 'audio/unreleased/eps/SERGIK - The World Dont Stop/IMG_0289.JPG',
}

function getSupabaseArtworkUrl(epName) {
  const storagePath = EP_ARTWORK_MAP[epName]
  if (!storagePath) return null
  
  const { data } = supabase.storage
    .from(BUCKET_NAME)
    .getPublicUrl(storagePath)
  
  return data.publicUrl
}

/**
 * Recursively ensure all artwork is present and correct
 */
function ensureArtwork(items, stats = { restored: 0, inherited: 0, fixed: 0 }) {
  for (const item of items) {
    // Ensure EP/folder artwork
    if (item.type === 'ep' || item.type === 'album' || item.type === 'single') {
      const epName = item.name.replace(' EP', '').replace(' Album', '').trim()
      const expectedUrl = getSupabaseArtworkUrl(epName)
      
      if (expectedUrl) {
        // Check if artwork is missing or incorrect
        const isSupabaseUrl = item.artwork && (
          item.artwork.includes('supabase.co') ||
          item.artwork.startsWith('http://') ||
          item.artwork.startsWith('https://')
        )
        
        if (!item.artwork || (!isSupabaseUrl && item.artwork !== expectedUrl)) {
          const oldArtwork = item.artwork || '(missing)'
          item.artwork = expectedUrl
          stats.restored++
          console.log(`   ✅ Restored EP artwork: ${item.name}`)
          console.log(`      ${oldArtwork.substring(0, 60)}... → ${expectedUrl.substring(0, 60)}...`)
        }
      }
    }
    
    // Ensure track artwork - inherit from EP if missing
    if (item.tracks && Array.isArray(item.tracks)) {
      for (const track of item.tracks) {
        if (!track.artwork && item.artwork) {
          track.artwork = item.artwork
          stats.inherited++
        } else if (track.artwork && !track.artwork.includes('supabase.co') && !track.artwork.startsWith('http')) {
          // Track has local path - use EP's Supabase URL if available
          if (item.artwork && item.artwork.includes('supabase.co')) {
            track.artwork = item.artwork
            stats.fixed++
          }
        }
      }
    }
    
    // Recurse into children
    if (item.children && Array.isArray(item.children)) {
      ensureArtwork(item.children, stats)
    }
  }
  
  return stats
}

/**
 * Main execution
 */
async function main() {
  console.log('🖼️  Ensuring All Artwork URLs Are Present...\n')
  
  try {
    // Read library data
    const libraryData = JSON.parse(readFileSync(MUSIC_LIBRARY_FILE, 'utf-8'))
    
    // Ensure all artwork
    const stats = ensureArtwork(libraryData.folders || [])
    
    // Write back if changes were made
    if (stats.restored > 0 || stats.inherited > 0 || stats.fixed > 0) {
      writeFileSync(
        MUSIC_LIBRARY_FILE,
        JSON.stringify(libraryData, null, 2) + '\n',
        'utf-8'
      )
      
      console.log('\n' + '='.repeat(60))
      console.log('📊 SUMMARY')
      console.log('='.repeat(60))
      console.log(`EP Artwork Restored:    ${stats.restored}`)
      console.log(`Track Artwork Inherited: ${stats.inherited}`)
      console.log(`Track Artwork Fixed:    ${stats.fixed}`)
      console.log('\n✅ All artwork URLs have been restored!')
    } else {
      console.log('✅ All artwork URLs are already correct!')
    }
    
  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  }
}

main()
