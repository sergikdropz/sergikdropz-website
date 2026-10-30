import { classifyStoreUrl } from '@/lib/studio/dsp-verify'
import { DSP_STORES } from '@/lib/studio/constants'
import { storeLinkToPlatform } from '@/lib/marketing/music-seo'
import { platformEmbedFromUrl } from '@/lib/shares/platform-embeds'
import { embedPathForToken, listenPathForToken, SHARE_EMBED_HEIGHT } from '@/lib/shares/types'
import { smartLinkKindForDate } from '@/lib/studio/launch-handoff'

export type SmartLinkDestinationKind = 'release' | 'artist' | 'site'

export type SmartLinkDestination = {
  id: string
  label: string
  href: string
  kind: SmartLinkDestinationKind
  /** Inline player for Spotify, Apple Music, and the SERGIK embed. */
  embedUrl: string | null
  embedHeight: number | null
}

export type SmartLinkLanding = {
  slug: string
  title: string
  artist: string
  artworkUrl: string | null
  description: string | null
  kind: 'presave' | 'listen'
  destinations: SmartLinkDestination[]
}

export type SmartLinkStoreRow = {
  store: string
  url: string
}

export type SmartLinkLandingInput = {
  slug: string
  title: string
  description?: string | null
  destinationUrl?: string | null
  release?: {
    id: string
    title?: string | null
    artist?: string | null
    artworkUrl?: string | null
    releaseDate?: string | null
    elevator?: string | null
    description?: string | null
  } | null
  stores?: SmartLinkStoreRow[]
  shareToken?: string | null
  now?: Date
}

const PINNED = ['spotify', 'apple_music'] as const

const STORE_ORDER = new Map(DSP_STORES.map((store, index) => [store.id, index]))

const PASSTHROUGH_QUERY = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'sid', 'email']

function storeId(store: string): string {
  return store.toLowerCase().replace(/[\s-]+/g, '_')
}

function isPublicHttp(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false
    const host = parsed.hostname.toLowerCase()
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return false
    return true
  } catch {
    return false
  }
}

function isReleasePage(store: string, url: string): boolean {
  const kind = classifyStoreUrl(store, url)
  return kind === 'album' || kind === 'track' || kind === 'playlist'
}

function hostStore(url: string): string | null {
  try {
    const host = new URL(url).hostname.toLowerCase()
    if (host.includes('spotify.com')) return 'spotify'
    if (host.includes('music.apple.com') || host.includes('itunes.apple.com')) return 'apple_music'
    return null
  } catch {
    return null
  }
}

function bestUrl(
  store: string,
  urls: string[],
  allowArtist: boolean,
): { href: string; kind: 'release' | 'artist' } | null {
  const clean = urls.map((url) => url.trim()).filter(isPublicHttp)
  const release = clean.find((url) => isReleasePage(store, url))
  if (release) return { href: release, kind: 'release' }
  if (!allowArtist) return null
  const artist = clean[0]
  return artist ? { href: artist, kind: 'artist' } : null
}

function displayTitle(raw: string): string {
  const stripped = raw.replace(/^(pre-save|listen)\s*:\s*/i, '').trim()
  return stripped || raw.trim() || 'SERGIK'
}

function blurb(text: string | null | undefined): string | null {
  const raw = String(text || '').replace(/\s+/g, ' ').trim()
  if (!raw) return null
  const sentence = raw.split(/(?<=[.!?])\s+/)[0] || raw
  if (sentence.length <= 220) return sentence
  return `${sentence.slice(0, 217).trim()}…`
}

function urlsForStore(stores: SmartLinkStoreRow[], id: string, destinationUrl: string | null): string[] {
  const fromRows = stores.filter((row) => storeId(row.store) === id).map((row) => row.url)
  if (destinationUrl && hostStore(destinationUrl) === id) fromRows.unshift(destinationUrl)
  return fromRows
}

function playerEmbed(id: string, href: string): { embedUrl: string; embedHeight: number } | null {
  if (id === 'site') {
    const token = href.match(/^\/s\/([^/?#]+)/)?.[1]
    if (!token) return null
    return { embedUrl: embedPathForToken(decodeURIComponent(token)), embedHeight: SHARE_EMBED_HEIGHT }
  }
  if (id === 'spotify') {
    const album = platformEmbedFromUrl('spotify', href)
    if (album?.embedUrl) return { embedUrl: album.embedUrl, embedHeight: album.height || 352 }
    const artist = href.match(/open\.spotify\.com\/artist\/([A-Za-z0-9]+)/)
    if (!artist) return null
    return {
      embedUrl: `https://open.spotify.com/embed/artist/${artist[1]}?utm_source=generator&theme=0`,
      embedHeight: 352,
    }
  }
  if (id === 'apple_music') {
    const album = platformEmbedFromUrl('apple_music', href)
    if (!album?.embedUrl) return null
    return { embedUrl: album.embedUrl, embedHeight: album.height || 450 }
  }
  return null
}

function withPlayer(dest: Omit<SmartLinkDestination, 'embedUrl' | 'embedHeight'>): SmartLinkDestination {
  const embed = playerEmbed(dest.id, dest.href)
  return {
    ...dest,
    embedUrl: embed?.embedUrl ?? null,
    embedHeight: embed?.embedHeight ?? null,
  }
}

function siteListenHref(releaseId: string | null, shareToken: string | null): string | null {
  const token = String(shareToken || '').trim()
  if (token) return listenPathForToken(token)
  const id = String(releaseId || '').trim()
  if (!id) return null
  return `/music/${encodeURIComponent(id)}`
}

export function assembleSmartLinkLanding(input: SmartLinkLandingInput): SmartLinkLanding {
  const stores = input.stores || []
  const destinationUrl = String(input.destinationUrl || '').trim() || null
  const release = input.release || null
  const destinations: SmartLinkDestination[] = []
  const seen = new Set<string>()

  const push = (dest: SmartLinkDestination) => {
    const key = `${dest.id}:${dest.href}`
    if (seen.has(key)) return
    seen.add(key)
    destinations.push(dest)
  }

  const siteHref = siteListenHref(release?.id || null, input.shareToken || null)
  if (siteHref) {
    push(
      withPlayer({
        id: 'site',
        label: 'SERGIK',
        href: siteHref,
        kind: 'site',
      }),
    )
  }

  for (const id of PINNED) {
    const picked = bestUrl(id, urlsForStore(stores, id, destinationUrl), true)
    if (!picked) continue
    push(
      withPlayer({
        id,
        label: storeLinkToPlatform(id).label,
        href: picked.href,
        kind: picked.kind,
      }),
    )
  }

  const extras = stores
    .map((row) => ({ id: storeId(row.store), url: row.url }))
    .filter((row) => row.id !== 'spotify' && row.id !== 'apple_music' && row.id !== 'site')
    .sort((a, b) => {
      const ai = STORE_ORDER.get(a.id as (typeof DSP_STORES)[number]['id'])
      const bi = STORE_ORDER.get(b.id as (typeof DSP_STORES)[number]['id'])
      return (ai ?? 999) - (bi ?? 999)
    })

  const usedStores = new Set<string>()
  for (const row of extras) {
    if (usedStores.has(row.id)) continue
    const picked = bestUrl(row.id, urlsForStore(stores, row.id, null), true)
    if (!picked) continue
    usedStores.add(row.id)
    push(
      withPlayer({
        id: row.id,
        label: storeLinkToPlatform(row.id).label,
        href: picked.href,
        kind: picked.kind,
      }),
    )
  }

  if (
    destinationUrl &&
    isPublicHttp(destinationUrl) &&
    !destinations.some((dest) => dest.href === destinationUrl)
  ) {
    const host = hostStore(destinationUrl)
    push(
      withPlayer({
        id: host || 'destination',
        label: host ? storeLinkToPlatform(host).label : 'Listen',
        href: destinationUrl,
        kind: host && isReleasePage(host, destinationUrl) ? 'release' : 'artist',
      }),
    )
  }

  const artwork = String(release?.artworkUrl || '').trim()

  return {
    slug: input.slug,
    title: displayTitle(String(release?.title || input.title || '')),
    artist: String(release?.artist || '').trim() || 'SERGIK',
    artworkUrl: artwork && isPublicHttp(artwork) ? artwork : null,
    description: blurb(release?.elevator) || blurb(input.description) || blurb(release?.description),
    kind: smartLinkKindForDate(release?.releaseDate, input.now),
    destinations,
  }
}

export function smartLinkGoHref(
  slug: string,
  destId: string,
  search: Record<string, string | string[] | undefined> = {},
): string {
  const params = new URLSearchParams()
  params.set('dest', destId)
  for (const key of PASSTHROUGH_QUERY) {
    const value = search[key]
    const raw = Array.isArray(value) ? value[0] : value
    if (raw && raw.trim()) params.set(key, raw.trim())
  }
  return `/api/go/${encodeURIComponent(slug)}?${params.toString()}`
}

/** Absolute URL for a landing destination. Rejects anything that is not http(s) or a site path. */
export function resolveSmartLinkTarget(href: string, origin: string): string | null {
  const raw = href.trim()
  if (raw.startsWith('/') && !raw.startsWith('//')) {
    try {
      return new URL(raw, origin).toString()
    } catch {
      return null
    }
  }
  if (!isPublicHttp(raw)) return null
  return raw
}
