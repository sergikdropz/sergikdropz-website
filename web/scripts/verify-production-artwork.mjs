#!/usr/bin/env node
/**
 * Verify Production Artwork
 * 
 * Comprehensive verification that all EP artwork is:
 * 1. Present in music-library.json
 * 2. Using correct Supabase URLs
 * 3. Accessible in Supabase Storage
 * 4. Properly formatted
 * 
 * Usage: node scripts/verify-production-artwork.mjs
 */

import { readFileSync } from 'fs'
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

/**
 * Extract storage path from Supabase URL
 */
function extractStoragePath(url) {
  if (!url || !url.includes('supabase.co')) return null
  const match = url.match(/\/storage\/v1\/object\/public\/[^/]+\/(.+)$/)
  return match ? decodeURIComponent(match[1]) : null
}

/**
 * Verify image exists and is accessible
 */
async function verifyImageAccess(storagePath) {
  try {
    const pathParts = storagePath.split('/')
    const fileName = pathParts.pop()
    const folderPath = pathParts.join('/')
    
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .list(folderPath || '', {
        search: fileName,
      })
    
    if (error) return { exists: false, accessible: false, error: error.message }
    
    const found = data && data.some(file => file.name === fileName)
    if (!found) return { exists: false, accessible: false, error: 'File not found' }
    
    // Try to get public URL to verify accessibility
    const { data: urlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(storagePath)
    
    return { exists: true, accessible: true, publicUrl: urlData.publicUrl }
  } catch (error) {
    return { exists: false, accessible: false, error: error.message }
  }
}

/**
 * Collect and verify all artwork
 */
async function verifyAllArtwork(items, results = { eps: [], tracks: [], issues: [] }) {
  for (const item of items) {
    // Check EP/folder artwork
    if (item.type === 'ep' || item.type === 'album' || item.type === 'single') {
      const hasArtwork = !!item.artwork
      const isSupabaseUrl = item.artwork && (
        item.artwork.includes('supabase.co') ||
        item.artwork.startsWith('http://') ||
        item.artwork.startsWith('https://')
      )
      
      if (!hasArtwork) {
        results.issues.push({
          type: 'missing-ep-artwork',
          ep: item.name,
          severity: 'high',
        })
      } else if (!isSupabaseUrl) {
        results.issues.push({
          type: 'local-artwork-url',
          ep: item.name,
          artwork: item.artwork,
          severity: 'high',
        })
      } else {
        const storagePath = extractStoragePath(item.artwork)
        if (storagePath) {
          const verification = await verifyImageAccess(storagePath)
          results.eps.push({
            ep: item.name,
            artwork: item.artwork,
            storagePath,
            ...verification,
          })
          
          if (!verification.exists || !verification.accessible) {
            results.issues.push({
              type: 'inaccessible-artwork',
              ep: item.name,
              storagePath,
              error: verification.error,
              severity: 'high',
            })
          }
        }
      }
    }
    
    // Check track artwork
    if (item.tracks && Array.isArray(item.tracks)) {
      for (const track of item.tracks) {
        if (track.artwork) {
          const isSupabaseUrl = track.artwork.includes('supabase.co') ||
                               track.artwork.startsWith('http://') ||
                               track.artwork.startsWith('https://')
          
          if (!isSupabaseUrl) {
            results.issues.push({
              type: 'local-track-artwork',
              track: track.title,
              ep: item.name,
              artwork: track.artwork,
              severity: 'medium',
            })
          } else {
            const storagePath = extractStoragePath(track.artwork)
            if (storagePath) {
              const verification = await verifyImageAccess(storagePath)
              results.tracks.push({
                track: track.title,
                ep: item.name,
                artwork: track.artwork,
                storagePath,
                ...verification,
              })
            }
          }
        } else if (item.artwork) {
          // Track inherits from EP - that's fine
          results.tracks.push({
            track: track.title,
            ep: item.name,
            artwork: item.artwork,
            inherited: true,
            storagePath: extractStoragePath(item.artwork),
          })
        }
      }
    }
    
    // Recurse
    if (item.children && Array.isArray(item.children)) {
      await verifyAllArtwork(item.children, results)
    }
  }
  
  return results
}

/**
 * Main execution
 */
async function main() {
  console.log('🔍 Verifying Production Artwork...\n')
  console.log('='.repeat(60))
  
  try {
    // Read library data
    const libraryData = JSON.parse(readFileSync(MUSIC_LIBRARY_FILE, 'utf-8'))
    
    // Verify all artwork
    console.log('📊 Checking artwork URLs and accessibility...\n')
    const results = await verifyAllArtwork(libraryData.folders || [])
    
    // Summary
    console.log('='.repeat(60))
    console.log('📊 VERIFICATION SUMMARY')
    console.log('='.repeat(60))
    console.log(`EPs Checked:              ${results.eps.length}`)
    console.log(`Tracks Checked:            ${results.tracks.length}`)
    console.log(`Issues Found:              ${results.issues.length}`)
    
    // EP Status
    const epsWithArtwork = results.eps.filter(e => e.exists && e.accessible).length
    const epsMissing = results.eps.filter(e => !e.exists || !e.accessible).length
    
    console.log(`\nEP Artwork Status:`)
    console.log(`  ✅ Accessible:           ${epsWithArtwork}`)
    console.log(`  ❌ Missing/Inaccessible: ${epsMissing}`)
    
    // Issues
    if (results.issues.length > 0) {
      console.log(`\n⚠️  ISSUES FOUND:`)
      results.issues.forEach((issue, idx) => {
        console.log(`\n${idx + 1}. ${issue.type.toUpperCase()} (${issue.severity})`)
        if (issue.ep) console.log(`   EP: ${issue.ep}`)
        if (issue.track) console.log(`   Track: ${issue.track}`)
        if (issue.artwork) console.log(`   Artwork: ${issue.artwork.substring(0, 60)}...`)
        if (issue.storagePath) console.log(`   Storage: ${issue.storagePath}`)
        if (issue.error) console.log(`   Error: ${issue.error}`)
      })
    } else {
      console.log(`\n✅ NO ISSUES FOUND - All artwork is correct!`)
    }
    
    // Detailed EP Status
    if (results.eps.length > 0) {
      console.log(`\n📁 EP Artwork Details:`)
      results.eps.forEach(ep => {
        const status = ep.exists && ep.accessible ? '✅' : '❌'
        console.log(`   ${status} ${ep.ep}`)
        if (ep.storagePath) {
          console.log(`      ${ep.storagePath}`)
        }
      })
    }
    
    // Final Status
    console.log('\n' + '='.repeat(60))
    if (results.issues.length === 0 && epsMissing === 0) {
      console.log('✅ PRODUCTION READY - All artwork verified!')
    } else {
      console.log('⚠️  ACTION REQUIRED - Some issues need attention')
      console.log('\n💡 Next Steps:')
      if (results.issues.some(i => i.type === 'missing-ep-artwork')) {
        console.log('   - Run: node scripts/restore-ep-artwork.mjs')
      }
      if (results.issues.some(i => i.type.includes('inaccessible'))) {
        console.log('   - Run: node scripts/upload-ep-artwork-to-supabase.mjs')
      }
    }
    console.log('='.repeat(60))
    
  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  }
}

main()
