import type { Metadata } from 'next'
import ShopHubClient from './ShopHubClient'

export const revalidate = 300

export const metadata: Metadata = {
  title: 'Shop | SERGIK',
  description:
    'SERGIK shops — Music downloads and membership, Merch print-on-demand, and future Software and Hardware stores.',
}

export default function ShopPage() {
  return <ShopHubClient />
}
