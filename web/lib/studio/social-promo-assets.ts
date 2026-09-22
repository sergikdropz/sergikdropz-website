/**
 * Browser-only IG / Meta / Spotify preview assets for Release Studio marketing.
 * Still cards, spinning-vinyl story/reel videos, Spotify Canvas drift, ZIP kit.
 */

import { zipSync, strToU8 } from 'fflate'
import {
  proxiedArtworkUrl,
  renderStorySnippet,
  STORY_SNIPPET_DURATION_SEC,
  type StorySnippetLayout,
} from '@/lib/shares/story-snippet'
import type { SocialPromoAssetKind, SocialPromoPlan, SocialPromoPost } from '@/lib/studio/social-promo'
import { formatPromoSlotLocal, socialPromoChannelLabel } from '@/lib/studio/social-promo'
import { renderSpotifyCanvas } from '@/lib/studio/spotify-canvas'

function clean(value: unknown): string {
  return value == null ? '' : String(value).trim()
}

export function sanitizeSocialFilename(value: string, maxLen = 48): string {
  return (
    clean(value)
      .replace(/[^\w\-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, maxLen)
      .replace(/^-|-$/g, '') || 'release'
  )
}

/** Folder layout inside the downloadable social kit ZIP. */
export function socialPromoKitPaths(slug: string) {
  const root = `${slug}-social-kit`
  return {
    root,
    readme: `${root}/README.txt`,
    feedPng: `${root}/01-feed/ig-feed-1080.png`,
    storyStillPng: `${root}/02-stories/story-still-1080x1920.png`,
    vinylStory: (ext: string) => `${root}/02-stories/vinyl-story-15s.${ext}`,
    vinylReel: (ext: string) => `${root}/03-reels/vinyl-reel-15s.${ext}`,
    captions: `${root}/04-captions/schedule.txt`,
    spotifyCanvas: (ext: string) => `${root}/05-spotify-canvas/canvas-drift-8s.${ext}`,
    zipName: `${root}.zip`,
  } as const
}

export type SocialKitProgress = {
  phase: string
  ratio: number
}

async function loadImage(url: string): Promise<HTMLImageElement | null> {
  if (!url || typeof Image === 'undefined') return null
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = url
  })
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

async function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('PNG encode failed'))),
      'image/png'
    )
  })
}

async function blobToUint8(blob: Blob): Promise<Uint8Array> {
  const buf = await blob.arrayBuffer()
  return new Uint8Array(buf)
}

function videoExtFromMime(mimeType: string): string {
  return mimeType.includes('mp4') ? 'mp4' : 'webm'
}

function resolveArtworkSrc(artworkUrl?: string | null): string {
  const raw = clean(artworkUrl)
  if (!raw) return ''
  return proxiedArtworkUrl(raw)
}

function drawCoverCard(opts: {
  width: number
  height: number
  artwork: HTMLImageElement | null
  title: string
  artist: string
  badge: string
  cta: string
}): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = opts.width
  canvas.height = opts.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas unavailable')

  const grad = ctx.createLinearGradient(0, 0, opts.width, opts.height)
  grad.addColorStop(0, '#0a0a0b')
  grad.addColorStop(0.55, '#1a1028')
  grad.addColorStop(1, '#0f172a')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, opts.width, opts.height)

  const isStory = opts.height > opts.width
  const artSize = isStory ? Math.min(opts.width * 0.78, 820) : opts.width * 0.72
  const artX = (opts.width - artSize) / 2
  const artY = isStory ? opts.height * 0.18 : opts.height * 0.1

  if (opts.artwork) {
    ctx.save()
    const radius = 28
    ctx.beginPath()
    ctx.moveTo(artX + radius, artY)
    ctx.arcTo(artX + artSize, artY, artX + artSize, artY + artSize, radius)
    ctx.arcTo(artX + artSize, artY + artSize, artX, artY + artSize, radius)
    ctx.arcTo(artX, artY + artSize, artX, artY, radius)
    ctx.arcTo(artX, artY, artX + artSize, artY, radius)
    ctx.closePath()
    ctx.clip()
    ctx.drawImage(opts.artwork, artX, artY, artSize, artSize)
    ctx.restore()
  } else {
    ctx.fillStyle = '#27272a'
    ctx.fillRect(artX, artY, artSize, artSize)
  }

  ctx.fillStyle = 'rgba(167, 139, 250, 0.95)'
  ctx.font = '600 36px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(opts.badge.toUpperCase(), opts.width / 2, artY + artSize + (isStory ? 72 : 56))

  ctx.fillStyle = '#fafafa'
  ctx.font = `700 ${isStory ? 64 : 52}px system-ui, sans-serif`
  const title = opts.title.length > 42 ? `${opts.title.slice(0, 40)}…` : opts.title
  ctx.fillText(title, opts.width / 2, artY + artSize + (isStory ? 150 : 120))

  ctx.fillStyle = '#a1a1aa'
  ctx.font = `500 ${isStory ? 40 : 34}px system-ui, sans-serif`
  ctx.fillText(opts.artist, opts.width / 2, artY + artSize + (isStory ? 210 : 170))

  ctx.fillStyle = '#c4b5fd'
  ctx.font = `600 ${isStory ? 34 : 28}px system-ui, sans-serif`
  ctx.fillText(opts.cta, opts.width / 2, isStory ? opts.height - 160 : opts.height - 70)

  ctx.fillStyle = '#71717a'
  ctx.font = '500 24px system-ui, sans-serif'
  ctx.fillText('SERGIK', opts.width / 2, isStory ? opts.height - 100 : opts.height - 36)

  return canvas
}

export async function buildSocialFeedSquareBlob(input: {
  artworkUrl?: string | null
  title: string
  artist?: string | null
  badge?: string
  cta?: string
}): Promise<{ blob: Blob; filename: string }> {
  const artwork = await loadImage(resolveArtworkSrc(input.artworkUrl))
  const canvas = drawCoverCard({
    width: 1080,
    height: 1080,
    artwork,
    title: clean(input.title) || 'New release',
    artist: clean(input.artist) || 'SERGIK',
    badge: clean(input.badge) || 'Out now',
    cta: clean(input.cta) || 'Link in bio',
  })
  const blob = await canvasToPngBlob(canvas)
  return { blob, filename: `${sanitizeSocialFilename(input.title)}-ig-feed-1080.png` }
}

export async function buildSocialStoryStillBlob(input: {
  artworkUrl?: string | null
  title: string
  artist?: string | null
  badge?: string
  cta?: string
}): Promise<{ blob: Blob; filename: string }> {
  const artwork = await loadImage(resolveArtworkSrc(input.artworkUrl))
  const canvas = drawCoverCard({
    width: 1080,
    height: 1920,
    artwork,
    title: clean(input.title) || 'New release',
    artist: clean(input.artist) || 'SERGIK',
    badge: clean(input.badge) || 'New music',
    cta: clean(input.cta) || 'Swipe up · listen',
  })
  const blob = await canvasToPngBlob(canvas)
  return { blob, filename: `${sanitizeSocialFilename(input.title)}-ig-story-1080x1920.png` }
}

export async function buildSocialStoryVideoBlob(input: {
  artworkUrl?: string | null
  title: string
  artist?: string | null
  audioUrl: string
  startSec?: number
  layout?: StorySnippetLayout
  cta?: string
  onProgress?: (phase: string, ratio?: number) => void
}): Promise<{ blob: Blob; filename: string; mimeType: string }> {
  const snippet = await renderStorySnippet({
    artworkUrl: input.artworkUrl,
    title: clean(input.title) || 'New release',
    artist: clean(input.artist) || 'SERGIK',
    audioUrl: input.audioUrl,
    durationSec: STORY_SNIPPET_DURATION_SEC,
    startSec: input.startSec ?? 0,
    layout: input.layout === 'cover' ? 'cover' : 'vinyl',
    cta: clean(input.cta) || 'Listen · link sticker',
    onProgress: input.onProgress,
  })
  return { blob: snippet.blob, filename: snippet.filename, mimeType: snippet.mimeType }
}

export async function downloadSocialFeedSquare(input: {
  artworkUrl?: string | null
  title: string
  artist?: string | null
  badge?: string
  cta?: string
}): Promise<{ filename: string }> {
  const { blob, filename } = await buildSocialFeedSquareBlob(input)
  downloadBlob(blob, filename)
  return { filename }
}

export async function downloadSocialStoryStill(input: {
  artworkUrl?: string | null
  title: string
  artist?: string | null
  badge?: string
  cta?: string
}): Promise<{ filename: string }> {
  const { blob, filename } = await buildSocialStoryStillBlob(input)
  downloadBlob(blob, filename)
  return { filename }
}

export async function downloadSocialStoryVideo(input: {
  artworkUrl?: string | null
  title: string
  artist?: string | null
  audioUrl: string
  startSec?: number
  layout?: StorySnippetLayout
  cta?: string
  onProgress?: (phase: string, ratio?: number) => void
}): Promise<{ filename: string; mimeType: string }> {
  const result = await buildSocialStoryVideoBlob(input)
  downloadBlob(result.blob, result.filename)
  return { filename: result.filename, mimeType: result.mimeType }
}

export function buildSocialCaptionsScheduleText(input: {
  title: string
  artist?: string | null
  streetDate?: string | null
  plan?: SocialPromoPlan | null
}): string {
  const title = clean(input.title) || 'Release'
  const artist = clean(input.artist) || 'SERGIK'
  const lines: string[] = [
    `SERGIK social captions — ${artist} · ${title}`,
    input.streetDate ? `Street date: ${clean(input.streetDate)}` : 'Street date: TBD',
    input.plan?.timezone ? `Timezone: ${input.plan.timezone}` : 'Timezone: America/Los_Angeles',
    '',
    'Copy each caption into Meta Business Suite / Instagram when posting.',
    'Mark the matching slot Posted in Studio after upload.',
    '',
  ]

  const posts = input.plan?.posts || []
  if (!posts.length) {
    lines.push('(No schedule generated yet — Generate schedule in Studio, then re-download the kit.)')
    return lines.join('\n')
  }

  posts.forEach((post, index) => {
    const when = formatPromoSlotLocal(post.scheduled_at, input.plan?.timezone)
    lines.push('─'.repeat(48))
    lines.push(`${index + 1}. ${post.label}`)
    lines.push(`When: ${when} · T${post.day_offset >= 0 ? '+' : ''}${post.day_offset} · ${post.local_time} PT`)
    lines.push(`Channel: ${socialPromoChannelLabel(post.channel)}`)
    lines.push(`Asset: ${post.asset}`)
    lines.push(`Status: ${post.status}`)
    if (post.hint) lines.push(`Hint: ${post.hint}`)
    lines.push('')
    lines.push(post.caption || '(no caption)')
    lines.push('')
  })

  return lines.join('\n')
}

function buildSocialKitReadme(input: {
  title: string
  artist?: string | null
  hasVinyl: boolean
  hasSpotifyCanvas: boolean
}): string {
  const title = clean(input.title) || 'Release'
  const artist = clean(input.artist) || 'SERGIK'
  return [
    `SERGIK social asset kit — ${artist} · ${title}`,
    '',
    'Folders',
    '  01-feed/            → 1080×1080 IG / FB feed square',
    '  02-stories/         → 1080×1920 still + 15s spinning-vinyl story video',
    '  03-reels/           → same vinyl trailer sized for IG Reels upload',
    '  04-captions/        → timed captions matching Studio schedule',
    '  05-spotify-canvas/  → 8s silent cover drift (pan/zoom) for Spotify Canvas',
    '',
    'Ops',
    '  1. Upload stills/videos in Meta Business Suite or IG app.',
    '  2. Paste captions from 04-captions/schedule.txt.',
    '  3. Add link stickers on Stories / bio link on Feed+Reels.',
    '  4. Upload 05-spotify-canvas to Spotify for Artists (per track).',
    '  5. Mark each slot Posted in Studio Social promo.',
    '',
    input.hasVinyl
      ? 'Vinyl videos are 15s @ 1080×1920 (WebM or MP4). Convert to MP4 in CapCut if Meta rejects WebM.'
      : 'No Catalog WAV — vinyl story/reel videos were skipped. Add audio and re-download the kit.',
    input.hasSpotifyCanvas
      ? 'Spotify Canvas is 8s @ 720×1280, silent, rebound Ken Burns loop (same drift as site covers). Convert to H.264 MP4 if Spotify rejects WebM.'
      : 'No cover art — Spotify Canvas was skipped.',
    '',
  ].join('\n')
}

export type BuildSocialPromoAssetZipInput = {
  title: string
  artist?: string | null
  artworkUrl?: string | null
  streetDate?: string | null
  plan?: SocialPromoPlan | null
  /** Preview WAV for spinning-vinyl story + reel. */
  audioUrl?: string | null
  audioTitle?: string | null
  startSec?: number
  onProgress?: (progress: SocialKitProgress) => void
}

export type BuildSocialPromoAssetZipResult = {
  blob: Blob
  filename: string
  paths: string[]
  hasVinyl: boolean
  hasSpotifyCanvas: boolean
  /** Post IDs that use downloadable visual assets (mark ready after kit download). */
  readyPostIds: string[]
}

export async function buildSpotifyCanvasBlob(input: {
  artworkUrl?: string | null
  title: string
  onProgress?: (phase: string, ratio?: number) => void
}): Promise<{ blob: Blob; filename: string; mimeType: string }> {
  const result = await renderSpotifyCanvas({
    artworkUrl: input.artworkUrl,
    title: clean(input.title) || 'New release',
    onProgress: input.onProgress,
  })
  return { blob: result.blob, filename: result.filename, mimeType: result.mimeType }
}

export async function downloadSpotifyCanvas(input: {
  artworkUrl?: string | null
  title: string
  onProgress?: (phase: string, ratio?: number) => void
}): Promise<{ filename: string; mimeType: string }> {
  const result = await buildSpotifyCanvasBlob(input)
  downloadBlob(result.blob, result.filename)
  return { filename: result.filename, mimeType: result.mimeType }
}

export async function buildSocialPromoAssetZip(
  input: BuildSocialPromoAssetZipInput
): Promise<BuildSocialPromoAssetZipResult> {
  const slug = sanitizeSocialFilename(input.title)
  const paths = socialPromoKitPaths(slug)
  const files: Record<string, Uint8Array> = {}
  const listed: string[] = []
  const report = (phase: string, ratio: number) => {
    input.onProgress?.({ phase, ratio: Math.max(0, Math.min(1, ratio)) })
  }

  report('Building feed square…', 0.05)
  const feed = await buildSocialFeedSquareBlob({
    artworkUrl: input.artworkUrl,
    title: input.title,
    artist: input.artist,
    badge: input.streetDate ? 'New release' : 'Coming soon',
    cta: 'Listen · link in bio',
  })
  files[paths.feedPng] = await blobToUint8(feed.blob)
  listed.push(paths.feedPng)

  report('Building story still…', 0.2)
  const still = await buildSocialStoryStillBlob({
    artworkUrl: input.artworkUrl,
    title: input.title,
    artist: input.artist,
    badge: input.streetDate ? 'Out now' : 'Coming soon',
    cta: 'Add link sticker',
  })
  files[paths.storyStillPng] = await blobToUint8(still.blob)
  listed.push(paths.storyStillPng)

  let hasVinyl = false
  const audioUrl = clean(input.audioUrl)
  if (audioUrl) {
    report('Rendering spinning vinyl…', 0.28)
    const vinyl = await buildSocialStoryVideoBlob({
      artworkUrl: input.artworkUrl,
      title: clean(input.audioTitle) || clean(input.title) || 'New release',
      artist: input.artist,
      audioUrl,
      startSec: input.startSec ?? 0,
      layout: 'vinyl',
      cta: 'Listen · link sticker',
      onProgress: (phase, ratio) => {
        const r = typeof ratio === 'number' ? ratio : 0
        report(phase || 'Rendering vinyl…', 0.28 + r * 0.32)
      },
    })
    const ext = videoExtFromMime(vinyl.mimeType)
    const bytes = await blobToUint8(vinyl.blob)
    const storyPath = paths.vinylStory(ext)
    const reelPath = paths.vinylReel(ext)
    files[storyPath] = bytes
    files[reelPath] = bytes
    listed.push(storyPath, reelPath)
    hasVinyl = true
  }

  let hasSpotifyCanvas = false
  if (clean(input.artworkUrl)) {
    report('Rendering Spotify Canvas…', 0.62)
    try {
      const canvas = await buildSpotifyCanvasBlob({
        artworkUrl: input.artworkUrl,
        title: input.title,
        onProgress: (phase, ratio) => {
          const r = typeof ratio === 'number' ? ratio : 0
          report(phase || 'Spotify Canvas…', 0.62 + r * 0.22)
        },
      })
      const ext = videoExtFromMime(canvas.mimeType)
      const canvasPath = paths.spotifyCanvas(ext)
      files[canvasPath] = await blobToUint8(canvas.blob)
      listed.push(canvasPath)
      hasSpotifyCanvas = true
    } catch {
      // Still ship the kit without Canvas if recording fails (e.g. no MediaRecorder).
      report('Spotify Canvas skipped', 0.84)
    }
  }

  report('Packing captions…', 0.88)
  const captions = buildSocialCaptionsScheduleText({
    title: input.title,
    artist: input.artist,
    streetDate: input.streetDate,
    plan: input.plan,
  })
  files[paths.captions] = strToU8(captions)
  listed.push(paths.captions)

  files[paths.readme] = strToU8(
    buildSocialKitReadme({
      title: input.title,
      artist: input.artist,
      hasVinyl,
      hasSpotifyCanvas,
    })
  )
  listed.push(paths.readme)

  report('Zipping…', 0.95)
  const zipped = zipSync(files, { level: 6 })
  const blob = new Blob([zipped], { type: 'application/zip' })

  const posts = input.plan?.posts || []
  const readyPostIds = posts
    .filter((p) => p.asset === 'feed_square' || p.asset === 'story_static' || (p.asset === 'story_video' && hasVinyl))
    .map((p) => p.id)

  report('Done', 1)
  return {
    blob,
    filename: paths.zipName,
    paths: listed,
    hasVinyl,
    hasSpotifyCanvas,
    readyPostIds,
  }
}

export async function downloadSocialPromoAssetZip(
  input: BuildSocialPromoAssetZipInput
): Promise<BuildSocialPromoAssetZipResult> {
  const result = await buildSocialPromoAssetZip(input)
  downloadBlob(result.blob, result.filename)
  return result
}

export function assetDownloadKind(
  asset: SocialPromoAssetKind
): 'feed' | 'story_still' | 'story_video' | null {
  if (asset === 'feed_square') return 'feed'
  if (asset === 'story_static') return 'story_still'
  if (asset === 'story_video') return 'story_video'
  return null
}

export function badgeForPost(post: Pick<SocialPromoPost, 'day_offset'>): string {
  if (post.day_offset < 0) return `${Math.abs(post.day_offset)}d out`
  if (post.day_offset === 0) return 'Out now'
  return 'Now playing'
}
