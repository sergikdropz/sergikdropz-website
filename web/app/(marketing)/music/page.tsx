import { getPublicLiveReleases } from '@/lib/marketing/public-releases'
import MusicPageClient from './MusicPageClient'

export const revalidate = 300

export default async function MusicPage() {
  const initialLiveReleases = await getPublicLiveReleases()
  return <MusicPageClient initialLiveReleases={initialLiveReleases} />
}
