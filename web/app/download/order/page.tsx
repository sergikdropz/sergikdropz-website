import type { Metadata } from 'next'
import Link from 'next/link'
import OrderDownloadStage from '@/components/shop/OrderDownloadStage'
import { resolveShopOrderDownload, vaultDownloadFileName } from '@/lib/shop/order-download'
import { toSameOriginMediaUrl } from '@/utils/normalizeVaultAudioUrl'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Download — SERGIK',
  robots: { index: false, follow: false },
}

export default async function OrderDownloadPage({
  searchParams,
}: {
  searchParams: { session_id?: string }
}) {
  const sessionId = String(searchParams.session_id || '').trim()
  const result = await resolveShopOrderDownload(sessionId)
  if (!result.ok) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black px-4 text-center text-white">
        <div>
          <h1 className="text-2xl font-semibold">Download unavailable</h1>
          <p className="mt-2 text-zinc-400">{result.message}</p>
          <Link href="/shop" className="mt-6 inline-block text-sm text-zinc-300 underline">
            Back to shop
          </Link>
        </div>
      </div>
    )
  }

  const { order } = result
  return (
    <OrderDownloadStage
      title={order.title}
      artist={order.artist}
      artwork={order.artwork}
      kindLabel={order.kindLabel}
      formatLabel={order.formatLabel}
      tracks={order.tracks.map((track) => ({
        id: track.id,
        title: track.title,
        artist: track.artist,
        filename: vaultDownloadFileName(track.title, track.ext),
        href: `/api/download/order/file?session_id=${encodeURIComponent(order.sessionId)}&track=${encodeURIComponent(track.id)}`,
        playback: toSameOriginMediaUrl(track.relativePath) || '',
      }))}
    />
  )
}
