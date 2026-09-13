#!/usr/bin/env node
/**
 * Verify EP Artwork in Supabase Storage
 * 
 * Checks if all EP artwork images exist in Supabase Storage
 * and reports any missing files
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
  if (match) {
    return decodeURIComponent(match[1])
  }
  return null
}

/**
 * Verify image exists in Supabase Storage
 */
async function verifyImage(storagePath) {
  try {
    const pathParts = storagePath.split('/')
    const fileName = pathParts.pop()
    const folderPath = pathParts.join('/')
    
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .list(folderPath || '', {
        search: fileName,
      })
    
    if (error) {
      return { exists: false, error: error.message }
    }
    
    const found = data && data.some(file => file.name === fileName)
    return { exists: found, error: null }
  } catch (error) {
    return { exists: false, error: error.message }
  }
}

/**
 * Collect all artwork URLs from library
 */
function collectArtworkUrls(items, urls = new Set()) {
  for (const item of items) {
    if (item.artwork && item.artwork.includes('supabase.co')) {
      urls.add(item.artwork)
    }
    
    if (item.tracks) {
      item.tracks.forEach(track => {
        if (track.artwork && track.artwork.includes('supabase.co')) {
          urls.add(track.artwork)
        }
      })
    }
    
    if (item.children) {
      collectArtworkUrls(item.children, urls)
    }
  }
  
  return urls
}

/**
 * Main execution
 */
async function main() {
  console.log('🔍 Verifying EP Artwork in Supabase Storage...\n')
  
  try {
    // Read library data
    const libraryData = JSON.parse(readFileSync(MUSIC_LIBRARY_FILE, 'utf-8'))
    
    // Collect all artwork URLs
    const artworkUrls = collectArtworkUrls(libraryData.folders || [])
    console.log(`📊 Found ${artworkUrls.size} unique artwork URLs in music-library.json\n`)
    
    // Verify each image
    console.log('🔍 Verifying images in Supabase Storage...\n')
    const results = []
    
    for (const url of artworkUrls) {
      const storagePath = extractStoragePath(url)
      if (!storagePath) {
        results.push({ url, storagePath: null, exists: false, error: 'Could not extract storage path' })
        continue
      }
      
      const { exists, error } = await verifyImage(storagePath)
      results.push({ url, storagePath, exists, error })
      
      if (exists) {
        console.log(`   ✅ ${storagePath}`)
      } else {
        console.log(`   ❌ ${storagePath}${error ? ` - ${error}` : ' (not found)'}`)
      }
    }
    
    // Summary
    const existing = results.filter(r => r.exists).length
    const missing = results.filter(r => !r.exists).length
    
    console.log('\n' + '='.repeat(60))
    console.log('📊 VERIFICATION SUMMARY')
    console.log('='.repeat(60))
    console.log(`Total Artwork URLs:     ${artworkUrls.size}`)
    console.log(`✅ Found in Storage:     ${existing}`)
    console.log(`❌ Missing from Storage: ${missing}`)
    
    if (missing > 0) {
      console.log('\n⚠️  Missing Images:')
      results.filter(r => !r.exists).forEach(r => {
        console.log(`   - ${r.storagePath || r.url}`)
        if (r.error) {
          console.log(`     Error: ${r.error}`)
        }
      })
      console.log('\n💡 Run: node scripts/upload-ep-artwork-to-supabase.mjs')
    } else {
      console.log('\n✅ All artwork images exist in Supabase Storage!')
    }
    
  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  }
}

main()
