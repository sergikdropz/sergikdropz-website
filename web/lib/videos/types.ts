export const VIDEO_CATEGORIES = [
  { id: 'music-video', label: 'Music Video' },
  { id: 'visualizer', label: 'Visualizer' },
  { id: 'collaboration', label: 'Collaboration' },
  { id: 'live-performance', label: 'Live Performance' },
  { id: 'behind-the-scenes', label: 'Behind the Scenes' },
] as const

export type VideoCategory = (typeof VIDEO_CATEGORIES)[number]['id']

export type CatalogVideo = {
  id: string
  title: string
  description: string
  youtube_id: string
  category: string
  date: string
  featured?: boolean
  published?: boolean
  thumbnail?: string
}

export type VideoCatalog = {
  videos: CatalogVideo[]
  youtube_channel: string
}

export const DEFAULT_YOUTUBE_CHANNEL = 'https://youtube.com/@sergikdropz'
