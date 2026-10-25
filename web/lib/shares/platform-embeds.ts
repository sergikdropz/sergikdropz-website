import type { SharePlatformEmbed, SharePlatformId } from '@/lib/shares/types'
import { releaseCampaignSlug } from '@/lib/shares/share-utm'

/** DistroKid’s main listener row: Spotify through iHeart. */
export const PLATFORM_ORDER: SharePlatformId[] = [
  'spotify',
  'apple_music',
  'youtube_music',
  'amazon',
  'deezer',
  'tidal',
  'pandora',
  'iheart',
]

const LABELS: Record<SharePlatformId, string> = {
  spotify: 'Spotify',
  apple_music: 'Apple Music',
  youtube_music: 'YouTube Music',
  amazon: 'Amazon Music',
  deezer: 'Deezer',
  tidal: 'Tidal',
  pandora: 'Pandora',
  iheart: 'iHeartRadio',
}

const ODESLI_PLATFORMS: Record<string, SharePlatformId> = {
  spotify: 'spotify',
  appleMusic: 'apple_music',
  youtubeMusic: 'youtube_music',
  amazonMusic: 'amazon',
  deezer: 'deezer',
  tidal: 'tidal',
  pandora: 'pandora',
}

export function hyperfollowLookupUrl(artist: string, title: string): string | null {
  const artistSlug = artist
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 32)
  const titleSlug = releaseCampaignSlug(title)
  if (!artistSlug || !titleSlug || titleSlug === 'sergik-release') return null
  return `https://distrokid.com/hyperfollow/${artistSlug}/${titleSlug}`
}

export function decodeStoreHtml(html: string): string {
  return html.replace(/&#47;/g, '/').replace(/&amp;/g, '&')
}

function fold(value: string): string {
  return value
    .toLowerCase()
    .replace(/&amp;/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function canonical(id: SharePlatformId, rawUrl: string): string | null {
  const url = rawUrl.trim()
  if (!/^https?:\/\//i.test(url)) return null

  if (id === 'spotify') {
    const match = url.match(/open\.spotify\.com\/(album|track|playlist)\/([A-Za-z0-9]+)/)
    if (!match || /\/artist\//i.test(url)) return null
    return `https://open.spotify.com/${match[1]}/${match[2]}`
  }

  if (id === 'apple_music') {
    const match = url.match(
      /(?:geo\.|embed\.)?music\.apple\.com\/([a-z]{2})\/(album|song)\/([^/?#]+)\/(\d+)/i,
    )
    if (!match || /\/artist\//i.test(url)) return null
    return `https://music.apple.com/${match[1].toLowerCase()}/${match[2].toLowerCase()}/${match[3]}/${match[4]}`
  }

  if (id === 'youtube_music') {
    const playlist = url.match(/[?&]list=([A-Za-z0-9_-]+)/)
    const watch = url.match(/(?:[?&]v=|youtu\.be\/)([A-Za-z0-9_-]{11})/)
    if (/\/channel\/|\/@/i.test(url) && !playlist && !watch) return null
    if (!/music\.youtube\.com|youtube\.com|youtu\.be/i.test(url)) return null
    if (playlist) return `https://music.youtube.com/playlist?list=${playlist[1]}`
    if (watch) return `https://music.youtube.com/watch?v=${watch[1]}`
    return null
  }

  if (id === 'amazon') {
    const album = url.match(/music\.amazon\.[^/]+\/albums\/([A-Z0-9]+)/i)
    if (album) return `https://music.amazon.com/albums/${album[1]}`
    const product = url.match(/amazon\.[^/]+\/(?:gp\/product|dp)\/([A-Z0-9]+)/i)
    if (product && !/\/artist|\/search/i.test(url)) return `https://music.amazon.com/albums/${product[1]}`
    return null
  }

  if (id === 'deezer') {
    const match = url.match(/deezer\.com\/(?:[a-z]{2}\/)?(album|track)\/(\d+)/i)
    if (!match || /\/artist\//i.test(url)) return null
    return `https://www.deezer.com/${match[1].toLowerCase()}/${match[2]}`
  }

  if (id === 'tidal') {
    const match = url.match(/tidal\.com\/(?:browse\/)?(?:album|track)\/(\d+)/i)
    if (!match || /\/artist\//i.test(url)) return null
    const kind = /\/track\//i.test(url) ? 'track' : 'album'
    return `https://tidal.com/${kind}/${match[1]}`
  }

  if (id === 'pandora') {
    if (!/pandora\.com\/.+\/album\//i.test(url) && !/pandora\.com\/album\//i.test(url)) return null
    if (/\/search\//i.test(url)) return null
    return url.split('?')[0]
  }

  if (/\/search/i.test(url) || /iheart\.com\/artist\/id-\d+\/?$/i.test(url)) return null
  const album = url.match(/iheart\.com\/(?:artist\/id-\d+\/)?albums?\/(?:id-)?(\d+)/i)
  if (!album) return null
  return `https://www.iheart.com/album/${album[1]}/`
}

function withPlayer(id: SharePlatformId, url: string): Pick<SharePlatformEmbed, 'embedUrl' | 'height'> | null {
  if (id === 'spotify') {
    const match = url.match(/open\.spotify\.com\/(album|track|playlist)\/([A-Za-z0-9]+)/)
    if (!match) return null
    return {
      embedUrl: `https://open.spotify.com/embed/${match[1]}/${match[2]}?utm_source=generator&theme=0`,
      height: match[1] === 'track' ? 152 : 352,
    }
  }
  if (id === 'apple_music') {
    const match = url.match(/music\.apple\.com\/([a-z]{2})\/(album|song)\/([^/?#]+)\/(\d+)/i)
    if (!match) return null
    return {
      embedUrl: `https://embed.music.apple.com/${match[1]}/${match[2]}/${match[3]}/${match[4]}`,
      height: match[2] === 'song' ? 175 : 450,
    }
  }
  if (id === 'youtube_music') {
    const playlist = url.match(/[?&]list=([A-Za-z0-9_-]+)/)
    const watch = url.match(/[?&]v=([A-Za-z0-9_-]{11})/)
    if (playlist) {
      return { embedUrl: `https://www.youtube.com/embed/videoseries?list=${playlist[1]}`, height: 200 }
    }
    if (watch) return { embedUrl: `https://www.youtube.com/embed/${watch[1]}`, height: 200 }
  }
  return null
}

/** Pull release-level store URLs out of a public store or hyperfollow page. */
export function releaseUrlsFromStoreHtml(html: string): Partial<Record<SharePlatformId, string>> {
  const text = decodeStoreHtml(html)
  const out: Partial<Record<SharePlatformId, string>> = {}
  const patterns: Array<[SharePlatformId, RegExp]> = [
    ['spotify', /https?:\/\/open\.spotify\.com\/(?:album|track|playlist)\/[A-Za-z0-9]+/g],
    [
      'apple_music',
      /https?:\/\/(?:geo\.|embed\.)?music\.apple\.com\/[a-z]{2}\/(?:album|song)\/[^"'?\s]+\/\d+/gi,
    ],
    ['youtube_music', /https?:\/\/music\.youtube\.com\/[^\s"'<]+/g],
    ['amazon', /https?:\/\/music\.amazon\.[^/]+\/albums\/[A-Z0-9]+/gi],
    ['deezer', /https?:\/\/(?:www\.)?deezer\.com\/(?:[a-z]{2}\/)?(?:album|track)\/\d+/gi],
    ['tidal', /https?:\/\/(?:listen\.|www\.)?tidal\.com\/(?:browse\/)?(?:album|track)\/\d+/gi],
    ['pandora', /https?:\/\/(?:www\.)?pandora\.com\/[^\s"'<]*\/album\/[^\s"'<]+/gi],
    ['iheart', /https?:\/\/(?:www\.)?iheart\.com\/[^\s"'<]*album[^\s"'<]*/gi],
  ]
  for (const [id, pattern] of patterns) {
    const found = text.match(pattern)
    if (!found) continue
    for (const href of found) {
      const clean = canonical(id, href)
      if (clean) {
        out[id] = clean
        break
      }
    }
  }
  return out
}

/** song.link / odesli.co matches payload. Ignores artist and store-duplicate rows. */
export function releaseUrlsFromOdesliMatches(
  payload: unknown,
): Partial<Record<SharePlatformId, string>> {
  if (!payload || typeof payload !== 'object') return {}
  const links = (payload as { links?: Record<string, { url?: unknown }> }).links
  if (!links) return {}
  const out: Partial<Record<SharePlatformId, string>> = {}
  for (const [platform, store] of Object.entries(ODESLI_PLATFORMS)) {
    const raw = String(links[platform]?.url || '').trim()
    const url = raw ? canonical(store, raw) : null
    if (url) out[store] = url
  }
  return out
}

/** Deezer album search. Accepts a title + artist match, not the first hit. */
export function deezerAlbumFromSearch(
  payload: unknown,
  title: string,
  artist: string,
): string | null {
  const rows = (payload as { data?: unknown })?.data
  if (!Array.isArray(rows)) return null
  const wantTitle = fold(title)
  const wantArtist = fold(artist)
  if (!wantTitle) return null
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    const record = row as { title?: unknown; link?: unknown; artist?: { name?: unknown } }
    const foundTitle = fold(String(record.title || ''))
    const foundArtist = fold(String(record.artist?.name || ''))
    if (foundTitle !== wantTitle && !foundTitle.startsWith(`${wantTitle} `)) continue
    if (wantArtist && foundArtist && !foundArtist.includes(wantArtist) && !wantArtist.includes(foundArtist)) {
      continue
    }
    const url = canonical('deezer', String(record.link || ''))
    if (url) return url
  }
  return null
}

export function platformEmbedFromUrl(
  id: SharePlatformId,
  rawUrl: string,
): SharePlatformEmbed | null {
  const url = canonical(id, rawUrl)
  if (!url) return null
  const player = withPlayer(id, url)
  return {
    id,
    label: LABELS[id],
    url,
    ...(player || {}),
  }
}

export function sharePlatformEmbeds(
  urls: Partial<Record<SharePlatformId, string | null | undefined>>,
): SharePlatformEmbed[] {
  const embeds: SharePlatformEmbed[] = []
  for (const id of PLATFORM_ORDER) {
    const raw = urls[id]
    if (!raw) continue
    const embed = platformEmbedFromUrl(id, raw)
    if (embed) embeds.push(embed)
  }
  return embeds
}
