import { isMp4Blob } from '@/lib/shares/ensure-mp4'
import { releaseCampaignSlug, type ShareUtmPlatform } from '@/lib/shares/share-utm'

/** Destinations that take a timed listen link. Video apps get a file handoff, not a download. */
export type ClipLinkPlatform = 'copy' | 'x' | 'facebook' | 'whatsapp'
export type ClipVideoPlatform = 'instagram' | 'tiktok' | 'youtube'
export type ClipPlatformId = ClipLinkPlatform | ClipVideoPlatform

export type ClipPlatformTarget = {
  id: ClipPlatformId
  label: string
  /** `redirect` opens the platform composer. `video` hands the clip to that app. */
  kind: 'redirect' | 'video'
}

export type ClipCue = {
  startSec: number
  trackId: string | null
}

const LINK_UTM: Record<ClipPlatformId, ShareUtmPlatform | 'clip'> = {
  copy: 'clip',
  x: 'x',
  facebook: 'facebook',
  whatsapp: 'whatsapp',
  instagram: 'instagram',
  tiktok: 'tiktok',
  youtube: 'youtube',
}

/** SoundCloud-style row: one tap opens that network. */
export const CLIP_SHARE_TARGETS: ClipPlatformTarget[] = [
  { id: 'instagram', label: 'Instagram', kind: 'video' },
  { id: 'tiktok', label: 'TikTok', kind: 'video' },
  { id: 'youtube', label: 'YouTube', kind: 'video' },
  { id: 'facebook', label: 'Facebook', kind: 'redirect' },
  { id: 'x', label: 'X', kind: 'redirect' },
  { id: 'whatsapp', label: 'WhatsApp', kind: 'redirect' },
  { id: 'copy', label: 'Copy', kind: 'redirect' },
]

export function formatShareClock(sec: number): string {
  const safe = Math.max(0, Math.floor(Number(sec) || 0))
  const m = Math.floor(safe / 60)
  const s = safe % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

/** `?t=` seconds and optional track id, so a shared link opens on the moment. */
export function parseClipCue(search: string): ClipCue | null {
  const raw = search.startsWith('?') ? search.slice(1) : search
  const params = new URLSearchParams(raw)
  const t = Number(params.get('t'))
  if (!Number.isFinite(t) || t <= 0) return null
  const trackId = params.get('track')?.trim() || null
  return { startSec: t, trackId }
}

export function timedListenUrl(
  listenUrl: string,
  opts: {
    startSec: number
    trackId?: string | null
    platform?: ClipPlatformId
    campaign?: string | null
    base?: string
  },
): string {
  const url = new URL(listenUrl, opts.base || 'https://sergikdropz.com')
  const start = Math.max(0, Math.floor(Number(opts.startSec) || 0))
  if (start > 0) url.searchParams.set('t', String(start))
  else url.searchParams.delete('t')
  const trackId = opts.trackId?.trim()
  if (trackId) url.searchParams.set('track', trackId)
  if (opts.platform) {
    url.searchParams.set('utm_source', LINK_UTM[opts.platform])
    url.searchParams.set('utm_medium', 'social')
    url.searchParams.set('utm_campaign', releaseCampaignSlug(opts.campaign || 'release'))
  }
  return url.toString()
}

export function clipShareCaption(opts: {
  title: string
  artist?: string | null
  url: string
  startSec: number
}): string {
  const who = [opts.title.trim(), opts.artist?.trim()].filter(Boolean).join(' — ')
  return `${who}\nListen from ${formatShareClock(opts.startSec)}\n${opts.url}`
}

export function socialIntentUrl(
  platform: Exclude<ClipLinkPlatform, 'copy'>,
  opts: { text: string; url: string },
): string {
  if (platform === 'x') {
    return `https://twitter.com/intent/tweet?text=${encodeURIComponent(opts.text)}`
  }
  if (platform === 'whatsapp') {
    return `https://wa.me/?text=${encodeURIComponent(opts.text)}`
  }
  return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(opts.url)}&quote=${encodeURIComponent(opts.text)}`
}

/**
 * Bare upload pages. Instagram Stories has no web URL that accepts a video,
 * so callers must hand the file off instead of opening instagram.com.
 */
export function videoAppUrl(platform: ClipVideoPlatform): string {
  if (platform === 'tiktok') return 'https://www.tiktok.com/upload'
  if (platform === 'youtube') return 'https://www.youtube.com/upload'
  return 'https://www.instagram.com/'
}

/** Fields that ride along with a shared video file. */
export function clipFileShareFields(opts: {
  filesOnly?: boolean
  title: string
  text?: string
}): { title?: string; text?: string } {
  // A link in the payload makes Instagram open the feed/composer and drop the story video.
  if (opts.filesOnly) return {}
  const fields: { title?: string; text?: string } = {}
  if (opts.title) fields.title = opts.title
  if (opts.text) fields.text = opts.text
  return fields
}

export type ReadyClipFile = {
  platform: ClipVideoPlatform
  blob: Blob
  filename: string
  title: string
  text: string
  moment: string
  mode: 'sheet' | 'save'
}

export function clipReadySharePrompt(
  platform: ClipVideoPlatform,
  mode: ReadyClipFile['mode'],
): { actionLabel: string; hint: string } {
  const label = platform === 'tiktok' ? 'TikTok' : platform === 'youtube' ? 'YouTube' : 'Instagram'
  if (mode === 'save') {
    const where = platform === 'instagram' ? 'Instagram Stories' : label
    return {
      actionLabel: 'Save story clip',
      hint: `The clip is ready. Save the MP4, then add it in ${where}. The listen link is copied for a sticker.`,
    }
  }
  if (platform === 'instagram') {
    return {
      actionLabel: 'Add to Instagram Story',
      hint: 'The clip is ready. This sends the video to your Instagram Story.',
    }
  }
  return {
    actionLabel: `Share to ${label}`,
    hint: `The clip is ready. This sends the video to ${label}.`,
  }
}

export function clipHandoffSuccessMessage(platform: ClipVideoPlatform, how: 'shared' | 'saved'): string {
  if (how === 'saved') {
    const where = platform === 'instagram' ? 'Instagram Stories' : platform === 'tiktok' ? 'TikTok' : 'YouTube'
    return `Story clip saved. Add it in ${where}. The listen link is copied for a sticker.`
  }
  if (platform === 'instagram') {
    return 'Instagram Story opened with the clip. Nothing was saved to this device.'
  }
  const label = platform === 'tiktok' ? 'TikTok' : 'YouTube'
  return `${label} opened with the clip. Nothing was saved to this device.`
}

function canHandoffClipFile(blob: Blob, filename: string): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function' || typeof File === 'undefined') {
    return false
  }
  try {
    const file = new File([blob], filename, { type: blob.type || 'video/mp4' })
    if (typeof navigator.canShare !== 'function') return true
    return navigator.canShare({ files: [file] })
  } catch {
    return false
  }
}

/**
 * Stage a rendered clip for a second tap. Sharing after the 15s render loses
 * the click gesture, and opening instagram.com lands on the feed without the video.
 */
export function prepareClipHandoff(opts: {
  platform: ClipVideoPlatform
  blob: Blob
  filename: string
  title: string
  text: string
  moment: string
  mimeType?: string
}): { ok: true; clip: ReadyClipFile } | { ok: false; reason: string } {
  if (opts.platform === 'instagram' && !isMp4Blob(opts.blob, opts.mimeType)) {
    return {
      ok: false,
      reason: 'Instagram Stories needs an MP4, and this clip did not convert. Nothing was sent.',
    }
  }
  return {
    ok: true,
    clip: {
      platform: opts.platform,
      blob: opts.blob,
      filename: opts.filename,
      title: opts.title,
      text: opts.text,
      moment: opts.moment,
      mode: canHandoffClipFile(opts.blob, opts.filename) ? 'sheet' : 'save',
    },
  }
}
