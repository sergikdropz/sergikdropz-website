#!/usr/bin/env node
/**
 * Fix Image Paths Script
 * 
 * Updates image paths in music-library.json to use Supabase Storage URLs
 * for images that are too large to deploy to Vercel.
 * 
 * Usage: node scripts/fix-image-paths.mjs [--use-supabase]
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

const USE_SUPABASE = process.argv.includes('--use-supabase')
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const MUSIC_LIBRARY_FILE = join(__dirname, '..', 'data', 'music-library.json')

let supabase = null
if (USE_SUPABASE && SUPABASE_URL && SUPABASE_SERVICE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

/**
 * Get Supabase Storage URL for image
 */
function getImageStorageUrl(imagePath) {
  if (!supabase || !imagePath) return null
  
  // Remove leading /images/ or /public/images/
  let storagePath = imagePath
    .replace(/^\/images\//, '')
    .replace(/^\/public\/images\//, '')
    .replace(/^\//, '')
  
  // Check if it's in the excluded directory
  if (storagePath.startsWith('audio/unreleased/eps/')) {
    // These are in Supabase Storage (if uploaded)
    const { data } = supabase.storage
      .from('gallery-images') // Or 'audio-images' bucket if you have one
      .getPublicUrl(storagePath)
    return data.publicUrl
  }
  
  return null
}

/**
 * Recursively update image paths in library data
 */
function updateImagePaths(items, changes = []) {
  for (const item of items) {
    // Update artwork on folder/album/ep
    if (item.artwork) {
      const originalPath = item.artwork
      let newPath = originalPath
      
      // Skip if already a Supabase URL (don't process URLs that are already correct)
      const isAlreadySupabaseUrl = originalPath.startsWith('http://') || 
                                   originalPath.startsWith('https://') ||
                                   originalPath.includes('supabase.co')
      
      if (isAlreadySupabaseUrl) {
        // Already a Supabase URL - keep it as-is
        newPath = originalPath
      } else if (originalPath.includes('/audio/unreleased/eps/')) {
        // Check if this is an excluded image (large EP artwork)
        if (USE_SUPABASE && supabase) {
          const supabaseUrl = getImageStorageUrl(originalPath)
          if (supabaseUrl) {
            newPath = supabaseUrl
            changes.push({
              type: 'artwork',
              item: item.name,
              from: originalPath,
              to: newPath,
            })
          }
        } else {
          // For now, keep local path but note it will 404 in production
          console.warn(`   ⚠️  Large image will 404 in production: ${originalPath}`)
        }
      }
      
      item.artwork = newPath
    }
    
    // Update artwork on tracks
    if (item.tracks) {
      item.tracks.forEach(track => {
        if (track.artwork) {
          const originalPath = track.artwork
          let newPath = originalPath
          
          // Skip if already a Supabase URL (don't process URLs that are already correct)
          const isAlreadySupabaseUrl = originalPath.startsWith('http://') || 
                                       originalPath.startsWith('https://') ||
                                       originalPath.includes('supabase.co')
          
          if (isAlreadySupabaseUrl) {
            // Already a Supabase URL - keep it as-is
            newPath = originalPath
          } else if (originalPath.includes('/audio/unreleased/eps/')) {
            if (USE_SUPABASE && supabase) {
              const supabaseUrl = getImageStorageUrl(originalPath)
              if (supabaseUrl) {
                newPath = supabaseUrl
                changes.push({
                  type: 'track-artwork',
                  item: track.title,
                  from: originalPath,
                  to: newPath,
                })
              }
            } else {
              console.warn(`   ⚠️  Large image will 404 in production: ${originalPath}`)
            }
          }
          
          track.artwork = newPath
        }
      })
    }
    
    // Recurse into children
    if (item.children) {
      updateImagePaths(item.children, changes)
    }
  }
  
  return changes
}

/**
 * Main execution
 */
async function main() {
  console.log('🖼️  Fixing image paths in music-library.json...\n')
  
  if (USE_SUPABASE) {
    if (!supabase) {
      console.error('❌ Supabase not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
      process.exit(1)
    }
    console.log('   Using Supabase Storage for large images\n')
  } else {
    console.log('   Note: Large images will still 404 in production.')
    console.log('   Run with --use-supabase to use Supabase Storage URLs\n')
  }
  
  try {
    // Read library data
    const libraryData = JSON.parse(readFileSync(MUSIC_LIBRARY_FILE, 'utf-8'))
    
    // Update image paths
    const changes = updateImagePaths(libraryData.folders || [])
    
    // Write back
    writeFileSync(
      MUSIC_LIBRARY_FILE,
      JSON.stringify(libraryData, null, 2) + '\n',
      'utf-8'
    )
    
    console.log(`✅ Updated ${changes.length} image paths`)
    if (changes.length > 0) {
      console.log('\n   Changes:')
      changes.slice(0, 10).forEach(change => {
        console.log(`   - ${change.type}: ${change.item}`)
        console.log(`     ${change.from} → ${change.to || '(kept local)'}`)
      })
      if (changes.length > 10) {
        console.log(`   ... and ${changes.length - 10} more`)
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  }
}

main()
