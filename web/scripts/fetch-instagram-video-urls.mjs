#!/usr/bin/env node

/**
 * Fetch Instagram Video URLs from Graph API and Update Database
 * 
 * This script uses Instagram Graph API to fetch video URLs
 * and updates the database with the actual video URLs.
 * 
 * Requires: INSTAGRAM_ACCESS_TOKEN and INSTAGRAM_USER_ID in .env.local
 */

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load environment variables
config({ path: join(__dirname, '../.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const INSTAGRAM_ACCESS_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN
const INSTAGRAM_USER_ID = process.env.INSTAGRAM_USER_ID

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing Supabase environment variables')
  process.exit(1)
}

if (!INSTAGRAM_ACCESS_TOKEN || !INSTAGRAM_USER_ID) {
  console.error('❌ Missing Instagram API credentials')
  console.error('   Please set INSTAGRAM_ACCESS_TOKEN and INSTAGRAM_USER_ID in .env.local')
  console.error('   See: web/INSTAGRAM_SETUP_GUIDE.md for setup instructions')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

/**
 * Fetch media from Instagram Graph API
 */
async function fetchMediaFromAPI() {
  try {
    // Fetch recent media - include thumbnail_url for videos
    // Instagram Graph API uses graph.facebook.com, not graph.instagram.com
    const apiUrl = `https://graph.facebook.com/v18.0/${INSTAGRAM_USER_ID}/media?fields=id,media_type,media_url,permalink,thumbnail_url,caption,timestamp&access_token=${INSTAGRAM_ACCESS_TOKEN}&limit=50`
    
    console.log('📡 Fetching media from Instagram Graph API...\n')
    
    const response = await fetch(apiUrl)
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error('❌ Instagram API error:', response.status, errorData)
      throw new Error(`Instagram API returned ${response.status}: ${JSON.stringify(errorData)}`)
    }
    
    const data = await response.json()
    
    if (!data.data || data.data.length === 0) {
      console.log('⚠️  No media found in Instagram API response')
      return []
    }
    
    console.log(`✅ Found ${data.data.length} media item(s) from API\n`)
    
    return data.data
  } catch (error) {
    console.error('❌ Error fetching from Instagram API:', error.message)
    throw error
  }
}

/**
 * Update database with video URLs from API
 */
async function updateDatabaseWithVideoUrls(apiMedia) {
  console.log('💾 Updating database with video URLs...\n')
  console.log('='.repeat(70))
  
  const results = {
    updated: 0,
    notFound: 0,
    errors: [],
  }
  
  // Create a map of permalink -> media data for quick lookup
  const mediaMap = new Map()
  apiMedia.forEach(item => {
    const cleanPermalink = item.permalink.split('?')[0]
    mediaMap.set(cleanPermalink, item)
  })
  
  // Get all videos from database that need URLs
  const { data: dbVideos, error: fetchError } = await supabase
    .from('instagram_media')
    .select('*')
    .eq('media_type', 'video')
    .is('video_url', null)
    .or('video_url.is.null,video_url.eq./api/instagram/proxy-image%3Furl%3Dhttps%3A%2F%2Finstagram.com')
  
  if (fetchError) {
    console.error('❌ Error fetching videos from database:', fetchError)
    throw fetchError
  }
  
  if (!dbVideos || dbVideos.length === 0) {
    console.log('ℹ️  No videos in database need updating')
    return results
  }
  
  console.log(`Found ${dbVideos.length} video(s) in database to update\n`)
  
  // Update each video
  for (let i = 0; i < dbVideos.length; i++) {
    const dbVideo = dbVideos[i]
    const cleanPermalink = dbVideo.permalink.split('?')[0]
    
    console.log(`[${i + 1}/${dbVideos.length}] ${cleanPermalink}`)
    
    const apiMediaItem = mediaMap.get(cleanPermalink)
    
    if (!apiMediaItem) {
      console.log(`  ⏭️  Not found in API response (may be older post)`)
      results.notFound++
      continue
    }
    
    if (apiMediaItem.media_type !== 'VIDEO') {
      console.log(`  ⏭️  Not a video in API (type: ${apiMediaItem.media_type})`)
      results.notFound++
      continue
    }
    
    // Update with video URL and thumbnail
    const videoUrl = apiMediaItem.media_url
    const thumbnailUrl = apiMediaItem.thumbnail_url || apiMediaItem.media_url
    
    if (!videoUrl) {
      console.log(`  ⚠️  No video URL in API response`)
      results.notFound++
      continue
    }
    
    console.log(`  ✅ Found video URL`)
    
    // Use proxy endpoint for now (will be replaced with Supabase URLs after download)
    const proxiedVideoUrl = `/api/instagram/proxy-image?url=${encodeURIComponent(videoUrl)}`
    const proxiedThumbnailUrl = thumbnailUrl 
      ? `/api/instagram/proxy-image?url=${encodeURIComponent(thumbnailUrl)}`
      : null
    
    const { error: updateError } = await supabase
      .from('instagram_media')
      .update({
        video_url: proxiedVideoUrl,
        thumbnail_url: proxiedThumbnailUrl,
        media_url: proxiedThumbnailUrl || proxiedVideoUrl,
        caption: apiMediaItem.caption || dbVideo.caption,
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', dbVideo.id)
    
    if (updateError) {
      console.error(`  ❌ Database error: ${updateError.message}`)
      results.errors.push(`${cleanPermalink}: ${updateError.message}`)
    } else {
      console.log(`  ✅ Updated in database`)
      results.updated++
    }
  }
  
  return results
}

/**
 * Main function
 */
async function main() {
  console.log('🎬 Fetching Instagram Video URLs from Graph API\n')
  console.log('='.repeat(70))
  
  try {
    // Fetch media from Instagram API
    const apiMedia = await fetchMediaFromAPI()
    
    if (apiMedia.length === 0) {
      console.log('\n⚠️  No media found. Check your Instagram API credentials.')
      return
    }
    
    // Update database with video URLs
    const results = await updateDatabaseWithVideoUrls(apiMedia)
    
    console.log('\n' + '='.repeat(70))
    console.log('📊 Summary:')
    console.log(`  ✅ Updated: ${results.updated}`)
    console.log(`  ⏭️  Not found: ${results.notFound}`)
    
    if (results.errors.length > 0) {
      console.log(`  ❌ Errors: ${results.errors.length}`)
      console.log('\n❌ Error details:')
      results.errors.forEach(err => console.log(`  - ${err}`))
    }
    
    if (results.updated > 0) {
      console.log('\n💡 Next Steps:')
      console.log('  1. Run: node scripts/download-instagram-videos-to-supabase.mjs')
      console.log('  2. This will download videos and upload to Supabase Storage')
      console.log('  3. Database will be updated with Supabase Storage URLs')
    }
    
    console.log('\n✨ Done!')
  } catch (error) {
    console.error('\n❌ Fatal error:', error.message)
    process.exit(1)
  }
}

main().catch(console.error)

