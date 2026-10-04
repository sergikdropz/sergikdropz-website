/**
 * Bookmark desks in the Admin AI browser — same three-line card for every site.
 */

export type AdminDeskSkillHint = 'studio_release' | 'growth_marketing' | 'product_strategy'

export type AdminDeskCard = {
  id: string
  label: string
  /** Hostname suffixes (match if host === suffix or host.endsWith('.' + suffix)). */
  hosts: string[]
  purpose: string
  matchSergik: string
  never: string
  skillHint: AdminDeskSkillHint
}

export const ADMIN_DESK_CARDS: AdminDeskCard[] = [
  {
    id: 'site',
    label: 'Site',
    hosts: ['sergikdropz.com', 'localhost', '127.0.0.1'],
    purpose: 'Public SERGIK site and MusicBank.',
    matchSergik: 'Live routes and copy must match Release Studio and marketing truth.',
    never: 'Do not invent analytics or claim a store is live without a store link.',
    skillHint: 'product_strategy',
  },
  {
    id: 'spotify',
    label: 'Spotify',
    hosts: ['open.spotify.com'],
    purpose: 'Public artist and catalog pages.',
    matchSergik: 'Titles, artwork, and ISRCs must match Metadata.',
    never: 'Do not invent monthly listeners or playlist adds.',
    skillHint: 'growth_marketing',
  },
  {
    id: 'spotify_artists',
    label: 'Spotify Artists',
    hosts: ['artists.spotify.com'],
    purpose: 'Spotify for Artists desk (stats, pitching, profile).',
    matchSergik: 'Growth moves must match the platform growth snapshot.',
    never: 'Do not push Marquee or invent listener counts.',
    skillHint: 'growth_marketing',
  },
  {
    id: 'youtube',
    label: 'YouTube',
    hosts: ['www.youtube.com', 'youtube.com', 'm.youtube.com'],
    purpose: 'Public channel and video pages.',
    matchSergik: 'Visualizer titles and timestamps come from Release Studio Catalog.',
    never: 'Do not invent view counts or claim Content ID earnings without evidence.',
    skillHint: 'growth_marketing',
  },
  {
    id: 'youtube_studio',
    label: 'YouTube Studio',
    hosts: ['studio.youtube.com'],
    purpose: 'Upload, analytics, and channel settings.',
    matchSergik: 'Titles, descriptions, and tags come from marketing_copy / platform_tags.',
    never: 'Do not publish or invent analytics.',
    skillHint: 'growth_marketing',
  },
  {
    id: 'soundcloud',
    label: 'SoundCloud',
    hosts: ['soundcloud.com', 'www.soundcloud.com'],
    purpose: 'Public tracks and Fan Support desk.',
    matchSergik: 'Collab and Spotlight moves must match the growth scorecard.',
    never: 'Do not invent plays or claim Spotlight eligibility without the snapshot.',
    skillHint: 'growth_marketing',
  },
  {
    id: 'instagram',
    label: 'Instagram',
    hosts: ['www.instagram.com', 'instagram.com'],
    purpose: 'IG profile and compose for feed/stories.',
    matchSergik: 'Captions and artwork come from Meta promo / marketing_copy.',
    never: 'No follower DMs. Reels stay manual. Do not claim a post is live without a meta id.',
    skillHint: 'product_strategy',
  },
  {
    id: 'facebook',
    label: 'Facebook',
    hosts: ['www.facebook.com', 'facebook.com'],
    purpose: 'Page posts and Meta compose.',
    matchSergik: 'Use run_meta_promo_pipeline for scheduled Page photos.',
    never: 'Do not invent engagement or blast Messenger.',
    skillHint: 'product_strategy',
  },
  {
    id: 'apple_artists',
    label: 'Apple Artists',
    hosts: ['artists.apple.com'],
    purpose: 'Apple Music for Artists claim and profile.',
    matchSergik: 'Claim and bio must match the growth board P0s.',
    never: 'Do not invent chart or listener numbers.',
    skillHint: 'growth_marketing',
  },
  {
    id: 'distrokid',
    label: 'DistroKid',
    hosts: ['distrokid.com', 'www.distrokid.com'],
    purpose: 'Delivery form for new uploads (no DistroKid API).',
    matchSergik: 'Packet from Release Studio: title, label, date, QTA53 ISRCs, artwork, WAVs.',
    never:
      'Fill every packet field and attach files, then stop. You QC and click DistroKid Continue. Never click Continue/Submit. Never invent a UPC — leave blank on new uploads. Never let DistroKid mint ISRCs (paste QTA53). No ASAP date. Social Media Pack off.',
    skillHint: 'studio_release',
  },
  {
    id: 'soundexchange',
    label: 'SoundExchange',
    hosts: ['isrc.soundexchange.com', 'www.soundexchange.com', 'soundexchange.com'],
    purpose: 'Public ISRC lookup. Neighboring-rights repertoire is SX Direct.',
    matchSergik: 'ISRCs must match Catalog (prefix QTA53).',
    never: 'Do not invent codes or claim a registration without evidence.',
    skillHint: 'studio_release',
  },
  {
    id: 'sx_direct',
    label: 'SX Direct',
    hosts: ['sxdirect.soundexchange.com'],
    purpose: 'SoundExchange Direct repertoire. Release Studio queues QTA53 ISRCs here when they are minted.',
    matchSergik: 'Codes must match Catalog QTA53 from assign_isrcs. Rights owner SX1102Q6ZJ / registrant 2181363681.',
    never: 'Do not invent royalty figures or codes. Do not mint ISRCs in DistroKid.',
    skillHint: 'studio_release',
  },
  {
    id: 'us_isrc',
    label: 'US ISRC',
    hosts: ['www.usisrc.org', 'usisrc.org'],
    purpose: 'US ISRC agency reference.',
    matchSergik: 'SERGIK codes stay on QTA53 from Release Studio assign_isrcs.',
    never: 'Do not mint a second ISRC for an existing track.',
    skillHint: 'studio_release',
  },
  {
    id: 'revelator',
    label: 'Revelator',
    hosts: ['platform.revelator.com', 'revelator.com'],
    purpose: 'Aggregator / HOMES delivery desk.',
    matchSergik: 'UPC, stores, and artwork must match Delivery preflight.',
    never: 'Do not invent store live status or reuse a wrong prior UPC without Support guidance.',
    skillHint: 'studio_release',
  },
]

function hostMatches(host: string, suffix: string): boolean {
  const h = host.toLowerCase()
  const s = suffix.toLowerCase()
  return h === s || h.endsWith(`.${s}`)
}

export function deskCardForUrl(url: string | null | undefined): AdminDeskCard | null {
  if (!url?.trim()) return null
  try {
    const host = new URL(url.includes('://') ? url : `https://${url}`).hostname.toLowerCase()
    let best: { card: AdminDeskCard; len: number } | null = null
    for (const card of ADMIN_DESK_CARDS) {
      for (const suffix of card.hosts) {
        if (!hostMatches(host, suffix)) continue
        const len = suffix.length
        if (!best || len > best.len) best = { card, len }
      }
    }
    return best?.card ?? null
  } catch {
    return null
  }
}

export function formatDeskCard(card: AdminDeskCard): string {
  return [
    `Desk: ${card.label}`,
    `Purpose: ${card.purpose}`,
    `Match SERGIK: ${card.matchSergik}`,
    `Never: ${card.never}`,
  ].join('\n')
}

/** Compact catalog of every bookmark desk for the system prompt. */
export function adminDeskCatalogPrompt(): string {
  return [
    'DESK CARDS (bookmarks in the Admin browser)',
    ...ADMIN_DESK_CARDS.map(
      (card) =>
        `- ${card.label}: ${card.purpose} Match SERGIK: ${card.matchSergik} Never: ${card.never}`,
    ),
  ].join('\n')
}

export function deskSkillHintFromMessage(message: string): AdminDeskSkillHint | null {
  const pages = [...message.matchAll(/^Page:\s*(\S+)/gm)].map((m) => m[1] || '')
  for (const page of pages) {
    const card = deskCardForUrl(page)
    if (card) return card.skillHint
  }
  const lower = message.toLowerCase()
  if (
    /distrokid\.com|revelator\.com|soundexchange\.com|usisrc\.org|sxdirect\.soundexchange/.test(lower)
  ) {
    return 'studio_release'
  }
  if (
    /artists\.spotify\.com|studio\.youtube\.com|artists\.apple\.com|open\.spotify\.com|soundcloud\.com/.test(
      lower,
    )
  ) {
    return 'growth_marketing'
  }
  if (/instagram\.com|facebook\.com/.test(lower)) {
    return 'product_strategy'
  }
  return null
}
