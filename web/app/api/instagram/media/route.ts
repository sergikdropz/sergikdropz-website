import { NextResponse } from 'next/server'
import instagramPostsData from '@/data/instagram-posts.json'

interface InstagramMedia {
  url: string
  mediaUrl: string
  type: 'image' | 'video'
  permalink: string
  videoUrl?: string
  thumbnailUrl?: string
  caption?: string
}

/**
 * Helper to create proxy URL for Instagram URLs (avoids CORS issues)
 * Prevents double-proxying by checking if URL is already a proxy URL
 */
function createProxyUrl(url: string): string {
  // If URL is already a proxy URL, return as-is
  if (url.includes('/api/instagram/proxy-image')) {
    return url
  }
  
  // If URL is not a full URL (starts with http/https), it might be a relative path
  // In that case, don't proxy it
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return url
  }
  
  return `/api/instagram/proxy-image?url=${encodeURIComponent(url)}`
}

/**
 * Fetch Instagram post media using oEmbed API
 * This gets just the media URL without captions
 */
async function fetchPostMedia(postUrl: string): Promise<InstagramMedia | null> {
  try {
    const cleanUrl = postUrl.split('?')[0].trim()
    
    const oembedUrl = `https://api.instagram.com/oembed?url=${encodeURIComponent(cleanUrl)}`
    const response = await fetch(oembedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    })
    
    if (response.ok) {
      const data = await response.json()
      const originalMediaUrl = data.thumbnail_url || null
      
      if (originalMediaUrl) {
        const mediaUrl = createProxyUrl(originalMediaUrl)
        const isVideo = cleanUrl.includes('/reel/')
        
        return {
          url: cleanUrl,
          mediaUrl,
          type: isVideo ? 'video' : 'image',
          permalink: cleanUrl,
        }
      }
    }
    
    return null
  } catch (error: any) {
    // Silently fail - we'll use fallback methods
    return null
  }
}

/**
 * Use Instagram post URL pattern to construct image URL
 * This is a fast, reliable method that works in both dev and prod
 */
function getInstagramImageUrl(postUrl: string): string | null {
  try {
    const cleanUrl = postUrl.split('?')[0].trim()
    const postIdMatch = cleanUrl.match(/instagram\.com\/(?:p|reel)\/([^\/]+)/)
    if (postIdMatch && postIdMatch[1]) {
      const postId = postIdMatch[1]
      return `https://www.instagram.com/p/${postId}/media/?size=l`
    }
    return null
  } catch (error) {
    return null
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const username = searchParams.get('username')
  const limit = parseInt(searchParams.get('limit') || '100', 10)

  try {
    // PRIORITY 1: Use Instagram Graph API (if credentials available)
    const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN
    const userId = process.env.INSTAGRAM_USER_ID

    if (accessToken && userId) {
      try {
        const allMedia: any[] = []
        let nextUrl: string | null = `https://graph.facebook.com/v18.0/${userId}/media?fields=id,media_type,media_url,permalink,thumbnail_url,caption,timestamp,username,children{id,media_type,media_url,permalink,thumbnail_url}&access_token=${accessToken}&limit=100`
        let pageCount = 0
        const maxPages = 50

        while (nextUrl && pageCount < maxPages && allMedia.length < limit) {
          const response: Response = await fetch(nextUrl)
          
          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}))
            console.error('Instagram API error:', response.status, errorData)
            
            if (allMedia.length > 0) {
              break
            }
            break
          }

          const data = await response.json()
          
          if (!data.data || data.data.length === 0) {
            break
          }

          const pageMedia = data.data.map((item: any) => {
            const isVideo = item.media_type === 'VIDEO'
            
            const mediaUrl = isVideo 
              ? (item.thumbnail_url ? createProxyUrl(item.thumbnail_url) : createProxyUrl(item.media_url))
              : (item.media_url ? createProxyUrl(item.media_url) : createProxyUrl(item.thumbnail_url))
            
            const videoUrl = isVideo && item.media_url 
              ? createProxyUrl(item.media_url)
              : undefined
            
            const thumbnailUrl = item.thumbnail_url 
              ? createProxyUrl(item.thumbnail_url)
              : undefined

            return {
              url: item.permalink,
              mediaUrl,
              videoUrl,
              type: isVideo ? 'video' : 'image',
              permalink: item.permalink,
              thumbnailUrl,
              caption: item.caption,
            }
          })
          
          allMedia.push(...pageMedia)

          if (data.paging && data.paging.next && allMedia.length < limit) {
            nextUrl = data.paging.next
            pageCount++
          } else {
            nextUrl = null
          }
        }
        
        if (allMedia.length > 0) {
          const media = allMedia.slice(0, limit)
          
          return NextResponse.json({
            media,
            total: allMedia.length,
            returned: media.length,
            source: 'api',
          })
        }
      } catch (apiError) {
        console.error('Instagram API request error:', apiError)
      }
    }

    // PRIORITY 2: File-based posts (PRIMARY source - works in both dev and prod)
    // Skip database to match development behavior exactly
    const posts = instagramPostsData.posts || []
    const realPosts = posts.filter(
      (post: string) => !post.includes('EXAMPLE_POST') && post.trim().length > 0
    )

    if (realPosts.length === 0) {
      return NextResponse.json({
        media: [],
        message: 'No posts configured.',
        source: 'file',
      })
    }

    // Process posts with simple, reliable methods
    const postsToFetch = realPosts.slice(0, limit)
    
    const mediaPromises = postsToFetch.map(async (postUrl: string) => {
      try {
        const cleanUrl = postUrl.split('?')[0].trim()
        
        // Method 1: Try constructed URL (fastest, no external request)
        const constructedUrl = getInstagramImageUrl(postUrl)
        if (constructedUrl) {
          return {
            url: cleanUrl,
            mediaUrl: createProxyUrl(constructedUrl),
            type: postUrl.includes('/reel/') ? 'video' as const : 'image' as const,
            permalink: cleanUrl,
          }
        }
        
        // Method 2: Try oEmbed (reliable, works in both dev and prod)
        const oembedResult = await Promise.race([
          fetchPostMedia(postUrl),
          new Promise<null>((_, reject) => 
            setTimeout(() => reject(new Error('Timeout')), 3000)
          )
        ]).catch(() => null)
        
        if (oembedResult) return oembedResult
        
        // Fallback: Return placeholder (always works)
        return {
          url: cleanUrl,
          mediaUrl: '/images/gallery/logo.png',
          type: postUrl.includes('/reel/') ? 'video' as const : 'image' as const,
          permalink: cleanUrl,
        }
      } catch (error) {
        // Always return something, even on error
        return {
          url: postUrl.split('?')[0].trim(),
          mediaUrl: '/images/gallery/logo.png',
          type: postUrl.includes('/reel/') ? 'video' as const : 'image' as const,
          permalink: postUrl.split('?')[0].trim(),
        }
      }
    })
    
    const mediaResults = await Promise.all(mediaPromises)
    const media = mediaResults.filter((m): m is InstagramMedia => m !== null)

    if (media.length > 0) {
      return NextResponse.json({
        media,
        total: realPosts.length,
        returned: media.length,
        source: 'file',
      })
    }

    // Final fallback: return posts with placeholders
    const fallbackMedia = postsToFetch.map((postUrl: string) => ({
      url: postUrl.split('?')[0].trim(),
      mediaUrl: '/images/gallery/logo.png',
      type: (postUrl.includes('/reel/') ? 'video' : 'image') as 'image' | 'video',
      permalink: postUrl.split('?')[0].trim(),
    }))

    return NextResponse.json({
      media: fallbackMedia,
      total: realPosts.length,
      returned: fallbackMedia.length,
      source: 'file',
    })
  } catch (error: any) {
    console.error('Error fetching Instagram media:', error)
    
    // Even on error, try to return file-based posts
    try {
      const posts = instagramPostsData.posts || []
      const realPosts = posts.filter(
        (post: string) => !post.includes('EXAMPLE_POST') && post.trim().length > 0
      )
      
      if (realPosts.length > 0) {
        const fallbackMedia = realPosts.slice(0, limit).map((postUrl: string) => ({
          url: postUrl.split('?')[0].trim(),
          mediaUrl: '/images/gallery/logo.png',
          type: (postUrl.includes('/reel/') ? 'video' : 'image') as 'image' | 'video',
          permalink: postUrl.split('?')[0].trim(),
        }))
        
        return NextResponse.json({
          media: fallbackMedia,
          total: realPosts.length,
          returned: fallbackMedia.length,
          source: 'file',
        })
      }
    } catch (fallbackError) {
      console.error('Fallback also failed:', fallbackError)
    }
    
    return NextResponse.json(
      { 
        error: 'Failed to fetch Instagram media',
        message: 'Unable to load Instagram posts. Please try again later.',
        media: [],
        source: 'error'
      },
      { status: 500 }
    )
  }
}
