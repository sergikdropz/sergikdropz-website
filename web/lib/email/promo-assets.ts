export const PROMO_ASSET_KINDS = ['cover', 'press', 'caption', 'link'] as const

export type PromoAssetKind = (typeof PROMO_ASSET_KINDS)[number]

export type PromoStoreLink = {
  store: string
  url: string
}

export type PromoTrack = {
  title: string
  isrc: string
  durationSec: number | null
}

export type PromoRelease = {
  id: string
  title: string
  releaseDate: string | null
  artworkUrl: string
  press: string
  caption: string
  pitch: string
  smartLink: string
  storeUrl: string
  /** Every smart link for this release. The first one is also `smartLink`. */
  smartLinks?: string[]
  /** Every store URL. The preferred one is also `storeUrl`. */
  storeLinks?: PromoStoreLink[]
  pressBlurb?: string
  elevatorPitch?: string
  socialCaption?: string
  storeDescription?: string
  spotifyPitch?: string
  visualizer?: string
  tags?: string
  credits?: string
  artist?: string
  genre?: string
  releaseType?: string
  upc?: string
  label?: string
  tracks?: PromoTrack[]
  /** Public SERGIK Promo Lab page for this release, when a share link exists. */
  promoLabUrl?: string
}

export type MailBlock =
  | { kind: 'cover'; url: string; title: string }
  | { kind: 'press'; title: string; text: string }
  | { kind: 'caption'; title: string; text: string }
  | { kind: 'link'; url: string; label: string }
  | { kind: 'note'; title: string; text: string }

const KIND_LABEL: Record<PromoAssetKind, string> = {
  cover: 'Cover',
  press: 'Press',
  caption: 'Promo',
  link: 'Links',
}

const LISTEN_URL = 'https://sergikdropz.com/music'

export function promoAssetLabel(kind: PromoAssetKind): string {
  return KIND_LABEL[kind]
}

export function promoKindsForAccount(accountId: string): PromoAssetKind[] {
  if (accountId === 'press') return ['press', 'cover', 'caption', 'link']
  if (accountId === 'promo' || accountId === 'fans') return ['caption', 'cover', 'link', 'press']
  if (accountId === 'studio') return ['cover', 'link', 'press', 'caption']
  return ['cover', 'press', 'caption', 'link']
}

function clean(value: unknown): string {
  return value == null ? '' : String(value).trim()
}

function copyField(copy: Record<string, unknown>, key: string): string {
  return clean(copy[key]).slice(0, 4000)
}

export function promoReleaseFromRow(row: Record<string, unknown>): PromoRelease | null {
  const title = clean(row.title)
  const id = clean(row.id)
  if (!id || !title) return null
  const copy = row.marketing_copy && typeof row.marketing_copy === 'object' ? (row.marketing_copy as Record<string, unknown>) : {}
  const date = clean(row.release_date).slice(0, 10)
  const pressBlurb = copyField(copy, 'press_blurb')
  const elevatorPitch = copyField(copy, 'elevator_pitch')
  const socialCaption = copyField(copy, 'social_caption')
  const storeDescription = copyField(copy, 'store_description')
  const spotifyPitch = copyField(copy, 'spotify_pitch')
  return {
    id,
    title,
    releaseDate: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
    artworkUrl: clean(row.artwork_url),
    press: pressBlurb || elevatorPitch,
    caption: socialCaption || storeDescription,
    pitch: spotifyPitch || elevatorPitch,
    smartLink: clean(row.smart_link),
    storeUrl: clean(row.store_url),
    pressBlurb,
    elevatorPitch,
    socialCaption,
    storeDescription,
    spotifyPitch,
    visualizer: copyField(copy, 'youtube_visualizer'),
    tags: copyField(copy, 'platform_tags'),
    credits: copyField(copy, 'credits_block'),
    artist: clean(row.album_artist),
    genre: clean(row.genre),
    releaseType: clean(row.type),
    upc: clean(row.upc),
    label: clean(row.label_name),
    tracks: [],
  }
}

export function promoAssetAvailable(release: PromoRelease, kind: PromoAssetKind): boolean {
  if (kind === 'cover') return /^https?:\/\//i.test(release.artworkUrl) || release.artworkUrl.startsWith('/')
  if (kind === 'press') return Boolean(release.press)
  if (kind === 'caption') return Boolean(release.caption || release.pitch)
  return Boolean(release.title)
}

function dayOffset(releaseDate: string | null, today: string): number | null {
  if (!releaseDate) return null
  const release = Date.parse(`${releaseDate}T12:00:00Z`)
  const now = Date.parse(`${today}T12:00:00Z`)
  if (!Number.isFinite(release) || !Number.isFinite(now)) return null
  return Math.round((release - now) / 86_400_000)
}

function releaseScore(release: PromoRelease, query: string, today: string): number {
  const title = release.title.toLowerCase()
  let score = 0
  if (query && title && query.includes(title)) score += 10
  else if (query.length > 2 && title.includes(query)) score += 8
  else if (query) {
    const hits = title.split(/[^\p{L}\p{N}]+/u).filter((token) => token.length > 2 && query.includes(token))
    score += hits.length
  }
  const offset = dayOffset(release.releaseDate, today)
  if (!query) {
    if (offset != null && offset >= 0 && offset <= 21) score += 5 - offset / 10
    else if (offset != null) score += 1
    else score += 0.5
  } else if (offset != null && offset >= 0 && offset <= 14) {
    score += 0.5
  }
  return score
}

function rankPromoReleases(releases: PromoRelease[], kind: PromoAssetKind, context: string, today: string) {
  const query = context.trim().toLowerCase()
  return releases
    .filter((release) => promoAssetAvailable(release, kind))
    .map((release) => ({ release, score: releaseScore(release, query, today) }))
    .sort((a, b) => b.score - a.score || a.release.title.localeCompare(b.release.title))
}

export function suggestPromoAssets(
  releases: PromoRelease[],
  kind: PromoAssetKind,
  context: string,
  today: string,
  limit = 6,
): PromoRelease[] {
  return rankPromoReleases(releases, kind, context, today)
    .filter((item) => item.score > 0)
    .slice(0, limit)
    .map((item) => item.release)
}

export function promoSuggestionReason(release: PromoRelease, context: string, today: string): string {
  const query = context.trim().toLowerCase()
  const title = release.title.toLowerCase()
  if (query && title && (query.includes(title) || (query.length > 2 && title.includes(query)))) return 'Matches this draft'
  const offset = dayOffset(release.releaseDate, today)
  if (offset === 0) return 'Out today'
  if (offset != null && offset > 0 && offset <= 21) return `Out in ${offset} day${offset === 1 ? '' : 's'}`
  if (release.releaseDate) return release.releaseDate
  return 'On the release list'
}

export type PromoMenuItem = {
  id: string
  kind: PromoAssetKind | 'tracks' | 'codes' | 'when' | 'subject' | 'signoff'
  group: string
  label: string
  detail: string
  block?: MailBlock
  /** Appended to the letter instead of a block. */
  prose?: string
  /** Replaces the subject line. */
  subject?: string
}

const MENU_RELEASE_LIMIT = 8

function filled(...values: Array<string | null | undefined>): string {
  for (const value of values) {
    const text = value?.trim() ?? ''
    if (text) return text
  }
  return ''
}

function noteItem(
  release: PromoRelease,
  kind: 'press' | 'caption',
  piece: string,
  label: string,
  text: string,
  detail: string,
): PromoMenuItem | null {
  const body = text.trim()
  if (!body) return null
  return {
    id: `${release.id}:${piece}`,
    kind,
    group: release.title,
    label,
    detail,
    block: { kind, title: release.title, text: readableMailSource(body) },
  }
}

const STORE_ORDER = ['spotify', 'apple', 'youtube', 'soundcloud', 'deezer', 'tidal', 'amazon', 'beatport', 'bandcamp', 'pandora']

function storeMenuLabel(store: string, url: string): string {
  const token = `${store} ${url}`.toLowerCase()
  if (token.includes('spotify')) return 'Spotify'
  if (token.includes('apple')) return 'Apple Music'
  if (token.includes('music.youtube')) return 'YouTube Music'
  if (token.includes('youtube') || token.includes('youtu.be')) return 'YouTube'
  if (token.includes('soundcloud')) return 'SoundCloud'
  if (token.includes('tidal')) return 'Tidal'
  if (token.includes('bandcamp')) return 'Bandcamp'
  if (token.includes('deezer')) return 'Deezer'
  if (token.includes('amazon')) return 'Amazon Music'
  if (token.includes('beatport')) return 'Beatport'
  if (token.includes('pandora')) return 'Pandora'
  if (token.includes('instagram')) return 'Instagram'
  if (token.includes('tiktok')) return 'TikTok'
  if (token.includes('shazam')) return 'Shazam'
  if (token.includes('iheart')) return 'iHeart'
  const name = store.replace(/[_-]+/g, ' ').trim()
  if (name && !/^store$/i.test(name)) return name.replace(/\b\w/g, (char) => char.toUpperCase())
  return 'Store link'
}

function storeRank(store: string, url: string): number {
  const token = `${store} ${url}`.toLowerCase()
  const index = STORE_ORDER.findIndex((name) => token.includes(name))
  return index === -1 ? STORE_ORDER.length : index
}

function usableLink(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') return false
    if (/\/search\/?$/i.test(parsed.pathname)) return false
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

function linkDetail(url: string): string {
  try {
    const parsed = new URL(url)
    const path = parsed.pathname.replace(/\/$/, '')
    const tail = path.split('/').filter(Boolean).pop()
    return tail ? `${parsed.host}/${tail}` : parsed.host
  } catch {
    return url
  }
}

function smartLinkLabel(url: string): string {
  return /presave/i.test(url) ? 'Pre-save' : 'Smart link'
}

function coverItems(release: PromoRelease, context: string, today: string): PromoMenuItem[] {
  if (!promoAssetAvailable(release, 'cover')) return []
  return [
    {
      id: `${release.id}:cover`,
      kind: 'cover',
      group: release.title,
      label: 'Cover art',
      detail: promoSuggestionReason(release, context, today),
      block: { kind: 'cover', url: release.artworkUrl, title: release.title },
    },
  ]
}

function promoLabDetail(url: string): string {
  try {
    const parsed = new URL(url)
    return `${parsed.host}${parsed.pathname.replace(/\/$/, '')}`
  } catch {
    return url
  }
}

/** Same collaborator URL the Promo Lab Share button copies. */
function promoLabItem(release: PromoRelease): PromoMenuItem | null {
  const url = clean(release.promoLabUrl)
  if (!usableLink(url)) return null
  return {
    id: `${release.id}:promo-lab`,
    kind: 'link',
    group: release.title,
    label: 'Promo Lab',
    detail: promoLabDetail(url),
    block: { kind: 'link', url, label: `Promo Lab — ${release.title}` },
  }
}

function linkItems(release: PromoRelease, leadOnly: boolean): PromoMenuItem[] {
  const items: PromoMenuItem[] = []
  const lab = promoLabItem(release)
  if (lab && !leadOnly) items.push(lab)
  const smart = (release.smartLinks?.length ? release.smartLinks : release.smartLink ? [release.smartLink] : []).filter(usableLink)
  const seen = new Set<string>()
  for (const url of smart) {
    if (seen.has(url)) continue
    seen.add(url)
    const label = smartLinkLabel(url)
    items.push({
      id: `${release.id}:smart:${items.length}`,
      kind: 'link',
      group: release.title,
      label,
      detail: linkDetail(url),
      block: { kind: 'link', url, label: `${label} — ${release.title}` },
    })
    if (leadOnly) return items
  }
  const stores = (release.storeLinks?.length
    ? release.storeLinks
    : release.storeUrl
      ? [{ store: 'store', url: release.storeUrl }]
      : []
  )
    .filter((store) => usableLink(store.url) && !seen.has(store.url.trim()))
    .sort((a, b) => storeRank(a.store, a.url) - storeRank(b.store, b.url))
  for (const store of stores) {
    const url = store.url.trim()
    if (seen.has(url)) continue
    seen.add(url)
    const label = storeMenuLabel(store.store, url)
    items.push({
      id: `${release.id}:store:${items.length}`,
      kind: 'link',
      group: release.title,
      label,
      detail: linkDetail(url),
      block: { kind: 'link', url, label: `${label} — ${release.title}` },
    })
    if (leadOnly) return items.slice(0, 1)
  }
  return items
}

function pressItems(release: PromoRelease, context: string, today: string): PromoMenuItem[] {
  const detail = promoSuggestionReason(release, context, today)
  const blurb = filled(release.pressBlurb, release.elevatorPitch ? '' : release.press)
  const elevator = filled(release.elevatorPitch)
  const items = [
    noteItem(release, 'press', 'press', 'Press blurb', blurb, detail),
    noteItem(release, 'press', 'elevator', 'Elevator pitch', elevator === blurb ? '' : elevator, detail),
    noteItem(release, 'press', 'credits', 'Credits', filled(release.credits), detail),
  ]
  return items.filter((item): item is PromoMenuItem => Boolean(item))
}

function promoItems(release: PromoRelease, context: string, today: string): PromoMenuItem[] {
  const detail = promoSuggestionReason(release, context, today)
  const caption = filled(release.socialCaption, release.storeDescription || release.spotifyPitch ? '' : release.caption)
  const store = filled(release.storeDescription)
  const pitch = filled(release.spotifyPitch, release.pitch && release.pitch !== caption && release.pitch !== store ? release.pitch : '')
  const items = [
    noteItem(release, 'caption', 'caption', 'Launch caption', caption, detail),
    noteItem(release, 'caption', 'store', 'Store description', store === caption ? '' : store, detail),
    noteItem(release, 'caption', 'pitch', 'Spotify pitch', pitch === caption || pitch === store ? '' : pitch, detail),
    noteItem(release, 'caption', 'tags', 'Tags', filled(release.tags), detail),
    noteItem(release, 'caption', 'visualizer', 'Visualizer', filled(release.visualizer), detail),
  ]
  return items.filter((item): item is PromoMenuItem => Boolean(item))
}

function itemsForRelease(
  release: PromoRelease,
  kind: PromoAssetKind,
  context: string,
  today: string,
  leadOnly: boolean,
): PromoMenuItem[] {
  const items =
    kind === 'cover'
      ? coverItems(release, context, today)
      : kind === 'link'
        ? linkItems(release, leadOnly)
        : kind === 'press'
          ? pressItems(release, context, today)
          : promoItems(release, context, today)
  return leadOnly ? items.slice(0, 1) : items
}

function rankedReleases(releases: PromoRelease[], context: string, today: string): PromoRelease[] {
  const query = context.trim().toLowerCase()
  return [...releases].sort(
    (a, b) => releaseScore(b, query, today) - releaseScore(a, query, today) || a.title.localeCompare(b.title),
  )
}

function releaseTracks(release: PromoRelease): PromoTrack[] {
  return (release.tracks ?? []).filter((track) => track.title.trim())
}

function clockDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

function typeLabel(type: string | undefined): string {
  if (type === 'ep') return 'EP'
  if (type === 'album') return 'Album'
  if (type === 'single') return 'Single'
  return ''
}

function releaseDayLabel(release: PromoRelease): string | null {
  if (!release.releaseDate) return null
  const [year, month, day] = release.releaseDate.split('-').map((part) => Number(part))
  if (!year || !month || !day) return null
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const name = months[month - 1]
  if (!name) return null
  return `${name} ${day}, ${year}`
}

function noteMenuItem(
  id: string,
  group: string,
  label: string,
  detail: string,
  title: string,
  text: string,
  kind: PromoMenuItem['kind'],
): PromoMenuItem {
  return { id, kind, group, label, detail, block: { kind: 'note', title, text } }
}

function proseMenuItem(
  id: string,
  group: string,
  label: string,
  detail: string,
  prose: string,
  kind: PromoMenuItem['kind'],
): PromoMenuItem {
  return { id, kind, group, label, detail, prose }
}

function trackMenuItems(release: PromoRelease, leadOnly: boolean): PromoMenuItem[] {
  const tracks = releaseTracks(release)
  if (!tracks.length) return []
  const detail = `${tracks.length} track${tracks.length === 1 ? '' : 's'}`
  const items: PromoMenuItem[] = []
  if (tracks.length >= 2) {
    const noun = release.releaseType === 'album' ? 'album' : release.releaseType === 'single' ? 'single' : 'EP'
    items.push(
      noteMenuItem(
        `${release.id}:tracklist`,
        release.title,
        'Tracklist',
        detail,
        'Tracklist',
        `Also on the ${noun}: ${tracks.map((track) => track.title).join(', ')}.`,
        'tracks',
      ),
    )
  }
  items.push(
    noteMenuItem(
      `${release.id}:numbered`,
      release.title,
      tracks.length === 1 ? tracks[0]!.title : 'Numbered list',
      detail,
      'Tracklist',
      tracks.map((track, index) => `${index + 1}. ${track.title}`).join('\n'),
      'tracks',
    ),
  )
  if (tracks.some((track) => track.durationSec && track.durationSec > 0)) {
    items.push(
      noteMenuItem(
        `${release.id}:times`,
        release.title,
        'With times',
        detail,
        'Tracklist',
        tracks
          .map((track, index) => {
            const time = track.durationSec && track.durationSec > 0 ? ` (${clockDuration(track.durationSec)})` : ''
            return `${index + 1}. ${track.title}${time}`
          })
          .join('\n'),
        'tracks',
      ),
    )
  }
  if (tracks.some((track) => track.isrc)) {
    items.push(
      noteMenuItem(
        `${release.id}:isrc-list`,
        release.title,
        'With ISRCs',
        detail,
        'Tracklist',
        tracks
          .map((track, index) => `${index + 1}. ${track.title}${track.isrc ? ` — ${track.isrc}` : ''}`)
          .join('\n'),
        'tracks',
      ),
    )
  }
  return leadOnly ? items.slice(0, 1) : items
}

function codesMenuItems(release: PromoRelease, leadOnly: boolean): PromoMenuItem[] {
  const upc = release.upc?.trim() || ''
  const coded = releaseTracks(release).filter((track) => track.isrc)
  if (!upc && !coded.length) return []
  const items: PromoMenuItem[] = []
  if (upc) {
    items.push(noteMenuItem(`${release.id}:upc`, release.title, 'UPC', upc, 'Codes', `UPC ${upc}`, 'codes'))
  }
  if (coded.length) {
    items.push(
      noteMenuItem(
        `${release.id}:isrcs`,
        release.title,
        'ISRCs',
        `${coded.length} code${coded.length === 1 ? '' : 's'}`,
        'Codes',
        coded.map((track, index) => `${index + 1}. ${track.title} — ${track.isrc}`).join('\n'),
        'codes',
      ),
    )
  }
  if (upc && coded.length) {
    items.push(
      noteMenuItem(
        `${release.id}:codes`,
        release.title,
        'UPC and ISRCs',
        upc,
        'Codes',
        [`UPC ${upc}`, '', ...coded.map((track, index) => `${index + 1}. ${track.title} — ${track.isrc}`)].join('\n'),
        'codes',
      ),
    )
  }
  return leadOnly ? items.slice(0, 1) : items
}

function whenMenuItems(release: PromoRelease, today: string, leadOnly: boolean): PromoMenuItem[] {
  const items: PromoMenuItem[] = []
  const facts = [release.artist, typeLabel(release.releaseType), release.genre, release.label].filter(
    (part): part is string => Boolean(part?.trim()),
  )
  if (facts.length) {
    const line = `${release.title} — ${facts.join(' · ')}`
    items.push(proseMenuItem(`${release.id}:facts`, release.title, 'Release line', facts.join(' · '), line, 'when'))
  }
  const day = releaseDayLabel(release)
  const offset = dayOffset(release.releaseDate, today)
  if (day) {
    items.push(
      proseMenuItem(`${release.id}:out-day`, release.title, `Out ${day}`, day, `${release.title} is out ${day}.`, 'when'),
    )
  }
  if (offset === 0) {
    items.push(proseMenuItem(`${release.id}:out-today`, release.title, 'Out today', 'Today', `${release.title} is out today.`, 'when'))
  } else if (offset != null && offset > 0 && offset <= 60) {
    const label = `Out in ${offset} day${offset === 1 ? '' : 's'}`
    items.push(proseMenuItem(`${release.id}:out-in`, release.title, label, day || label, `${release.title} is ${label.toLowerCase()}.`, 'when'))
  }
  return leadOnly ? items.slice(0, 1) : items
}

function subjectMenuItems(release: PromoRelease, today: string, leadOnly: boolean): PromoMenuItem[] {
  const day = releaseDayLabel(release)
  const offset = dayOffset(release.releaseDate, today)
  const presave = [release.smartLink, ...(release.smartLinks ?? [])].some((url) => /presave/i.test(url || ''))
  const items: PromoMenuItem[] = []
  if (day) {
    const subject = `${release.title} — out ${day}`
    items.push({ id: `${release.id}:subject-day`, kind: 'subject', group: release.title, label: subject, detail: 'Subject', subject })
  }
  if (presave) {
    const subject = `Pre-save ${release.title}`
    items.push({ id: `${release.id}:subject-presave`, kind: 'subject', group: release.title, label: subject, detail: 'Subject', subject })
  }
  if (offset != null && offset <= 0) {
    const subject = `${release.title} is out`
    items.push({ id: `${release.id}:subject-out`, kind: 'subject', group: release.title, label: subject, detail: 'Subject', subject })
  }
  if (release.genre?.trim()) {
    const subject = `${release.title} — new ${release.genre.trim()}`
    items.push({ id: `${release.id}:subject-genre`, kind: 'subject', group: release.title, label: subject, detail: 'Subject', subject })
  }
  if (!items.length) {
    items.push({
      id: `${release.id}:subject-title`,
      kind: 'subject',
      group: release.title,
      label: release.title,
      detail: 'Subject',
      subject: release.title,
    })
  }
  return leadOnly ? items.slice(0, 1) : items
}

const SIGN_OFFS: { id: string; label: string; text: string; accounts: string[] }[] = [
  { id: 'sergik', label: 'SERGIK', text: '— SERGIK', accounts: ['fans', 'drops', 'shop'] },
  { id: 'studio', label: 'Release Studio', text: '— SERGIK Release Studio', accounts: ['studio'] },
  { id: 'press', label: 'Press desk', text: '— SERGIK Press', accounts: ['press'] },
  { id: 'bookings', label: 'Bookings', text: '— SERGIK Bookings\nPhoenix, AZ', accounts: ['bookings'] },
  { id: 'promo', label: 'Promo', text: '— SERGIK\nPhoenix, AZ', accounts: ['promo'] },
  { id: 'support', label: 'Support', text: '— SERGIK Support', accounts: ['support'] },
]

export function signOffMenu(accountId: string): PromoMenuItem[] {
  return [...SIGN_OFFS]
    .sort((a, b) => Number(b.accounts.includes(accountId)) - Number(a.accounts.includes(accountId)))
    .map((row) => ({
      id: `sign:${row.id}`,
      kind: 'signoff' as const,
      group: row.accounts.includes(accountId) ? 'This mailbox' : 'Other mailboxes',
      label: row.label,
      detail: row.text.split('\n')[0] || row.label,
      prose: row.text,
    }))
}

export type ComposeMenu = { id: string; label: string; items: PromoMenuItem[] }

/** Tracklist, codes, date lines, subjects, and sign-offs for the compose row. */
export function extraComposeMenus(
  releases: PromoRelease[],
  context: string,
  today: string,
  accountId: string,
): ComposeMenu[] {
  const ranked = rankedReleases(releases, context, today)
  const collect = (build: (release: PromoRelease, leadOnly: boolean) => PromoMenuItem[]) => {
    const items: PromoMenuItem[] = []
    let used = 0
    for (const release of ranked) {
      const next = build(release, used > 0)
      if (!next.length) continue
      items.push(...next)
      used += 1
      if (used >= MENU_RELEASE_LIMIT) break
    }
    return items
  }
  return [
    { id: 'tracks', label: 'Tracks', items: collect(trackMenuItems) },
    { id: 'codes', label: 'Codes', items: collect(codesMenuItems) },
    { id: 'when', label: 'When', items: collect((release, leadOnly) => whenMenuItems(release, today, leadOnly)) },
    { id: 'subject', label: 'Subject', items: collect((release, leadOnly) => subjectMenuItems(release, today, leadOnly)) },
    { id: 'signoff', label: 'Sign-off', items: signOffMenu(accountId) },
  ]
}

/** Every attachable piece for a menu, best-matching releases first, then the rest of the list. */
export function promoMenuItems(
  releases: PromoRelease[],
  kind: PromoAssetKind,
  context: string,
  today: string,
): PromoMenuItem[] {
  const ranked = rankedReleases(releases, context, today)
  const items: PromoMenuItem[] = []
  let used = 0
  for (const release of ranked) {
    const next = itemsForRelease(release, kind, context, today, used > 0)
    if (!next.length) continue
    items.push(...next)
    used += 1
    if (used >= MENU_RELEASE_LIMIT) break
  }
  if (kind === 'link') {
    items.push({
      id: 'site:music',
      kind: 'link',
      group: 'Site',
      label: 'Music page',
      detail: 'sergikdropz.com/music',
      block: { kind: 'link', url: LISTEN_URL, label: 'Listen on SERGIK' },
    })
  }
  return items
}

export function promoAssetFilename(title: string, kind: PromoAssetKind): string {
  const slug =
    title
      .toLowerCase()
      .replace(/[^\w\-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48) || 'release'
  if (kind === 'cover') return `${slug}-cover`
  if (kind === 'press') return `${slug}-press.txt`
  if (kind === 'caption') return `${slug}-caption.txt`
  return `${slug}-listen.txt`
}

export function promoAssetText(release: PromoRelease, kind: PromoAssetKind): string {
  if (kind === 'press') return `${release.title}\n\n${release.press}`.trim()
  if (kind === 'caption') return `${release.title}\n\n${release.caption || release.pitch}`.trim()
  return promoBlocks(release, 'link')
    .map((block) => (block.kind === 'link' ? `${block.label}\n${block.url}` : ''))
    .filter(Boolean)
    .join('\n\n')
}

function fence(block: MailBlock): string {
  if (block.kind === 'cover') return `:::cover\n${block.url}\n${block.title}\n:::`
  if (block.kind === 'link') return `:::link\n${block.url}\n${block.label}\n:::`
  return `:::${block.kind}\n${block.title}\n${block.text}\n:::`
}

function parseFence(kind: MailBlock['kind'], raw: string): MailBlock | null {
  const lines = raw.replace(/\r\n/g, '\n').split('\n')
  const first = (lines[0] || '').trim()
  const rest = lines.slice(1).join('\n').trim()
  if (kind === 'cover') {
    if (!first) return null
    return { kind, url: first, title: rest || 'Cover' }
  }
  if (kind === 'link') {
    if (!/^https?:\/\//i.test(first)) return null
    return { kind, url: first, label: rest || first }
  }
  if (!rest) return null
  return { kind, title: first || 'Release', text: rest }
}

const FENCE = /:::(cover|press|caption|link|note)\n([\s\S]*?)\n:::/g

export function parseMailMessage(body: string): { prose: string; blocks: MailBlock[] } {
  const blocks: MailBlock[] = []
  const prose = body
    .replace(FENCE, (_match, kind: MailBlock['kind'], raw: string) => {
      const block = parseFence(kind, raw)
      if (block) blocks.push(block)
      return ''
    })
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return { prose, blocks: orderMailBlocks(blocks) }
}

/** Cover, then links, then press, then promo. */
export function orderMailBlocks(blocks: MailBlock[]): MailBlock[] {
  const rank: Record<MailBlock['kind'], number> = { cover: 0, link: 1, note: 2, press: 3, caption: 4 }
  return blocks
    .map((block, index) => ({ block, index }))
    .sort((left, right) => rank[left.block.kind] - rank[right.block.kind] || left.index - right.index)
    .map((item) => item.block)
}

export function composeMailBody(prose: string, blocks: MailBlock[]): string {
  const text = prose.trim()
  const fences = blocks.map(fence).join('\n\n')
  if (text && fences) return `${text}\n\n${fences}`
  return text || fences
}

function sameBlock(left: MailBlock, right: MailBlock): boolean {
  if (left.kind !== right.kind) return false
  if (left.kind === 'cover' && right.kind === 'cover') return left.url === right.url
  if (left.kind === 'link' && right.kind === 'link') return left.url === right.url
  if ((left.kind === 'press' || left.kind === 'caption' || left.kind === 'note') && left.kind === right.kind) {
    return left.title === right.title && left.text === right.text
  }
  return false
}

export function appendMailProse(body: string, line: string): string {
  const next = line.trim()
  if (!next) return body
  const { prose, blocks } = parseMailMessage(body)
  if (prose.includes(next)) return composeMailBody(prose, blocks)
  return composeMailBody(prose ? `${prose.trim()}\n\n${next}` : next, blocks)
}

export function insertMailBlock(body: string, block: MailBlock): string {
  const { prose, blocks } = parseMailMessage(body)
  if (blocks.some((item) => sameBlock(item, block))) return composeMailBody(prose, blocks)
  return composeMailBody(prose, [...blocks, block])
}

export function promoBlocks(release: PromoRelease, kind: PromoAssetKind): MailBlock[] {
  if (kind === 'cover' && promoAssetAvailable(release, 'cover')) {
    return [{ kind: 'cover', url: release.artworkUrl, title: release.title }]
  }
  if (kind === 'press' && release.press) {
    return [{ kind: 'press', title: release.title, text: readableMailSource(release.press) }]
  }
  if (kind === 'caption') {
    const text = readableMailSource(release.caption || release.pitch)
    return text ? [{ kind: 'caption', title: release.title, text }] : []
  }
  const links: MailBlock[] = []
  if (release.smartLink) links.push({ kind: 'link', url: release.smartLink, label: `Smart link — ${release.title}` })
  if (release.storeUrl && release.storeUrl !== release.smartLink) {
    links.push({ kind: 'link', url: release.storeUrl, label: `Listen — ${release.title}` })
  }
  if (!links.length) links.push({ kind: 'link', url: LISTEN_URL, label: `Listen — ${release.title}` })
  return links
}

export function insertPromoMessage(body: string, release: PromoRelease, kind: PromoAssetKind): string {
  const { prose, blocks } = parseMailMessage(body)
  const next = [...blocks]
  for (const block of promoBlocks(release, kind)) {
    if (!next.some((item) => sameBlock(item, block))) next.push(block)
  }
  return composeMailBody(prose, next)
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export type MailCopyPiece =
  | { type: 'paragraph'; text: string }
  | { type: 'tags'; text: string }
  | { type: 'tracks'; label: string; tracks: string[] }

const ABBREVIATION = /(?:^|[\s(])(?:feat|ft|vs|mr|mrs|ms|dr|st|jr|sr|inc|ltd|vol|no|e\.g|i\.e)$/i

function splitSentences(text: string): string[] {
  const out: string[] = []
  let start = 0
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (ch !== '.' && ch !== '!' && ch !== '?') continue
    if (ch === '.' && ABBREVIATION.test(text.slice(0, i))) continue
    const after = text.slice(i + 1)
    if (after && !/^\s/.test(after)) continue
    const next = after.trimStart()
    if (next && !/^[\p{Lu}"“‘'(\d#🎧]/u.test(next)) continue
    const sentence = text.slice(start, i + 1).trim()
    if (sentence) out.push(sentence)
    start = i + 1
    while (text[start] === ' ') start += 1
    i = start - 1
  }
  const rest = text.slice(start).trim()
  if (rest) out.push(rest)
  return out.length ? out : [text.trim()].filter(Boolean)
}

const LONG_BREAKS = [' — ', '; ', ', and ', ', while ', ' while ']

function loosenLongSentence(sentence: string): string[] {
  if (sentence.length <= 150) return [sentence]
  for (const mark of LONG_BREAKS) {
    const at = sentence.indexOf(mark)
    if (at < 20 || at > sentence.length - 24) continue
    const left = sentence.slice(0, at).trim()
    const right = sentence.slice(at + mark.length).trim()
    if (!left || !right) continue
    const closed = /[.!?]$/.test(left) ? left : `${left}.`
    const opened = /^[\p{Ll}]/u.test(right) ? `${right.charAt(0).toUpperCase()}${right.slice(1)}` : right
    return [...loosenLongSentence(closed), ...loosenLongSentence(opened)]
  }
  return [sentence]
}

/** Turns a run-on note into short paragraphs, a hashtag line, and a track list. */
export function formatMailCopy(text: string): MailCopyPiece[] {
  const trimmed = text.replace(/\r\n/g, '\n').trim()
  if (!trimmed) return []
  const blocks = trimmed.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean)
  const sentences: string[] = []
  for (const block of blocks) {
    const lines = block.split('\n').map((line) => line.trim()).filter(Boolean)
    const shortLines = lines.length > 1 && lines.every((line) => line.length <= 160)
    const chunks = shortLines ? lines : splitSentences(block.replace(/\s*\n\s*/g, ' '))
    for (const chunk of chunks) sentences.push(...loosenLongSentence(chunk))
  }
  const pieces: MailCopyPiece[] = []
  for (const sentence of sentences) {
    const trackLine = sentence.match(/^(Also on the (?:EP|album|release|record)):\s*(.+)$/i)
    if (trackLine) {
      const tracks = trackLine[2]
        .replace(/[.]+$/, '')
        .split(/\s*,\s*/)
        .map((track) => track.trim())
        .filter(Boolean)
      if (tracks.length > 1) {
        pieces.push({ type: 'tracks', label: trackLine[1], tracks })
        continue
      }
    }
    if (/^(?:#\S+\s*)+$/.test(sentence)) {
      pieces.push({ type: 'tags', text: sentence })
      continue
    }
    pieces.push({ type: 'paragraph', text: sentence })
  }
  return pieces
}

/** Paragraphs separated by blank lines, so the compose box can edit the readable note. */
export function readableMailSource(text: string): string {
  return formatMailCopy(text)
    .map((piece) => {
      if (piece.type === 'tracks') return `${piece.label}: ${piece.tracks.join(', ')}.`
      return piece.text
    })
    .join('\n\n')
}

function copyHtml(text: string): string {
  return formatMailCopy(text)
    .map((piece, index) => {
      if (piece.type === 'tracks') {
        const items = piece.tracks
          .map((track) => `<li style="margin:0 0 6px;font-size:15px;line-height:1.45">${escapeHtml(track)}</li>`)
          .join('')
        return `<p style="margin:20px 0 8px;font-size:13px;font-weight:600;color:#18181b">${escapeHtml(piece.label)}</p><ul style="margin:0 0 18px;padding:0;list-style:none">${items}</ul>`
      }
      if (piece.type === 'tags') {
        return `<p style="margin:0 0 16px;font-size:13px;line-height:1.6;color:#71717a">${escapeHtml(piece.text)}</p>`
      }
      const lead = index === 0
      const style = lead
        ? 'margin:0 0 14px;font-size:16px;line-height:1.55;color:#18181b'
        : 'margin:0 0 14px;font-size:15px;line-height:1.65;color:#3f3f46'
      return `<p style="${style}">${escapeHtml(piece.text)}</p>`
    })
    .join('')
}

function absoluteAssetUrl(url: string): string {
  if (url.startsWith('/')) return `https://sergikdropz.com${url}`
  return url
}

function blockHtml(block: MailBlock): string {
  if (block.kind === 'cover') {
    const src = absoluteAssetUrl(block.url)
    if (!/^https?:\/\//i.test(src)) return ''
    return `<p style="margin:0 0 16px"><img src="${escapeHtml(src)}" alt="${escapeHtml(block.title)} cover" width="576" style="display:block;width:100%;max-width:576px;height:auto;border-radius:8px"/></p>`
  }
  if (block.kind === 'link') {
    return `<a href="${escapeHtml(block.url)}" style="display:block;margin:0 0 10px;padding:12px 16px;background:#18181b;color:#ffffff;text-decoration:none;border-radius:10px;font-size:14px;font-weight:600;text-align:center">${escapeHtml(block.label)}</a>`
  }
  if (block.kind === 'note') {
    return `<p style="margin:8px 0 4px;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#a1a1aa">${escapeHtml(block.title)}</p>${copyHtml(block.text)}`
  }
  const label = block.kind === 'press' ? 'Press' : 'Promo'
  return `<p style="margin:8px 0 4px;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#a1a1aa">${label}</p><h2 style="margin:0 0 14px;font-size:20px;line-height:1.3;font-weight:650;color:#18181b">${escapeHtml(block.title)}</h2>${copyHtml(block.text)}`
}

/** Paragraphs plus cover, press, promo copy, and links stored in the message. */
export function mailMessageHtml(text: string): string {
  const { prose, blocks } = parseMailMessage(text)
  return `${prose ? copyHtml(prose) : ''}${blocks.map(blockHtml).join('')}`
}
