#!/usr/bin/env node

/**
 * Adds an "All Tracks" folder under Discography containing all tracks from the library
 * Run with: node scripts/add-all-tracks-folder.mjs
 */

import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

const DATA_FILE = join(process.cwd(), 'data', 'music-library.json')

console.log('📂 Adding "All Tracks" folder to Discography...')
console.log(`📁 Reading: ${DATA_FILE}`)

// Read the current structure
const data = JSON.parse(readFileSync(DATA_FILE, 'utf8'))

// Recursively collect all tracks from the entire library structure
function collectAllTracks(items) {
  const allTracks = []
  
  function extractTracks(items) {
    if (!items || !Array.isArray(items)) return
    
    items.forEach(item => {
      // Collect tracks directly in this item
      if (item.tracks && Array.isArray(item.tracks)) {
        allTracks.push(...item.tracks)
      }
      
      // Recursively process children
      if (item.children && Array.isArray(item.children)) {
        extractTracks(item.children)
      }
    })
  }
  
  extractTracks(items)
  return allTracks
}

// Find Discography folder (could be at root or under hidden father folder)
function findDiscography(items) {
  for (const item of items) {
    if (item.id === 'folder-discography' && item.name === 'Discography') {
      return item
    }
    if (item.children && Array.isArray(item.children)) {
      const found = findDiscography(item.children)
      if (found) return found
    }
  }
  return null
}

// Collect all tracks from the entire library
const allTracks = collectAllTracks(data.folders)
console.log(`📊 Found ${allTracks.length} tracks in the library`)

if (allTracks.length === 0) {
  console.warn('⚠️  No tracks found in the library. Skipping "All Tracks" folder creation.')
  process.exit(0)
}

// Find Discography folder
const discographyFolder = findDiscography(data.folders)

if (!discographyFolder) {
  console.error('❌ Discography folder not found!')
  process.exit(1)
}

// Check if "All Tracks" folder already exists
const existingAllTracks = discographyFolder.children?.find(
  child => child.id === 'folder-all-tracks' || child.name === 'All Tracks'
)

if (existingAllTracks) {
  console.log('🔄 "All Tracks" folder already exists. Updating tracks...')
  existingAllTracks.tracks = allTracks
  console.log(`✅ Updated "All Tracks" folder with ${allTracks.length} tracks`)
} else {
  // Create "All Tracks" folder
  const allTracksFolder = {
    id: 'folder-all-tracks',
    name: 'All Tracks',
    type: 'folder',
    parentId: discographyFolder.id,
    tracks: allTracks,
    children: []
  }
  
  // Initialize children array if it doesn't exist
  if (!discographyFolder.children) {
    discographyFolder.children = []
  }
  
  // Add "All Tracks" as the first child (before other folders)
  discographyFolder.children.unshift(allTracksFolder)
  console.log('✅ Created "All Tracks" folder')
}

// Write back to file
writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8')

console.log(`✅ Successfully added/updated "All Tracks" folder with ${allTracks.length} tracks`)
console.log(`\n📊 Structure:`)
console.log(`   Discography`)
console.log(`   ├── All Tracks (${allTracks.length} tracks)`)
if (discographyFolder.children && discographyFolder.children.length > 1) {
  discographyFolder.children.slice(1).forEach((child, index) => {
    const isLast = index === discographyFolder.children.length - 2
    console.log(`   ${isLast ? '└' : '├'}── ${child.name}`)
  })
}
console.log(`\n💾 Saved to: ${DATA_FILE}`)
