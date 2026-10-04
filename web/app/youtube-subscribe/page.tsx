import type { Metadata } from 'next'
import YoutubeSubscribePopup from './YoutubeSubscribePopup'

export const metadata: Metadata = {
  title: 'Subscribe to SERGIK',
  robots: { index: false, follow: false },
}

export default function YoutubeSubscribePage() {
  return <YoutubeSubscribePopup />
}
