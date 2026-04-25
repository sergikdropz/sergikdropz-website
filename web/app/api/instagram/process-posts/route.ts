import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'
import { createWriteStream, readFileSync, mkdirSync, unlink } from 'fs'
import { join } from 'path'
import { pipeline } from 'stream/promises'
import { Readable } from 'stream'

/**
 * Process Instagram posts: scrape, download videos, upload to Supabase
 * This is called automatically when posts are saved via Instagram Helper
 */

// Helper to extract post ID
function extractPostId(url: string): string | null {
  const match = url.match(/instagram\.com\/(?:p|reel)\/([^\/\?]+)/)
  return match ? match[1] : null
}

// Helper to extract username
function extractUsername(url: string): string | null {
  const match = url.match(/instagram\.com\/([^\/]+)/)
  return match && !['p', 'reel', 'tv'].includes(match[1]) ? match[1] : null
}

/**
 * Scrape Instagram post to get video URL and metadata
 */
async function scrapePostMetadata(postUrl: string): Promise<{
  videoUrl: string | null
  thumbnailUrl: string | null
  caption: string | null
  width: number | null
  height: number | null
  durationSeconds: number | null
} | null> {
  try {
    const cleanUrl = postUrl.split('?')[0].trim()
    
    // Fetch the post page
    const response = await fetch(cleanUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.instagram.com/',
      },
    })
    
    if (!response.ok) {
      console.error(`Failed to fetch ${cleanUrl}: ${response.status}`)
      return null
    }
    
    const html = await response.text()
    
    // Try to find video URL in window._sharedData
    let videoUrl: string | null = null
    let thumbnailUrl: string | null = null
    let caption: string | null = null
    let width: number | null = null
    let height: number | null = null
    let durationSeconds: number | null = null
    
    const sharedDataMatch = html.match(/window\._sharedData\s*=\s*({[\s\S]+?});/)
    if (sharedDataMatch) {
      try {
        const sharedData = JSON.parse(sharedDataMatch[1])
        const postData = sharedData?.entry_data?.PostPage?.[0]?.graphql?.shortcode_media
        
        if (postData) {
          if (postData.is_video && postData.video_url) {
            videoUrl = postData.video_url
          }
          if (postData.display_url) {
            thumbnailUrl = postData.display_url
          }
          if (postData.edge_media_to_caption?.edges?.[0]?.node?.text) {
            caption = postData.edge_media_to_caption.edges[0].node.text
          }
          if (postData.dimensions) {
            width = postData.dimensions.width
            height = postData.dimensions.height
          }
          if (postData.video_duration) {
            durationSeconds = Math.round(postData.video_duration)
          }
        }
      } catch (e) {
        console.error('Error parsing _sharedData:', e)
      }
    }
    
    // Fallback: Try og:video meta tag
    if (!videoUrl) {
      const ogVideoMatch = html.match(/<meta\s+property=["']og:video["']\s+content=["']([^"']+)["']/i)
      if (ogVideoMatch && ogVideoMatch[1]) {
        videoUrl = ogVideoMatch[1].replace(/&amp;/g, '&')
      }
    }
    
    // Fallback: Try og:image for thumbnail
    if (!thumbnailUrl) {
      const ogImageMatch = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i)
      if (ogImageMatch && ogImageMatch[1]) {
        thumbnailUrl = ogImageMatch[1].replace(/&amp;/g, '&')
      }
    }
    
    return {
      videoUrl,
      thumbnailUrl,
      caption,
      width,
      height,
      durationSeconds,
    }
  } catch (error) {
    console.error(`Error scraping ${postUrl}:`, error)
    return null
  }
}

/**
 * Download video from URL
 */
async function downloadVideo(videoUrl: string, filePath: string): Promise<boolean> {
  try {
    const response = await fetch(videoUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://www.instagram.com/',
      },
    })
    
    if (!response.ok) {
      console.error(`Failed to download video: ${response.status}`)
      return false
    }
    
    // Ensure directory exists
    const dir = join(filePath, '..')
    mkdirSync(dir, { recursive: true })
    
    // Stream video to file
    const fileStream = createWriteStream(filePath)
    await pipeline(Readable.fromWeb(response.body as any), fileStream)
    
    return true
  } catch (error) {
    console.error('Error downloading video:', error)
    return false
  }
}

/**
 * Upload video to Supabase Storage
 */
async function uploadVideoToSupabase(filePath: string, fileName: string, supabase: any): Promise<string | null> {
  try {
    const fileBuffer = readFileSync(filePath)
    
    // Ensure bucket exists
    const { data: buckets } = await supabase.storage.listBuckets()
    const bucketExists = buckets?.some((b: any) => b.name === 'instagram-videos')
    
    if (!bucketExists) {
      const { error: createError } = await supabase.storage.createBucket('instagram-videos', {
        public: true,
        fileSizeLimit: 100 * 1024 * 1024, // 100MB
      })
      if (createError) {
        console.error('Error creating bucket:', createError)
      }
    }
    
    const { data, error } = await supabase.storage
      .from('instagram-videos')
      .upload(fileName, fileBuffer, {
        contentType: 'video/mp4',
        upsert: true,
      })
    
    if (error) {
      console.error('Upload error:', error)
      return null
    }
    
    // Get public URL
    const { data: urlData } = supabase.storage
      .from('instagram-videos')
      .getPublicUrl(fileName)
    
    return urlData.publicUrl
  } catch (error) {
    console.error('Error uploading video:', error)
    return null
  }
}

/**
 * Upload thumbnail to Supabase Storage
 */
async function uploadThumbnailToSupabase(thumbnailUrl: string, fileName: string, supabase: any): Promise<string | null> {
  try {
    const response = await fetch(thumbnailUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://www.instagram.com/',
      },
    })
    
    if (!response.ok) {
      return null
    }
    
    const imageBuffer = Buffer.from(await response.arrayBuffer())
    const thumbFileName = fileName.replace('.mp4', '.jpg')
    
    const { data, error } = await supabase.storage
      .from('instagram-videos')
      .upload(thumbFileName, imageBuffer, {
        contentType: 'image/jpeg',
        upsert: true,
      })
    
    if (error) {
      return null
    }
    
    const { data: urlData } = supabase.storage
      .from('instagram-videos')
      .getPublicUrl(thumbFileName)
    
    return urlData.publicUrl
  } catch (error) {
    return null
  }
}

/**
 * Try to get video URL from Instagram Graph API
 */
async function getVideoUrlFromAPI(postUrl: string): Promise<{
  videoUrl: string | null
  thumbnailUrl: string | null
  caption: string | null
} | null> {
  const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN
  const userId = process.env.INSTAGRAM_USER_ID
  
  if (!accessToken || !userId) {
    return null
  }
  
  try {
    // Extract post ID from URL
    const postId = extractPostId(postUrl)
    if (!postId) return null
    
    // Try to find the media in user's recent media
    // Instagram Graph API uses graph.facebook.com, not graph.instagram.com
    // Note: Includes collaboration posts where you are the original author
    const apiUrl = `https://graph.facebook.com/v18.0/${userId}/media?fields=id,media_type,media_url,permalink,thumbnail_url,caption,username&access_token=${accessToken}&limit=100`
    const response = await fetch(apiUrl)
    
    if (!response.ok) {
      return null
    }
    
    const data = await response.json()
    if (!data.data) return null
    
    // Find matching post by permalink
    const cleanUrl = postUrl.split('?')[0].trim()
    const matchingPost = data.data.find((item: any) => {
      const itemPermalink = item.permalink?.split('?')[0].trim()
      return itemPermalink === cleanUrl || itemPermalink?.includes(postId)
    })
    
    if (matchingPost && matchingPost.media_type === 'VIDEO') {
      return {
        videoUrl: matchingPost.media_url,
        thumbnailUrl: matchingPost.thumbnail_url || matchingPost.media_url,
        caption: matchingPost.caption || null,
      }
    }
    
    return null
  } catch (error) {
    console.error('Error fetching from Instagram API:', error)
    return null
  }
}

export async function POST(request: Request) {
  try {
    const { postUrls } = await request.json()
    
    if (!Array.isArray(postUrls) || postUrls.length === 0) {
      return NextResponse.json(
        { error: 'postUrls must be a non-empty array' },
        { status: 400 }
      )
    }
    
    const supabase = createSupabaseServerClient()
    const results = {
      processed: 0,
      videosDownloaded: 0,
      imagesProcessed: 0,
      errors: [] as string[],
    }
    
    // Create temp directory
    const tempDir = join(process.cwd(), 'temp', 'instagram-videos')
    mkdirSync(tempDir, { recursive: true })
    
    // Process each post
    for (const postUrl of postUrls) {
      try {
        const cleanUrl = postUrl.split('?')[0].trim()
        const postId = extractPostId(cleanUrl)
        const isVideo = cleanUrl.includes('/reel/')
        
        if (!postId) {
          results.errors.push(`${cleanUrl}: Invalid post ID`)
          continue
        }
        
        // Try Instagram Graph API first (if credentials available)
        let metadata = null
        if (isVideo) {
          const apiData = await getVideoUrlFromAPI(cleanUrl)
          if (apiData) {
            metadata = {
              videoUrl: apiData.videoUrl,
              thumbnailUrl: apiData.thumbnailUrl,
              caption: apiData.caption,
              width: null,
              height: null,
              durationSeconds: null,
            }
          }
        }
        
        // Fallback to scraping if API didn't work
        if (!metadata) {
          metadata = await scrapePostMetadata(cleanUrl)
        }
        
        if (!metadata) {
          results.errors.push(`${cleanUrl}: Failed to get metadata (scraping blocked or API credentials missing)`)
          continue
        }
        
        let supabaseVideoUrl: string | null = null
        let supabaseThumbnailUrl: string | null = null
        
        // If it's a video, download and upload
        if (isVideo && metadata.videoUrl) {
          const fileName = `${postId}.mp4`
          const tempPath = join(tempDir, fileName)
          
          // Download video
          const downloaded = await downloadVideo(metadata.videoUrl, tempPath)
          
          if (downloaded) {
            // Upload to Supabase
            supabaseVideoUrl = await uploadVideoToSupabase(tempPath, fileName, supabase)
            
            if (supabaseVideoUrl) {
              results.videosDownloaded++
              
              // Clean up temp file
              try {
                const { unlink: unlinkAsync } = await import('fs/promises')
                await unlinkAsync(tempPath)
              } catch (e) {
                // Ignore cleanup errors
              }
            }
          }
          
          // Upload thumbnail if available
          if (metadata.thumbnailUrl) {
            supabaseThumbnailUrl = await uploadThumbnailToSupabase(
              metadata.thumbnailUrl,
              fileName,
              supabase
            )
          }
        } else if (metadata.thumbnailUrl) {
          // For images, just upload thumbnail
          const fileName = `${postId}.jpg`
          supabaseThumbnailUrl = await uploadThumbnailToSupabase(
            metadata.thumbnailUrl,
            fileName,
            supabase
          )
          results.imagesProcessed++
        }
        
        // Update database with Supabase URLs
        const username = extractUsername(cleanUrl) || 'sergikdropz'
        
        const updateData: any = {
          media_type: isVideo ? 'video' : 'image',
          caption: metadata.caption,
          username: username,
          post_id: postId,
          width: metadata.width,
          height: metadata.height,
          duration_seconds: metadata.durationSeconds,
          is_active: true,
          error_message: null,
          updated_at: new Date().toISOString(),
        }
        
        // Use Supabase Storage URLs (not Instagram URLs)
        if (supabaseVideoUrl) {
          updateData.video_url = supabaseVideoUrl
          updateData.media_url = supabaseVideoUrl // Use video URL for media_url too
        } else if (supabaseThumbnailUrl) {
          updateData.media_url = supabaseThumbnailUrl
        }
        
        if (supabaseThumbnailUrl) {
          updateData.thumbnail_url = supabaseThumbnailUrl
        }
        
        const { error: updateError } = await supabase
          .from('instagram_media')
          .upsert({
            post_url: cleanUrl,
            permalink: cleanUrl,
            ...updateData,
          }, {
            onConflict: 'post_url',
          })
        
        if (updateError) {
          results.errors.push(`${cleanUrl}: ${updateError.message}`)
        } else {
          results.processed++
        }
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 2000))
        
      } catch (error: any) {
        results.errors.push(`${postUrl}: ${error.message}`)
      }
    }
    
    return NextResponse.json({
      success: true,
      results,
    })
  } catch (error: any) {
    console.error('Error processing posts:', error)
    return NextResponse.json(
      { error: 'Failed to process posts', details: error.message },
      { status: 500 }
    )
  }
}

