'use client'

import Image from 'next/image'
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { resolveImageUrl } from '@/utils/resolveImageUrl'

interface GalleryImage {
  id: string
  src: string
  alt: string
  category: 'portrait' | 'performance' | 'studio' | 'landscape'
  description?: string
}

interface ImageGalleryProps {
  images: GalleryImage[]
}

export default function ImageGallery({ images }: ImageGalleryProps) {
  const [selectedImage, setSelectedImage] = useState<GalleryImage | null>(null)
  const [filter, setFilter] = useState<string>('all')
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set())

  // Filter out images that have errors (missing images)
  const availableImages = images.filter(img => !imageErrors.has(img.id))
  
  const filteredImages = filter === 'all' 
    ? availableImages 
    : availableImages.filter(img => img.category === filter)

  const categories = [
    { value: 'all', label: 'All', count: availableImages.length },
    { value: 'performance', label: 'Performance', count: availableImages.filter(img => img.category === 'performance').length },
    { value: 'portrait', label: 'Portrait', count: availableImages.filter(img => img.category === 'portrait').length },
    { value: 'studio', label: 'Studio', count: availableImages.filter(img => img.category === 'studio').length },
    { value: 'landscape', label: 'Landscape', count: availableImages.filter(img => img.category === 'landscape').length },
  ]

  const handleImageError = (imageId: string) => {
    setImageErrors(prev => new Set(prev).add(imageId))
  }

  if (availableImages.length === 0) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-400 text-lg mb-4">No gallery images found.</p>
        <p className="text-gray-500 text-sm mb-2">
          {images.length > 0 && imageErrors.size > 0 && (
            <span className="block mb-2">
              {imageErrors.size} image{imageErrors.size > 1 ? 's' : ''} not found. Add image files to <code className="bg-gray-900 px-2 py-1 rounded">web/public/images/gallery/</code>
            </span>
          )}
          Add images to <code className="bg-gray-900 px-2 py-1 rounded">web/data/gallery.json</code>
        </p>
      </div>
    )
  }

  return (
    <>
      {/* Filter Buttons */}
      <div className="flex flex-wrap gap-2 sm:gap-3 mb-4 sm:mb-6 md:mb-10 justify-center px-2">
        {categories.map((cat) => (
          <button
            key={cat.value}
            onClick={() => setFilter(cat.value)}
            className={`px-3 sm:px-4 md:px-5 py-2 sm:py-2.5 rounded-full text-xs sm:text-sm font-medium transition-all duration-200 min-h-[44px] touch-manipulation active:scale-95 ${
              filter === cat.value
                ? 'bg-white text-black shadow-lg scale-105'
                : 'bg-gray-800/50 text-gray-300 hover:bg-gray-700/50 active:bg-gray-600/50 hover:text-white border border-gray-700/50'
            }`}
          >
            <span>{cat.label}</span>
            <span className={`ml-1.5 sm:ml-2 text-[10px] sm:text-xs ${filter === cat.value ? 'text-gray-600' : 'text-gray-500'}`}>
              ({cat.count})
            </span>
          </button>
        ))}
      </div>

      {/* Image Grid */}
      <AnimatePresence mode="wait">
        <motion.div
          key={filter}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3 md:gap-4"
        >
          {filteredImages.map((image, index) => {
            const hasError = imageErrors.has(image.id)
            // Prioritize first-row images, or specific LCP images
            const isPriority = index < 4 || 
              image.id === 'unorganized-img-5043' || 
              image.id === 'unorganized-img-2025' ||
              image.id === 'unorganized-img-2192' ||
              image.id === 'unorganized-img-5800' ||
              image.id === 'performance-red-blue-1' ||
              image.id === 'portrait-vault-neon-2' ||
              image.src?.includes('IMG_5043') ||
              image.src?.includes('IMG_2025') ||
              image.src?.includes('IMG_2192') ||
              image.src?.includes('IMG_5800') ||
              image.src?.includes('performance-red-blue-1') ||
              image.src?.includes('Vault neon 2')
            return (
              <motion.div
                key={image.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.05 }}
                className="group relative aspect-square bg-gray-900 rounded-lg overflow-hidden cursor-pointer"
                onClick={() => setSelectedImage(image)}
              >
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-100 z-10" />
                <Image
                  src={resolveImageUrl(image.src)}
                  alt={image.alt}
                  fill
                  className="object-cover group-hover:scale-110 transition-transform duration-500"
                  sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                  onError={() => handleImageError(image.id)}
                  loading={isPriority ? 'eager' : 'lazy'}
                  priority={isPriority}
                  quality={index < 4 ? 85 : index < 8 ? 75 : 60}
                />
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-20">
                  <div className="bg-black/70 backdrop-blur-sm rounded-full p-2">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7" />
                    </svg>
                  </div>
                </div>
              </motion.div>
            )
          })}
        </motion.div>
      </AnimatePresence>

      {/* Results Count */}
      <div className="mt-8 text-center text-gray-500 text-sm">
        Showing {filteredImages.length} of {availableImages.length} available image{availableImages.length !== 1 ? 's' : ''}
        {imageErrors.size > 0 && (
          <span className="block mt-2 text-xs text-gray-600">
            ({imageErrors.size} image{imageErrors.size > 1 ? 's' : ''} not found - add files to web/public/images/gallery/)
          </span>
        )}
      </div>

      {/* Modal/Lightbox */}
      <AnimatePresence>
        {selectedImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/95 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4 safe-area-inset"
            onClick={() => setSelectedImage(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", duration: 0.3 }}
              className="max-w-6xl max-h-[95vh] relative w-full h-full flex items-center justify-center"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setSelectedImage(null)}
                className="absolute top-2 sm:top-4 right-2 sm:right-4 text-white text-2xl sm:text-3xl hover:text-gray-300 transition-colors z-10 bg-black/70 rounded-full w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center hover:bg-black/90 backdrop-blur-sm touch-manipulation min-h-[44px] min-w-[44px]"
                aria-label="Close"
              >
                ×
              </button>
              
              <div className="relative bg-gray-900 rounded-lg overflow-hidden w-full h-full flex items-center justify-center">
                <Image
                  src={resolveImageUrl(selectedImage.src)}
                  alt={selectedImage.alt}
                  width={1200}
                  height={1200}
                  className="object-contain max-h-[90vh] max-w-full w-auto h-auto mx-auto"
                  priority
                  sizes="(max-width: 768px) 100vw, 90vw"
                />
              </div>

              {/* Navigation */}
              {filteredImages.length > 1 && (
                <>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      const currentIndex = filteredImages.findIndex(img => img.id === selectedImage.id)
                      const prevIndex = currentIndex > 0 ? currentIndex - 1 : filteredImages.length - 1
                      setSelectedImage(filteredImages[prevIndex])
                    }}
                    className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 text-white bg-black/70 hover:bg-black/90 rounded-full p-2.5 sm:p-3 backdrop-blur-sm transition-all z-10 touch-manipulation min-h-[44px] min-w-[44px] flex items-center justify-center"
                    aria-label="Previous image"
                  >
                    <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      const currentIndex = filteredImages.findIndex(img => img.id === selectedImage.id)
                      const nextIndex = currentIndex < filteredImages.length - 1 ? currentIndex + 1 : 0
                      setSelectedImage(filteredImages[nextIndex])
                    }}
                    className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 text-white bg-black/70 hover:bg-black/90 rounded-full p-2.5 sm:p-3 backdrop-blur-sm transition-all z-10 touch-manipulation min-h-[44px] min-w-[44px] flex items-center justify-center"
                    aria-label="Next image"
                  >
                    <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
