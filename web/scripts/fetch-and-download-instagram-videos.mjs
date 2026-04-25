#!/usr/bin/env node

/**
 * Complete Instagram Video Workflow
 * 
 * 1. Fetch video URLs from Instagram Graph API (if credentials available)
 * 2. Update database with video URLs
 * 3. Download videos from Instagram
 * 4. Upload videos to Supabase Storage
 * 5. Update database with Supabase Storage URLs
 */

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { readFileSync, writeFileSync } from 'fs'
import { createWriteStream } from 'fs'
import { pipeline } from 'stream/promises'

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

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

/**
 * Fetch media from Instagram Graph API with video URLs
 */
async function fetchMediaFromAPI() {
  if (!INSTAGRAM_ACCESS_TOKEN || !INSTAGRAM_USER_ID) {
    return null
  }

  try {
    // Fetch with all needed fields including thumbnail_url for videos
    // Instagram Graph API uses graph.facebook.com, not graph.instagram.com
    const apiUrl = `https://graph.facebook.com/v18.0/${INSTAGRAM_USER_ID}/media?fields=id,media_type,media_url,permalink,thumbnail_url,caption,timestamp&access_token=${INSTAGRAM_ACCESS_TOKEN}&limit=50`
    
    console.log('📡 Fetching media from Instagram Graph API...\n')
    
    const response = await fetch(apiUrl)
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error('❌ Instagram API error:', response.status, errorData)
      return null
    }
    
    const data = await response.json()
    
    if (!data.data || data.data.length === 0) {
      console.log('⚠️  No media found in Instagram API response')
      return null
    }
    
    console.log(`✅ Found ${data.data.length} media item(s) from API\n`)
    
    return data.data
  } catch (error) {
    console.error('❌ Error fetching from Instagram API:', error.message)
    return null
  }
}

/**
 * Update database with video URLs from API
 */
async function updateDatabaseWithVideoUrls(apiMedia) {
  if (!apiMedia || apiMedia.length === 0) {
    return { updated: 0, notFound: 0, errors: [] }
  }

  console.log('💾 Updating database with video URLs...\n')
  console.log('='.repeat(70))
  
  const results = {
    updated: 0,
    notFound: 0,
    errors: [],
  }
  
  // Create a map of permalink -> media data
  const mediaMap = new Map()
  apiMedia.forEach(item => {
    const cleanPermalink = item.permalink.split('?')[0]
    mediaMap.set(cleanPermalink, item)
  })
  
  // Get all videos from database
  const { data: dbVideos, error: fetchError } = await supabase
    .from('instagram_media')
    .select('*')
    .eq('media_type', 'video')
  
  if (fetchError) {
    console.error('❌ Error fetching videos from database:', fetchError)
    throw fetchError
  }
  
  if (!dbVideos || dbVideos.length === 0) {
    console.log('ℹ️  No videos in database to update')
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
      console.log(`  ⏭️  Not found in API response`)
      results.notFound++
      continue
    }
    
    if (apiMediaItem.media_type !== 'VIDEO') {
      console.log(`  ⏭️  Not a video in API (type: ${apiMediaItem.media_type})`)
      results.notFound++
      continue
    }
    
    const videoUrl = apiMediaItem.media_url
    const thumbnailUrl = apiMediaItem.thumbnail_url || apiMediaItem.media_url
    
    if (!videoUrl) {
      console.log(`  ⚠️  No video URL in API response`)
      results.notFound++
      continue
    }
    
    console.log(`  ✅ Found video URL`)
    
    // Store direct Instagram URL (will be downloaded and replaced with Supabase URL)
    const { error: updateError } = await supabase
      .from('instagram_media')
      .update({
        video_url: videoUrl, // Direct Instagram URL for downloading
        thumbnail_url: thumbnailUrl,
        media_url: thumbnailUrl || videoUrl,
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
 * Download video from URL
 */
async function downloadVideo(videoUrl, filePath) {
  try {
    const response = await fetch(videoUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://www.instagram.com/',
      },
    })
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    
    const fileStream = createWriteStream(filePath)
    await pipeline(response.body, fileStream)
    
    return true
  } catch (error) {
    console.error(`  ❌ Download error: ${error.message}`)
    return false
  }
}

/**
 * Upload video to Supabase Storage
 */
async function uploadVideoToSupabase(filePath, fileName) {
  try {
    const fileBuffer = readFileSync(filePath)
    
    const { data, error } = await supabase.storage
      .from('instagram-videos')
      .upload(fileName, fileBuffer, {
        contentType: 'video/mp4',
        upsert: true,
      })
    
    if (error) {
      throw error
    }
    
    // Get public URL
    const { data: urlData } = supabase.storage
      .from('instagram-videos')
      .getPublicUrl(fileName)
    
    return urlData.publicUrl
  } catch (error) {
    console.error(`  ❌ Upload error: ${error.message}`)
    return null
  }
}

/**
 * Download and upload videos
 */
async function downloadAndUploadVideos() {
  console.log('\n📥 Downloading and uploading videos...\n')
  console.log('='.repeat(70))
  
  // Get all videos with Instagram URLs (not Supabase URLs)
  const { data: videos, error } = await supabase
    .from('instagram_media')
    .select('*')
    .eq('media_type', 'video')
    .not('video_url', 'is', null)
    .not('video_url', 'like', '%supabase.co%')
  
  if (error) {
    console.error('❌ Error fetching videos:', error)
    return { downloaded: 0, uploaded: 0, errors: [] }
  }
  
  if (!videos || videos.length === 0) {
    console.log('ℹ️  No videos to download (all may already be uploaded)')
    return { downloaded: 0, uploaded: 0, errors: [] }
  }
  
  console.log(`Found ${videos.length} video(s) to download\n`)
  
  const results = {
    downloaded: 0,
    uploaded: 0,
    errors: [],
  }
  
  const tempDir = join(__dirname, '../.temp')
  try {
    const { mkdir } = await import('fs/promises')
    await mkdir(tempDir, { recursive: true })
  } catch (e) {
    // Directory might already exist
  }
  
  for (let i = 0; i < videos.length; i++) {
    const video = videos[i]
    const postId = video.post_id || video.permalink.split('/').filter(Boolean).pop()
    const fileName = `${postId}.mp4`
    const tempPath = join(tempDir, fileName)
    
    console.log(`\n[${i + 1}/${videos.length}] ${video.permalink}`)
    console.log(`  📥 Downloading...`)
    
    // Download video
    const downloaded = await downloadVideo(video.video_url, tempPath)
    
    if (!downloaded) {
      results.errors.push(`Failed to download ${video.permalink}`)
      continue
    }
    
    console.log(`  ✅ Downloaded`)
    console.log(`  📤 Uploading to Supabase...`)
    
    // Upload to Supabase
    const supabaseUrl = await uploadVideoToSupabase(tempPath, fileName)
    
    if (!supabaseUrl) {
      results.errors.push(`Failed to upload ${video.permalink}`)
      continue
    }
    
    console.log(`  ✅ Uploaded`)
    
    // Update database with Supabase URL
    const { error: updateError } = await supabase
      .from('instagram_media')
      .update({
        video_url: supabaseUrl,
        updated_at: new Date().toISOString(),
      })
      .eq('id', video.id)
    
    if (updateError) {
      console.error(`  ❌ Database update error: ${updateError.message}`)
      results.errors.push(`Failed to update database for ${video.permalink}`)
    } else {
      console.log(`  ✅ Database updated`)
      results.downloaded++
      results.uploaded++
    }
    
    // Clean up temp file
    try {
      const { unlink } = await import('fs/promises')
      await unlink(tempPath)
    } catch (e) {
      // Ignore cleanup errors
    }
    
    // Rate limiting
    if (i < videos.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 2000))
    }
  }
  
  return results
}

/**
 * Main function
 */
async function main() {
  console.log('🎬 Complete Instagram Video Workflow\n')
  console.log('='.repeat(70))
  
  try {
    // Step 1: Try to fetch video URLs from API
    let apiMedia = null
    if (INSTAGRAM_ACCESS_TOKEN && INSTAGRAM_USER_ID) {
      apiMedia = await fetchMediaFromAPI()
      if (apiMedia) {
        const updateResults = await updateDatabaseWithVideoUrls(apiMedia)
        console.log(`\n📊 API Update Summary:`)
        console.log(`  ✅ Updated: ${updateResults.updated}`)
        console.log(`  ⏭️  Not found: ${updateResults.notFound}`)
      }
    } else {
      console.log('⚠️  Instagram API credentials not found')
      console.log('   Using existing video URLs in database (if any)')
    }
    
    // Step 2: Download and upload videos
    const downloadResults = await downloadAndUploadVideos()
    
    console.log('\n' + '='.repeat(70))
    console.log('📊 Final Summary:')
    console.log(`  ✅ Downloaded: ${downloadResults.downloaded}`)
    console.log(`  ✅ Uploaded: ${downloadResults.uploaded}`)
    
    if (downloadResults.errors.length > 0) {
      console.log(`  ❌ Errors: ${downloadResults.errors.length}`)
      console.log('\n❌ Error details:')
      downloadResults.errors.forEach(err => console.log(`  - ${err}`))
    }
    
    if (downloadResults.uploaded > 0) {
      console.log('\n✨ Success! Videos are now in Supabase Storage and ready to play!')
    } else if (!INSTAGRAM_ACCESS_TOKEN || !INSTAGRAM_USER_ID) {
      console.log('\n💡 To get video URLs, set up Instagram API credentials:')
      console.log('   Add to web/.env.local:')
      console.log('   INSTAGRAM_ACCESS_TOKEN=your_token')
      console.log('   INSTAGRAM_USER_ID=your_user_id')
    }
    
    console.log('\n✨ Done!')
  } catch (error) {
    console.error('\n❌ Fatal error:', error.message)
    process.exit(1)
  }
}

main().catch(console.error)

