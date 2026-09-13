'use client'

import ShareListenClient from '@/components/shares/ShareListenClient'

/** Embed iframe entry — same stage formula as track/EP share pages. */
export default function ShareEmbedClient({ token }: { token: string }) {
  return <ShareListenClient token={token} variant="embed" />
}
