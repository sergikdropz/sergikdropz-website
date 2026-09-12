import videosData from '@/data/videos.json'
import { normalizeCatalog } from '@/lib/videos/catalog-model'
import VideosPageClient from './VideosPageClient'

export default function Videos() {
  const catalog = normalizeCatalog(videosData)
  return <VideosPageClient initialCatalog={catalog} />
}
