#!/usr/bin/env node

/**
 * Download Instagram videos in highest quality and upload to Supabase Storage
 * 
 * Instagram videos are already in MP4/H.264 format (optimal for web):
 * - Hardware accelerated decoding
 * - Wide browser support
 * - Efficient compression
 * - No re-encoding needed (preserves quality)
 */

import { createClient } from '@supabase/supabase-js'
import { readFile, mkdir } from 'fs/promises'
import { join, basename } from 'path'
import { existsSync } from 'fs'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { createWriteStream } from 'fs'
import { pipeline } from 'stream/promises'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

dotenv.config({ path: join(__dirname, '..', '.env.local') })

const BUCKET_NAME = 'instagram-videos'
const TEMP_DIR = join(__dirname, '..', 'temp', 'instagram-videos')

// Initialize Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

function extractPostId(url) {
  const match = url.match(/instagram\.com\/(?:p|reel)\/([^\/\?]+)/)
  return match ? match[1] : null
}

/**
 * Scrape Instagram post to get highest quality video URL
 * Instagram provides video_url which is already the best quality available
 */
async function scrapePostMetadata(postUrl) {
  try {
    const cleanUrl = postUrl.split('?')[0].trim()
    
    console.log(`\n📡 Scraping: ${cleanUrl}`)
    
    const response = await fetch(cleanUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.instagram.com/',
      },
    })
    
    if (!response.ok) {
      console.error(`  ❌ HTTP ${response.status}`)
      return null
    }
    
    const html = await response.text()
    
    let videoUrl = null
    let thumbnailUrl = null
    let caption = null
    let username = null
    let width = null
    let height = null
    let durationSeconds = null
    let metadata = {}
    
    // Extract from window._sharedData (most reliable, highest quality)
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
            metadata.username = username
          }
          
          // Check if video - Instagram's video_url is already highest quality
          if (postData.is_video) {
            // This is the highest quality video URL Instagram provides
            videoUrl = postData.video_url
            
            // Get best quality thumbnail (last item in display_resources is highest)
            if (postData.display_resources && postData.display_resources.length > 0) {
              thumbnailUrl = postData.display_resources[postData.display_resources.length - 1].src
            } else if (postData.display_url) {
              thumbnailUrl = postData.display_url
            }
            
            // Get dimensions
            if (postData.dimensions) {
              width = postData.dimensions.width
              height = postData.dimensions.height
            }
            
            // Get duration
            if (postData.video_duration) {
              durationSeconds = Math.round(postData.video_duration)
            }
            
            console.log(`  ✅ Found video: ${width}x${height}, ${durationSeconds}s`)
          } else {
            console.log(`  ⏭️  Image post (skipping)`)
            return { isImage: true }
          }
          
          // Engagement metrics
          if (postData.edge_media_preview_like?.count !== undefined) {
            metadata.likes = postData.edge_media_preview_like.count
          }
          if (postData.edge_media_to_comment?.count !== undefined) {
            metadata.comments = postData.edge_media_to_comment.count
          }
        }
      } catch (e) {
        console.error(`  ⚠️  Parse error:`, e.message)
      }
    }
    
    if (!videoUrl) {
      console.log(`  ⏭️  No video URL found`)
      return null
    }
    
    const postId = extractPostId(cleanUrl)
    
    return {
      postUrl: cleanUrl,
      permalink: cleanUrl,
      postId,
      videoUrl, // Highest quality from Instagram
      thumbnailUrl,
      caption,
      username,
      width,
      height,
      durationSeconds,
      metadata,
    }
  } catch (error) {
    console.error(`  ❌ Error:`, error.message)
    return null
  }
}

/**
 * Download video with streaming for large files
 * Instagram videos are already MP4/H.264 (optimal format)
 */
async function downloadVideo(videoUrl, outputPath) {
  try {
    console.log(`  📥 Downloading video (highest quality)...`)
    
    const response = await fetch(videoUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.instagram.com/',
        'Accept': 'video/mp4,video/*,*/*;q=0.8',
      },
    })
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    
    // Stream download for memory efficiency
    const fileStream = createWriteStream(outputPath)
    await pipeline(response.body, fileStream)
    
    // Get file size
    const { statSync } = await import('fs')
    const stats = statSync(outputPath)
    const sizeMB = (stats.size / (1024 * 1024)).toFixed(2)
    
    console.log(`  ✅ Downloaded: ${basename(outputPath)} (${sizeMB} MB)`)
    return true
  } catch (error) {
    console.error(`  ❌ Download failed:`, error.message)
    return false
  }
}

/**
 * Create bucket if needed
 */
async function createBucketIfNeeded() {
  const { data: buckets, error: listError } = await supabase.storage.listBuckets()
  
  if (listError) {
    throw new Error(`Failed to list buckets: ${listError.message}`)
  }

  const bucketExists = buckets?.some(b => b.name === BUCKET_NAME)

  if (!bucketExists) {
    console.log(`\n📦 Creating bucket: ${BUCKET_NAME}...`)
    const { error: createError } = await supabase.storage.createBucket(BUCKET_NAME, {
      public: true,
      fileSizeLimit: 104857600, // 100MB per file
      allowedMimeTypes: ['video/mp4'],
    })

    if (createError) {
      throw new Error(`Failed to create bucket: ${createError.message}`)
    }
    console.log(`✅ Bucket created`)
  } else {
    console.log(`✅ Bucket exists: ${BUCKET_NAME}`)
  }
}

/**
 * Upload video to Supabase Storage
 * Videos are already optimized MP4/H.264 - no re-encoding needed
 */
async function uploadVideoToSupabase(filePath, fileName) {
  try {
    const { readFile } = await import('fs/promises')
    const fileBuffer = await readFile(filePath)
    
    console.log(`  📤 Uploading to Supabase Storage...`)
    
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(fileName, fileBuffer, {
        contentType: 'video/mp4',
        upsert: true, // Overwrite if exists
        cacheControl: '31536000', // 1 year cache
      })

    if (error) {
      throw error
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(fileName)

    console.log(`  ✅ Uploaded: ${urlData.publicUrl}`)
    return urlData.publicUrl
  } catch (error) {
    throw new Error(`Upload failed: ${error.message}`)
  }
}

/**
 * Save metadata to database with Supabase Storage URLs
 */
async function saveToDatabase(metadata, supabaseVideoUrl, supabaseThumbnailUrl) {
  try {
    const { error } = await supabase
      .from('instagram_media')
      .upsert({
        post_url: metadata.postUrl,
        permalink: metadata.permalink,
        media_type: 'video',
        media_url: supabaseVideoUrl, // Supabase Storage URL
        thumbnail_url: supabaseThumbnailUrl || metadata.thumbnailUrl || null,
        video_url: supabaseVideoUrl, // Same - Supabase Storage URL
        caption: metadata.caption || null,
        username: metadata.username || null,
        post_id: metadata.postId || null,
        width: metadata.width || null,
        height: metadata.height || null,
        duration_seconds: metadata.durationSeconds || null,
        metadata: Object.keys(metadata.metadata || {}).length > 0 ? metadata.metadata : null,
        is_active: true,
        error_message: null,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'post_url',
      })
    
    if (error) {
      throw error
    }
    
    return true
  } catch (error) {
    console.error(`  ❌ Database error:`, error.message)
    return false
  }
}

/**
 * Upload thumbnail if available
 */
async function uploadThumbnailToSupabase(thumbnailUrl, fileName) {
  if (!thumbnailUrl) return null
  
  try {
    const response = await fetch(thumbnailUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://www.instagram.com/',
      },
    })
    
    if (!response.ok) return null
    
    const imageBuffer = Buffer.from(await response.arrayBuffer())
    const thumbFileName = fileName.replace('.mp4', '_thumb.jpg')
    
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(thumbFileName, imageBuffer, {
        contentType: 'image/jpeg',
        upsert: true,
        cacheControl: '31536000',
      })
    
    if (error) {
      console.log(`  ⚠️  Thumbnail upload failed: ${error.message}`)
      return null
    }
    
    const { data: urlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(thumbFileName)
    
    return urlData.publicUrl
  } catch (error) {
    return null
  }
}

/**
 * Main function
 */
async function main() {
  console.log('🎬 Downloading Instagram Videos (Highest Quality) to Supabase\n')
  console.log('='.repeat(70))
  console.log('📝 Note: Instagram videos are already MP4/H.264 (optimal for web)')
  console.log('   - Hardware accelerated decoding')
  console.log('   - Wide browser support')
  console.log('   - No re-encoding needed (preserves quality)\n')

  // Ensure temp directory exists
  if (!existsSync(TEMP_DIR)) {
    await mkdir(TEMP_DIR, { recursive: true })
  }

  await createBucketIfNeeded()

  // Read Instagram posts
  const postsFile = join(__dirname, '..', 'data', 'instagram-posts.json')
  const postsData = JSON.parse(await readFile(postsFile, 'utf-8'))
  const posts = (postsData.posts || []).filter(
    (post) => !post.includes('EXAMPLE_POST')
  )

  if (posts.length === 0) {
    console.log('❌ No posts found')
    process.exit(1)
  }

  console.log(`\n📋 Found ${posts.length} post(s)\n`)

  const results = {
    success: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  }

  // Process each post
  for (let i = 0; i < posts.length; i++) {
    const postUrl = posts[i]
    const postId = extractPostId(postUrl)
    
    console.log(`\n[${i + 1}/${posts.length}] ${postUrl}`)
    
    try {
      // Scrape metadata (gets highest quality video_url)
      const metadata = await scrapePostMetadata(postUrl)
      
      if (!metadata || metadata.isImage) {
        results.skipped++
        continue
      }
      
      // Download video
      const fileName = `${postId || `video-${i}`}.mp4`
      const localPath = join(TEMP_DIR, fileName)
      
      const downloaded = await downloadVideo(metadata.videoUrl, localPath)
      if (!downloaded) {
        results.failed++
        results.errors.push(`${postUrl}: Download failed`)
        continue
      }
      
      // Upload video to Supabase
      const supabaseVideoUrl = await uploadVideoToSupabase(localPath, fileName)
      
      // Upload thumbnail if available
      let supabaseThumbnailUrl = null
      if (metadata.thumbnailUrl) {
        supabaseThumbnailUrl = await uploadThumbnailToSupabase(metadata.thumbnailUrl, fileName)
      }
      
      // Save to database
      const saved = await saveToDatabase(metadata, supabaseVideoUrl, supabaseThumbnailUrl)
      if (!saved) {
        results.failed++
        results.errors.push(`${postUrl}: Database save failed`)
        continue
      }
      
      results.success++
      
      // Clean up local file
      try {
        const { unlink } = await import('fs/promises')
        await unlink(localPath)
      } catch (e) {
        // Ignore cleanup errors
      }
      
      // Rate limiting
      if (i < posts.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000))
      }
    } catch (error) {
      console.error(`  ❌ Error:`, error.message)
      results.failed++
      results.errors.push(`${postUrl}: ${error.message}`)
    }
  }

  // Summary
  console.log('\n' + '='.repeat(70))
  console.log('\n📊 Summary:')
  console.log(`  ✅ Success: ${results.success}`)
  console.log(`  ⏭️  Skipped: ${results.skipped}`)
  console.log(`  ❌ Failed: ${results.failed}`)
  
  if (results.errors.length > 0) {
    console.log('\n❌ Errors:')
    results.errors.forEach(err => console.log(`  - ${err}`))
  }
  
  console.log('\n✨ Done! Videos are now in Supabase Storage.')
  console.log('   They will load efficiently with hardware acceleration.\n')
}

main().catch(console.error)


