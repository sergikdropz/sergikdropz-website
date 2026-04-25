#!/usr/bin/env node

/**
 * Remove duplicate tracks from subfolders of "All Tracks"
 * Ensures subfolders only reference tracks that exist in "All Tracks"
 */

import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const rootDir = join(__dirname, '..', '..')
const dataFile = join(rootDir, 'web', 'data', 'music-library.json')

function removeDuplicatesFromSubfolders() {
  console.log('🔄 Removing duplicate tracks from subfolders of "All Tracks"...\n')

  const data = JSON.parse(readFileSync(dataFile, 'utf8'))
  
  // Find "All Tracks" folder
  const findFolder = (items, id) => {
    for (const item of items) {
      if (item.id === id) return item
      if (item.children) {
        const found = findFolder(item.children, id)
        if (found) return found
      }
    }
    return null
  }

  const discography = data.folders.find(f => f.id === 'folder-discography')
  if (!discography) {
    console.error('❌ Discography folder not found!')
    return
  }

  const allTracks = findFolder(discography.children || [], 'folder-all-tracks')
  if (!allTracks) {
    console.error('❌ "All Tracks" folder not found!')
    return
  }

  // Build set of track IDs in "All Tracks"
  const allTracksTrackIds = new Set()
  if (allTracks.tracks) {
    allTracks.tracks.forEach(track => {
      allTracksTrackIds.add(track.id)
    })
  }

  console.log(`📊 Found ${allTracksTrackIds.size} tracks in "All Tracks"\n`)

  // Process subfolders of "All Tracks"
  let removedCount = 0
  const processFolder = (folder) => {
    if (!folder.children) return

    folder.children.forEach(child => {
      if (child.tracks && Array.isArray(child.tracks)) {
        const originalCount = child.tracks.length
        // Keep only tracks that exist in "All Tracks" (they're references)
        // Remove tracks that don't exist in "All Tracks" (they should be added to All Tracks first)
        child.tracks = child.tracks.filter(track => {
          const existsInAllTracks = allTracksTrackIds.has(track.id)
          if (existsInAllTracks) {
            return true // Keep track (it references All Tracks)
          } else {
            // Track not in All Tracks - should be added to All Tracks first
            console.log(`   ⚠️  Track "${track.title}" in "${child.name}" not found in "All Tracks" - will be removed`)
            return false // Remove track (should be in All Tracks first)
          }
        })
        
        const removed = originalCount - child.tracks.length
        if (removed > 0) {
          removedCount += removed
          console.log(`   ✅ Removed ${removed} duplicate tracks from "${child.name}"`)
        }
      }

      // Process nested children
      if (child.children) {
        processFolder(child)
      }
    })
  }

  processFolder(allTracks)

  if (removedCount > 0) {
    writeFileSync(dataFile, JSON.stringify(data, null, 2), 'utf8')
    console.log(`\n✅ Removed ${removedCount} duplicate tracks from subfolders`)
  } else {
    console.log('\n✅ No duplicate tracks found - all subfolder tracks reference "All Tracks"')
  }

  console.log('\n💡 Next step: Use "Sync" button in /admin/music to sync to database')
}

removeDuplicatesFromSubfolders()
