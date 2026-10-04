import type { Metadata } from 'next'
import ShareDownloadClient from '@/components/shares/ShareDownloadClient'
import { parseDownloadSelection } from '@/lib/shares/share-download'

type Props = {
  params: Promise<{ token: string }>
  searchParams: Promise<{ format?: string; scope?: string; track?: string }>
}

export const metadata: Metadata = {
  title: 'Private download — SERGIK',
  robots: { index: false, follow: false },
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
