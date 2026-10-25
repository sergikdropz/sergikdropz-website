import videosData from '@/data/videos.json'
import { loadMetaPublishCredentials } from '@/lib/meta/connection'
import { instagramShortcode, type TrackMedia } from '@/lib/studio/royalties/ledger-groups'
import { isYouTubeId } from '@/lib/videos/youtube'

const DESCRIPTION_CAP = 4000

type VideoSnippet = { id: string; title: string; description: string }

export type LedgerMediaResult = {
  media: TrackMedia[]
  note: string | null
}

function catalogVideos(): VideoSnippet[] {
  return (videosData.videos || [])
    .filter((video) => isYouTubeId(video.youtube_id || ''))
    .map((video) => ({
      id: video.youtube_id,
      title: video.title || '',
      description: video.description || '',
    }))
}

async function youtubeGet(path: string, apiKey: string): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetch(`https://www.googleapis.com/youtube/v3/${path}&key=${apiKey}`)
    if (!response.ok) return null
    return (await response.json()) as Record<string, unknown>
  } catch {
    return null
  }
}

async function channelUploads(apiKey: string): Promise<VideoSnippet[]> {
  const channel = await youtubeGet('channels?part=contentDetails&forHandle=sergikdropz', apiKey)
  const items = Array.isArray(channel?.items) ? channel.items : []
  const uploads = (items[0] as { contentDetails?: { relatedPlaylists?: { uploads?: string } } } | undefined)
    ?.contentDetails?.relatedPlaylists?.uploads
  if (!uploads) return []
  const videos: VideoSnippet[] = []
  let page: string | null = null
  for (let i = 0; i < 8; i += 1) {
    const token = page ? `&pageToken=${encodeURIComponent(page)}` : ''
    const data = await youtubeGet(
      `playlistItems?part=snippet&playlistId=${encodeURIComponent(uploads)}&maxResults=50${token}`,
      apiKey,
    )
    const rows = Array.isArray(data?.items) ? data.items : []
    for (const item of rows) {
      const snippet = (item as { snippet?: Record<string, unknown> }).snippet || {}
      const resource = snippet.resourceId as { videoId?: string } | undefined
      const id = resource?.videoId || ''
      if (!isYouTubeId(id)) continue
      videos.push({
        id,
        title: typeof snippet.title === 'string' ? snippet.title : '',
        description: typeof snippet.description === 'string' ? snippet.description.slice(0, DESCRIPTION_CAP) : '',
      })
    }
    page = typeof data?.nextPageToken === 'string' ? data.nextPageToken : null
    if (!page) break
  }
  return videos
}

async function describedVideos(ids: string[], apiKey: string): Promise<VideoSnippet[]> {
  const videos: VideoSnippet[] = []
  for (let index = 0; index < ids.length; index += 50) {
    const batch = ids.slice(index, index + 50)
    const data = await youtubeGet(`videos?part=snippet&id=${batch.join(',')}`, apiKey)
    const rows = Array.isArray(data?.items) ? data.items : []
    for (const item of rows) {
      const row = item as { id?: string; snippet?: { title?: string; description?: string } }
      if (!row.id || !isYouTubeId(row.id)) continue
      videos.push({
        id: row.id,
        title: row.snippet?.title || '',
        description: (row.snippet?.description || '').slice(0, DESCRIPTION_CAP),
      })
    }
  }
  return videos
}

function youtubeMedia(videos: VideoSnippet[]): TrackMedia[] {
  const byId = new Map<string, TrackMedia>()
  for (const video of videos) {
    const current = byId.get(video.id)
    const text = `${video.title} ${video.description}`.trim()
    if (current && (current.text || '').length >= text.length) continue
    byId.set(video.id, { title: video.title, text, youtubeId: video.id })
  }
  return Array.from(byId.values())
}

async function instagramMedia(): Promise<{ media: TrackMedia[]; note: string | null }> {
  const credentials = await loadMetaPublishCredentials()
  if (!credentials?.igUserId || !credentials.pageAccessToken) {
    return { media: [], note: 'Instagram is connected without a Page token, so post captions could not be matched.' }
  }
  const media: TrackMedia[] = []
  let next: string | null =
    `https://graph.facebook.com/v21.0/${credentials.igUserId}/media?fields=permalink,caption&limit=50&access_token=${encodeURIComponent(credentials.pageAccessToken)}`
  for (let page = 0; page < 6 && next; page += 1) {
    try {
      const response = await fetch(next)
      const body = (await response.json()) as {
        data?: { permalink?: string; caption?: string }[]
        paging?: { next?: string }
        error?: { message?: string }
      }
      if (!response.ok) {
        return {
          media,
          note: 'Instagram captions could not be read. Reconnect Meta on the royalties desk, then reload the ledger.',
        }
      }
      for (const item of body.data || []) {
        const id = instagramShortcode(item.permalink)
        if (!id) continue
        const caption = item.caption || ''
        media.push({ title: caption, text: caption, instagramId: id })
      }
      next = body.paging?.next || null
    } catch {
      return {
        media,
        note: 'Instagram captions could not be read. Reconnect Meta on the royalties desk, then reload the ledger.',
      }
    }
  }
  return { media, note: null }
}

/** YouTube uploads plus Instagram captions, for matching ledger tracks to videos and posts. */
export async function collectLedgerMedia(): Promise<LedgerMediaResult> {
  const apiKey = (process.env.YOUTUBE_API_KEY || '').trim()
  const videos = catalogVideos()
  if (apiKey) {
    const [uploads, described] = await Promise.all([
      channelUploads(apiKey),
      describedVideos(
        videos.map((video) => video.id),
        apiKey,
      ),
    ])
    videos.push(...uploads, ...described)
  }
  const instagram = await instagramMedia()
  return {
    media: [...youtubeMedia(videos), ...instagram.media],
    note: instagram.note,
  }
}
