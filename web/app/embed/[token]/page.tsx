import type { Metadata } from 'next'
import ShareEmbedClient from '@/components/shares/ShareEmbedClient'

type Props = { params: Promise<{ token: string }> }

export const metadata: Metadata = {
  title: 'SERGIK Player',
  robots: { index: false, follow: false },
}

/** Embeds use the same share stage formula as /s/[token] (accents, disc/sleeve, waveform dock). */
export default async function ShareEmbedPage({ params }: Props) {
  const { token: raw } = await params
  const token = decodeURIComponent(raw || '').trim()

  return (
    <main className="h-[100dvh] min-h-[560px] overflow-hidden bg-black text-white">
      <ShareEmbedClient token={token} />
    </main>
  )
}
