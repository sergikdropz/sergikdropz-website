#!/usr/bin/env node

/**
 * Reorganizes existing music-library.json to iTunes-style structure:
 * Artist → Album/EP → Tracks
 * Run with: node scripts/reorganize-to-itunes-style.mjs
 */

import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

const INPUT_FILE = join(process.cwd(), 'data', 'music-library.json')
const OUTPUT_FILE = join(process.cwd(), 'data', 'music-library.json')

// Extract primary artist from track artist field
function getPrimaryArtist(artistString) {
  if (!artistString) return 'Unknown Artist'
  
  // If it's a collaboration (contains "x" or "ft." or "feat.")
  if (artistString.match(/\s+(x|ft\.|feat\.|featuring)\s+/i)) {
    // For collaborations, group by the first artist or keep as collaboration
    const parts = artistString.split(/\s+(x|ft\.|feat\.|featuring)\s+/i)
    if (parts[0].trim().toUpperCase() === 'SERGIK') {
      return 'SERGIK'
    }
    // Group collaborations together
    return 'Collaborations'
  }
  
  // Normalize artist name
  const normalized = artistString.trim()
  if (normalized.toUpperCase() === 'SERGIK' || normalized.toUpperCase() === 'SEERGIK') {
    return 'SERGIK'
  }
  
  return normalized || 'Unknown Artist'
}

// Reorganize library to iTunes-style structure
function reorganizeLibrary(data) {
  const artists = {} // Artist folders
  const playlists = [] // Keep playlists separate
  
  // Process all folders and their children
  function processItems(items) {
    items.forEach(item => {
      // Check if this is a playlist
      let isPlaylist = false
      if (item.name && (item.name.toLowerCase().includes('playlist') || 
          (item.tracks && item.tracks.length > 0 && 
           item.tracks[0].file && item.tracks[0].file.includes('/Playlists/')))) {
        isPlaylist = true
      }
      
      // Handle playlists separately
      if (isPlaylist) {
        playlists.push(item)
        return
      }
      
      // For albums/EPs, determine the primary artist from tracks
      let primaryArtist = 'SERGIK' // Default
      
      if (item.tracks && item.tracks.length > 0) {
        // Get the most common artist from tracks
        const artistCounts = {}
        item.tracks.forEach(track => {
          const artist = getPrimaryArtist(track.artist)
          artistCounts[artist] = (artistCounts[artist] || 0) + 1
        })
        
        // Find the artist with most tracks
        if (Object.keys(artistCounts).length > 0) {
          primaryArtist = Object.keys(artistCounts).reduce((a, b) => 
            artistCounts[a] > artistCounts[b] ? a : b
          )
        }
      }
      
      // Create artist folder if it doesn't exist
      if (!artists[primaryArtist]) {
        artists[primaryArtist] = {
          id: `artist-${primaryArtist.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
          name: primaryArtist,
          type: 'folder',
          parentId: null,
          children: []
        }
      }
      
      // Add item to artist's children
      artists[primaryArtist].children.push(item)
    })
  }
  
  // Process all folders
  if (data.folders && Array.isArray(data.folders)) {
    data.folders.forEach(folder => {
      if (folder.children && Array.isArray(folder.children)) {
        processItems(folder.children)
      } else {
        // If folder has tracks directly, treat it as an album
        processItems([folder])
      }
    })
  }
  
  // Convert artists object to array and sort
  const artistFolders = Object.values(artists).sort((a, b) => {
    // SERGIK first, then Collaborations, then alphabetically
    if (a.name === 'SERGIK') return -1
    if (b.name === 'SERGIK') return 1
    if (a.name === 'Collaborations') return -1
    if (b.name === 'Collaborations') return 1
    return a.name.localeCompare(b.name)
  })
  
  // Sort albums/EPs within each artist by year (newest first), then by name
  artistFolders.forEach(artist => {
    if (artist.children) {
      artist.children.sort((a, b) => {
        // Sort by year (newest first)
        if (a.year && b.year && a.year !== b.year) {
          return b.year - a.year
        }
        // Then by name
        return a.name.localeCompare(b.name)
      })
    }
  })
  
  // Add playlists as a separate folder if there are any (after artists)
  const result = [...artistFolders]
  if (playlists.length > 0) {
    result.push({
      id: 'folder-playlists',
      name: 'Curated ID Playlists',
      type: 'folder',
      parentId: null,
      children: playlists.sort((a, b) => {
        // Sort playlists by year (newest first), then by name
        if (a.year && b.year && a.year !== b.year) {
          return b.year - a.year
        }
        return a.name.localeCompare(b.name)
      })
    })
  }
  
  return {
    ...data,
    folders: result
  }
}

// Main function
function reorganize() {
  console.log('🎵 Reorganizing music library to iTunes-style structure...')
  console.log(`📁 Reading: ${INPUT_FILE}`)
  
  try {
    // Read existing library
    const data = JSON.parse(readFileSync(INPUT_FILE, 'utf8'))
    
    console.log(`✅ Found ${data.folders?.length || 0} folders`)
    
    // Count total tracks
    const countTracks = (items) => {
      let count = 0
      items.forEach(item => {
        if (item.tracks) count += item.tracks.length
        if (item.children) count += countTracks(item.children)
      })
      return count
    }
    const totalTracks = countTracks(data.folders || [])
    console.log(`🎶 Found ${totalTracks} tracks`)
    
    // Reorganize
    const reorganized = reorganizeLibrary(data)
    
    // Write back
    writeFileSync(OUTPUT_FILE, JSON.stringify(reorganized, null, 2))
    
    console.log(`\n✅ Successfully reorganized ${OUTPUT_FILE}`)
    console.log(`\n📊 New structure:`)
    console.log(`   - ${reorganized.folders.length} artist folders`)
    
    reorganized.folders.forEach(folder => {
      const albumCount = folder.children?.length || 0
      const trackCount = countTracks(folder.children || [])
      console.log(`   - ${folder.name}: ${albumCount} albums/EPs, ${trackCount} tracks`)
    })
    
    console.log(`\n💡 Library is now organized like iTunes: Artist → Album/EP → Tracks`)
    
  } catch (error) {
    console.error('❌ Error reorganizing library:', error)
    process.exit(1)
  }
}

// Run the reorganization
reorganize()

