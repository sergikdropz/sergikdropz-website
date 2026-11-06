import type { TvReleaseItem, TvTrackItem } from '@/lib/tv/catalog'

export function releaseHasPlayableAudio(tracks: Array<{ audioUrl?: string | null }>): boolean {
  return tracks.some((track) => Boolean(track.audioUrl?.trim()))
}

export function firstPlayableTrackIndex(tracks: Array<{ audioUrl?: string | null }>): number {
  const index = tracks.findIndex((track) => Boolean(track.audioUrl?.trim()))
  return index >= 0 ? index : 0
}

/** Move to the next or previous track that has a file. Wraps inside the release. */
export function stepPlayableTrackIndex(
  tracks: Array<{ audioUrl?: string | null }>,
  index: number,
  delta: 1 | -1,
): number {
  const playable = tracks.flatMap((track, trackIndex) => (track.audioUrl?.trim() ? [trackIndex] : []))
  if (playable.length === 0) return index
  if (delta > 0) return playable.find((trackIndex) => trackIndex > index) ?? playable[0]
  return [...playable].reverse().find((trackIndex) => trackIndex < index) ?? playable[playable.length - 1]
}

export function mergePlaybackTracks(
  releases: TvReleaseItem[],
  byReleaseId: Record<string, TvTrackItem[]>,
): TvReleaseItem[] {
  return releases.map((release) => {
    const tracks = byReleaseId[release.id]
    if (!tracks?.length) return release
    return { ...release, tracks }
  })
}

/** Browser-playable vault URL. Drops dead storage hosts. */
export function playableAudioUrl(value: string | null | undefined): string {
  const url = (value || '').trim()
  if (!url || url.includes('storage.local.invalid')) return ''
  if (url.startsWith('/api/audio/media/') || url.startsWith('/audio/')) return url
  if (/^https:\/\//i.test(url)) return url
  return ''
}
