'use client'

import Image from 'next/image'
import { CRATE_MOSAIC_SIZE } from '@/lib/catalog-sync'
import { resolveImageUrl } from '@/utils/resolveImageUrl'

function mosaicCanOptimize(src: string): boolean {
  if (!src || src.startsWith('blob:') || src.startsWith('data:')) return false
  if (src.startsWith('/') && !src.startsWith('//')) return true
  try {
    const { hostname } = new URL(src)
    return (
      hostname.endsWith('.supabase.co') ||
      hostname === 's3.amazonaws.com' ||
      hostname.endsWith('.amazonaws.com') ||
      hostname.endsWith('.fandalism.com') ||
      hostname.endsWith('.scdn.co')
    )
  } catch {
    return false
  }
}

function MosaicTile({ src }: { src: string }) {
  const resolved = resolveImageUrl(src) || src
  if (mosaicCanOptimize(resolved)) {
    return (
      <Image
        src={resolved}
        alt=""
        fill
        sizes="48px"
        quality={45}
        className="object-cover"
        loading="lazy"
      />
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={resolved} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
  )
}

/** 3×3 crate-style cover collage. Empty cells fill with dark tiles. */
export function CrateCoverMosaic({ covers }: { covers: string[] }) {
  if (!covers.length) {
    return <div className="absolute inset-0 bg-gray-900" aria-hidden />
  }
  const cells = Array.from({ length: CRATE_MOSAIC_SIZE }, (_, index) => covers[index] || '')
  return (
    <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 gap-px bg-black" aria-hidden>
      {cells.map((src, index) =>
        src ? (
          <span key={`${src}-${index}`} className="relative block h-full w-full overflow-hidden">
            <MosaicTile src={src} />
          </span>
        ) : (
          <div key={`empty-${index}`} className="h-full w-full bg-gray-900" />
        ),
      )}
    </div>
  )
}
