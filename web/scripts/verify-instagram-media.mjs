#!/usr/bin/env node

/**
 * Verify Instagram Media Database State
 * 
 * This script checks the current state of Instagram media in the database:
 * - How many videos vs images are stored
 * - Whether videos have Supabase Storage URLs or proxied URLs
 * - Which posts need to be downloaded/uploaded
 * - Whether the instagram-videos bucket exists
 * 
 * Usage:
 *   node scripts/verify-instagram-media.mjs
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

console.log('🔍 Verifying Instagram Media Database State...\n')
console.log('='.repeat(70))

// Check environment variables
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing Supabase environment variables')
  console.error('   Make sure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in .env.local')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

/**
 * Check if URL is a Supabase Storage URL
 */
function isSupabaseStorageUrl(url) {
  if (!url) return false
  return url.includes('supabase.co') && url.includes('/storage/v1/object/public/')
}

/**
 * Check if URL is a proxied URL
 */
function isProxiedUrl(url) {
  if (!url) return false
  return url.includes('/api/instagram/proxy-image')
}

/**
 * Main verification function
 */
async function verifyInstagramMedia() {
  try {
    // 1. Check if instagram_media table exists and get all records
    console.log('\n1. Querying instagram_media table...')
    const { data: media, error: queryError } = await supabase
      .from('instagram_media')
      .select('*')
      .eq('is_active', true)
      .order('scraped_at', { ascending: false })

    if (queryError) {
      if (queryError.code === 'PGRST116' || queryError.message.includes('does not exist')) {
        console.log('   ❌ instagram_media table does not exist')
        console.log('   💡 Run the database schema first: web/supabase/schema.sql')
        return
      }
      throw queryError
    }

    if (!media || media.length === 0) {
      console.log('   ⚠️  No media found in database')
      console.log('   💡 Run the scrape script or download script to populate media')
      return
    }

    console.log(`   ✅ Found ${media.length} media item(s)`)

    // 2. Analyze media types
    console.log('\n2. Analyzing media types...')
    const videos = media.filter(m => m.media_type === 'video')
    const images = media.filter(m => m.media_type === 'image')
    
    console.log(`   📹 Videos: ${videos.length}`)
    console.log(`   🖼️  Images: ${images.length}`)

    // 3. Check video URLs
    console.log('\n3. Checking video URLs...')
    const videosWithSupabaseUrls = videos.filter(v => 
      isSupabaseStorageUrl(v.video_url) || isSupabaseStorageUrl(v.media_url)
    )
    const videosWithProxiedUrls = videos.filter(v => 
      isProxiedUrl(v.video_url) || isProxiedUrl(v.media_url)
    )
    const videosWithOtherUrls = videos.filter(v => {
      const videoUrl = v.video_url || v.media_url
      return videoUrl && !isSupabaseStorageUrl(videoUrl) && !isProxiedUrl(videoUrl)
    })
    const videosWithoutUrls = videos.filter(v => !v.video_url && !v.media_url)

    console.log(`   ✅ Videos with Supabase Storage URLs: ${videosWithSupabaseUrls.length}`)
    console.log(`   🔄 Videos with proxied URLs: ${videosWithProxiedUrls.length}`)
    console.log(`   🌐 Videos with other URLs (Instagram direct): ${videosWithOtherUrls.length}`)
    console.log(`   ❌ Videos without URLs: ${videosWithoutUrls.length}`)

    // 4. Show examples
    if (videosWithSupabaseUrls.length > 0) {
      console.log('\n   📋 Example Supabase Storage URL:')
      const example = videosWithSupabaseUrls[0]
      console.log(`      ${example.video_url || example.media_url}`)
    }

    if (videosWithProxiedUrls.length > 0) {
      console.log('\n   📋 Example proxied URL:')
      const example = videosWithProxiedUrls[0]
      console.log(`      ${example.video_url || example.media_url}`)
    }

    // 5. Check instagram-videos bucket
    console.log('\n4. Checking Supabase Storage bucket...')
    const { data: buckets, error: bucketError } = await supabase.storage.listBuckets()
    
    if (bucketError) {
      console.log(`   ⚠️  Error checking buckets: ${bucketError.message}`)
    } else {
      const instagramBucket = buckets?.find(b => b.name === 'instagram-videos')
      if (instagramBucket) {
        console.log('   ✅ instagram-videos bucket exists')
        
        // Count files in bucket
        const { data: files, error: filesError } = await supabase.storage
          .from('instagram-videos')
          .list()
        
        if (filesError) {
          console.log(`   ⚠️  Error listing files: ${filesError.message}`)
        } else {
          const videoFiles = files?.filter(f => f.name.endsWith('.mp4') || f.name.endsWith('.mov'))
          console.log(`   📁 Files in bucket: ${files?.length || 0} (${videoFiles?.length || 0} videos)`)
        }
      } else {
        console.log('   ❌ instagram-videos bucket does not exist')
        console.log('   💡 The download script will create it automatically')
      }
    }

    // 6. Summary and recommendations
    console.log('\n' + '='.repeat(70))
    console.log('📊 SUMMARY')
    console.log('='.repeat(70))
    
    if (videos.length === 0) {
      console.log('\n⚠️  No videos found in database')
      console.log('   💡 Run: node scripts/download-instagram-videos-to-supabase.mjs')
    } else if (videosWithSupabaseUrls.length === videos.length) {
      console.log('\n✅ All videos have Supabase Storage URLs!')
      console.log('   🎉 Videos should play directly when clicked')
    } else if (videosWithProxiedUrls.length > 0) {
      console.log('\n⚠️  Some videos have proxied URLs (not Supabase Storage URLs)')
      console.log(`   📥 ${videosWithProxiedUrls.length} video(s) need to be downloaded and uploaded`)
      console.log('   💡 Run: node scripts/download-instagram-videos-to-supabase.mjs')
    } else if (videosWithOtherUrls.length > 0) {
      console.log('\n⚠️  Some videos have Instagram direct URLs')
      console.log(`   📥 ${videosWithOtherUrls.length} video(s) need to be downloaded and uploaded`)
      console.log('   💡 Run: node scripts/download-instagram-videos-to-supabase.mjs')
    }

    // 7. List videos that need downloading
    if (videosWithProxiedUrls.length > 0 || videosWithOtherUrls.length > 0) {
      console.log('\n📋 Videos that need Supabase Storage URLs:')
      const needsDownload = [...videosWithProxiedUrls, ...videosWithOtherUrls]
      needsDownload.slice(0, 5).forEach((video, index) => {
        console.log(`   ${index + 1}. ${video.permalink || video.post_url}`)
      })
      if (needsDownload.length > 5) {
        console.log(`   ... and ${needsDownload.length - 5} more`)
      }
    }

    console.log('\n' + '='.repeat(70))

  } catch (error) {
    console.error('\n❌ Error during verification:', error.message)
    if (error.stack) {
      console.error(error.stack)
    }
    process.exit(1)
  }
}

// Run verification
verifyInstagramMedia()

