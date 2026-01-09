import Image from 'next/image'

interface HeroImageProps {
  src: string
  alt: string
  priority?: boolean
}

export default function HeroImage({ src, alt, priority = false }: HeroImageProps) {
  return (
    <div className="absolute inset-0 z-0">
      <Image
        src={src}
        alt={alt}
        fill
        priority={priority}
        className="object-cover opacity-30"
        quality={90}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-black" />
    </div>
  )
}

