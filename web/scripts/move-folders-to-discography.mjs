#!/usr/bin/env node

/**
 * Move folders to Discography (instead of under All Tracks)
 * - Moves "Curated ID Playlists" and "SERGIK EP Collection" to be direct children of Discography
 * - "All Tracks" remains as its own folder containing all unique track IDs
 */

import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const dataFile = join(__dirname, '..', 'data', 'music-library.json')

async function moveFoldersToDiscography() {
  console.log('🔄 Moving folders to Discography...\n')

  // Folders to move
  const foldersToMove = [
    'folder-playlists',    // Curated ID Playlists
    'artist-sergik'        // SERGIK EP Collection
  ]

  // Read and parse JSON file
  console.log('📝 Reading music-library.json...')
  const data = JSON.parse(readFileSync(dataFile, 'utf8'))

  const discography = data.folders.find(f => f.id === 'folder-discography')
  if (!discography) {
    console.error('❌ Discography folder not found!')
    return
  }

  // Initialize children array if needed
  if (!discography.children) {
    discography.children = []
  }

  // Find All Tracks folder
  const allTracks = discography.children.find(c => c.id === 'folder-all-tracks')
  if (!allTracks) {
    console.error('❌ "All Tracks" folder not found under Discography!')
    return
  }

  // Move specified folders from All Tracks children to Discography children
  for (const folderId of foldersToMove) {
    if (!allTracks.children) continue

    const folderIndex = allTracks.children.findIndex(f => f.id === folderId)
    if (folderIndex !== -1) {
      // Remove from All Tracks
      const folder = allTracks.children.splice(folderIndex, 1)[0]
      
      // Update parentId
      folder.parentId = 'folder-discography'
      
      // Add to Discography children
      discography.children.push(folder)
      
      console.log(`   ✅ Moved "${folder.name}" from All Tracks to Discography`)
    } else {
      console.log(`   ⚠️  Folder ${folderId} not found in All Tracks children`)
    }
  }

  // Write updated JSON
  writeFileSync(dataFile, JSON.stringify(data, null, 2), 'utf8')
  
  console.log('\n✅ JSON file reorganization complete!')
  console.log('\n📁 New structure:')
  console.log('   Discography/')
  console.log('   ├── All Tracks (playlist of all unique tracks)')
  discography.children.forEach(child => {
    if (child.id !== 'folder-all-tracks') {
      console.log(`   ├── ${child.name}`)
    }
  })
  console.log('\n💡 Database already updated. Refresh the page to see changes.')
}

moveFoldersToDiscography().catch(console.error)
