import type { Metadata } from 'next'
import type { ShareVisibility } from '@/lib/shares/types'

/** Crawlers that build a link card from Open Graph. They honor robots noindex. */
const SOCIAL_UNFURL =
  /facebookexternalhit|Facebot|Twitterbot|LinkedInBot|WhatsApp|Slackbot|Discordbot|TelegramBot|Pinterest|redditbot|embedly/i

export function isSocialUnfurlAgent(userAgent: string | null | undefined): boolean {
  return SOCIAL_UNFURL.test(userAgent || '')
}

/**
 * Search engines stay off unlisted shares. Facebook, iMessage, and similar
 * crawlers must still be allowed to read the preview, or the post has no card.
 */
export function sharePreviewRobots(
  visibility: ShareVisibility,
  userAgent: string | null | undefined,
): Metadata['robots'] {
  if (isSocialUnfurlAgent(userAgent)) {
    return { index: true, follow: true }
  }
  const open = visibility === 'public'
  return { index: open, follow: open }
}
