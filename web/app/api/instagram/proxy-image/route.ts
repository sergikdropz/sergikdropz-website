import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

function instagramPermalinkFromUrl(mediaUrl: string): string | null {
  try {
    const u = new URL(mediaUrl)
    if (!u.hostname.includes('instagram.com')) return null
    const m = u.pathname.replace(/\/$/, '').match(/^\/(reel|p|tv)\/([^/?#]+)/)
    if (m) return `https://www.instagram.com/${m[1]}/${m[2]}/`
  } catch {
    return null
  }
  return null
}

/** When Instagram blocks direct /media URLs, oEmbed still exposes a CDN thumbnail. */
async function fetchOembedThumbnailUrl(permalink: string): Promise<string | null> {
  const cleanUrl = permalink.split('?')[0].trim()
  const ua =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

  try {
    const oembedUrl = `https://api.instagram.com/oembed?url=${encodeURIComponent(cleanUrl)}`
    const res = await fetch(oembedUrl, {
      headers: { 'User-Agent': ua, Accept: 'application/json' },
      cache: 'no-store',
    })
    if (res.ok) {
      const data = (await res.json()) as { thumbnail_url?: string }
      if (data.thumbnail_url) return data.thumbnail_url
    }
  } catch {
    // ignore
  }

  const appId =
    process.env.META_APP_ID || process.env.FACEBOOK_APP_ID || process.env.INSTAGRAM_APP_ID
  const appSecret =
    process.env.META_APP_SECRET || process.env.FACEBOOK_APP_SECRET || process.env.INSTAGRAM_APP_SECRET
  if (!appId || !appSecret) return null

  try {
    const token = `${appId}|${appSecret}`
    const graphUrl = `https://graph.facebook.com/v18.0/instagram_oembed?url=${encodeURIComponent(
      cleanUrl,
    )}&access_token=${encodeURIComponent(token)}`
    const res = await fetch(graphUrl, { cache: 'no-store' })
    if (!res.ok) return null
    const data = (await res.json()) as { thumbnail_url?: string }
    return data.thumbnail_url || null
  } catch {
    return null
  }
}

/**
 * Proxy endpoint to fetch Instagram images and videos server-side
 * This avoids CORS and 403 errors by fetching media on the server
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  let mediaUrl = searchParams.get('url')

  if (!mediaUrl) {
    return NextResponse.json(
      { error: 'Missing url parameter' },
      { status: 400 }
    )
  }

  // Decode the URL to check for recursive proxy calls
  try {
    mediaUrl = decodeURIComponent(mediaUrl)
  } catch (e) {
    // If decoding fails, use original
  }

  // Prevent recursive proxy calls - if URL already contains proxy endpoint, extract the original URL
  if (mediaUrl.includes('/api/instagram/proxy-image')) {
    // Extract the original URL from the recursive proxy URL
    const recursiveMatch = mediaUrl.match(/proxy-image\?url=([^&]+)/)
    if (recursiveMatch && recursiveMatch[1]) {
      try {
        mediaUrl = decodeURIComponent(recursiveMatch[1])
      } catch (e) {
        return NextResponse.json(
          { error: 'Invalid recursive proxy URL' },
          { status: 400 }
        )
      }
    } else {
      return NextResponse.json(
        { error: 'Recursive proxy URL detected' },
        { status: 400 }
      )
    }
  }

  // Validate that the URL is actually an Instagram URL or a valid media URL
  if (!mediaUrl.startsWith('http://') && !mediaUrl.startsWith('https://')) {
    return NextResponse.json(
      { error: 'Invalid URL format' },
      { status: 400 }
    )
  }

  try {
    // Determine if this is a video or image based on URL
    const isVideo = mediaUrl.includes('.mp4') || mediaUrl.includes('video') || mediaUrl.includes('reel')
    
    // Get Range header for video streaming
    const range = request.headers.get('Range')
    
    // Prepare headers for Instagram request
    const fetchHeaders: HeadersInit = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': 'https://www.instagram.com/',
      'Accept': isVideo 
        ? 'video/mp4,video/*,*/*;q=0.8'
        : 'image/webp,image/apng,image/*,*/*;q=0.8',
    }
    
    // Pass through Range header for video streaming
    if (range && isVideo) {
      fetchHeaders['Range'] = range
    }
    
    // Fetch the media from Instagram
    let response: Response
    let recoveredViaOembed = false
    try {
      response = await fetch(mediaUrl, {
        headers: fetchHeaders,
        // Add timeout for video requests
        signal: isVideo ? AbortSignal.timeout(30000) : undefined, // 30 second timeout for videos
      })
    } catch (fetchError: any) {
      console.error(`Error fetching media from ${mediaUrl}:`, fetchError.message)
      
      // If it's a video and we get a network error, it's likely blocked by Instagram
      if (isVideo) {
        return NextResponse.json(
          { 
            error: 'Video access blocked',
            message: 'Instagram videos cannot be accessed directly. The video may be blocked by Instagram.',
            requiresDownload: true,
          },
          { status: 403 }
        )
      }
      
      return NextResponse.json(
        { error: 'Failed to fetch media', message: fetchError.message },
        { status: 500 }
      )
    }

    if (!response.ok) {
      console.error(`Failed to fetch media: ${response.status} ${response.statusText}`)

      const permalink = instagramPermalinkFromUrl(mediaUrl)
      if (permalink && (response.status === 404 || response.status === 403)) {
        const thumb = await fetchOembedThumbnailUrl(permalink)
        if (thumb) {
          try {
            const imgRes = await fetch(thumb, {
              headers: {
                'User-Agent': fetchHeaders['User-Agent'] as string,
                Referer: 'https://www.instagram.com/',
                Accept: 'image/webp,image/apng,image/*,*/*;q=0.8',
              },
            })
            if (imgRes.ok) {
              response = imgRes
              recoveredViaOembed = true
            }
          } catch (e) {
            console.error('oEmbed thumbnail fetch failed:', e)
          }
        }
      }

      if (!response.ok) {
        // For videos, provide more helpful error message
        if (isVideo && response.status === 403) {
          return NextResponse.json(
            {
              error: 'Video access forbidden',
              message: 'Instagram videos are blocked from direct access. The video may not be playable.',
              requiresDownload: true,
            },
            { status: 403 },
          )
        }

        return NextResponse.json(
          { error: 'Failed to fetch media', status: response.status },
          { status: response.status },
        )
      }
    }

    const streamAsVideo = isVideo && !recoveredViaOembed

    // Get content type and length
    const contentType =
      response.headers.get('content-type') || (streamAsVideo ? 'video/mp4' : 'image/jpeg')
    const contentLength = response.headers.get('content-length')
    const contentRange = response.headers.get('content-range')
    
    // For videos, stream the response instead of loading into memory
    // For images, we can load into memory (they're smaller)
    if (streamAsVideo && response.body) {
      // Stream video directly
      const responseHeaders: HeadersInit = {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400, s-maxage=86400',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': 'Range',
        'Accept-Ranges': 'bytes',
      }
      
      if (contentLength) {
        responseHeaders['Content-Length'] = contentLength
      }
      if (contentRange) {
        responseHeaders['Content-Range'] = contentRange
      }

      const status = range && response.status === 206 ? 206 : response.status

      return new NextResponse(response.body, {
        status,
        headers: responseHeaders,
      })
    } else {
      // For images, load into memory
      const mediaBuffer = await response.arrayBuffer()

      const responseHeaders: HeadersInit = {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400, s-maxage=86400',
        'Access-Control-Allow-Origin': '*',
        'Accept-Ranges': 'bytes',
      }
      
      if (contentLength) {
        responseHeaders['Content-Length'] = contentLength
      }
      if (contentRange) {
        responseHeaders['Content-Range'] = contentRange
      }

      return new NextResponse(mediaBuffer, {
        status: response.status,
        headers: responseHeaders,
      })
    }
  } catch (error) {
    console.error('Error proxying media:', error)
    return NextResponse.json(
      { error: 'Failed to proxy media' },
      { status: 500 }
    )
  }
}

