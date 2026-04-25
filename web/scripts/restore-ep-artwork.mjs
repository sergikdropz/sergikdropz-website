#!/usr/bin/env node
/**
 * Restore EP Artwork URLs
 * 
 * Verifies and restores EP artwork URLs in music-library.json
 * Ensures all EP artwork points to correct Supabase Storage URLs
 * 
 * Usage: node scripts/restore-ep-artwork.mjs [--verify-only]
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

const VERIFY_ONLY = process.argv.includes('--verify-only')
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const MUSIC_LIBRARY_FILE = join(__dirname, '..', 'data', 'music-library.json')
const BUCKET_NAME = 'gallery-images'

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

// EP artwork mapping - known EP artwork files
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

/**
 * Get Supabase URL for EP artwork
 */
function getSupabaseArtworkUrl(epName) {
  const storagePath = EP_ARTWORK_MAP[epName]
  if (!storagePath) return null
  
  const { data } = supabase.storage
    .from(BUCKET_NAME)
    .getPublicUrl(storagePath)
  
  return data.publicUrl
}

/**
 * Verify image exists in Supabase Storage
 */
async function verifyImageExists(storagePath) {
  try {
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .list(dirname(storagePath), {
        search: basename(storagePath),
      })
    
    if (error) {
      console.warn(`   ⚠️  Error checking: ${storagePath} - ${error.message}`)
      return false
    }
    
    return data && data.length > 0
  } catch (error) {
    console.warn(`   ⚠️  Error verifying: ${storagePath} - ${error.message}`)
    return false
  }
}

function basename(path) {
  return path.split('/').pop()
}

/**
 * Recursively restore artwork URLs
 */
async function restoreArtwork(items, changes = [], missing = []) {
  for (const item of items) {
    // Process EP/folder artwork
    if (item.type === 'ep' || item.type === 'album' || item.type === 'single') {
      const epName = item.name.replace(' EP', '').replace(' Album', '').trim()
      const expectedUrl = getSupabaseArtworkUrl(epName)
      
      if (expectedUrl) {
        // Verify image exists in storage
        const storagePath = EP_ARTWORK_MAP[epName]
        const exists = await verifyImageExists(storagePath)
        
        if (!exists) {
          missing.push({
            ep: item.name,
            path: storagePath,
            expectedUrl,
          })
        }
        
        // Check if artwork needs to be restored
        if (!item.artwork || 
            item.artwork !== expectedUrl ||
            (!item.artwork.includes('supabase.co') && !item.artwork.startsWith('http'))) {
          
          if (!VERIFY_ONLY) {
            const oldArtwork = item.artwork || '(missing)'
            item.artwork = expectedUrl
            changes.push({
              type: 'ep-artwork',
              ep: item.name,
              from: oldArtwork,
              to: expectedUrl,
              verified: exists,
            })
          } else {
            if (!item.artwork || item.artwork !== expectedUrl) {
              changes.push({
                type: 'ep-artwork',
                ep: item.name,
                current: item.artwork || '(missing)',
                expected: expectedUrl,
                verified: exists,
              })
            }
          }
        }
      }
    }
    
    // Process track artwork - inherit from EP if missing
    if (item.tracks && Array.isArray(item.tracks)) {
      for (const track of item.tracks) {
        if (!track.artwork && item.artwork) {
          if (!VERIFY_ONLY) {
            track.artwork = item.artwork
            changes.push({
              type: 'track-artwork',
              track: track.title,
              from: '(missing)',
              to: item.artwork,
            })
          } else {
            changes.push({
              type: 'track-artwork',
              track: track.title,
              current: '(missing)',
              expected: item.artwork,
            })
          }
        } else if (track.artwork && !track.artwork.includes('supabase.co') && !track.artwork.startsWith('http')) {
          // Track has local path but EP has Supabase URL - use EP's URL
          if (item.artwork && item.artwork.includes('supabase.co')) {
            if (!VERIFY_ONLY) {
              const oldArtwork = track.artwork
              track.artwork = item.artwork
              changes.push({
                type: 'track-artwork',
                track: track.title,
                from: oldArtwork,
                to: item.artwork,
              })
            } else {
              changes.push({
                type: 'track-artwork',
                track: track.title,
                current: track.artwork,
                expected: item.artwork,
              })
            }
          }
        }
      }
    }
    
    // Recurse into children
    if (item.children && Array.isArray(item.children)) {
      await restoreArtwork(item.children, changes, missing)
    }
  }
  
  return { changes, missing }
}

/**
 * Main execution
 */
async function main() {
  console.log('🖼️  Restoring EP Artwork URLs in music-library.json...\n')
  
  if (VERIFY_ONLY) {
    console.log('🔍 VERIFY ONLY MODE - No changes will be made\n')
  }
  
  try {
    // Read library data
    const libraryData = JSON.parse(readFileSync(MUSIC_LIBRARY_FILE, 'utf-8'))
    
    // Restore artwork URLs
    const { changes, missing } = await restoreArtwork(libraryData.folders || [])
    
    // Write back if not verify-only
    if (!VERIFY_ONLY && changes.length > 0) {
      writeFileSync(
        MUSIC_LIBRARY_FILE,
        JSON.stringify(libraryData, null, 2) + '\n',
        'utf-8'
      )
      console.log(`✅ Restored ${changes.length} artwork URLs`)
    } else if (VERIFY_ONLY) {
      console.log(`🔍 Found ${changes.length} items that need restoration`)
    } else {
      console.log(`✅ All artwork URLs are correct`)
    }
    
    if (changes.length > 0) {
      console.log('\n   Changes:')
      changes.slice(0, 20).forEach(change => {
        const status = change.verified === false ? ' ⚠️ (not in storage)' : ''
        console.log(`   - ${change.type}: ${change.ep || change.track}${status}`)
        if (change.from && change.to) {
          console.log(`     ${change.from.substring(0, 60)}... → ${change.to.substring(0, 60)}...`)
        } else if (change.current && change.expected) {
          console.log(`     Current: ${change.current.substring(0, 60)}...`)
          console.log(`     Expected: ${change.expected.substring(0, 60)}...`)
        }
      })
      if (changes.length > 20) {
        console.log(`   ... and ${changes.length - 20} more`)
      }
    }
    
    if (missing.length > 0) {
      console.log('\n⚠️  Images missing from Supabase Storage:')
      missing.forEach(item => {
        console.log(`   - ${item.ep}: ${item.path}`)
      })
      console.log('\n💡 Run: node scripts/upload-ep-artwork-to-supabase.mjs')
    }
    
  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  }
}

main()
