import { NextResponse } from 'next/server'
import instagramPostsData from '@/data/instagram-posts.json'

/** Must stay in sync with placeholder checks in `InstagramMediaGrid.tsx` */
const PLACEHOLDER_MEDIA_PATH = '/images/gallery/logo.png'

interface InstagramMedia {
  url: string
  mediaUrl: string
  type: 'image' | 'video'
  permalink: string
  videoUrl?: string
  thumbnailUrl?: string
  caption?: string
}

function createProxyUrl(url: string): string {
  if (url.includes('/api/instagram/proxy-image')) return url
  if (!url.startsWith('http://') && !url.startsWith('https://')) return url
  return `/api/instagram/proxy-image?url=${encodeURIComponent(url)}`
}

/**
 * Instagram/Facebook CDNs usually allow browser requests; datacenter direct fetches often 403.
 * Prefer hotlinking CDN URLs from the client; keep proxy for video bytes and odd hosts.
 */
function clientImageDisplayUrl(url: string): string {
  if (!url.startsWith('http')) return url
  if (url.includes('supabase.co')) return url
  if (url.includes('/api/instagram/proxy-image')) return url
  try {
    const u = new URL(url)
    const pathAndQuery = `${u.pathname}${u.search}`
    const looksLikeVideo = /\.(mp4|m3u8|webm|mov)(\?|$)/i.test(pathAndQuery)
    if (looksLikeVideo) return createProxyUrl(url)
    const host = u.hostname
    const preferDirect =
      host.includes('cdninstagram.com') ||
      host.includes('fbcdn.net') ||
      (host.includes('instagram.com') && pathAndQuery.includes('/media/'))
    if (preferDirect) return url
  } catch {
    // fall through
  }
  return createProxyUrl(url)
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  try {
    return await Promise.race([
      promise,
      new Promise<T | null>((resolve) => setTimeout(() => resolve(null), ms)),
    ])
  } catch {
    return null
  }
}

async function fetchInstagramOembed(postUrl: string): Promise<InstagramMedia | null> {
  try {
    const cleanUrl = postUrl.split('?')[0].trim()
    const oembedUrl = `https://api.instagram.com/oembed?url=${encodeURIComponent(cleanUrl)}`
    const response = await fetch(oembedUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'application/json',
      },
      cache: 'no-store',
    })
    if (!response.ok) return null
    const data = (await response.json()) as { thumbnail_url?: string }
    const thumb = data.thumbnail_url
    if (!thumb) return null
    const isVideo = cleanUrl.includes('/reel/')
    const mediaUrl = clientImageDisplayUrl(thumb)
    return {
      url: cleanUrl,
      mediaUrl,
      type: isVideo ? 'video' : 'image',
      permalink: cleanUrl,
      thumbnailUrl: isVideo ? mediaUrl : undefined,
    }
  } catch {
    return null
  }
}

/**
 * Meta Graph instagram_oembed — works when public oEmbed is flaky; needs app id + secret.
 * https://developers.facebook.com/docs/graph-api/reference/instagram-oembed
 */
async function fetchFacebookInstagramOembed(postUrl: string): Promise<InstagramMedia | null> {
  const appId =
    process.env.META_APP_ID || process.env.FACEBOOK_APP_ID || process.env.INSTAGRAM_APP_ID
  const appSecret =
    process.env.META_APP_SECRET || process.env.FACEBOOK_APP_SECRET || process.env.INSTAGRAM_APP_SECRET
  if (!appId || !appSecret) return null

  try {
    const cleanUrl = postUrl.split('?')[0].trim()
    const token = `${appId}|${appSecret}`
    const graphUrl = `https://graph.facebook.com/v18.0/instagram_oembed?url=${encodeURIComponent(
      cleanUrl
    )}&access_token=${encodeURIComponent(token)}`
    const response = await fetch(graphUrl, { cache: 'no-store' })
    if (!response.ok) return null
    const data = (await response.json()) as { thumbnail_url?: string }
    const thumb = data.thumbnail_url
    if (!thumb) return null
    const isVideo = cleanUrl.includes('/reel/')
    const mediaUrl = clientImageDisplayUrl(thumb)
    return {
      url: cleanUrl,
      mediaUrl,
      type: isVideo ? 'video' : 'image',
      permalink: cleanUrl,
      thumbnailUrl: isVideo ? mediaUrl : undefined,
    }
  } catch {
    return null
  }
}

async function fetchPostOgImage(postUrl: string): Promise<string | null> {
  try {
    const cleanUrl = postUrl.split('?')[0].trim()
    const response = await fetch(cleanUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
      cache: 'no-store',
    })
    if (!response.ok) return null
    const html = await response.text()
    const m1 = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)
    const m2 = html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i)
    const raw = m1?.[1] || m2?.[1]
    if (!raw) return null
    return raw.replace(/&amp;/g, '&').replace(/&quot;/g, '"')
  } catch {
    return null
  }
}

function legacyMediaUrlCandidates(postUrl: string): string[] {
  const cleanUrl = postUrl.split('?')[0].trim()
  const m = cleanUrl.match(/instagram\.com\/(p|reel)\/([^/?#]+)/)
  if (!m?.[2]) return []
  const shortcode = m[2]
  const kind = m[1]
  if (kind === 'reel') {
    return [
      `https://www.instagram.com/reel/${shortcode}/media/?size=l`,
      `https://www.instagram.com/p/${shortcode}/media/?size=l`,
    ]
  }
  return [`https://www.instagram.com/p/${shortcode}/media/?size=l`]
}

function buildFromImageUrl(cleanUrl: string, imageUrl: string, postUrlForType: string): InstagramMedia {
  const isVideo = postUrlForType.includes('/reel/')
  const display = clientImageDisplayUrl(imageUrl)
  return {
    url: cleanUrl,
    mediaUrl: display,
    type: isVideo ? 'video' : 'image',
    permalink: cleanUrl,
    thumbnailUrl: isVideo ? display : undefined,
  }
}

async function resolvePostMedia(postUrl: string): Promise<InstagramMedia> {
  const cleanUrl = postUrl.split('?')[0].trim()

  const ig = await withTimeout(fetchInstagramOembed(postUrl), 9500)
  if (ig) return ig

  const fb = await withTimeout(fetchFacebookInstagramOembed(postUrl), 8500)
  if (fb) return fb

  const ogUrl = await withTimeout(fetchPostOgImage(postUrl), 12000)
  if (ogUrl) return buildFromImageUrl(cleanUrl, ogUrl, postUrl)

  const candidates = legacyMediaUrlCandidates(postUrl)
  if (candidates.length > 0) {
    return buildFromImageUrl(cleanUrl, candidates[0], postUrl)
  }

  return {
    url: cleanUrl,
    mediaUrl: PLACEHOLDER_MEDIA_PATH,
    type: postUrl.includes('/reel/') ? 'video' : 'image',
    permalink: cleanUrl,
  }
}

const cacheHeaders = {
  'Cache-Control': 'public, s-maxage=180, stale-while-revalidate=600',
}

/** Graph API version — keep in sync with Meta dashboard app settings */
const GRAPH_API_VERSION = 'v21.0'

/**
 * Instagram Graph CDN URLs often 403 in the browser when loaded directly (referrer / signed URL).
 * Proxy all Graph-sourced image/video bytes through our API so `<img>` / `<video>` load reliably.
 */
function graphProxiedUrl(url: string | undefined): string | undefined {
  if (!url || !url.startsWith('http')) return undefined
  return createProxyUrl(url)
}

/**
 * Map Graph `media` objects — handles CAROUSEL_ALBUM (parent often has no `media_url`).
 * INSTAGRAM_USER_ID must be the Instagram *business/creator* id from Graph (not Facebook Page id).
 */
function mapGraphMediaItem(item: Record<string, unknown>): InstagramMedia {
  let mediaType = item.media_type as string
  let media_url = item.media_url as string | undefined
  let thumbnail_url = item.thumbnail_url as string | undefined

  if (mediaType === 'CAROUSEL_ALBUM') {
    const children = (item.children as { data?: Record<string, unknown>[] } | undefined)?.data
    const first = children?.[0]
    if (first) {
      const childType = first.media_type as string | undefined
      const cMedia = first.media_url as string | undefined
      const cThumb = first.thumbnail_url as string | undefined
      if (childType === 'VIDEO') {
        thumbnail_url = cThumb || thumbnail_url
        media_url = cMedia || media_url
      } else {
        media_url = cMedia || media_url
        thumbnail_url = cThumb || thumbnail_url
      }
    }
  }

  let isVideo = mediaType === 'VIDEO'
  if (mediaType === 'CAROUSEL_ALBUM') {
    const children = (item.children as { data?: Record<string, unknown>[] } | undefined)?.data
    const firstType = children?.[0]?.media_type as string | undefined
    if (firstType === 'VIDEO') isVideo = true
  }

  const posterOrImage =
    isVideo
      ? thumbnail_url || media_url
      : media_url || thumbnail_url

  const mediaUrl = posterOrImage
    ? graphProxiedUrl(posterOrImage) || PLACEHOLDER_MEDIA_PATH
    : PLACEHOLDER_MEDIA_PATH

  const rawVideo =
    isVideo
      ? media_url ||
        (mediaType === 'VIDEO' ? (item.media_url as string | undefined) : undefined)
      : undefined
  const videoUrl = rawVideo ? graphProxiedUrl(rawVideo) : undefined

  const thumbnailUrl =
    isVideo && thumbnail_url ? graphProxiedUrl(thumbnail_url) : undefined

  return {
    url: item.permalink as string,
    mediaUrl,
    videoUrl,
    type: isVideo ? 'video' : 'image',
    permalink: item.permalink as string,
    thumbnailUrl,
    caption: item.caption as string | undefined,
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const limit = parseInt(searchParams.get('limit') || '100', 10)

  let graphDiagnostics: {
    attempted: boolean
    ok: boolean
    httpStatus?: number
    error?: { message: string; code?: number; type?: string; error_subcode?: number }
    hint?: string
  } = { attempted: false, ok: false }

  try {
    const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN
    const userId = process.env.INSTAGRAM_USER_ID

    if (accessToken && userId) {
      graphDiagnostics.attempted = true
      try {
        const fields = [
          'id',
          'media_type',
          'media_url',
          'permalink',
          'thumbnail_url',
          'caption',
          'timestamp',
          'username',
          'children{media_type,media_url,permalink,thumbnail_url}',
        ].join(',')
        const allMedia: InstagramMedia[] = []
        let nextUrl: string | null =
          `https://graph.facebook.com/${GRAPH_API_VERSION}/${userId}/media?fields=${encodeURIComponent(
            fields
          )}&access_token=${encodeURIComponent(accessToken)}&limit=100`
        let pageCount = 0
        const maxPages = 50

        while (nextUrl && pageCount < maxPages && allMedia.length < limit) {
          const response = await fetch(nextUrl)

          if (!response.ok) {
            const errorData = (await response.json().catch(() => ({}))) as {
              error?: { message?: string; code?: number; type?: string; error_subcode?: number }
            }
            console.error('Instagram API error:', response.status, errorData)
            graphDiagnostics.httpStatus = response.status
            graphDiagnostics.error = errorData.error
              ? {
                  message: String(errorData.error.message || 'Unknown error'),
                  code: errorData.error.code,
                  type: errorData.error.type,
                  error_subcode: errorData.error.error_subcode,
                }
              : { message: response.statusText || 'Request failed' }
            graphDiagnostics.hint =
              response.status === 401 || response.status === 190
                ? 'Long-lived token may be expired — renew in Meta Developer dashboard.'
                : response.status === 400
                  ? 'Confirm INSTAGRAM_USER_ID is the Instagram Business Account id (from GET /me/accounts + instagram_business_account), not the Facebook Page id.'
                  : undefined
            break
          }

          const data = await response.json()

          if (!data.data || data.data.length === 0) {
            graphDiagnostics.ok = true
            graphDiagnostics.hint =
              'Graph returned zero media. Check token scopes (instagram_basic, instagram_manage_insights if needed) and that the IG account has published posts.'
            break
          }

          graphDiagnostics.ok = true

          const pageMedia: InstagramMedia[] = data.data.map((row: Record<string, unknown>) =>
            mapGraphMediaItem(row)
          )

          allMedia.push(...pageMedia)

          if (data.paging?.next && allMedia.length < limit) {
            nextUrl = data.paging.next as string
            pageCount++
          } else {
            nextUrl = null
          }
        }

        if (allMedia.length > 0) {
          const media = allMedia.slice(0, limit)
          return NextResponse.json(
            {
              media,
              total: allMedia.length,
              returned: media.length,
              source: 'api',
              instagramGraph: graphDiagnostics,
            },
            { headers: cacheHeaders }
          )
        }
      } catch (apiError) {
        console.error('Instagram API request error:', apiError)
        graphDiagnostics.error = {
          message: apiError instanceof Error ? apiError.message : 'Instagram API request error',
        }
      }
    }

    const posts = instagramPostsData.posts || []
    const realPosts = posts.filter(
      (post: string) => !post.includes('EXAMPLE_POST') && post.trim().length > 0
    )

    if (realPosts.length === 0) {
      return NextResponse.json(
        {
          media: [],
          message: 'No posts configured.',
          source: 'file',
          ...(graphDiagnostics.attempted ? { instagramGraph: graphDiagnostics } : {}),
        },
        { headers: cacheHeaders }
      )
    }

    const postsToFetch = realPosts.slice(0, limit)
    const mediaResults = await Promise.all(postsToFetch.map((url) => resolvePostMedia(url)))
    const media = mediaResults.filter(Boolean)

    return NextResponse.json(
      {
        media,
        total: realPosts.length,
        returned: media.length,
        source: 'file',
        ...(graphDiagnostics.attempted ? { instagramGraph: graphDiagnostics } : {}),
      },
      { headers: cacheHeaders }
    )
  } catch (error: unknown) {
    console.error('Error fetching Instagram media:', error)

    try {
      const posts = instagramPostsData.posts || []
      const realPosts = posts.filter(
        (post: string) => !post.includes('EXAMPLE_POST') && post.trim().length > 0
      )

      if (realPosts.length > 0) {
        const fallbackMedia = realPosts.slice(0, limit).map((postUrl: string) => {
          const cleanUrl = postUrl.split('?')[0].trim()
          return {
            url: cleanUrl,
            mediaUrl: PLACEHOLDER_MEDIA_PATH,
            type: (postUrl.includes('/reel/') ? 'video' : 'image') as 'image' | 'video',
            permalink: cleanUrl,
          }
        })

        return NextResponse.json(
          {
            media: fallbackMedia,
            total: realPosts.length,
            returned: fallbackMedia.length,
            source: 'file',
          },
          { headers: cacheHeaders }
        )
      }
    } catch (fallbackError) {
      console.error('Fallback also failed:', fallbackError)
    }

    return NextResponse.json(
      {
        error: 'Failed to fetch Instagram media',
        message: 'Unable to load Instagram posts. Please try again later.',
        media: [],
        source: 'error',
      },
      { status: 500 }
    )
  }
}
