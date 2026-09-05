import galleryData from '@/data/gallery.json'
import { nextImageOptimizerHref } from '@/lib/mosaic-image-url'
import { resolveImageUrl } from '@/utils/resolveImageUrl'

/** Preload the first gallery mosaic tiles so Safari starts fetching before client JS runs. */
const PRELOAD_TILE_COUNT = 2
const PRELOAD_WIDTH = 828
const PRELOAD_QUALITY = 72

export default function BackgroundMosaicPreload() {
  const hrefs = galleryData.images.slice(0, PRELOAD_TILE_COUNT).map((img) =>
    nextImageOptimizerHref(resolveImageUrl(img.src), PRELOAD_WIDTH, PRELOAD_QUALITY),
  )

  return (
    <>
      {hrefs.map((href) => (
        <link key={href} rel="preload" as="image" href={href} fetchPriority="high" />
      ))}
    </>
  )
}
