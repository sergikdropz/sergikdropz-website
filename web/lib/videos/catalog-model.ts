import { DEFAULT_YOUTUBE_CHANNEL, type CatalogVideo, type VideoCatalog } from '@/lib/videos/types'

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback
}

export function normalizeVideo(raw: unknown, index = 0): CatalogVideo | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const youtubeId = asString(row.youtube_id)
  const title = asString(row.title)
  if (!youtubeId || !title) return null

  const id = asString(row.id) || `video-${index + 1}`
  return {
    id,
    title,
    description: asString(row.description),
    youtube_id: youtubeId,
    category: asString(row.category) || 'music-video',
    date: asString(row.date) || new Date().getFullYear().toString(),
    featured: row.featured === true,
    published: row.published === false ? false : true,
    thumbnail: asString(row.thumbnail) || undefined,
  }
}

export function normalizeCatalog(data: unknown): VideoCatalog {
  const row = data && typeof data === 'object' ? (data as Record<string, unknown>) : {}
  const videos = Array.isArray(row.videos)
    ? row.videos.map((video, index) => normalizeVideo(video, index)).filter((video): video is CatalogVideo => video !== null)
    : []

  return {
    videos,
    youtube_channel: asString(row.youtube_channel) || DEFAULT_YOUTUBE_CHANNEL,
  }
}

export function sortCatalogVideos(videos: CatalogVideo[]): CatalogVideo[] {
  return [...videos].sort((a, b) => {
    if (Boolean(a.featured) !== Boolean(b.featured)) return a.featured ? -1 : 1
    return (b.date || '').localeCompare(a.date || '')
  })
}

export function publicVideos(catalog: VideoCatalog): CatalogVideo[] {
  return catalog.videos.filter((video) => video.published !== false)
}

export function featuredVideo(videos: CatalogVideo[]): CatalogVideo | null {
  return videos.find((video) => video.featured) || videos[0] || null
}

export function reorderCatalogVideos(videos: CatalogVideo[], orderedIds: string[]): CatalogVideo[] {
  const byId = new Map(videos.map((video) => [video.id, video]))
  const next: CatalogVideo[] = []
  for (const id of orderedIds) {
    const video = byId.get(id)
    if (video) {
      next.push(video)
      byId.delete(id)
    }
  }
  next.push(...byId.values())
  return next
}

export function upsertCatalogVideo(catalog: VideoCatalog, video: CatalogVideo): VideoCatalog {
  const existingIndex = catalog.videos.findIndex((row) => row.id === video.id || row.youtube_id === video.youtube_id)
  const videos = [...catalog.videos]
  if (existingIndex >= 0) {
    videos[existingIndex] = { ...videos[existingIndex], ...video, id: videos[existingIndex].id }
  } else {
    videos.unshift(video)
  }

  if (video.featured) {
    for (let i = 0; i < videos.length; i += 1) {
      if (videos[i].id !== video.id && videos[i].youtube_id !== video.youtube_id) {
        videos[i] = { ...videos[i], featured: false }
      }
    }
  }

  return { ...catalog, videos }
}

export function removeCatalogVideo(catalog: VideoCatalog, id: string): VideoCatalog {
  return { ...catalog, videos: catalog.videos.filter((video) => video.id !== id) }
}
