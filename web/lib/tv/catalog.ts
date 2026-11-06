import type { CatalogVideo } from '@/lib/videos/types'
import { videoCategoryLabel, youtubeThumbnailUrls } from '@/lib/videos/youtube'
import { resolveImageUrl } from '@/utils/resolveImageUrl'

export const TV_SHELF_LIMIT = 18

export type TvVideoItem = {
  id: string
  title: string
  youtubeId: string
  category: string
  thumbnails: string[]
}

export type TvTrackItem = {
  title: string
  duration: number | null
  audioUrl: string
}

export type TvReleaseItem = {
  id: string
  title: string
  type: string
  year: number | null
  image: string
  tracks: TvTrackItem[]
}

export type TvListenItem = {
  id: string
  title: string
  description: string
  url: string
}

type LiveReleaseInput = {
  id: string
  title: string
  type: string
  release_date?: string | null
  artwork_url?: string | null
  tracks?: Array<{ title?: string | null; duration?: number | null }>
}

type StaticReleaseInput = {
  id: string
  title: string
  type: string
  year?: number | null
  release_date?: string | null
  image?: string | null
}

type ScheduleReleaseInput = {
  id: string
  title: string
  type: string
  release_date?: string | null
  artwork?: string | null
}

type PlaylistInput = {
  id: string
  title: string
  url?: string | null
  description?: string | null
  featured?: boolean
}

export function buildTvVideos(videos: CatalogVideo[]): TvVideoItem[] {
  return videos
    .filter((video) => video.published !== false && video.youtube_id && video.title)
    .slice(0, TV_SHELF_LIMIT)
    .map((video) => ({
      id: video.id,
      title: video.title,
      youtubeId: video.youtube_id,
      category: videoCategoryLabel(video.category || 'music-video'),
      thumbnails: video.thumbnail
        ? [video.thumbnail, ...youtubeThumbnailUrls(video.youtube_id)]
        : youtubeThumbnailUrls(video.youtube_id),
    }))
}

export function buildTvReleases(input: {
  live: LiveReleaseInput[]
  staticReleases: StaticReleaseInput[]
  schedule: ScheduleReleaseInput[]
  today: string
}): TvReleaseItem[] {
  const shelf = new Map<string, TvReleaseItem>()

  const put = (item: TvReleaseItem) => {
    if (!item.id || !item.title || shelf.has(item.id)) return
    shelf.set(item.id, item)
  }

  for (const release of input.live) {
    put({
      id: release.id,
      title: release.title,
      type: titleCase(release.type),
      year: releaseYear(release.release_date, null),
      image: artworkUrl(release.artwork_url),
      tracks: tracksFrom(release.tracks),
    })
  }

  for (const release of input.schedule) {
    if (!release.release_date || release.release_date > input.today) continue
    put({
      id: release.id,
      title: release.title,
      type: titleCase(release.type),
      year: releaseYear(release.release_date, null),
      image: artworkUrl(release.artwork),
      tracks: [],
    })
  }

  for (const release of input.staticReleases) {
    put({
      id: release.id,
      title: release.title,
      type: titleCase(release.type),
      year: releaseYear(release.release_date, release.year),
      image: artworkUrl(release.image),
      tracks: [],
    })
  }

  return [...shelf.values()].slice(0, TV_SHELF_LIMIT)
}

export function buildTvListen(playlists: PlaylistInput[]): TvListenItem[] {
  return [...playlists]
    .filter((playlist) => typeof playlist.url === 'string' && playlist.url.trim().length > 0)
    .sort((a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)))
    .slice(0, 8)
    .map((playlist) => ({
      id: playlist.id,
      title: playlist.title,
      description: (playlist.description || '').trim(),
      url: playlist.url!.trim(),
    }))
}

export function formatTvDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return ''
  const total = Math.round(seconds)
  const minutes = Math.floor(total / 60)
  const remain = total % 60
  return `${minutes}:${remain.toString().padStart(2, '0')}`
}

function tracksFrom(tracks: LiveReleaseInput['tracks']): TvTrackItem[] {
  if (!tracks) return []
  return tracks
    .map((track) => ({
      title: (track.title || '').trim(),
      duration: typeof track.duration === 'number' && track.duration > 0 ? track.duration : null,
      audioUrl: '',
    }))
    .filter((track) => track.title.length > 0)
}

function artworkUrl(value: string | null | undefined): string {
  const raw = (value || '').trim()
  if (!raw) return ''
  const resolved = resolveImageUrl(raw)
  if (!resolved || resolved.includes('storage.local.invalid')) return ''
  return resolved
}

function releaseYear(releaseDate?: string | null, year?: number | null): number | null {
  if (releaseDate && /^\d{4}/.test(releaseDate)) return Number(releaseDate.slice(0, 4))
  if (typeof year === 'number' && year > 0) return year
  return null
}

function titleCase(value: string): string {
  const text = (value || '').trim()
  if (!text) return 'Release'
  if (/^eps?$/i.test(text)) return 'EP'
  if (/^lps?$/i.test(text)) return 'LP'
  return text.charAt(0).toUpperCase() + text.slice(1)
}
