'use client'

import Image from 'next/image'
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

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

  const filteredImages = filter === 'all' 
    ? images 
    : images.filter(img => img.category === filter)

  const categories = [
    { value: 'all', label: 'All', count: images.length },
    { value: 'performance', label: 'Performance', count: images.filter(img => img.category === 'performance').length },
    { value: 'portrait', label: 'Portrait', count: images.filter(img => img.category === 'portrait').length },
    { value: 'studio', label: 'Studio', count: images.filter(img => img.category === 'studio').length },
    { value: 'landscape', label: 'Landscape', count: images.filter(img => img.category === 'landscape').length },
  ]

  const handleImageError = (imageId: string) => {
    setImageErrors(prev => new Set(prev).add(imageId))
  }

  if (images.length === 0) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-400 text-lg mb-4">No gallery images found.</p>
        <p className="text-gray-500 text-sm">
          Add images to <code className="bg-gray-900 px-2 py-1 rounded">web/data/gallery.json</code>
        </p>
      </div>
    )
  }

  return (
    <>
      {/* Filter Buttons */}
      <div className="flex flex-wrap gap-2 mb-10 justify-center">
        {categories.map((cat) => (
          <button
            key={cat.value}
            onClick={() => setFilter(cat.value)}
            className={`px-5 py-2.5 rounded-full text-sm font-medium transition-all duration-200 ${
              filter === cat.value
                ? 'bg-white text-black shadow-lg scale-105'
                : 'bg-gray-800/50 text-gray-300 hover:bg-gray-700/50 hover:text-white border border-gray-700/50'
            }`}
          >
            <span>{cat.label}</span>
            <span className={`ml-2 text-xs ${filter === cat.value ? 'text-gray-600' : 'text-gray-500'}`}>
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
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4"
        >
          {filteredImages.map((image, index) => {
            const hasError = imageErrors.has(image.id)
            return (
              <motion.div
                key={image.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.05 }}
                className="group relative aspect-square bg-gray-900 rounded-lg overflow-hidden cursor-pointer"
                onClick={() => setSelectedImage(image)}
              >
                {!hasError ? (
                  <>
                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10" />
                    <Image
                      src={image.src}
                      alt={image.alt}
                      fill
                      className="object-cover group-hover:scale-110 transition-transform duration-500"
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      onError={() => handleImageError(image.id)}
                      unoptimized={image.src.startsWith('/images/')}
                    />
                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-20">
                      <div className="bg-black/70 backdrop-blur-sm rounded-full p-2">
                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7" />
                        </svg>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gray-900 text-gray-600">
                    <div className="text-center p-4">
                      <p className="text-sm">Image not found</p>
                      <p className="text-xs mt-2">{image.alt}</p>
                    </div>
                  </div>
                )}
              </motion.div>
            )
          })}
        </motion.div>
      </AnimatePresence>

      {/* Results Count */}
      <div className="mt-8 text-center text-gray-500 text-sm">
        Showing {filteredImages.length} of {images.length} images
      </div>

      {/* Modal/Lightbox */}
      <AnimatePresence>
        {selectedImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/95 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setSelectedImage(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", duration: 0.3 }}
              className="max-w-6xl max-h-[95vh] relative"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setSelectedImage(null)}
                className="absolute -top-12 right-0 text-white text-3xl hover:text-gray-300 transition-colors z-10 bg-black/50 rounded-full w-10 h-10 flex items-center justify-center hover:bg-black/70 backdrop-blur-sm"
                aria-label="Close"
              >
                ×
              </button>
              
              <div className="relative bg-gray-900 rounded-lg overflow-hidden">
                <Image
                  src={selectedImage.src}
                  alt={selectedImage.alt}
                  width={1200}
                  height={1200}
                  className="object-contain max-h-[90vh] w-auto mx-auto"
                  priority
                  unoptimized={selectedImage.src.startsWith('/images/')}
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
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-white bg-black/50 hover:bg-black/70 rounded-full p-3 backdrop-blur-sm transition-all z-10"
                    aria-label="Previous image"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-white bg-black/50 hover:bg-black/70 rounded-full p-3 backdrop-blur-sm transition-all z-10"
                    aria-label="Next image"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
