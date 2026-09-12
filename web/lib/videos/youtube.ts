const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/

export function isYouTubeId(value: string): boolean {
  return YOUTUBE_ID_RE.test(value.trim())
}

/**
 * Accept a raw ID, watch URL, youtu.be short link, embed, or Shorts URL.
 */
export function parseYouTubeInput(input: string): { youtubeId: string } | { error: string } {
  const raw = input.trim()
  if (!raw) return { error: 'Paste a YouTube URL or 11-character video ID' }
  if (isYouTubeId(raw)) return { youtubeId: raw }

  try {
    const url = new URL(raw.startsWith('http') ? raw : `https://${raw}`)
    const host = url.hostname.replace(/^www\./, '').replace(/^m\./, '')

    if (host === 'youtu.be') {
      const id = url.pathname.split('/').filter(Boolean)[0] || ''
      return isYouTubeId(id) ? { youtubeId: id } : { error: 'Could not find a video ID in that link' }
    }

    if (host === 'youtube.com' || host === 'music.youtube.com' || host === 'youtube-nocookie.com') {
      const watchId = url.searchParams.get('v')
      if (watchId && isYouTubeId(watchId)) return { youtubeId: watchId }

      const parts = url.pathname.split('/').filter(Boolean)
      const prefixed = parts[0] === 'embed' || parts[0] === 'shorts' || parts[0] === 'live' || parts[0] === 'v'
      const pathId = prefixed ? parts[1] : ''
      if (pathId && isYouTubeId(pathId)) return { youtubeId: pathId }
    }
  } catch {
    return { error: 'Could not read that YouTube URL' }
  }

  return { error: 'Could not find a video ID in that link' }
}

export function youtubeWatchUrl(youtubeId: string): string {
  return `https://www.youtube.com/watch?v=${youtubeId}`
}

export function youtubeEmbedUrl(youtubeId: string, autoplay = false): string {
  const params = new URLSearchParams({ rel: '0', modestbranding: '1' })
  if (autoplay) params.set('autoplay', '1')
  return `https://www.youtube-nocookie.com/embed/${youtubeId}?${params.toString()}`
}

export function youtubeThumbnailUrls(youtubeId: string): string[] {
  return [
    `https://img.youtube.com/vi/${youtubeId}/maxresdefault.jpg`,
    `https://img.youtube.com/vi/${youtubeId}/sddefault.jpg`,
    `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`,
    `https://img.youtube.com/vi/${youtubeId}/mqdefault.jpg`,
  ]
}

export function slugifyVideoTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/sergik\s*[x×]\s*/gi, '')
    .replace(/^sergik\s*[-–—:]\s*/i, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return slug || 'video'
}

export function uniqueVideoSlug(title: string, existingIds: string[]): string {
  const base = slugifyVideoTitle(title)
  if (!existingIds.includes(base)) return base
  let n = 2
  while (existingIds.includes(`${base}-${n}`)) n += 1
  return `${base}-${n}`
}

export function guessVideoCategory(title: string, description = ''): string {
  const hay = `${title} ${description}`.toLowerCase()
  if (/\b(behind the scenes|bts|studio session)\b/.test(hay)) return 'behind-the-scenes'
  if (/\b(live|performance|festival|set)\b/.test(hay)) return 'live-performance'
  if (/\bvisualizer\b/.test(hay)) return 'visualizer'
  if (/\b(collab|collaboration)\b/.test(hay) || /\sx\s/.test(title)) return 'collaboration'
  return 'music-video'
}

export function videoCategoryLabel(category: string): string {
  return category
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}
