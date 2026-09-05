'use client'

import { useState, useEffect } from 'react'
import ImageGallery from '@/components/ImageGallery'
import galleryData from '@/data/gallery.json'

type GalleryImage = {
  id: string
  src: string
  alt: string
  category: 'portrait' | 'performance' | 'studio' | 'landscape'
  description?: string
}

const fallbackImages = (galleryData.images || []) as GalleryImage[]

export default function Gallery() {
  const [images, setImages] = useState<GalleryImage[]>(fallbackImages)

  useEffect(() => {
    async function fetchImages() {
      try {
        const response = await fetch('/api/gallery/db?active_only=true')

        if (!response.ok) {
          throw new Error('Failed to fetch from database')
        }

        const data = await response.json()

        if (data.images && data.images.length > 0) {
          setImages(data.images)
        }
      } catch (error) {
        console.error('Error fetching gallery from database:', error)
        setImages(fallbackImages)
      }
    }

    fetchImages()
  }, [])

  return (
    <div className="pt-20 min-h-screen relative">
      <div className="container mx-auto px-4 sm:px-6 py-8 sm:py-12 md:py-16 relative z-10">
        <div className="max-w-4xl mx-auto mb-8 sm:mb-12">
          <h1 
            className="text-4xl sm:text-5xl md:text-6xl font-bold mb-3 sm:mb-4 text-center font-six-caps border"
            style={{
              fontSize: '84px',
              lineHeight: '99px',
              letterSpacing: '3.7px',
              backgroundImage: 'linear-gradient(90deg, rgba(0, 0, 0, 0) 0%, rgba(255, 255, 255, 1) 59%)',
              backgroundClip: 'text',
              WebkitBackgroundClip: 'text',
              color: 'transparent',
              borderWidth: '1px',
              borderColor: 'rgba(255, 255, 255, 1)'
            }}
          >
            Gallery
          </h1>
          <p className="text-gray-400 text-base sm:text-lg leading-relaxed">
            Visual documentation of performances, studio sessions, and moments from the underground scene.
          </p>
        </div>
        <ImageGallery images={images} />
      </div>
    </div>
  )
}
