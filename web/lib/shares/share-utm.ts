/** Platform tags for share listen links (analytics + attribution). */

export type ShareUtmPlatform =
  | 'instagram'
  | 'tiktok'
  | 'youtube'
  | 'x'
  | 'facebook'
  | 'whatsapp'
  | 'linkedin'
  | 'email'
  | 'dj'
  | 'promoter'

export function releaseCampaignSlug(releaseTitle: string): string {
  const slug = releaseTitle
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]+/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 48)
    .replace(/^-|-$/g, '')
  return slug || 'sergik-release'
}

export function listenUrlWithUtm(
  listenUrl: string,
  platform: ShareUtmPlatform,
  releaseTitle?: string,
): string {
  try {
    const url = new URL(listenUrl)
    url.searchParams.set('utm_source', platform)
    url.searchParams.set('utm_medium', 'social')
    url.searchParams.set('utm_campaign', releaseCampaignSlug(releaseTitle || 'release'))
    return url.toString()
  } catch {
    return listenUrl
  }
}
