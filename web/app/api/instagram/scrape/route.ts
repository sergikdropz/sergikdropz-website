import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'
import instagramPostsData from '@/data/instagram-posts.json'

interface ScrapedMedia {
  postUrl: string
  permalink: string
  mediaType: 'image' | 'video'
  mediaUrl: string
  thumbnailUrl?: string
  videoUrl?: string
  caption?: string
  username?: string
  postId?: string
  width?: number
  height?: number
  durationSeconds?: number
  metadata?: any
}

/**
 * Extract post ID from Instagram URL
 */
function extractPostId(url: string): string | null {
  const match = url.match(/instagram\.com\/(?:p|reel)\/([^\/\?]+)/)
  return match ? match[1] : null
}

/**
 * Extract username from Instagram URL
 */
function extractUsername(url: string): string | null {
  const match = url.match(/instagram\.com\/([^\/]+)/)
  return match && !['p', 'reel', 'tv'].includes(match[1]) ? match[1] : null
}

/**
 * Scrape Instagram post metadata from HTML
 */
async function scrapePostMetadata(postUrl: string): Promise<ScrapedMedia | null> {
  try {
    const cleanUrl = postUrl.split('?')[0].trim()
    
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
      console.error(`Failed to fetch ${cleanUrl}: ${response.status}`)
      return null
    }
    
    const html = await response.text()
    
    // Extract metadata
    let imageUrl: string | null = null
    let videoUrl: string | null = null
    let thumbnailUrl: string | null = null
    let caption: string | null = null
    let width: number | undefined
    let height: number | undefined
    let durationSeconds: number | undefined
    const metadata: any = {}
    
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
          const owner = postData.owner
          if (owner?.username) {
            metadata.username = owner.username
          }
          
          // Check if video
          if (postData.is_video) {
            videoUrl = postData.video_url
            thumbnailUrl = postData.display_url || postData.display_resources?.[postData.display_resources.length - 1]?.src
            
            // Get video dimensions
            if (postData.dimensions) {
              width = postData.dimensions.width
              height = postData.dimensions.height
            }
            
            // Try to get duration
            if (postData.video_duration) {
              durationSeconds = Math.round(postData.video_duration)
            }
          } else {
            // Image post
            imageUrl = postData.display_url || postData.display_resources?.[postData.display_resources.length - 1]?.src
            
            if (postData.dimensions) {
              width = postData.dimensions.width
              height = postData.dimensions.height
            }
          }
          
          // Get engagement metrics
          if (postData.edge_media_preview_like?.count !== undefined) {
            metadata.likes = postData.edge_media_preview_like.count
          }
          if (postData.edge_media_to_comment?.count !== undefined) {
            metadata.comments = postData.edge_media_to_comment.count
          }
        }
      } catch (e) {
        console.error('Error parsing _sharedData:', e)
      }
    }
    
    // Method 2: Try og:image meta tag (fallback)
    if (!imageUrl && !videoUrl) {
      const ogImageMatch = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i)
      if (ogImageMatch && ogImageMatch[1]) {
        imageUrl = ogImageMatch[1]
          .replace(/&amp;/g, '&')
          .replace(/&quot;/g, '"')
      }
    }
    
    // Method 3: Try og:video meta tag
    if (!videoUrl) {
      const ogVideoMatch = html.match(/<meta\s+property=["']og:video["']\s+content=["']([^"']+)["']/i)
      if (ogVideoMatch && ogVideoMatch[1]) {
        videoUrl = ogVideoMatch[1]
          .replace(/&amp;/g, '&')
          .replace(/&quot;/g, '"')
      }
    }
    
    // Determine media type
    const isVideo = cleanUrl.includes('/reel/') || cleanUrl.includes('/tv/') || videoUrl !== null
    const mediaType: 'image' | 'video' = isVideo ? 'video' : 'image'
    
    // Use video URL if available, otherwise image URL
    const mediaUrl = videoUrl || imageUrl || thumbnailUrl
    
    if (!mediaUrl) {
      console.error(`No media URL found for ${cleanUrl}`)
      return null
    }
    
    // Extract post ID and username
    const postId = extractPostId(cleanUrl)
    const username = extractUsername(cleanUrl) || metadata.username
    
    return {
      postUrl: cleanUrl,
      permalink: cleanUrl,
      mediaType,
      mediaUrl, // This will be proxied
      thumbnailUrl: thumbnailUrl ?? (isVideo ? (imageUrl ?? undefined) : undefined),
      videoUrl: videoUrl ?? undefined,
      caption: caption ?? undefined,
      username: username ?? undefined,
      postId: postId || undefined,
      width,
      height,
      durationSeconds,
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
    }
  } catch (error) {
    console.error(`Error scraping ${postUrl}:`, error)
    return null
  }
}

/**
 * Save scraped media to database
 */
/**
 * Save scraped media metadata to database
 * 
 * NOTE: This function saves PROXIED URLs (not Supabase Storage URLs).
 * For video uploads to Supabase Storage, use: download-instagram-videos-to-supabase.mjs
 * 
 * The proxy endpoint is used to avoid CORS and 403 errors from Instagram,
 * but for reliable video playback, videos should be downloaded and uploaded
 * to Supabase Storage using the download script.
 */
async function saveMediaToDatabase(media: ScrapedMedia, supabase: any) {
  try {
    // Use proxy endpoint for media URLs
    // NOTE: For videos, consider using download-instagram-videos-to-supabase.mjs
    // to upload videos to Supabase Storage for direct playback
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
      console.error('Error saving to database:', error)
      return false
    }
    
    return true
  } catch (error) {
    console.error('Error in saveMediaToDatabase:', error)
    return false
  }
}

export async function POST(request: Request) {
  try {
    const { postUrls } = await request.json().catch(() => ({}))
    
    // Get posts from request or use data file
    const posts = postUrls || (instagramPostsData.posts || []).filter(
      (post: string) => !post.includes('EXAMPLE_POST')
    )
    
    if (posts.length === 0) {
      return NextResponse.json(
        { error: 'No posts to scrape' },
        { status: 400 }
      )
    }
    
    const supabase = createSupabaseServerClient()
    const results = {
      success: 0,
      failed: 0,
      errors: [] as string[],
    }
    
    // Scrape each post
    for (const postUrl of posts) {
      try {
        const scraped = await scrapePostMetadata(postUrl)
        
        if (scraped) {
          const saved = await saveMediaToDatabase(scraped, supabase)
          if (saved) {
            results.success++
          } else {
            results.failed++
            results.errors.push(`Failed to save ${postUrl}`)
          }
        } else {
          results.failed++
          results.errors.push(`Failed to scrape ${postUrl}`)
        }
      } catch (error: any) {
        results.failed++
        results.errors.push(`${postUrl}: ${error.message}`)
      }
      
      // Rate limiting - wait between requests
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
    
    return NextResponse.json({
      message: `Scraped ${results.success} posts, ${results.failed} failed`,
      results,
    })
  } catch (error: any) {
    console.error('Error in scrape route:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to scrape Instagram posts' },
      { status: 500 }
    )
  }
}

export async function GET(request: Request) {
  try {
    const supabase = createSupabaseServerClient()
    const { searchParams } = new URL(request.url)
    const username = searchParams.get('username')
    const limit = parseInt(searchParams.get('limit') || '100', 10)
    
    let query = supabase
      .from('instagram_media')
      .select('*')
      .eq('is_active', true)
      .order('scraped_at', { ascending: false })
      .limit(limit)
    
    if (username) {
      query = query.eq('username', username)
    }
    
    const { data, error } = await query
    
    if (error) {
      console.error('Error fetching from database:', error)
      return NextResponse.json(
        { error: 'Failed to fetch media' },
        { status: 500 }
      )
    }
    
    // Transform to match expected format
    const media = (data || []).map((item: any) => ({
      url: item.post_url,
      mediaUrl: item.video_url || item.media_url, // Use video_url for videos, media_url for images
      type: item.media_type,
      permalink: item.permalink,
      thumbnailUrl: item.thumbnail_url,
      caption: item.caption,
      metadata: item.metadata,
    }))
    
    return NextResponse.json({
      media,
      total: media.length,
      source: 'database',
    })
  } catch (error: any) {
    console.error('Error in GET scrape route:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch Instagram media' },
      { status: 500 }
    )
  }
}

