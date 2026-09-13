'use client'

import Image from 'next/image'
import { CRATE_MOSAIC_SIZE } from '@/lib/catalog-sync'

function MosaicTile({ src }: { src: string }) {
  const sameOrigin = src.startsWith('/') && !src.startsWith('//')
  if (sameOrigin) {
    return (
      <Image
        src={src.split('?')[0] || src}
        alt=""
        fill
        sizes="80px"
        className="object-cover"
        loading="lazy"
      />
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
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
