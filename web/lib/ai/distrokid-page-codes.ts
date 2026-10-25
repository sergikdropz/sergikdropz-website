/**
 * DistroKid album ISRCs live in `.isrc-value` (often `desktop-only`).
 * Visible page text hides those cells and the agent loop keeps only the first
 * few hundred characters, which is navigation chrome. This is the list the model should copy.
 */

import { parseDistroKidAlbumHtml } from '@/lib/studio/distrokid-import'
import { validateISRC } from '@/lib/studio/isrc-format'

export type DistroKidPageKind = 'album' | 'mymusic' | 'isrc' | 'upload' | 'other'

export type DistroKidPageTrackCode = {
  n: number
  title: string
  isrc: string | null
}

export type DistroKidPageCodes = {
  page: 'album' | 'mymusic' | 'isrc'
  album: string | null
  upc: string | null
  tracks: DistroKidPageTrackCode[]
  note: string
}

const NO_CODES_NOTE =
  'No ISRCs on this page. Open the album at /dashboard/album/?albumuuid=. /isrc/?albumuuid= redirects to My Music and does not list codes.'

const ALBUM_NOTE =
  'Parsed from album HTML (.isrc-value), including desktop-only cells hidden from visible text. Copy these exact ISRCs. Do not open /isrc/.'

const EMPTY_ALBUM_NOTE =
  'This album page has no track rows yet. Reload it. Do not open /isrc/ — that URL redirects to My Music.'

export function distrokidPageKind(pageUrl: string): DistroKidPageKind | null {
  try {
    const url = new URL(pageUrl)
    if (!/(^|\.)distrokid\.com$/i.test(url.hostname)) return null
    const path = url.pathname.replace(/\/+$/, '') || '/'
    if (path === '/isrc' || path.startsWith('/isrc/')) return 'isrc'
    if (path === '/mymusic' || path.startsWith('/mymusic/')) return 'mymusic'
    if (path === '/new' || path.startsWith('/new/')) return 'upload'
    if (path.includes('/dashboard/album')) return 'album'
    return 'other'
  } catch {
    return null
  }
}

function normalizeCode(raw: string | null | undefined): string | null {
  const compact = String(raw || '')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase()
  return validateISRC(compact) ? compact : null
}

function pullIsrcValues(html: string): string[] {
  const found: string[] = []
  const patterns = [
    /class="[^"]*isrc-value[^"]*"[^>]*>\s*([A-Z0-9-]{10,20})/gi,
    /data-clipboard-text=["']([A-Z0-9-]{10,20})["']/gi,
    /data-isrc=["']([A-Z0-9-]{10,20})["']/gi,
  ]
  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) {
      const code = normalizeCode(match[1])
      if (code && !found.includes(code)) found.push(code)
    }
  }
  return found
}

export function distrokidCodesFromHtml(html: string, pageUrl: string): DistroKidPageCodes | null {
  const kind = distrokidPageKind(pageUrl)
  if (!kind || kind === 'upload' || kind === 'other') return null
  if (kind === 'mymusic' || kind === 'isrc') {
    return {
      page: kind,
      album: null,
      upc: null,
      tracks: [],
      note: NO_CODES_NOTE,
    }
  }

  const parsed = parseDistroKidAlbumHtml(html, { pageUrl })
  const loose = pullIsrcValues(html)
  let tracks: DistroKidPageTrackCode[] = parsed.tracks.map((track, index) => ({
    n: track.track_number || index + 1,
    title: track.title,
    isrc: normalizeCode(track.isrc),
  }))

  if (tracks.length && tracks.every((track) => !track.isrc) && loose.length) {
    tracks = tracks.map((track, index) => ({
      ...track,
      isrc: loose[index] || null,
    }))
  }

  if (!tracks.length && loose.length) {
    tracks = loose.map((isrc, index) => ({
      n: index + 1,
      title: `Track ${index + 1}`,
      isrc,
    }))
  }

  const digits = parsed.upc?.replace(/\D/g, '') || ''
  const upcOk = digits.length === 12 || digits.length === 13 ? digits : null
  const album = parsed.title && parsed.title !== 'Untitled' ? parsed.title : null

  if (!tracks.length && !upcOk) {
    return {
      page: 'album',
      album,
      upc: null,
      tracks: [],
      note: EMPTY_ALBUM_NOTE,
    }
  }

  return {
    page: 'album',
    album,
    upc: upcOk,
    tracks,
    note: ALBUM_NOTE,
  }
}

export function formatDistroKidPageCodes(codes: DistroKidPageCodes): string {
  const lines = ['DISTROKID CODES']
  if (codes.album) lines.push(`Album: ${codes.album}`)
  if (codes.upc) lines.push(`UPC: ${codes.upc}`)
  if (!codes.tracks.length) {
    lines.push(codes.note)
    return lines.join('\n')
  }
  for (const track of codes.tracks) {
    lines.push(`${track.n}. ${track.title} — ${track.isrc || 'missing'}`)
  }
  const missing = codes.tracks.filter((track) => !track.isrc).length
  if (missing) lines.push(`${missing} track(s) have no ISRC on this page.`)
  lines.push(codes.note)
  return lines.join('\n')
}

/** Tool JSON used to keep ~400 characters per string. Codes must survive that cut. */
export function keepToolString(value: string, max = 400): string {
  if (value.length <= max) return value
  const at = value.indexOf('DISTROKID CODES')
  if (at >= 0) {
    const room = Math.max(max, 2200)
    const slice = value.slice(at, at + room)
    return slice.length < value.length - at ? `${slice}…` : slice
  }
  return `${value.slice(0, max)}…`
}

export function orderToolOutputForDistroKid(
  output: Record<string, unknown>,
  max = 400,
): Record<string, unknown> {
  if (!output.distrokidCodes) return output
  const text = typeof output.text === 'string' ? output.text : ''
  return {
    distrokidCodes: output.distrokidCodes,
    ...output,
    text: text ? keepToolString(text, max) : text,
  }
}
