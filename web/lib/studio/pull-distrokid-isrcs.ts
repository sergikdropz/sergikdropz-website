/**
 * Match DistroKid album-page ISRCs onto Release Studio tracks.
 * DistroKid is the source when a code already exists there — this does not mint QTA53.
 */

import { normalizeTitleKey } from '@/lib/studio/distrokid-import'
import { validateISRC } from '@/lib/studio/isrc-format'

export type CatalogPullTrack = {
  id: string
  title: string
  track_number: number | null
  isrc_full: string | null
}

export type DistroKidPullCode = {
  n: number
  title: string
  isrc: string | null
}

export type DistroKidAlbumCandidate = {
  albumuuid: string
  title: string
  text: string
}

export type IsrcPullMatch = {
  trackId: string
  trackTitle: string
  isrc: string
  previous: string | null
  changed: boolean
}

export function compactIsrc(value: string | null | undefined): string {
  return String(value || '')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase()
}

export function distrokidAlbumUrl(albumuuid: string): string {
  return `https://distrokid.com/dashboard/album/?albumuuid=${encodeURIComponent(albumuuid)}`
}

export function albumUuidFromHref(href: string): string | null {
  try {
    const url = new URL(href, 'https://distrokid.com')
    const id = url.searchParams.get('albumuuid')?.trim().toUpperCase() || ''
    return id.length >= 20 ? id : null
  } catch {
    return null
  }
}

function titleScore(left: string, right: string): number {
  const a = normalizeTitleKey(left)
  const b = normalizeTitleKey(right)
  if (!a || !b) return 0
  if (a === b) return 100
  if (a.startsWith(b) || b.startsWith(a)) return 80
  if ((a.includes(b) || b.includes(a)) && Math.min(a.length, b.length) >= 6) return 60
  return 0
}

export function pickDistroKidAlbum(
  candidates: DistroKidAlbumCandidate[],
  query: { title: string; upc?: string | null },
): DistroKidAlbumCandidate | null {
  const upc = String(query.upc || '').replace(/\D/g, '')
  if (upc.length >= 12) {
    const byUpc = candidates.filter((row) => row.text.replace(/\D/g, '').includes(upc))
    if (byUpc.length === 1) return byUpc[0]
  }

  const scored = candidates
    .map((row) => ({
      row,
      score: Math.max(titleScore(query.title, row.title), titleScore(query.title, row.text)),
    }))
    .filter((row) => row.score >= 80)
    .sort((a, b) => b.score - a.score)

  if (!scored.length) return null
  if (scored.length > 1 && scored[0].score === scored[1].score && scored[0].row.albumuuid !== scored[1].row.albumuuid) {
    return null
  }
  return scored[0].row
}

export function matchDistrokidIsrcs(
  tracks: CatalogPullTrack[],
  codes: DistroKidPullCode[],
): { matches: IsrcPullMatch[]; unmatchedCodes: string[] } {
  const used = new Set<string>()
  const matches: IsrcPullMatch[] = []
  const unmatchedCodes: string[] = []

  const ordered = [...codes].sort((a, b) => a.n - b.n)
  for (const code of ordered) {
    const isrc = compactIsrc(code.isrc)
    if (!validateISRC(isrc)) {
      if (code.title) unmatchedCodes.push(code.title)
      continue
    }

    const ranked = tracks
      .filter((track) => !used.has(track.id))
      .map((track) => {
        const numberHit = track.track_number != null && track.track_number === code.n
        const score = titleScore(track.title, code.title)
        const rank = (numberHit ? 100 : 0) + score
        return { track, rank, score, numberHit }
      })
      .filter((row) => row.numberHit || row.score >= 60)
      .sort((a, b) => b.rank - a.rank)

    const winner = ranked[0]
    const tied =
      ranked.length > 1 &&
      ranked[1].rank === winner.rank &&
      ranked[1].track.id !== winner.track.id
    if (!winner || tied) {
      unmatchedCodes.push(code.title || isrc)
      continue
    }

    used.add(winner.track.id)
    const previous = winner.track.isrc_full
    matches.push({
      trackId: winner.track.id,
      trackTitle: winner.track.title,
      isrc,
      previous,
      changed: compactIsrc(previous) !== isrc,
    })
  }

  return { matches, unmatchedCodes }
}
