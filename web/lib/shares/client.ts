import { toSameOriginMediaUrl } from '@/utils/normalizeVaultAudioUrl'
import {
  DEFAULT_PUBLIC_SITE_ORIGIN,
  embedHtmlSnippet,
  isLocalDevOrigin,
  listenUrlForToken,
  type ResolvedSharePayload,
  type ShareKind,
  type ShareTrackPayload,
  type ShareVisibility,
} from '@/lib/shares/types'
import {
  renderStorySnippet,
  shareOrDownloadBlob,
  STORY_SNIPPET_DURATION_SEC,
  type StorySnippetResult,
} from '@/lib/shares/story-snippet'

function browserOrigin(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin.replace(/\/$/, '')
  }
  return ''
}

/**
 * Origin for copied share links.
 * Prefer the host the admin is actually on (so local OG/opengraph-image works),
 * then a non-local SITE_URL, then the public domain.
 */
export function shareClipboardOrigin(): string {
  const browser = browserOrigin()
  if (browser && !isLocalDevOrigin(browser)) return browser

  const env = String(process.env.NEXT_PUBLIC_SITE_URL || '')
    .trim()
    .replace(/\/$/, '')
  if (env && !isLocalDevOrigin(env)) return env

  // Local admin: keep localhost so /s/.../opengraph-image on this machine is used.
  // (Phones cannot preview localhost — deploy for real sends.)
  if (browser) return browser
  return DEFAULT_PUBLIC_SITE_ORIGIN
}

/** Rewrite share URLs onto the public origin (never keep a poisoned localhost SITE_URL). */
export function withBrowserOrigin(payload: ResolvedSharePayload): ResolvedSharePayload {
  const origin = shareClipboardOrigin()
  const token = payload.share.token
  return {
    ...payload,
    urls: {
      listen: listenUrlForToken(token, origin),
      embed: `${origin}/embed/${encodeURIComponent(token)}`,
      embedHtml: embedHtmlSnippet(token, origin),
    },
  }
}

export async function createMusicShare(opts: {
  kind: ShareKind
  targetId: string
  visibility?: ShareVisibility
}): Promise<ResolvedSharePayload> {
  const res = await fetch('/api/shares', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      kind: opts.kind,
      targetId: opts.targetId,
      visibility: opts.visibility,
    }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(json.error || 'Failed to create share link')
  }
  return withBrowserOrigin(json as ResolvedSharePayload)
}

export async function copyShareListenLink(opts: {
  kind: ShareKind
  targetId: string
  visibility?: ShareVisibility
}): Promise<ResolvedSharePayload> {
  const payload = await createMusicShare(opts)
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(payload.urls.listen)
  }
  return payload
}

export async function copyShareEmbedHtml(opts: {
  kind: ShareKind
  targetId: string
  visibility?: ShareVisibility
}): Promise<ResolvedSharePayload> {
  const payload = await createMusicShare(opts)
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(payload.urls.embedHtml)
  }
  return payload
}

function pickStoryTrack(
  payload: ResolvedSharePayload,
  trackId?: string | null,
): ShareTrackPayload {
  if (trackId) {
    const match = payload.tracks.find((t) => t.id === trackId)
    if (match) return match
  }
  const first = payload.tracks[0]
  if (!first) throw new Error('Nothing to share — no playable tracks found.')
  return first
}

/** Prefer same-origin media proxy so Web Audio + canvas stay CORS-clean. */
export function storyAudioUrlForTrack(track: ShareTrackPayload): string {
  const fromPlayback = track.playbackUrl ? toSameOriginMediaUrl(track.playbackUrl) : null
  if (fromPlayback) return fromPlayback
  const fromFile = track.file ? toSameOriginMediaUrl(track.file) : null
  if (fromFile) return fromFile
  if (track.playbackUrl) return track.playbackUrl
  if (track.file) return track.file
  throw new Error('Track has no playable audio file')
}

export type ExportShareStoryResult = {
  payload: ResolvedSharePayload
  track: ShareTrackPayload
  snippet: StorySnippetResult
  delivery: 'shared' | 'downloaded'
}

/**
 * Create/reuse a share link, render a 15s IG Story video, download/share it,
 * and copy the listen URL for an Instagram Link sticker.
 */
export async function exportShareStorySnippet(opts: {
  kind: ShareKind
  targetId: string
  trackId?: string | null
  visibility?: ShareVisibility
  durationSec?: number
  startSec?: number
  onProgress?: (phase: string, ratio?: number) => void
}): Promise<ExportShareStoryResult> {
  opts.onProgress?.('share', 0)
  const payload = await createMusicShare({
    kind: opts.kind,
    targetId: opts.targetId,
    visibility: opts.visibility,
  })
  const track = pickStoryTrack(payload, opts.trackId)
  const audioUrl = storyAudioUrlForTrack(track)
  const artworkUrl =
    track.artwork || payload.collection?.artwork || null

  const snippet = await renderStorySnippet({
    artworkUrl,
    title: track.title || payload.share.title,
    artist: track.artist || payload.collection?.artist || 'SERGIK',
    audioUrl,
    durationSec: opts.durationSec ?? STORY_SNIPPET_DURATION_SEC,
    startSec: opts.startSec ?? 0,
    onProgress: opts.onProgress,
  })

  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(payload.urls.listen)
    } catch {
      /* ignore */
    }
  }

  const delivery = await shareOrDownloadBlob({
    blob: snippet.blob,
    filename: snippet.filename,
    title: `${track.title} — SERGIK`,
    text: `Listen: ${payload.urls.listen}`,
  })

  return { payload, track, snippet, delivery }
}
