#!/usr/bin/env node

/**
 * Script to fetch full discography from Spotify
 * Uses Spotify Web API to get all albums and singles
 * 
 * Usage:
 *   node scripts/fetch-full-discography.mjs
 * 
 * Requires SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in .env.local
 */

import fetch from 'node-fetch'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const ARTIST_ID = '7MnvMhWoSe4wYXuiI6iQ8H'
const RELEASES_FILE = path.join(__dirname, '../data/releases.json')

// Load environment variables
const envPath = path.join(__dirname, '../.env.local')
let clientId, clientSecret

if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8')
  const envVars = envContent.split('\n').reduce((acc, line) => {
    const [key, ...valueParts] = line.split('=')
    if (key && valueParts.length) {
      acc[key.trim()] = valueParts.join('=').trim()
    }
    return acc
  }, {})
  clientId = envVars.SPOTIFY_CLIENT_ID
  clientSecret = envVars.SPOTIFY_CLIENT_SECRET
} else {
  console.log('⚠️  .env.local not found. Using public oEmbed method instead...')
}

async function getAccessToken() {
  if (!clientId || !clientSecret) {
    return null
  }

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
    },
    body: 'grant_type=client_credentials'
  })

  if (!response.ok) {
    throw new Error(`Failed to get access token: ${response.statusText}`)
  }

  const data = await response.json()
  return data.access_token
}

async function getDiscographyFromAPI(accessToken) {
  const releases = []
  let offset = 0
  const limit = 50

  while (true) {
    const url = `https://api.spotify.com/v1/artists/${ARTIST_ID}/albums?include_groups=album,single,compilation&limit=${limit}&offset=${offset}&market=US`
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch albums: ${response.statusText}`)
    }

    const data = await response.json()
    
    for (const album of data.items) {
      const releaseType = album.album_type === 'single' ? 'Single' : 
                         album.album_type === 'compilation' ? 'Compilation' : 'EP'
      
      releases.push({
        id: album.id,
        title: album.name,
        type: releaseType,
        year: new Date(album.release_date).getFullYear(),
        platforms: ['Spotify', 'Apple Music', 'SoundCloud'],
        spotify_url: album.external_urls.spotify,
        image: album.images[0]?.url || null,
        fetch_from_spotify: true,
        release_date: album.release_date
      })
    }

    if (data.items.length < limit) {
      break
    }
    offset += limit
  }

  return releases
}

async function getArtworkFromOEmbed(spotifyUrl) {
  try {
    const oembedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(spotifyUrl)}`
    const response = await fetch(oembedUrl)
    if (response.ok) {
      const data = await response.json()
      return data.thumbnail_url || null
    }
  } catch (error) {
    console.error(`Failed to get artwork for ${spotifyUrl}:`, error.message)
  }
  return null
}

async function fetchDiscography() {
  console.log('🎵 Fetching SERGIK discography...\n')

  let releases = []

  // Try API method first
  if (clientId && clientSecret) {
    try {
      console.log('📡 Using Spotify Web API...')
      const accessToken = await getAccessToken()
      releases = await getDiscographyFromAPI(accessToken)
      console.log(`✅ Found ${releases.length} releases via API\n`)
    } catch (error) {
      console.log(`⚠️  API method failed: ${error.message}`)
      console.log('📡 Falling back to manual method...\n')
    }
  }

  // If API failed or not configured, provide manual instructions
  if (releases.length === 0) {
    console.log('📋 Manual Method:')
    console.log('1. Visit: https://open.spotify.com/artist/7MnvMhWoSe4wYXuiI6iQ8H/discography/all')
    console.log('2. Copy all album/single URLs')
    console.log('3. Run this script with URLs as arguments, or add them manually to releases.json\n')
    return
  }

  // Sort by release date (newest first)
  releases.sort((a, b) => {
    const dateA = new Date(a.release_date)
    const dateB = new Date(b.release_date)
    return dateB - dateA
  })

  // Generate IDs from titles
  releases = releases.map(release => ({
    ...release,
    id: release.title.toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '-')
      .substring(0, 50),
    release_date: undefined // Remove after sorting
  }))

  // Read existing releases to preserve any custom data
  let existingReleases = []
  if (fs.existsSync(RELEASES_FILE)) {
    const existing = JSON.parse(fs.readFileSync(RELEASES_FILE, 'utf-8'))
    existingReleases = existing.releases || []
  }

  // Merge: keep existing if ID matches, otherwise add new
  const mergedReleases = []
  const existingIds = new Set(existingReleases.map(r => r.id))

  // Add existing releases first
  mergedReleases.push(...existingReleases)

  // Add new releases
  for (const release of releases) {
    if (!existingIds.has(release.id)) {
      mergedReleases.push(release)
      console.log(`➕ Added: ${release.title} (${release.type}, ${release.year})`)
    } else {
      // Update existing release with latest data
      const existing = existingReleases.find(r => r.id === release.id)
      if (existing) {
        const updated = {
          ...existing,
          spotify_url: release.spotify_url,
          image: existing.image || release.image,
          year: release.year
        }
        const index = mergedReleases.findIndex(r => r.id === release.id)
        mergedReleases[index] = updated
        console.log(`🔄 Updated: ${release.title}`)
      }
    }
  }

  // Sort merged releases by year (newest first)
  mergedReleases.sort((a, b) => b.year - a.year)

  // Write to file
  const output = {
    releases: mergedReleases
  }

  fs.writeFileSync(RELEASES_FILE, JSON.stringify(output, null, 2))
  console.log(`\n✅ Saved ${mergedReleases.length} releases to ${RELEASES_FILE}`)
  console.log(`\n📊 Summary:`)
  console.log(`   - EPs: ${mergedReleases.filter(r => r.type === 'EP').length}`)
  console.log(`   - Singles: ${mergedReleases.filter(r => r.type === 'Single').length}`)
  console.log(`   - Remixes: ${mergedReleases.filter(r => r.type === 'Remix').length}`)
  console.log(`   - Other: ${mergedReleases.filter(r => !['EP', 'Single', 'Remix'].includes(r.type)).length}`)
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  fetchDiscography().catch(console.error)
}

export { fetchDiscography }

