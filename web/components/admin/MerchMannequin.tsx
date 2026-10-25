import type { CSSProperties } from 'react'
import type { GarmentFamily, PlacementId } from '@/lib/merch/blanks'

const SHOTS: Record<GarmentFamily, Partial<Record<PlacementId, string>>> = {
  tee: {
    front: '/images/merch/garments/tee-front.png',
    back: '/images/merch/garments/tee-back.png',
  },
  hoodie: {
    front: '/images/merch/garments/hoodie-front.png',
    back: '/images/merch/garments/hoodie-back.png',
  },
  hat: {
    front: '/images/merch/garments/hat-front.png',
  },
  sweatpants: {
    front: '/images/merch/garments/pants-front.png',
    back: '/images/merch/garments/pants-front.png',
  },
}

function maskStyle(src: string): CSSProperties {
  return {
    WebkitMaskImage: `url(${src})`,
    maskImage: `url(${src})`,
    WebkitMaskSize: 'contain',
    maskSize: 'contain',
    WebkitMaskRepeat: 'no-repeat',
    maskRepeat: 'no-repeat',
    WebkitMaskPosition: 'center',
    maskPosition: 'center',
  }
}

export default function MerchMannequin({
  family,
  color,
  placement,
}: {
  family: GarmentFamily
  color: string
  placement: PlacementId
  idPrefix?: string
}) {
  const src = SHOTS[family][placement] || SHOTS[family].front || SHOTS.tee.front!

  return (
    <div className="absolute inset-0" aria-hidden>
      <div className="pointer-events-none absolute inset-x-[18%] bottom-[4%] h-[7%] rounded-[50%] bg-black/55 blur-md" />
      <div className="absolute inset-0" style={{ backgroundColor: color, ...maskStyle(src) }} />
      <img
        src={src}
        alt=""
        draggable={false}
        className="pointer-events-none absolute inset-0 h-full w-full object-contain"
        style={{ mixBlendMode: 'multiply' }}
      />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at 50% 28%, rgba(255,255,255,0.22), rgba(255,255,255,0) 46%)',
          mixBlendMode: 'soft-light',
          ...maskStyle(src),
        }}
      />
    </div>
  )
}
