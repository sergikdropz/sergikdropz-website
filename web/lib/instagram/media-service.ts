import instagramPostsData from '@/data/instagram-posts.json'
import { loadManualPostsFromSettings } from '@/lib/instagram/manual-posts-settings'

/** Must stay in sync with placeholder checks in `InstagramMediaGrid.tsx` */
const PLACEHOLDER_MEDIA_PATH = '/images/gallery/logo.png'

export interface InstagramMedia {
  url: string
  mediaUrl: string
  type: 'image' | 'video'
  permalink: string
  videoUrl?: string
  thumbnailUrl?: string
  caption?: string
}

export type InstagramMediaPayload = {
  media: InstagramMedia[]
  total?: number
  returned?: number
  source: string
  message?: string
  instagramGraph?: {
    attempted: boolean
    ok: boolean
    httpStatus?: number
    error?: { message: string; code?: number; type?: string; error_subcode?: number }
    hint?: string
  }
  error?: string
}

function createProxyUrl(url: string): string {
  if (url.includes('/api/instagram/proxy-image')) return url
  if (!url.startsWith('http://') && !url.startsWith('https://')) return url
  return `/api/instagram/proxy-image?url=${encodeURIComponent(url)}`
}

/**
 * Instagram/Facebook CDNs often block hotlinking from arbitrary origins.
 * Use our proxy for thumbnails returned by oEmbed / OG / legacy URLs so `<img>` loads reliably.
 */
function thumbnailDisplayUrl(url: string): string {
  if (!url.startsWith('http')) return url
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
    const mediaUrl = thumbnailDisplayUrl(thumb)
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
    const mediaUrl = thumbnailDisplayUrl(thumb)
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
  const display = thumbnailDisplayUrl(imageUrl)
  return {
    url: cleanUrl,
    mediaUrl: display,
    type: isVideo ? 'video' : 'image',
    permalink: cleanUrl,
    thumbnailUrl: isVideo ? display : undefined,
  }
}

/** Resolve one post URL to displayable media (used by file fallback + preview). */
export async function resolvePostMediaForUrl(postUrl: string): Promise<InstagramMedia> {
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

/** Graph API version — keep in sync with Meta dashboard app settings */
const GRAPH_API_VERSION = 'v21.0'

function graphProxiedUrl(url: string | undefined): string | undefined {
  if (!url || !url.startsWith('http')) return undefined
  return createProxyUrl(url)
}

function mapGraphMediaItem(item: Record<string, unknown>): InstagramMedia {
  const mediaType = item.media_type as string
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
    isVideo ? thumbnail_url || media_url : media_url || thumbnail_url

  const mediaUrl = posterOrImage
    ? graphProxiedUrl(posterOrImage) || PLACEHOLDER_MEDIA_PATH
    : PLACEHOLDER_MEDIA_PATH

  const rawVideo =
    isVideo
      ? media_url || (mediaType === 'VIDEO' ? (item.media_url as string | undefined) : undefined)
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

export function normalizeInstagramPermalink(u: string): string {
  try {
    const clean = u.split('?')[0].trim()
    const x = new URL(clean.startsWith('http') ? clean : `https://${clean}`)
    const host = x.hostname.replace(/^www\./, '').toLowerCase()
    const path = x.pathname.replace(/\/$/, '') || '/'
    return `${host}${path}`.toLowerCase()
  } catch {
    return u.toLowerCase().trim()
  }
}

export function isPlaceholderMediaUrl(src: string | undefined): boolean {
  if (!src) return true
  return (
    src.includes('/images/gallery/logo.png') ||
    src.includes('/logo.svg') ||
    src.includes(PLACEHOLDER_MEDIA_PATH)
  )
}

/**
 * Same JSON body as `GET /api/instagram/media` — used by the route and by preview (no HTTP loopback).
 */
export async function getInstagramMediaPayload(limit: number): Promise<InstagramMediaPayload> {
  const graphDiagnostics: NonNullable<InstagramMediaPayload['instagramGraph']> = {
    attempted: false,
    ok: false,
  }

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
          return {
            media,
            total: allMedia.length,
            returned: media.length,
            source: 'api',
            instagramGraph: graphDiagnostics,
          }
        }
      } catch (apiError) {
        console.error('Instagram API request error:', apiError)
        graphDiagnostics.error = {
          message: apiError instanceof Error ? apiError.message : 'Instagram API request error',
        }
      }
    }

    const manual = await loadManualPostsFromSettings()
    const postsFromSource = manual?.posts ?? instagramPostsData.posts ?? []
    const realPosts = postsFromSource.filter(
      (post: string) => !post.includes('EXAMPLE_POST') && post.trim().length > 0
    )

    if (realPosts.length === 0) {
      return {
        media: [],
        message: 'No posts configured.',
        source: 'file',
        ...(graphDiagnostics.attempted ? { instagramGraph: graphDiagnostics } : {}),
      }
    }

    const postsToFetch = realPosts.slice(0, limit)
    const mediaResults = await Promise.all(postsToFetch.map((url) => resolvePostMediaForUrl(url)))
    const media = mediaResults.filter(Boolean)

    return {
      media,
      total: realPosts.length,
      returned: media.length,
      source: 'file',
      ...(graphDiagnostics.attempted ? { instagramGraph: graphDiagnostics } : {}),
    }
  } catch (error: unknown) {
    console.error('Error fetching Instagram media:', error)

    try {
      const manual = await loadManualPostsFromSettings()
      const postsFromSource = manual?.posts ?? instagramPostsData.posts ?? []
      const realPosts = postsFromSource.filter(
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

        return {
          media: fallbackMedia,
          total: realPosts.length,
          returned: fallbackMedia.length,
          source: 'file',
        }
      }
    } catch (fallbackError) {
      console.error('Fallback also failed:', fallbackError)
    }

    return {
      error: 'Failed to fetch Instagram media',
      message: 'Unable to load Instagram posts. Please try again later.',
      media: [],
      source: 'error',
    }
  }
}
