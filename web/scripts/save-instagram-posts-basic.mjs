#!/usr/bin/env node

/**
 * Save Instagram Posts to Database (Basic Metadata)
 * 
 * This saves the post URLs to the database even if we can't get video URLs yet.
 * Video URLs can be added later via Instagram API or manual upload.
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
 * Main function
 */
async function main() {
  console.log('💾 Saving Instagram Posts to Database (Basic Metadata)...\n')
  console.log(`Found ${posts.length} post(s) to save\n`)
  console.log('='.repeat(70))
  
  const results = {
    success: 0,
    failed: 0,
    errors: [],
  }
  
  // Process each post
  for (let i = 0; i < posts.length; i++) {
    const postUrl = posts[i]
    const cleanUrl = postUrl.split('?')[0].trim()
    const isVideo = cleanUrl.includes('/reel/')
    const postId = extractPostId(cleanUrl)
    const username = extractUsername(cleanUrl) || postsData.username || 'sergikdropz'
    
    console.log(`\n[${i + 1}/${posts.length}] ${cleanUrl}`)
    console.log(`  Type: ${isVideo ? 'video' : 'image'}`)
    
    try {
      // Save basic metadata - video URLs will be added later via API or manual upload
      const { error } = await supabase
        .from('instagram_media')
        .upsert({
          post_url: cleanUrl,
          permalink: cleanUrl,
          media_type: isVideo ? 'video' : 'image',
          media_url: `/api/instagram/proxy-image?url=${encodeURIComponent(`https://instagram.com/p/${postId}/media/?size=l`)}`, // Placeholder
          thumbnail_url: `/api/instagram/proxy-image?url=${encodeURIComponent(`https://instagram.com/p/${postId}/media/?size=m`)}`, // Placeholder
          video_url: null, // Will be populated later
          caption: null,
          username: username,
          post_id: postId,
          width: null,
          height: null,
          duration_seconds: null,
          metadata: {},
          is_active: true,
          error_message: isVideo ? 'Video URL needs to be fetched via Instagram API or manual upload' : null,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'post_url',
        })
      
      if (error) {
        console.error(`  ❌ Database error: ${error.message}`)
        results.failed++
        results.errors.push(`${cleanUrl}: ${error.message}`)
      } else {
        console.log(`  ✅ Saved to database`)
        results.success++
      }
    } catch (error) {
      console.error(`  ❌ Error: ${error.message}`)
      results.failed++
      results.errors.push(`${cleanUrl}: ${error.message}`)
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
  
  console.log('\n💡 Next Steps:')
  console.log('  1. Set up Instagram Graph API credentials to fetch video URLs')
  console.log('  2. Or manually upload videos to Supabase Storage and update database')
  console.log('  3. Or use the download script once Instagram API is configured')
  
  console.log('\n✨ Done!')
}

main().catch(console.error)

