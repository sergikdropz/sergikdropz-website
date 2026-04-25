#!/usr/bin/env node

/**
 * Parse music-library.json, deduplicate tracks, and output clean data
 * for restoring the database without redundant copies.
 * 
 * Strategy:
 * - EP tracks go into their EP folder (identified by "eps-" in track ID)
 * - Non-EP tracks go into the genre folder encoded in their track ID
 * - No "All Tracks" / "All Collabs" / empty org folders
 * - No cross-genre duplicates (each track appears in exactly one folder)
 */

import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const dataPath = join(__dirname, '..', 'data', 'music-library.json')
const jsonData = JSON.parse(readFileSync(dataPath, 'utf8'))

const root = jsonData.folders[0] // folder-discography
const allTracksFolder = root.children.find(c => c.id === 'folder-all-tracks')
const playlistsFolder = root.children.find(c => c.id === 'folder-playlists')
const epsFolder = root.children.find(c => c.id === 'artist-sergik')

// EP folder ID mapping from track ID patterns
const epPatternToFolder = {
  'SERGIK - Are We Awake': 'collection-unreleased-eps-sergik---are-we-awake-',
  'SERGIK - Daze': 'collection-unreleased-eps-sergik---daze-',
  'SERGIK - In The Streets': 'collection-unreleased-eps-sergik---in-the-streets-',
  'SERGIK - Inspire': 'collection-unreleased-eps-sergik---inspire-',
  'SERGIK - Soul Candy': 'collection-unreleased-eps-sergik---soul-candy-',
  'SERGIK - Staying A Vibe': 'collection-unreleased-eps-sergik---staying-a-vibe-',
  'SERGIK - The World Dont Stop': 'collection-unreleased-eps-sergik---the-world-dont-stop-',
  'SERGIK - Utopia': 'collection-unreleased-eps-sergik---utopia-',
  'SERGIK - Vice & Virtues': 'collection-unreleased-eps-sergik---vice---virtues-',
  'SERGIK - FTP': 'collection-unreleased-eps-sergik---ftp-',
}

// Genre folder ID mapping from track ID patterns
const genrePatternToFolder = {
  'Playlists-Deep n Funky': 'collection-unreleased-playlists-deep-n-funky-',
  'Playlists-Experimental : Free Form Bass': 'collection-unreleased-playlists-experimental---free-form-bass-',
  'Playlists-Feelin Sendy': 'collection-unreleased-playlists-feelin-sendy-',
  'Playlists-Funktioneers': 'collection-unreleased-playlists-funktioneers-',
  'Playlists-Hip Hop': 'collection-unreleased-playlists-hip-hop-',
  'Playlists-Party Time': 'collection-unreleased-playlists-party-time-',
  'Playlists-Reggae': 'collection-unreleased-playlists-reggae-',
}

function getTargetFolder(trackId) {
  // Check EP patterns first
  if (trackId.includes('eps-')) {
    for (const [pattern, folderId] of Object.entries(epPatternToFolder)) {
      if (trackId.includes(`eps-${pattern}-`)) {
        return folderId
      }
    }
  }
  // Check genre patterns
  for (const [pattern, folderId] of Object.entries(genrePatternToFolder)) {
    if (trackId.includes(pattern)) {
      return folderId
    }
  }
  return null
}

// Build folders list (only EPs + genre folders, no org/structural folders)
const folders = []

// Add EP folders
for (const ep of epsFolder.children) {
  if (ep.tracks?.length === 0 && ep.name === 'BATT x SERG') continue // Skip empty EP
  folders.push({
    id: ep.id,
    name: ep.name,
    type: ep.type,
    parent_id: null,
    hidden: ep.hidden || false,
    artwork_url: ep.artwork || null,
    year: ep.year || null,
  })
}

// Add genre/playlist folders
for (const genre of playlistsFolder.children) {
  folders.push({
    id: genre.id,
    name: genre.name,
    type: genre.type === 'ep' ? 'album' : genre.type, // Deep n Funky was incorrectly typed as 'ep'
    parent_id: null,
    hidden: genre.hidden || false,
    artwork_url: genre.artwork || null,
    year: genre.year || null,
  })
}

// Process tracks from "All Tracks" — assign each to one folder
const tracks = []
const seenTitles = new Set()

for (const track of allTracksFolder.tracks) {
  const targetFolder = getTargetFolder(track.id)
  if (!targetFolder) {
    console.warn('No folder match for:', track.id, '|', track.title)
    continue
  }

  // Deduplicate by title (keep first occurrence)
  if (seenTitles.has(track.title)) {
    continue
  }
  seenTitles.add(track.title)

  const trackId = `${track.id}-in-${targetFolder}`
  tracks.push({
    id: trackId,
    folder_id: targetFolder,
    title: track.title,
    artist: track.artist || 'SERGIK',
    duration: track.duration || null,
    file_url: track.file,
    artwork_url: track.artwork || null,
    bpm: track.bpm || null,
    key_signature: track.key_signature || null,
    energy_level: track.energy_level || null,
    danceability: track.danceability || null,
    sonic_dna: track.sonic_dna || null,
    waveform: track.waveform || null,
  })
}

// Count stats
const epTrackCount = tracks.filter(t => folders.find(f => f.id === t.folder_id && f.type === 'ep')).length
const genreTrackCount = tracks.filter(t => folders.find(f => f.id === t.folder_id && f.type === 'album')).length

console.log({
  totalFolders: folders.length,
  epFolders: folders.filter(f => f.type === 'ep').length,
  genreFolders: folders.filter(f => f.type === 'album').length,
  totalTracks: tracks.length,
  epTracks: epTrackCount,
  genreTracks: genreTrackCount,
  uniqueTitles: seenTitles.size,
})

// Show per-folder breakdown
console.log('\nPer-folder track counts:')
for (const f of folders) {
  const count = tracks.filter(t => t.folder_id === f.id).length
  console.log(`  ${f.name} (${f.type}): ${count} tracks`)
}

writeFileSync(
  join(__dirname, '..', 'data', 'restore-data.json'),
  JSON.stringify({ folders, tracks }, null, 2)
)
console.log(`\nWrote restore-data.json`)
