/** Privacy-safe campaign links. No names, emails, or royalty figures in the query string. */

export function licensingCampaignUrl(input: {
  origin?: string
  trackId?: string | null
  trackTitle?: string | null
  campaign?: string | null
}): string {
  const origin = (input.origin || 'https://sergikdropz.com').replace(/\/$/, '')
  const url = new URL('/licensing/request', origin)
  const trackId = String(input.trackId || '').trim()
  const title = String(input.trackTitle || '').trim()
  if (trackId) url.searchParams.set('track', trackId.slice(0, 80))
  if (title) url.searchParams.set('title', title.slice(0, 180))
  url.searchParams.set('utm_source', 'meta')
  url.searchParams.set('utm_medium', 'paid')
  const campaign = String(input.campaign || 'sergik')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  url.searchParams.set('utm_campaign', campaign || 'sergik')
  return url.toString()
}
