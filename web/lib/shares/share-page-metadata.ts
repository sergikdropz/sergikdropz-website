import type { Metadata } from 'next'
import { SHARE_CARD_VERSION } from '@/lib/shares/facebook-card'
import { isSocialUnfurlAgent, sharePreviewRobots } from '@/lib/shares/social-unfurl'
import {
  absoluteShareOgImageUrl,
  embedUrlForToken,
  listenUrlForToken,
  pickShareArtwork,
  type ResolvedSharePayload,
} from '@/lib/shares/types'

/** Bump when the OG card design changes so messenger caches re-fetch. */
export const SHARE_OG_VERSION = SHARE_CARD_VERSION

export function sharePageMetadata(input: {
  payload: ResolvedSharePayload
  origin: string
  token: string
  userAgent?: string | null
  surface: 'listen' | 'embed'
  /** Public mp4 of the listen-page card plus the first track. Facebook plays this in the timeline. */
  videoUrl?: string | null
}): Metadata {
  const { payload, origin, token, userAgent, surface, videoUrl } = input
  const title = `${payload.share.title} — SERGIK`
  const description =
    payload.share.kind === 'folder'
      ? `${payload.collection?.artist || 'SERGIK'} · ${payload.tracks.length} tracks`
      : `${payload.tracks[0]?.artist || 'SERGIK'}`
  const url =
    surface === 'embed' ? embedUrlForToken(token, origin) : listenUrlForToken(token, origin)
  const directCover = absoluteShareOgImageUrl(pickShareArtwork(payload), origin)
  const brandedOg = `${origin}/s/${encodeURIComponent(token)}/opengraph-image?v=${SHARE_OG_VERSION}`
  const social = isSocialUnfurlAgent(userAgent)
  const images = social
    ? [
        {
          url: brandedOg,
          width: 1200,
          height: 630,
          alt: title,
          type: 'image/png' as const,
        },
        ...(directCover ? [{ url: directCover, alt: title }] : []),
      ]
    : [
        ...(directCover ? [{ url: directCover, alt: title }] : []),
        {
          url: brandedOg,
          width: 1200,
          height: 630,
          alt: title,
          type: 'image/png' as const,
        },
      ]

  return {
    metadataBase: new URL(origin),
    title,
    description,
    robots: sharePreviewRobots(payload.share.visibility, userAgent),
    openGraph: {
      title,
      description,
      url,
      siteName: 'SERGIK',
      type: videoUrl ? 'video.other' : 'website',
      images,
      ...(videoUrl
        ? {
            videos: [
              {
                url: videoUrl,
                secureUrl: videoUrl,
                type: 'video/mp4',
                width: 1200,
                height: 630,
              },
            ],
          }
        : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: images.map((img) => img.url),
    },
  }
}
