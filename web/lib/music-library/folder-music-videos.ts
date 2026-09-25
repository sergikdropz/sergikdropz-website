import { isYouTubeId, parseYouTubeInput } from '@/lib/videos/youtube'

export const FOLDER_MUSIC_VIDEOS_META_KEY = 'music_videos'
export const FOLDER_MUSIC_VIDEOS_MAX = 4

/** Expanded video strip height ≈ 5 SongsTable rows (~49px each). */
export const FOLDER_MUSIC_VIDEOS_EXPANDED_PX = 245

export type FolderMusicVideo = {
  id: string
  youtubeId: string
  title?: string
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function videoIdFromEntry(entry: Record<string, unknown>): string | null {
  for (const key of ['youtubeId', 'youtube_id', 'id', 'url', 'link'] as const) {
    const raw = entry[key]
    if (typeof raw !== 'string' || !raw.trim()) continue
    if (key === 'youtubeId' || key === 'youtube_id' || key === 'id') {
      if (isYouTubeId(raw)) return raw.trim()
    }
    const parsed = parseYouTubeInput(raw)
    if ('youtubeId' in parsed) return parsed.youtubeId
  }
  return null
}

/** Normalize folder.metadata.music_videos into a capped list of embeddable videos. */
export function parseFolderMusicVideos(metadata: unknown): FolderMusicVideo[] {
  const meta = asRecord(metadata)
  if (!meta) return []
  const raw = meta[FOLDER_MUSIC_VIDEOS_META_KEY]
  if (!Array.isArray(raw)) return []

  const out: FolderMusicVideo[] = []
  const seen = new Set<string>()

  for (const item of raw) {
    if (out.length >= FOLDER_MUSIC_VIDEOS_MAX) break
    if (typeof item === 'string') {
      const parsed = parseYouTubeInput(item)
      if (!('youtubeId' in parsed) || seen.has(parsed.youtubeId)) continue
      seen.add(parsed.youtubeId)
      out.push({ id: parsed.youtubeId, youtubeId: parsed.youtubeId })
      continue
    }
    const entry = asRecord(item)
    if (!entry) continue
    const youtubeId = videoIdFromEntry(entry)
    if (!youtubeId || seen.has(youtubeId)) continue
    seen.add(youtubeId)
    const title = typeof entry.title === 'string' ? entry.title.trim() : ''
    out.push({
      id: typeof entry.id === 'string' && entry.id.trim() && !isYouTubeId(entry.id) ? entry.id.trim() : youtubeId,
      youtubeId,
      ...(title ? { title } : {}),
    })
  }

  return out
}

export function serializeFolderMusicVideos(videos: FolderMusicVideo[]): FolderMusicVideo[] {
  const out: FolderMusicVideo[] = []
  const seen = new Set<string>()
  for (const video of videos) {
    if (out.length >= FOLDER_MUSIC_VIDEOS_MAX) break
    const youtubeId = String(video?.youtubeId || '').trim()
    if (!isYouTubeId(youtubeId) || seen.has(youtubeId)) continue
    seen.add(youtubeId)
    const title = typeof video.title === 'string' ? video.title.trim() : ''
    out.push({
      id: String(video.id || youtubeId).trim() || youtubeId,
      youtubeId,
      ...(title ? { title } : {}),
    })
  }
  return out
}

export function folderMusicVideosMetadataPatch(videos: FolderMusicVideo[]): Record<string, unknown> {
  return { [FOLDER_MUSIC_VIDEOS_META_KEY]: serializeFolderMusicVideos(videos) }
}
