#!/usr/bin/env node

/**
 * Scans the audio folder structure and automatically generates music-library.json
 * Run with: node scripts/scan-music-library.mjs
 */

import { readdir, stat, readdirSync, writeFileSync as fsWriteFileSync, mkdirSync } from 'fs'
import { readdir as readdirAsync } from 'fs/promises'
import { join, relative, extname, basename, dirname } from 'path'
import { existsSync } from 'fs'
import { writeFileSync } from 'fs'
import { parseFile } from 'music-metadata'

const AUDIO_DIR = join(process.cwd(), 'public', 'audio')
const OUTPUT_FILE = join(process.cwd(), 'data', 'music-library.json')
const IMAGES_DIR = join(process.cwd(), 'public', 'images', 'artwork')

const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.flac', '.m4a', '.ogg', '.aac']
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif']

// Helper to check if file is audio
function isAudioFile(filename) {
  const ext = extname(filename).toLowerCase()
  return AUDIO_EXTENSIONS.includes(ext)
}

// Helper to check if file is image
function isImageFile(filename) {
  const ext = extname(filename).toLowerCase()
  return IMAGE_EXTENSIONS.includes(ext)
}

// Extract track title from filename
function extractTrackTitle(filename) {
  // Remove extension
  let title = basename(filename, extname(filename))
  // Remove "SERGIK - " prefix if present
  title = title.replace(/^SERGIK\s*[-–]\s*/i, '')
  // Remove "SERGIK x " prefix if present
  title = title.replace(/^SERGIK\s*x\s*/i, '')
  // Clean up extra spaces
  title = title.trim()
  return title || basename(filename, extname(filename))
}

// Extract artist from filename
function extractArtist(filename) {
  const name = basename(filename, extname(filename))
  // Check for "SERGIK x Artist" or "SERGIK - Track" format
  if (name.match(/SERGIK\s*x\s*/i)) {
    const parts = name.split(/SERGIK\s*x\s*/i)
    if (parts.length > 1) {
      return `SERGIK x ${parts[1].split(/[-–]/)[0].trim()}`
    }
  }
  return 'SERGIK'
}

// Ensure images directory exists
function ensureImagesDir() {
  if (!existsSync(IMAGES_DIR)) {
    mkdirSync(IMAGES_DIR, { recursive: true })
  }
}

// Extract artwork from audio file metadata
async function extractArtworkFromMetadata(filePath) {
  try {
    const metadata = await parseFile(filePath)
    
    if (metadata.common.picture && metadata.common.picture.length > 0) {
      // Get the first picture (usually the album art)
      const picture = metadata.common.picture[0]
      
      // Determine file extension from MIME type
      let ext = 'jpg'
      if (picture.format === 'image/png') ext = 'png'
      else if (picture.format === 'image/jpeg' || picture.format === 'image/jpg') ext = 'jpg'
      else if (picture.format === 'image/webp') ext = 'webp'
      else if (picture.format && picture.format.includes('png')) ext = 'png'
      else if (picture.format && picture.format.includes('jpeg')) ext = 'jpg'
      
      // Create a unique filename based on the audio file
      const audioFileName = basename(filePath, extname(filePath))
      const artworkFileName = `${audioFileName.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.${ext}`
      const artworkPath = join(IMAGES_DIR, artworkFileName)
      
      // Ensure the directory exists
      ensureImagesDir()
      
      // Save the artwork (picture.data is a Buffer)
      if (picture.data) {
        fsWriteFileSync(artworkPath, picture.data)
        return `/images/artwork/${artworkFileName}`
      }
    }
  } catch (error) {
    // Silently fail if metadata can't be read - not all files have embedded artwork
  }
  
  return null
}

// Find artwork in same directory (fallback)
function findArtwork(dir, trackName) {
  const files = readdirSync(dir)
  const imageFiles = files.filter(f => isImageFile(f))
  
  // Look for exact match first
  const baseName = basename(trackName, extname(trackName))
  const exactMatch = imageFiles.find(f => 
    basename(f, extname(f)).toLowerCase() === baseName.toLowerCase()
  )
  if (exactMatch) {
    return `/images/${relative(join(process.cwd(), 'public'), join(dir, exactMatch))}`
  }
  
  // Look for any image in directory
  if (imageFiles.length > 0) {
    return `/images/${relative(join(process.cwd(), 'public'), join(dir, imageFiles[0]))}`
  }
  
  return null
}

// Scan directory recursively
async function scanDirectory(dirPath, relativePath = '', parentCategory = '') {
  const items = []
  const entries = await readdirAsync(dirPath, { withFileTypes: true })
  
  // Separate files and directories
  const files = entries.filter(e => e.isFile() && isAudioFile(e.name))
  const subdirs = entries.filter(e => e.isDirectory() && !e.name.startsWith('.'))
  
  // Determine category from path
  let category = parentCategory
  if (relativePath.includes('unreleased/eps') || relativePath.includes('/eps/')) {
    category = 'unreleased-eps'
  } else if (relativePath.includes('unreleased/singles') || relativePath.includes('/singles/')) {
    category = 'unreleased-singles'
  } else if (relativePath.includes('unreleased/remixes') || relativePath.includes('/remixes/')) {
    category = 'exclusive-remixes'
  } else if (relativePath.includes('demos')) {
    category = 'demos'
  } else if (relativePath.includes('live-sessions')) {
    category = 'live-sessions'
  } else if (relativePath.includes('studio-takes')) {
    category = 'studio-takes'
  } else if (relativePath.includes('collaborations')) {
    category = 'collaborations'
  } else if (relativePath.includes('Playlists') || relativePath.includes('playlists')) {
    category = 'playlists'
  }
  
  // If this directory has audio files directly, create a collection
  if (files.length > 0) {
    // Process files in parallel to extract metadata
    console.log(`   📂 Processing ${files.length} files in ${basename(dirPath)}...`)
    const tracks = await Promise.all(files.map(async (file, index) => {
      const filePath = join(dirPath, file.name)
      const webPath = `/audio/${relativePath}${file.name}`
      
      let trackTitle = extractTrackTitle(file.name)
      let artist = extractArtist(file.name)
      let duration = 0
      let artwork = null
      
      try {
        // Extract metadata from audio file
        const metadata = await parseFile(filePath)
        
        // Use metadata if available
        if (metadata.common.title) {
          trackTitle = metadata.common.title
        }
        if (metadata.common.artist) {
          artist = metadata.common.artist
        }
        if (metadata.format.duration) {
          duration = Math.round(metadata.format.duration)
        }
        
        // Extract artwork from metadata first
        artwork = await extractArtworkFromMetadata(filePath)
        if (artwork) {
          process.stdout.write(`   ✅ Extracted artwork from ${file.name}\n`)
        }
      } catch (error) {
        // If metadata extraction fails, use filename-based extraction
        // Silently continue - not all files have metadata
      }
      
      // Fallback to directory artwork if no metadata artwork
      if (!artwork) {
        artwork = findArtwork(dirPath, file.name)
      }
      
      return {
        id: `track-${relativePath.replace(/\//g, '-')}${basename(file.name, extname(file.name)).toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
        title: trackTitle,
        artist: artist,
        duration: duration,
        file: webPath,
        ...(artwork && { artwork })
      }
    }))
    
    // Determine type based on folder name and path
    const folderName = basename(dirPath)
    let type = 'album'
    if (relativePath.includes('/eps/') || folderName.toLowerCase().includes('ep')) {
      type = 'ep'
    } else if (relativePath.includes('/singles/') || folderName.toLowerCase().includes('single')) {
      type = 'single'
    } else if (relativePath.includes('/remixes/') || folderName.toLowerCase().includes('remix')) {
      type = 'remix'
    } else if (relativePath.includes('demos') || folderName.toLowerCase().includes('demo')) {
      type = 'album'
    }
    
    // Extract year from folder name if present, or from track metadata
    let year = new Date().getFullYear()
    const yearMatch = folderName.match(/\b(20\d{2})\b/)
    if (yearMatch) {
      year = parseInt(yearMatch[1])
    } else if (tracks.length > 0) {
      // Try to get year from first track's metadata (if we had it)
      // For now, use folder name or default
    }
    
    // Find artwork for the collection - prefer artwork from first track
    let collectionArtwork = null
    if (tracks.length > 0 && tracks[0].artwork) {
      collectionArtwork = tracks[0].artwork
    } else {
      collectionArtwork = findArtwork(dirPath, '')
    }
    
    items.push({
      id: `collection-${relativePath.replace(/\//g, '-').toLowerCase().replace(/[^a-z0-9-]/g, '-')}`,
      name: folderName,
      type: type,
      year: year,
      category: category,
      ...(collectionArtwork && { artwork: collectionArtwork }),
      tracks: tracks
    })
  }
  
  // Scan subdirectories
  for (const subdir of subdirs) {
    const subdirPath = join(dirPath, subdir.name)
    const subRelativePath = relativePath ? `${relativePath}${subdir.name}/` : `${subdir.name}/`
    const subItems = await scanDirectory(subdirPath, subRelativePath, category)
    items.push(...subItems)
  }
  
  return items
}

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

// Organize items into iTunes-style structure: Artist → Album/EP → Tracks
function organizeIntoFolders(items) {
  const artists = {} // Artist folders
  const playlists = [] // Keep playlists separate
  
  items.forEach(item => {
    // Check if this is a playlist
    let isPlaylist = false
    if (item.tracks && item.tracks.length > 0) {
      const firstTrackPath = item.tracks[0].file || ''
      if (firstTrackPath.includes('/Playlists/') || firstTrackPath.includes('/playlists/')) {
        isPlaylist = true
      }
    }
    
    // Handle playlists separately
    if (isPlaylist) {
      const { category: _, ...itemWithoutCategory } = item
      playlists.push(itemWithoutCategory)
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
      primaryArtist = Object.keys(artistCounts).reduce((a, b) => 
        artistCounts[a] > artistCounts[b] ? a : b
      )
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
    
    // Remove category from item before adding
    const { category: _, ...itemWithoutCategory } = item
    artists[primaryArtist].children.push(itemWithoutCategory)
  })
  
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
  
  // Add playlists as a separate folder if there are any
  const result = [...artistFolders]
  if (playlists.length > 0) {
    result.push({
      id: 'folder-playlists',
      name: 'Curated ID Playlists',
      type: 'folder',
      parentId: null,
      children: playlists
    })
  }
  
  return result
}

// Main scan function
async function scanMusicLibrary() {
  console.log('🎵 Scanning music library...')
  console.log(`📁 Scanning: ${AUDIO_DIR}`)
  
  if (!existsSync(AUDIO_DIR)) {
    console.error(`❌ Audio directory not found: ${AUDIO_DIR}`)
    process.exit(1)
  }
  
  // Ensure images directory exists
  ensureImagesDir()
  
  try {
    // Scan all directories
    const allItems = await scanDirectory(AUDIO_DIR)
    
    console.log(`✅ Found ${allItems.length} collections`)
    
    // Count total tracks
    const totalTracks = allItems.reduce((sum, item) => sum + (item.tracks?.length || 0), 0)
    console.log(`🎶 Found ${totalTracks} tracks`)
    
    // Organize into folder structure
    const folders = organizeIntoFolders(allItems)
    
    // Create output structure
    const output = {
      description: "Unreleased music vault - exclusive tracks not available on streaming services",
      folders: folders,
      playlists: [
        {
          id: "playlist-vault-favorites",
          name: "Vault Favorites",
          description: "Curated selection of exclusive unreleased tracks",
          trackIds: [],
          createdAt: new Date().toISOString()
        }
      ]
    }
    
    // Write to file
    writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2))
    
    console.log(`\n✅ Successfully generated ${OUTPUT_FILE}`)
    console.log(`\n📊 Summary:`)
    console.log(`   - ${folders.length} folders`)
    console.log(`   - ${totalTracks} tracks`)
    
    // Count tracks with artwork
    const tracksWithArtwork = allItems.reduce((sum, item) => {
      return sum + (item.tracks?.filter(t => t.artwork).length || 0)
    }, 0)
    console.log(`   - ${tracksWithArtwork} tracks with artwork`)
    
    console.log(`\n💡 Artwork extracted from iTunes metadata and saved to /public/images/artwork/`)
    
  } catch (error) {
    console.error('❌ Error scanning library:', error)
    process.exit(1)
  }
}

// Run the scan
scanMusicLibrary()


