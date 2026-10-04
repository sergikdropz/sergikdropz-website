/** Tag on `fans` that means this email is a confirmed @sergikdropz subscriber. */
export const YT_SUBSCRIBER_CONFIRMED_TAG = 'youtube-subscriber'

/** Waiting for that confirmation. Does not unlock the video. */
export const YT_SUBSCRIBER_PENDING_TAG = 'youtube-pending'

export function normalizeGateEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const email = raw.trim().toLowerCase()
  if (email.length < 3 || email.length > 320) return null
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null
  return email
}

/**
 * Unlock only after our records say this email subscribed.
 * `youtube` + `subscriber` is the older confirmed pair from a real subscription check.
 */
export function fanTagsConfirmYoutubeSubscriber(tags: readonly string[]): boolean {
  if (tags.includes(YT_SUBSCRIBER_CONFIRMED_TAG)) return true
  return tags.includes('youtube') && tags.includes('subscriber')
}
