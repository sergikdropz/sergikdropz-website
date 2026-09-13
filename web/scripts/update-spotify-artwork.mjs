#!/usr/bin/env node
/**
 * Script to update releases.json with valid Spotify artwork URLs
 * Uses Spotify's oEmbed API to fetch artwork for each release
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import https from 'https'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const releasesFile = path.join(__dirname, '../data/releases.json')

// Function to fetch artwork from Spotify oEmbed API
function fetchSpotifyArtwork(spotifyUrl) {
  return new Promise((resolve, reject) => {
    // Only fetch for album/track URLs, not artist pages
    if (!spotifyUrl.includes('/album/') && !spotifyUrl.includes('/track/')) {
      resolve(null)
      return
    }

    const oembedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(spotifyUrl)}`
    
    https.get(oembedUrl, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try {
          if (res.statusCode === 200) {
            const json = JSON.parse(data)
            // Extract the image URL and convert to i.scdn.co format if possible
            const thumbnailUrl = json.thumbnail_url
            if (thumbnailUrl) {
              // Convert invalid CDN URLs to i.scdn.co format
              // Extract the image hash from the URL
              let validUrl = thumbnailUrl
              
              // If it's an invalid CDN URL, extract the hash and convert to i.scdn.co
              const invalidCdnMatch = thumbnailUrl.match(/image-cdn-[a-z]+\.spotifycdn\.com\/image\/([a-f0-9]+)/i)
              if (invalidCdnMatch) {
                const imageHash = invalidCdnMatch[1]
                validUrl = `https://i.scdn.co/image/${imageHash}`
              } else if (thumbnailUrl.includes('i.scdn.co')) {
                // Already in correct format
                validUrl = thumbnailUrl
              } else {
                // Try to extract hash from any Spotify URL format
                const hashMatch = thumbnailUrl.match(/([a-f0-9]{40})/i)
                if (hashMatch) {
                  validUrl = `https://i.scdn.co/image/${hashMatch[1]}`
                }
              }
              
              resolve(validUrl)
            } else {
              resolve(null)
            }
          } else {
            console.warn(`  ⚠️  oEmbed API returned status ${res.statusCode} for ${spotifyUrl}`)
            resolve(null)
          }
        } catch (e) {
          console.warn(`  ⚠️  Failed to parse response for ${spotifyUrl}:`, e.message)
          resolve(null)
        }
      })
    }).on('error', (err) => {
      console.warn(`  ⚠️  Network error fetching ${spotifyUrl}:`, err.message)
      resolve(null)
    })
  })
}

// Function to check if URL is invalid Spotify CDN
function isValidSpotifyUrl(url) {
  if (!url) return false
  const invalidPatterns = ['image-cdn-fa.spotifycdn.com', 'image-cdn-ak.spotifycdn.com']
  return !invalidPatterns.some(pattern => url.includes(pattern))
}

async function updateArtwork() {
  console.log('🎨 Updating Spotify artwork for all releases...\n')

  // Read releases.json
  const releasesData = JSON.parse(fs.readFileSync(releasesFile, 'utf8'))
  const releases = releasesData.releases

  let updated = 0
  let skipped = 0
  let failed = 0

  for (const release of releases) {
    console.log(`📀 Processing: ${release.title} (${release.type})`)
    
    // Skip if no Spotify URL
    if (!release.spotify_url) {
      console.log(`  ⏭️  No Spotify URL, skipping\n`)
      skipped++
      continue
    }

    // Skip if it's an artist page (can't get specific artwork)
    if (release.spotify_url.includes('/artist/') && !release.spotify_url.includes('/album/') && !release.spotify_url.includes('/track/')) {
      console.log(`  ⏭️  Artist page URL, skipping (need album/track URL)\n`)
      skipped++
      continue
    }

    // Check if current image is invalid
    const needsUpdate = !isValidSpotifyUrl(release.image)

    if (needsUpdate || release.fetch_from_spotify) {
      console.log(`  🔍 Fetching artwork from Spotify...`)
      const artworkUrl = await fetchSpotifyArtwork(release.spotify_url)
      
      if (artworkUrl && isValidSpotifyUrl(artworkUrl)) {
        release.image = artworkUrl
        release.fetch_from_spotify = true
        console.log(`  ✅ Updated: ${artworkUrl.substring(0, 60)}...\n`)
        updated++
      } else if (artworkUrl && !isValidSpotifyUrl(artworkUrl)) {
        console.log(`  ⚠️  Got invalid CDN URL, setting to null\n`)
        release.image = null
        failed++
      } else {
        console.log(`  ❌ Failed to fetch artwork\n`)
        // Keep existing image if it's valid, otherwise set to null
        if (!isValidSpotifyUrl(release.image)) {
          release.image = null
        }
        failed++
      }
    } else {
      console.log(`  ✓ Already has valid artwork\n`)
      skipped++
    }

    // Add small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 500))
  }

  // Write updated releases.json
  fs.writeFileSync(releasesFile, JSON.stringify(releasesData, null, 2) + '\n', 'utf8')

  console.log('\n📊 Summary:')
  console.log(`  ✅ Updated: ${updated}`)
  console.log(`  ⏭️  Skipped: ${skipped}`)
  console.log(`  ❌ Failed: ${failed}`)
  console.log(`\n✨ Done! Updated releases.json`)
}

// Run the script
updateArtwork().catch(console.error)

