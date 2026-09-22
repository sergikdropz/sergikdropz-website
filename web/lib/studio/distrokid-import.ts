/**
 * DistroKid My Music → Release Studio import (pure parsers + draft builders).
 * Extraction runs in the user's DistroKid browser session; Studio ingests JSON.
 */

import type { DspStoreId } from '@/lib/studio/constants'
import { ALL_DSP_STORE_IDS, isDspStoreId, orderDspStoreIds } from '@/lib/studio/constants'
import { parseKnownStoreUrl } from '@/lib/studio/dsp-connect'
import { parseISRC, validateISRC } from '@/lib/studio/isrc-format'
import type { StudioReleaseType } from '@/lib/studio/vault-import'

export const DISTROKID_EXPORT_VERSION = 2 as const

export type DistroKidStoreLink = {
  store: DspStoreId
  url: string
}

export type DistroKidTrack = {
  track_number: number
  title: string
  isrc: string | null
  /** DistroKid Vault WAV download path, e.g. https://distrokid.com/vault/download/?id=eQeZ9 */
  download_url: string | null
  credits_url: string | null
  lyrics_url: string | null
}

export type DistroKidRelease = {
  albumuuid: string
  title: string
  artist: string
  label: string | null
  release_date: string | null
  upload_date: string | null
  upc: string | null
  artwork_url: string | null
  hyperfollow_url: string | null
  tracks: DistroKidTrack[]
  store_links: DistroKidStoreLink[]
  /** DistroKid “Submitted to …” store icons (links optional). */
  submitted_stores: DspStoreId[]
  type_hint?: StudioReleaseType | null
}

export type DistroKidMyMusicRow = {
  albumuuid: string
  title: string
  artist: string
  track_count: number | null
  type_hint: StudioReleaseType | null
}

export type DistroKidCatalogExport = {
  version: typeof DISTROKID_EXPORT_VERSION
  source: 'distrokid'
  extracted_at: string
  releases: DistroKidRelease[]
}

export type DistroKidTrackDraft = {
  track_number: number
  title: string
  isrc_full: string | null
  isrc_prefix: string | null
  isrc_year: number | null
  isrc_serial: number | null
}

export type DistroKidReleaseDraft = {
  id: string
  title: string
  type: StudioReleaseType
  album_artist: string | null
  label_name: string | null
  release_date: string | null
  original_release_date: string | null
  upc: string | null
  previous_upc: string | null
  previously_released: true
  artwork_url: string | null
  albumuuid: string
  tracks: DistroKidTrackDraft[]
  store_links: DistroKidStoreLink[]
  /** Delivery targets — DistroKid submitted set when known. */
  target_stores: DspStoreId[]
  marketing_meta: {
    source: 'distrokid'
    albumuuid: string
    upc: string | null
    importedAt: string
    hyperfollow_url?: string | null
  }
}

function clean(value: unknown): string {
  if (value == null) return ''
  return String(value).replace(/\s+/g, ' ').trim()
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
}

function stripTags(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
}

/** Absolute https URL from DistroKid img src (may be protocol-relative). */
export function absolutizeDistroKidUrl(url: string | null | undefined): string | null {
  const raw = clean(url)
  if (!raw) return null
  if (raw.startsWith('//')) return `https:${raw}`
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw
  if (raw.startsWith('/')) return `https://distrokid.com${raw}`
  return raw
}

/** Parse DistroKid display dates like "February 14, 2025" → YYYY-MM-DD. */
export function parseDistroKidDate(raw: string | null | undefined): string | null {
  const value = clean(raw)
  if (!value) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) return null
  const d = new Date(parsed)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function normalizeTitleKey(title: string): string {
  return clean(title)
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function studioTypeFromTrackCount(count: number): StudioReleaseType {
  if (count <= 1) return 'single'
  if (count <= 6) return 'ep'
  return 'album'
}

export function studioReleaseIdFromDistroKid(
  albumuuid: string,
  now: number = Date.now(),
): string {
  const cleaned = String(albumuuid || '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 16)
  const label = cleaned || 'dk'
  return `release-dk-${label}-${now.toString(36)}`.slice(0, 80)
}

export function marketingCopyWithDistroKidMeta(
  existing: Record<string, unknown> | null | undefined,
  meta: DistroKidReleaseDraft['marketing_meta'],
): Record<string, unknown> {
  const previous = (existing || {}) as Record<string, unknown>
  const priorContinuity =
    previous._stream_continuity && typeof previous._stream_continuity === 'object'
      ? (previous._stream_continuity as Record<string, unknown>)
      : {}
  return {
    ...previous,
    _distrokid: {
      albumuuid: meta.albumuuid,
      upc: meta.upc,
      importedAt: meta.importedAt,
      source: 'distrokid' as const,
    },
    _stream_continuity: {
      ...priorContinuity,
      source: 'distrokid',
      old_distributor: 'distrokid',
      phases: {
        ...((priorContinuity.phases as Record<string, boolean>) || {}),
        captured: true,
        identity_verified: Boolean(meta.upc),
      },
      updated_at: new Date().toISOString(),
    },
  }
}

export function distroKidAlbumuuidFromMarketingCopy(
  copy: Record<string, unknown> | null | undefined,
): string | null {
  const dk = copy?._distrokid
  if (!dk || typeof dk !== 'object') return null
  const id = clean((dk as { albumuuid?: string }).albumuuid)
  return id || null
}

function extractInfoValue(html: string, label: RegExp): string | null {
  const re = new RegExp(
    `${label.source}[\\s\\S]*?<span[^>]*class="[^"]*info-value[^"]*"[^>]*>([\\s\\S]*?)<\\/span>`,
    'i',
  )
  const match = html.match(re)
  if (match) return stripTags(match[1])
  const textRe = new RegExp(`${label.source}\\s*[:]?\\s*([^\\n<]+)`, 'i')
  const textMatch = html.match(textRe)
  return textMatch ? clean(stripTags(textMatch[1])) : null
}

function extractAlbumuuid(html: string, fallbackUrl?: string | null): string | null {
  const fromHref =
    html.match(/albumuuid=([A-F0-9-]{20,})/i)?.[1] ||
    html.match(/albumuuid['"]?\s*[:=]\s*['"]([A-F0-9-]{20,})/i)?.[1]
  if (fromHref) return fromHref.toUpperCase().replace(/[^A-F0-9-]/g, '')
  if (fallbackUrl) {
    try {
      const u = new URL(fallbackUrl, 'https://distrokid.com')
      const id = u.searchParams.get('albumuuid')
      if (id) return id.toUpperCase()
    } catch {
      /* ignore */
    }
  }
  return null
}

/** Map DistroKid album-store-* test ids onto Studio DSP ids. */
export const DISTROKID_STORE_TESTID_TO_DSP: Record<string, DspStoreId> = {
  spotify: 'spotify',
  applemusic: 'apple_music',
  itunes: 'apple_music',
  facebook: 'instagram',
  tiktok: 'tiktok',
  google: 'youtube_music',
  amazon: 'amazon',
  rdio: 'pandora',
  deezer: 'deezer',
  tidal: 'tidal',
  iheart: 'iheart',
  imusica: 'claro_musica',
  saavn: 'saavn',
  boomplay: 'boomplay',
  anghami: 'anghami',
  netease: 'netease',
  tencent: 'tencent',
  qobuz: 'qobuz',
  joox: 'joox',
  kuackmedia: 'kuack_media',
  feedfm: 'adaptr',
  flo: 'flo',
  beats: 'medianet',
  // Optional DistroKid “more stores” checkboxes (testid may vary)
  audiomack: 'audiomack',
  snapchat: 'snapchat',
  massivemusic: 'massivemusic',
  roblox: 'roblox',
}

/**
 * DistroKid “Submitted to …” icons (data-testid=album-store-*).
 * Falls back to linked store URLs when the icon row is missing.
 */
export function collectDistroKidSubmittedStores(html: string): DspStoreId[] {
  const found = new Set<DspStoreId>()
  for (const match of html.matchAll(/data-testid=["']album-store-([^"']+)["']/gi)) {
    const key = String(match[1] || '').toLowerCase()
    const store = DISTROKID_STORE_TESTID_TO_DSP[key]
    if (store) found.add(store)
  }
  if (!found.size) {
    for (const link of collectDistroKidStoreLinks(html)) found.add(link.store)
  }
  return orderDspStoreIds(found)
}

/** Dedupe album-level DSP links; prefer Apple Music app=music over iTunes. */
export function collectDistroKidStoreLinks(html: string): DistroKidStoreLink[] {
  const hrefs = [...html.matchAll(/href=["']([^"']+)["']/gi)].map((m) => m[1])
  const byStore = new Map<DspStoreId, string>()
  const hasAlbumDsp = /open\.spotify\.com\/album|music\.apple\.com\/.*album|deezer\.com\/album/i.test(
    html,
  )

  for (const href of hrefs) {
    let absolute = absolutizeDistroKidUrl(href)
    if (!absolute) continue
    if (absolute.startsWith('http://')) absolute = `https://${absolute.slice('http://'.length)}`
    // Skip DistroKid tool pages
    if (/distrokid\.com\/(uri|spotify|tidalartist)\//i.test(absolute)) continue
    const parsed = parseKnownStoreUrl(absolute)
    if (!parsed) continue
    // Prefer album DSP pages; drop noisy per-track YouTube when Spotify/Apple exist
    if (parsed.store === 'youtube' && hasAlbumDsp) continue
    if (parsed.store === 'apple_music') {
      const existing = byStore.get('apple_music')
      if (existing && /app=music/i.test(existing) && /app=itunes/i.test(absolute)) continue
      if (existing && /app=itunes/i.test(existing) && /app=music/i.test(absolute)) {
        byStore.set('apple_music', absolute)
        continue
      }
    }
    if (!byStore.has(parsed.store)) {
      byStore.set(parsed.store, absolute)
    }
  }

  return [...byStore.entries()].map(([store, url]) => ({ store, url }))
}

function parseTrackRows(html: string): DistroKidTrack[] {
  const rows: DistroKidTrack[] = []
  // Split on track-row openings
  const parts = html.split(/<div[^>]*class="[^"]*\btrack-row\b[^"]*\btrackRow\b[^"]*"[^>]*>/i)
  for (let i = 1; i < parts.length; i++) {
    const chunk = parts[i].slice(0, 6000)
    const numRaw = chunk.match(/track-num[^>]*>\s*(\d+)/i)?.[1]
    const titleFromAttr = chunk.match(/track-name[\s\S]*?<span[^>]*title="([^"]+)"/i)?.[1]
    const titleFromText = chunk.match(/track-name[^>]*>\s*<span[^>]*>\s*([^<]+)/i)?.[1]
    const title = clean(decodeHtmlEntities(titleFromAttr || titleFromText || ''))
    const isrcRaw =
      chunk.match(/isrc-value[^>]*>\s*([A-Z0-9-]+)/i)?.[1] ||
      chunk.match(/ISRC[\s\S]{0,40}?([A-Z]{2}[A-Z0-9]{10})/i)?.[1] ||
      null
    const isrc = isrcRaw && validateISRC(isrcRaw) ? isrcRaw.replace(/-/g, '').toUpperCase() : null
    const downloadHref =
      chunk.match(/href=["']([^"']*vault\/download\/[^"']*)["']/i)?.[1] ||
      chunk.match(/track-download[\s\S]*?href=["']([^"']+)["']/i)?.[1] ||
      null
    const creditsHref =
      chunk.match(/href=["']([^"']*credits\/track\/[^"']*)["']/i)?.[1] || null
    const lyricsHref =
      chunk.match(/href=["']([^"']*lyrics\/track\/[^"']*)["']/i)?.[1] || null
    const track_number = numRaw ? parseInt(numRaw, 10) : rows.length + 1
    if (!title) continue
    rows.push({
      track_number,
      title,
      isrc,
      download_url: absolutizeDistroKidUrl(downloadHref),
      credits_url: absolutizeDistroKidUrl(creditsHref),
      lyrics_url: absolutizeDistroKidUrl(lyricsHref),
    })
  }

  if (rows.length) return rows

  // Text fallback: numbered title + ISRC blocks
  const text = stripTags(html)
  const textTracks = [
    ...text.matchAll(/(\d+)\s+([^\n]{2,120}?)\s+ISRC\s+([A-Z0-9-]{12,15})/gi),
  ]
  for (const m of textTracks) {
    const isrc = validateISRC(m[3]) ? m[3].replace(/-/g, '').toUpperCase() : null
    const title = clean(m[2])
    if (!title || /release date|upload date|distrokid upc/i.test(title)) continue
    rows.push({
      track_number: parseInt(m[1], 10),
      title,
      isrc,
      download_url: null,
      credits_url: null,
      lyrics_url: null,
    })
  }
  return rows
}

/**
 * Parse DistroKid My Music listing HTML into album rows.
 */
export function parseDistroKidMyMusicHtml(html: string): DistroKidMyMusicRow[] {
  const byUuid = new Map<string, DistroKidMyMusicRow>()
  const linkRe =
    /<a[^>]*href=["']([^"']*albumuuid=([^"'&]+)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi
  for (const match of html.matchAll(linkRe)) {
    const albumuuid = clean(match[2]).toUpperCase()
    if (!albumuuid || albumuuid.length < 20) continue
    const text = stripTags(match[3])
    if (!text || text.length < 2) continue
    // Prefer the longer "Title N tracks Artist" / "Title Single Artist" row
    const trackCountMatch = text.match(/(\d+)\s*tracks?/i)
    const isSingle = /\bSingle\b/i.test(text)
    const track_count: number | null = trackCountMatch
      ? parseInt(trackCountMatch[1], 10)
      : isSingle
        ? 1
        : null
    let title = text
      .replace(/\s+\d+\s*tracks?\s+/i, ' ')
      .replace(/\s+Single\s+/i, ' ')
      .trim()
    // Last token(s) often artist — DistroKid rows end with artist name
    let artist = ''
    const parts = title.split(/\s+/)
    if (parts.length >= 2) {
      // Heuristic: trailing artist is often a single word (Sergik) after title
      // Keep full text as title when we can't split reliably; album pages fix it.
      const maybeArtist = parts[parts.length - 1]
      if (/^[A-Za-z][A-Za-z0-9._-]{1,40}$/.test(maybeArtist)) {
        artist = maybeArtist
        title = parts.slice(0, -1).join(' ')
      }
    }
    const type_hint =
      track_count != null ? studioTypeFromTrackCount(track_count) : isSingle ? 'single' : null
    const existing = byUuid.get(albumuuid)
    if (!existing || text.length > `${existing.title} ${existing.artist}`.length) {
      byUuid.set(albumuuid, {
        albumuuid,
        title: title || existing?.title || albumuuid,
        artist: artist || existing?.artist || '',
        track_count: track_count ?? existing?.track_count ?? null,
        type_hint: type_hint ?? existing?.type_hint ?? null,
      })
    }
  }
  return [...byUuid.values()]
}

/**
 * Parse a DistroKid album dashboard HTML page.
 */
export function parseDistroKidAlbumHtml(
  html: string,
  opts?: { albumuuid?: string | null; pageUrl?: string | null },
): DistroKidRelease {
  const albumuuid =
    opts?.albumuuid?.toUpperCase() ||
    extractAlbumuuid(html, opts?.pageUrl) ||
    ''
  const title =
    clean(
      stripTags(
        html.match(/class="album-title"[^>]*>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/i)?.[1] || '',
      ),
    ) ||
    clean(html.match(/<title>\s*([^-|<]+)/i)?.[1] || '') ||
    'Untitled'

  const artist =
    clean(
      stripTags(
        html.match(/class="band-name"[^>]*>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/i)?.[1] || '',
      ),
    ) || ''

  const label = extractInfoValue(html, /Record\s*Label/)
  const upload_date = parseDistroKidDate(extractInfoValue(html, /Upload\s*date/))
  const release_date = parseDistroKidDate(extractInfoValue(html, /Release\s*date/))
  const upcRaw =
    extractInfoValue(html, /DistroKid\s*UPC/) ||
    extractInfoValue(html, /DK\s*UPC/) ||
    html.match(/id="js-album-upc"[^>]*>([^<]+)/i)?.[1] ||
    null
  const upc = upcRaw ? clean(upcRaw).replace(/\D/g, '') || null : null

  const artSrc =
    html.match(/<img[^>]*class="[^"]*album-image[^"]*"[^>]*src=["']([^"']+)["']/i)?.[1] ||
    html.match(/<img[^>]*src=["']([^"']+)["'][^>]*class="[^"]*album-image[^"]*"/i)?.[1] ||
    null
  const artwork_url = absolutizeDistroKidUrl(artSrc)

  const tracks = parseTrackRows(html)
  const store_links = collectDistroKidStoreLinks(html)
  const submitted_stores = collectDistroKidSubmittedStores(html)
  const hyperfollowHref =
    [...html.matchAll(/href=["']([^"']*hyperfollow\/[^"']+)["']/gi)]
      .map((m) => m[1])
      .find((h) => !/ref=globalmenu/i.test(h) && /hyperfollow\.com|\/hyperfollow\/[^/?]+\/[^/?]+/i.test(h)) ||
    null

  return {
    albumuuid,
    title,
    artist,
    label,
    release_date,
    upload_date,
    upc,
    artwork_url,
    hyperfollow_url: absolutizeDistroKidUrl(hyperfollowHref),
    tracks,
    store_links,
    submitted_stores,
    type_hint: studioTypeFromTrackCount(tracks.length || 1),
  }
}

export function parseDistroKidCatalogJson(raw: unknown): DistroKidCatalogExport {
  if (typeof raw === 'string') {
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      throw new Error('Invalid DistroKid JSON')
    }
    return parseDistroKidCatalogJson(parsed)
  }
  if (!raw || typeof raw !== 'object') throw new Error('DistroKid catalog must be an object')
  const obj = raw as Record<string, unknown>
  const releasesRaw = Array.isArray(obj.releases) ? obj.releases : []
  if (!releasesRaw.length) throw new Error('DistroKid catalog has no releases')

  const releases: DistroKidRelease[] = releasesRaw.map((item, index) => {
    if (!item || typeof item !== 'object') {
      throw new Error(`Release ${index + 1} is invalid`)
    }
    const r = item as Record<string, unknown>
    const albumuuid = clean(r.albumuuid).toUpperCase()
    if (!albumuuid) throw new Error(`Release ${index + 1} is missing albumuuid`)
    const tracksRaw = Array.isArray(r.tracks) ? r.tracks : []
    const tracks: DistroKidTrack[] = tracksRaw.map((t, ti) => {
      const row = (t && typeof t === 'object' ? t : {}) as Record<string, unknown>
      const title = clean(row.title)
      if (!title) throw new Error(`Release ${albumuuid} track ${ti + 1} missing title`)
      const isrcRaw = clean(row.isrc)
      const isrc = isrcRaw && validateISRC(isrcRaw) ? isrcRaw.replace(/-/g, '').toUpperCase() : null
      return {
        track_number: Number(row.track_number) || ti + 1,
        title,
        isrc,
        download_url: absolutizeDistroKidUrl(clean(row.download_url) || null),
        credits_url: absolutizeDistroKidUrl(clean(row.credits_url) || null),
        lyrics_url: absolutizeDistroKidUrl(clean(row.lyrics_url) || null),
      }
    })
    const store_links: DistroKidStoreLink[] = []
    if (Array.isArray(r.store_links)) {
      for (const link of r.store_links) {
        if (!link || typeof link !== 'object') continue
        const url = clean((link as { url?: string }).url)
        const storeRaw = clean((link as { store?: string }).store)
        if (!url) continue
        const parsed = parseKnownStoreUrl(url)
        if (parsed) {
          store_links.push({ store: parsed.store, url: parsed.url || url })
          continue
        }
        if (isDspStoreId(storeRaw)) {
          store_links.push({ store: storeRaw, url })
        }
      }
    }

    const submittedFromJson = new Set<DspStoreId>()
    if (Array.isArray(r.submitted_stores)) {
      for (const raw of r.submitted_stores) {
        const id = clean(raw)
        if (isDspStoreId(id)) submittedFromJson.add(id)
      }
    }
    if (Array.isArray(r.target_stores)) {
      for (const raw of r.target_stores) {
        const id = clean(raw)
        if (isDspStoreId(id)) submittedFromJson.add(id)
      }
    }
    for (const link of store_links) submittedFromJson.add(link.store)
    const submitted_stores = orderDspStoreIds(submittedFromJson)

    return {
      albumuuid,
      title: clean(r.title) || 'Untitled',
      artist: clean(r.artist),
      label: clean(r.label) || null,
      release_date: parseDistroKidDate(clean(r.release_date) || null),
      upload_date: parseDistroKidDate(clean(r.upload_date) || null),
      upc: clean(r.upc).replace(/\D/g, '') || null,
      artwork_url: absolutizeDistroKidUrl(clean(r.artwork_url) || null),
      hyperfollow_url: absolutizeDistroKidUrl(clean(r.hyperfollow_url) || null),
      tracks,
      store_links,
      submitted_stores,
      type_hint:
        (r.type_hint as StudioReleaseType) || studioTypeFromTrackCount(tracks.length || 1),
    }
  })

  return {
    version: DISTROKID_EXPORT_VERSION,
    source: 'distrokid',
    extracted_at:
      typeof obj.extracted_at === 'string' && obj.extracted_at
        ? obj.extracted_at
        : new Date().toISOString(),
    releases,
  }
}

export function buildDistroKidReleaseDraft(
  release: DistroKidRelease,
  now: number = Date.now(),
): DistroKidReleaseDraft {
  const tracks: DistroKidTrackDraft[] = release.tracks.map((t) => {
    const parsed = t.isrc ? parseISRC(t.isrc) : null
    return {
      track_number: t.track_number,
      title: t.title,
      isrc_full: parsed?.isrc_full ?? null,
      isrc_prefix: parsed?.prefix ?? null,
      isrc_year: parsed?.year ?? null,
      isrc_serial: parsed?.serial ?? null,
    }
  })
  const type =
    release.type_hint || studioTypeFromTrackCount(tracks.length || 1)
  const upc = release.upc
  const importedAt = new Date(now).toISOString()
  const target_stores =
    release.submitted_stores?.length > 0
      ? orderDspStoreIds(release.submitted_stores)
      : orderDspStoreIds(release.store_links.map((l) => l.store))
  const resolvedTargets = target_stores.length ? target_stores : [...ALL_DSP_STORE_IDS]

  return {
    id: studioReleaseIdFromDistroKid(release.albumuuid, now),
    title: release.title,
    type,
    album_artist: release.artist || null,
    label_name: release.label || null,
    release_date: release.release_date,
    original_release_date: release.release_date,
    upc,
    previous_upc: upc,
    previously_released: true,
    artwork_url: release.artwork_url,
    albumuuid: release.albumuuid,
    tracks,
    store_links: release.store_links,
    target_stores: resolvedTargets,
    marketing_meta: {
      source: 'distrokid',
      albumuuid: release.albumuuid,
      upc,
      importedAt,
      hyperfollow_url: release.hyperfollow_url,
    },
  }
}

export function buildDistroKidCatalogDrafts(
  catalog: DistroKidCatalogExport,
  now: number = Date.now(),
): DistroKidReleaseDraft[] {
  return catalog.releases.map((release, i) =>
    buildDistroKidReleaseDraft(release, now + i),
  )
}

/** Preview stats for Create Hub UI. */
export function summarizeDistroKidCatalog(catalog: DistroKidCatalogExport): {
  releaseCount: number
  trackCount: number
  withUpc: number
  withIsrc: number
  missingIsrc: number
  releases: Array<{
    albumuuid: string
    title: string
    type: StudioReleaseType
    trackCount: number
    upc: string | null
    isrcCount: number
  }>
} {
  const drafts = buildDistroKidCatalogDrafts(catalog)
  let trackCount = 0
  let withUpc = 0
  let withIsrc = 0
  let missingIsrc = 0
  const releases = drafts.map((d) => {
    trackCount += d.tracks.length
    if (d.upc) withUpc += 1
    const isrcCount = d.tracks.filter((t) => t.isrc_full).length
    withIsrc += isrcCount
    missingIsrc += d.tracks.length - isrcCount
    return {
      albumuuid: d.albumuuid,
      title: d.title,
      type: d.type,
      trackCount: d.tracks.length,
      upc: d.upc,
      isrcCount,
    }
  })
  return {
    releaseCount: drafts.length,
    trackCount,
    withUpc,
    withIsrc,
    missingIsrc,
    releases,
  }
}
