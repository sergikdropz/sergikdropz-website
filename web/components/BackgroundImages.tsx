'use client'

import Image from 'next/image'
import galleryData from '@/data/gallery.json'
import { useEffect, useState, useMemo } from 'react'
import { resolveImageUrl } from '@/utils/resolveImageUrl'

export default function BackgroundImages() {
  const galleryImages = galleryData.images
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set())
  const [isMobile, setIsMobile] = useState(false)
  const [gridImageIndices, setGridImageIndices] = useState<number[]>([])
  const [hasHydrated, setHasHydrated] = useState(false)

  // Detect mobile device
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  useEffect(() => {
    const id = window.requestAnimationFrame(() => setHasHydrated(true))
    return () => window.cancelAnimationFrame(id)
  }, [])

  // Filter out images that failed to load
  const availableImages = useMemo(() => 
    galleryImages.filter(img => !imageErrors.has(img.id)),
    [galleryImages, imageErrors]
  )

  // Reduce images on mobile for better performance
  // Mobile: 6 images (3x2 grid), Desktop: 24 images (6x4 grid)
  const initialGridImageCount = isMobile ? 4 : 8
  const gridImageCount = hasHydrated ? (isMobile ? 6 : 24) : initialGridImageCount

  // Initialize grid with random image indices
  useEffect(() => {
    if (availableImages.length > 0) {
      const initialIndices = Array.from({ length: gridImageCount }, () =>
        Math.floor(Math.random() * availableImages.length)
      )
      setGridImageIndices(initialIndices)
    }
  }, [availableImages.length, gridImageCount])

  // Periodically fade and shift random grid images to other photos
  useEffect(() => {
    if (gridImageIndices.length === 0 || availableImages.length === 0) return

    const interval = setInterval(() => {
      // Change 1-3 random grid cells at a time
      const cellsToChange = Math.floor(Math.random() * 3) + 1
      const newIndices = [...gridImageIndices]
      
      for (let i = 0; i < cellsToChange; i++) {
        const randomCellIndex = Math.floor(Math.random() * gridImageIndices.length)
        const randomImageIndex = Math.floor(Math.random() * availableImages.length)
        newIndices[randomCellIndex] = randomImageIndex
      }
      
      setGridImageIndices(newIndices)
    }, 3000 + Math.random() * 2000) // Change every 3-5 seconds

    return () => clearInterval(interval)
  }, [gridImageIndices.length, availableImages.length])

  return (
    <div className="fixed inset-0 z-0 pointer-events-none">
      {/* Grid layout for gallery photos - responsive: 3x2 on mobile, 6x4 on desktop */}
      <div className={`absolute inset-0 grid gap-0 ${isMobile ? 'grid-cols-3 grid-rows-2' : 'grid-cols-6 grid-rows-4'}`}>
        {gridImageIndices.map((imageIndex, index) => {
          const img = availableImages[imageIndex]
          if (!img) return null

          // Resolve Supabase URL or local fallback
          const imageUrl = resolveImageUrl(img.src)

          return (
            <div 
              key={`grid-${index}-${imageIndex}`}
              className="relative overflow-hidden group"
              style={{
                animationDelay: `${index * 0.1}s`,
              }}
            >
              <div className="absolute inset-0 animate-fade-in" style={{ position: 'absolute' }}>
                <Image
                  src={imageUrl}
                  alt={img.alt}
                  fill
                  className="object-cover opacity-50 hover:opacity-60 transition-all duration-1000 ease-in-out group-hover:scale-105"
                  quality={isMobile ? 40 : 60}
                  sizes={isMobile ? "33vw" : "(max-width: 768px) 50vw, 16.67vw"}
                  priority={!hasHydrated || index < (isMobile ? 3 : 6)}
                  loading={!hasHydrated || index < (isMobile ? 3 : 6) ? 'eager' : 'lazy'}
                  onError={() => setImageErrors(prev => new Set(prev).add(img.id))}
                  // Next.js will optimize Supabase URLs automatically
                />
              </div>
            </div>
          )
        })}
      </div>
      
      {/* Gradient overlay for text readability */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/75 via-black/60 to-black/75" />
      
      {/* Subtle animated overlay - disabled on mobile for performance */}
      {!isMobile && (
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-black/10 to-transparent animate-pulse-glow" />
      )}
    </div>
  )
}
