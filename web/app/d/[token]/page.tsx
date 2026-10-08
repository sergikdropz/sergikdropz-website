import type { Metadata } from 'next'
import { headers } from 'next/headers'
import ShareDownloadClient from '@/components/shares/ShareDownloadClient'
import { parseDownloadSelection } from '@/lib/shares/share-download'
import { resolveShareByToken } from '@/lib/shares/share-service'
import {
  absoluteShareOgImageUrl,
  pickShareArtwork,
  resolvePublicOrigin,
} from '@/lib/shares/types'

type DownloadQuery = { format?: string; scope?: string; track?: string }

type Props = {
  params: Promise<{ token: string }>
  searchParams: Promise<DownloadQuery>
}

const PRIVATE_ROBOTS = { index: false, follow: false }

function ogImageType(url: string): string | undefined {
  const path = url.split('?')[0]?.toLowerCase() || ''
  if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return 'image/jpeg'
  if (path.endsWith('.png')) return 'image/png'
  if (path.endsWith('.webp')) return 'image/webp'
  return undefined
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { token: raw } = await params
  const query = await searchParams
  const token = decodeURIComponent(raw || '').trim()
  const fallback: Metadata = { title: 'Private download — SERGIK', robots: PRIVATE_ROBOTS }
  if (!token) return fallback

  try {
    const origin = resolvePublicOrigin(await headers())
    const payload = await resolveShareByToken(token, {
      includePlaybackUrls: false,
      origin,
    })
    if (!payload) return fallback

    const parsed = parseDownloadSelection(
      { format: query.format, scope: query.scope, trackId: query.track },
      payload.tracks.map((track) => track.id),
    )
    const selection = parsed.ok ? parsed.selection : null
    const trackIndex =
      selection?.scope === 'track'
        ? Math.max(
            0,
            payload.tracks.findIndex((track) => track.id === selection.trackId),
          )
        : 0
    const tracks =
      selection?.scope === 'track'
        ? payload.tracks.filter((track) => track.id === selection.trackId)
        : payload.tracks
    const titleName =
      selection?.scope === 'track' ? tracks[0]?.title || payload.share.title : payload.share.title
    const artist = tracks[0]?.artist || payload.collection?.artist || 'SERGIK'
    const title = `Private download — ${titleName}`
    const formatLabel = selection ? selection.format.toUpperCase() : ''
    const scopeLabel =
      selection?.scope === 'release' ? 'Whole EP' : selection?.scope === 'track' ? 'Single track' : ''
    const description = [artist, formatLabel, scopeLabel].filter(Boolean).join(' · ')
    const pageParams = new URLSearchParams()
    if (query.format) pageParams.set('format', query.format)
    if (query.scope) pageParams.set('scope', query.scope)
    if (query.track) pageParams.set('track', query.track)
    const qs = pageParams.toString()
    const url = `${origin}/d/${encodeURIComponent(token)}${qs ? `?${qs}` : ''}`
    // Direct cover — messengers often skip a page when the only image is the site-wide brand card.
    const cover = absoluteShareOgImageUrl(pickShareArtwork(payload, trackIndex), origin)
    const coverType = cover ? ogImageType(cover) : undefined

    return {
      metadataBase: new URL(origin),
      title,
      description,
      robots: PRIVATE_ROBOTS,
      openGraph: {
        title,
        description,
        url,
        siteName: 'SERGIK',
        type: 'website',
        images: cover
          ? [
              {
                url: cover,
                alt: title,
                ...(coverType ? { type: coverType } : {}),
              },
            ]
          : undefined,
      },
      twitter: {
        card: 'summary_large_image',
        title,
        description,
        images: cover ? [cover] : undefined,
      },
    }
  } catch {
    return fallback
  }
}

export default async function ShareDownloadPage({ params, searchParams }: Props) {
  const { token: raw } = await params
  const query = await searchParams
  const token = decodeURIComponent(raw || '').trim()
  const parsed = parseDownloadSelection({
    format: query.format,
    scope: query.scope,
    trackId: query.track,
  })
  if (!token || !parsed.ok) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black px-6 text-center text-sm text-zinc-300">
        This download link is incomplete.
      </main>
    )
  }

  return (
    <ShareDownloadClient
      token={token}
      format={parsed.selection.format}
      scope={parsed.selection.scope}
      trackId={parsed.selection.trackId}
    />
  )
}
