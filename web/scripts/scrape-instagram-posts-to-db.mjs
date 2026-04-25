#!/usr/bin/env node

/**
 * Scrape Instagram Posts and Save to Database
 * 
 * This script uses the same scraping logic as the API route
 * to process Instagram post URLs and save them to the database
 */

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { readFileSync } from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load environment variables
config({ path: join(__dirname, '../.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

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

// Load posts from data file
const postsDataPath = join(__dirname, '../data/instagram-posts.json')
const postsData = JSON.parse(readFileSync(postsDataPath, 'utf-8'))
const posts = (postsData.posts || []).filter(
  (post) => !post.includes('EXAMPLE_POST')
)

/**
 * Extract post ID from Instagram URL
 */
function extractPostId(url) {
  const match = url.match(/instagram\.com\/(?:p|reel)\/([^\/\?]+)/)
  return match ? match[1] : null
}

/**
 * Extract username from Instagram URL
 */
function extractUsername(url) {
  const match = url.match(/instagram\.com\/([^\/]+)/)
  return match && !['p', 'reel', 'tv'].includes(match[1]) ? match[1] : null
}

/**
 * Scrape Instagram post metadata from HTML
 */
async function scrapePostMetadata(postUrl) {
  try {
    const cleanUrl = postUrl.split('?')[0].trim()
    
    console.log(`\n📡 Scraping: ${cleanUrl}`)
    
    // Fetch the post page
    const response = await fetch(cleanUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.instagram.com/',
      },
    })
    
    if (!response.ok) {
      console.error(`  ❌ HTTP ${response.status}`)
      return null
    }
    
    const html = await response.text()
    
    // Extract metadata
    let imageUrl = null
    let videoUrl = null
    let thumbnailUrl = null
    let caption = null
    let username = null
    let width = undefined
    let height = undefined
    let durationSeconds = undefined
    let metadata = {}
    
    // Method 1: Try window._sharedData (most reliable)
    const sharedDataMatch = html.match(/window\._sharedData\s*=\s*({[\s\S]+?});/)
    if (sharedDataMatch) {
      try {
        const sharedData = JSON.parse(sharedDataMatch[1])
        const postData = sharedData?.entry_data?.PostPage?.[0]?.graphql?.shortcode_media
        
        if (postData) {
          // Get caption
          if (postData.edge_media_to_caption?.edges?.[0]?.node?.text) {
            caption = postData.edge_media_to_caption.edges[0].node.text
          }
          
          // Get username
          if (postData.owner?.username) {
            username = postData.owner.username
          }
          
          // Check if it's a video
          if (postData.is_video && postData.video_url) {
            videoUrl = postData.video_url
            // Get thumbnail
            if (postData.display_url) {
              thumbnailUrl = postData.display_url
            }
            // Get dimensions
            if (postData.dimensions) {
              width = postData.dimensions.width
              height = postData.dimensions.height
            }
          } else if (postData.display_url) {
            imageUrl = postData.display_url
            if (postData.dimensions) {
              width = postData.dimensions.width
              height = postData.dimensions.height
            }
          }
        }
      } catch (e) {
        console.log(`  ⚠️  Could not parse _sharedData: ${e.message}`)
      }
    }
    
    // Method 2: Try JSON-LD structured data
    if (!imageUrl && !videoUrl) {
      const jsonLdMatches = html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)
      for (const match of jsonLdMatches) {
        try {
          const jsonData = JSON.parse(match[1])
          if (jsonData.video && jsonData.video.contentUrl) {
            videoUrl = jsonData.video.contentUrl
          }
          if (jsonData.image && typeof jsonData.image === 'string') {
            imageUrl = jsonData.image
          } else if (jsonData.image && jsonData.image.url) {
            imageUrl = jsonData.image.url
          }
          if (jsonData.caption) {
            caption = jsonData.caption
          }
        } catch (e) {
          // Continue to next match
        }
      }
    }
    
    // Method 3: Try og:video or og:image meta tags
    if (!videoUrl && !imageUrl) {
      const ogVideoMatch = html.match(/<meta[^>]*property=["']og:video["'][^>]*content=["']([^"']+)["']/i)
      if (ogVideoMatch) {
        videoUrl = ogVideoMatch[1]
      }
      
      const ogImageMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)
      if (ogImageMatch) {
        imageUrl = ogImageMatch[1]
      }
    }
    
    const postId = extractPostId(cleanUrl)
    const extractedUsername = extractUsername(cleanUrl) || username || postsData.username || 'sergikdropz'
    
    const isVideo = cleanUrl.includes('/reel/') || videoUrl !== null
    const mediaUrl = videoUrl || imageUrl
    
    if (!mediaUrl) {
      console.log(`  ⏭️  No media URL found`)
      return null
    }
    
    console.log(`  ✅ Found ${isVideo ? 'video' : 'image'}`)
    
    return {
      postUrl: cleanUrl,
      permalink: cleanUrl,
      mediaType: isVideo ? 'video' : 'image',
      mediaUrl: mediaUrl,
      thumbnailUrl: thumbnailUrl || imageUrl,
      videoUrl: videoUrl,
      caption: caption,
      username: extractedUsername,
      postId: postId,
      width: width,
      height: height,
      durationSeconds: durationSeconds,
      metadata: metadata,
    }
  } catch (error) {
    console.error(`  ❌ Error: ${error.message}`)
    return null
  }
}

/**
 * Save scraped media to database
 */
async function saveMediaToDatabase(media, supabase) {
  try {
    // Use proxy endpoint for media URLs (will be replaced with Supabase URLs when videos are uploaded)
    const proxiedMediaUrl = `/api/instagram/proxy-image?url=${encodeURIComponent(media.mediaUrl)}`
    const proxiedThumbnailUrl = media.thumbnailUrl 
      ? `/api/instagram/proxy-image?url=${encodeURIComponent(media.thumbnailUrl)}`
      : null
    const proxiedVideoUrl = media.videoUrl
      ? `/api/instagram/proxy-image?url=${encodeURIComponent(media.videoUrl)}`
      : null
    
    const { error } = await supabase
      .from('instagram_media')
      .upsert({
        post_url: media.postUrl,
        permalink: media.permalink,
        media_type: media.mediaType,
        media_url: proxiedMediaUrl,
        thumbnail_url: proxiedThumbnailUrl,
        video_url: proxiedVideoUrl,
        caption: media.caption,
        username: media.username,
        post_id: media.postId,
        width: media.width,
        height: media.height,
        duration_seconds: media.durationSeconds,
        metadata: media.metadata,
        is_active: true,
        error_message: null,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'post_url',
      })
    
    if (error) {
      console.error(`  ❌ Database error: ${error.message}`)
      return false
    }
    
    return true
  } catch (error) {
    console.error(`  ❌ Error saving: ${error.message}`)
    return false
  }
}

/**
 * Main function
 */
async function main() {
  console.log('📥 Scraping Instagram Posts and Saving to Database...\n')
  console.log(`Found ${posts.length} post(s) to process\n`)
  console.log('='.repeat(70))
  
  const results = {
    success: 0,
    failed: 0,
    errors: [],
  }
  
  // Process each post
  for (let i = 0; i < posts.length; i++) {
    const postUrl = posts[i]
    console.log(`\n[${i + 1}/${posts.length}] ${postUrl}`)
    
    try {
      const scraped = await scrapePostMetadata(postUrl)
      
      if (scraped) {
        const saved = await saveMediaToDatabase(scraped, supabase)
        if (saved) {
          results.success++
          console.log(`  ✅ Saved to database`)
        } else {
          results.failed++
          results.errors.push(`Failed to save ${postUrl}`)
        }
      } else {
        results.failed++
        results.errors.push(`Failed to scrape ${postUrl}`)
      }
    } catch (error) {
      results.failed++
      results.errors.push(`${postUrl}: ${error.message}`)
      console.error(`  ❌ Error: ${error.message}`)
    }
    
    // Rate limiting - wait between requests
    if (i < posts.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 2000))
    }
  }
  
  console.log('\n' + '='.repeat(70))
  console.log('📊 Summary:')
  console.log(`  ✅ Success: ${results.success}`)
  console.log(`  ❌ Failed: ${results.failed}`)
  
  if (results.errors.length > 0) {
    console.log('\n❌ Errors:')
    results.errors.forEach(err => console.log(`  - ${err}`))
  }
  
  console.log('\n✨ Done!')
}

main().catch(console.error)

