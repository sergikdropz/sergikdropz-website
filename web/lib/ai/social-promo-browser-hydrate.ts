import type { SocialPromoChannel, SocialPromoPost } from '@/lib/studio/social-promo'
import { socialPromoChannelLabel } from '@/lib/studio/social-promo'

export type SocialPromoBrowserDesk =
  | 'instagram'
  | 'facebook'
  | 'spotify_artists'
  | 'site'

export type SocialPromoBrowserHydrateDetail = {
  kind: 'social_promo'
  releaseId: string
  releaseTitle?: string | null
  postId: string
  label: string
  channel: SocialPromoChannel
  channelLabel: string
  asset: string
  caption: string
  hint: string
  desk: SocialPromoBrowserDesk
  deskLabel: string
  url: string
  /** When true, dock may type caption only after the user clicks Paste. */
  pasteOnDemand: true
}

const DESK_URLS: Record<SocialPromoBrowserDesk, { label: string; url: string }> = {
  instagram: { label: 'Instagram', url: 'https://www.instagram.com/sergikdropz/' },
  facebook: { label: 'Facebook', url: 'https://www.facebook.com/Sergikdropz/' },
  spotify_artists: {
    label: 'Spotify Artists',
    url: 'https://artists.spotify.com/c/artist/7MnvMhWoSe4wYXuiI6iQ8H/home',
  },
  site: { label: 'Site', url: 'https://sergikdropz.com/music' },
}

/** Map a social promo channel to the Admin browser HOMES desk. */
export function deskForSocialPromoChannel(channel: SocialPromoChannel): SocialPromoBrowserDesk {
  if (channel.startsWith('instagram')) return 'instagram'
  if (channel.startsWith('facebook')) return 'facebook'
  return 'site'
}

export function buildSocialPromoBrowserHydrate(input: {
  releaseId: string
  releaseTitle?: string | null
  post: Pick<SocialPromoPost, 'id' | 'channel' | 'label' | 'caption' | 'hint' | 'asset'>
}): SocialPromoBrowserHydrateDetail {
  const desk = deskForSocialPromoChannel(input.post.channel)
  const home = DESK_URLS[desk]
  return {
    kind: 'social_promo',
    releaseId: input.releaseId,
    releaseTitle: input.releaseTitle || null,
    postId: input.post.id,
    label: input.post.label,
    channel: input.post.channel,
    channelLabel: socialPromoChannelLabel(input.post.channel),
    asset: input.post.asset,
    caption: String(input.post.caption || '').trim(),
    hint: String(input.post.hint || '').trim(),
    desk,
    deskLabel: home.label,
    url: home.url,
    pasteOnDemand: true,
  }
}
