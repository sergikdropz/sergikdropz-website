'use client'

import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import { FaSearch, FaTimes, FaUpload, FaTrash, FaEdit, FaSave, FaPlus } from 'react-icons/fa'
import { resolveImageUrl } from '@/utils/resolveImageUrl'
import { shouldUnoptimizeImage } from '@/utils/imageOptimization'

type GalleryImage = {
  id: string
  src: string
  alt: string
  category: 'portrait' | 'performance' | 'studio' | 'landscape'
  description?: string
  filename?: string
  url?: string
  publicUrl?: string
}

export default function AdminGallery() {
  const { user, isAdmin, loading } = useAuth()
  const router = useRouter()
  
  const [images, setImages] = useState<GalleryImage[]>([])
  const [loadingImages, setLoadingImages] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [filter, setFilter] = useState<string>('all')
  const [selectedImage, setSelectedImage] = useState<GalleryImage | null>(null)
  const [editingImage, setEditingImage] = useState<GalleryImage | null>(null)
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set())
  
  // Upload state
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [uploadingToSupabase, setUploadingToSupabase] = useState(false)
  const [showUploadModal, setShowUploadModal] = useState(false)

  useEffect(() => {
    if (!loading && (!user || !isAdmin)) {
      router.push('/admin/login')
    }
  }, [user, isAdmin, loading, router])

  useEffect(() => {
    if (isAdmin) {
      fetchImages()
    }
  }, [isAdmin])

  async function fetchImages() {
    try {
      setLoadingImages(true)
      // Fetch from Supabase database (source of truth)
      const response = await fetch('/api/gallery/db')
      
      if (!response.ok) {
        throw new Error('Failed to fetch from database')
      }
      
      const data = await response.json()
      
      if (data.error) {
        console.error('Database error:', data.error)
        // Fallback to legacy endpoints
        const fallbackResponse = await fetch('/api/gallery/list')
        const fallbackData = await fallbackResponse.json()
        const transformedImages = (fallbackData.images || []).map((img: any, index: number) => ({
          id: img.id || img.filename || `img-${index}`,
          src: img.url || img.publicUrl || img.src || img.filename,
          alt: img.alt || img.filename || 'Gallery image',
          category: img.category || 'portrait',
          description: img.description || '',
          filename: img.filename || img.name,
        }))
        setImages(transformedImages)
        return
      }
      
      // Use data from Supabase database
      setImages(data.images || [])
    } catch (error) {
      console.error('Error fetching images:', error)
      setImages([])
    } finally {
      setLoadingImages(false)
    }
  }

  async function handleUpload() {
    if (selectedFiles.length === 0) return

    setUploading(true)
    setUploadProgress(0)

    try {
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i]
        const formData = new FormData()
        formData.append('file', file)

        const xhr = new XMLHttpRequest()

        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const fileProgress = (e.loaded / e.total) * 100
            const totalProgress = ((i + fileProgress / 100) / selectedFiles.length) * 100
            setUploadProgress(totalProgress)
          }
        })

        // Upload to Supabase Storage
        const uploadResponse = await fetch('/api/gallery/upload-supabase', {
          method: 'POST',
          body: formData,
        })

        if (!uploadResponse.ok) {
          throw new Error(`Upload failed for ${file.name}`)
        }

        const uploadData = await uploadResponse.json()

        // Create database entry
        const imageId = file.name.replace(/\.[^/.]+$/, '').replace(/[^a-z0-9-]/gi, '-').toLowerCase()
        
        const dbResponse = await fetch('/api/gallery/db', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image_id: imageId,
            filename: file.name,
            src: uploadData.publicUrl,
            alt: file.name.replace(/\.[^/.]+$/, '').replace(/-/g, ' '),
            category: 'portrait', // Default, can be edited later
            storage_url: uploadData.publicUrl,
            is_stored_in_supabase: true,
            size_bytes: file.size,
            mime_type: file.type,
          }),
        })

        if (!dbResponse.ok) {
          console.error('Failed to create database entry for', file.name)
        }

        // Update progress
        const totalProgress = ((i + 1) / selectedFiles.length) * 100
        setUploadProgress(totalProgress)
      }

      setSelectedFiles([])
      setUploadProgress(0)
      setShowUploadModal(false)
      fetchImages()
      alert('Images uploaded successfully!')
    } catch (error: any) {
      alert('Upload error: ' + error.message)
    } finally {
      setUploading(false)
      setUploadProgress(0)
    }
  }

  async function handleUploadToSupabase() {
    // Both upload methods now use Supabase, so they're the same
    await handleUpload()
  }

  async function handleDelete(image: GalleryImage) {
    if (!confirm('Are you sure you want to delete this image?')) return

    try {
      // Delete from Supabase database (source of truth)
      const response = await fetch(`/api/gallery/db?id=${encodeURIComponent(image.id)}&hard_delete=true`, {
        method: 'DELETE',
      })
      
      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          fetchImages()
          alert('Image deleted successfully')
          if (selectedImage?.id === image.id) {
            setSelectedImage(null)
          }
        } else {
          alert('Delete failed: ' + (data.error || 'Unknown error'))
        }
      } else {
        const errorData = await response.json()
        alert('Delete failed: ' + (errorData.error || 'Unknown error'))
      }
    } catch (error: any) {
      alert('Delete error: ' + error.message)
    }
  }

  async function handleSaveImage(image: GalleryImage) {
    try {
      // Update in Supabase database (source of truth)
      const response = await fetch('/api/gallery/db', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: image.id,
          alt: image.alt,
          category: image.category,
          description: image.description,
        }),
      })

      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          setEditingImage(null)
          fetchImages()
          alert('Image metadata saved successfully!')
        } else {
          alert('Save failed: ' + (data.error || 'Unknown error'))
        }
      } else {
        const errorData = await response.json()
        alert('Save failed: ' + (errorData.error || 'Unknown error'))
      }
    } catch (error: any) {
      alert('Save error: ' + error.message)
    }
  }

  const handleImageError = (imageId: string) => {
    setImageErrors(prev => new Set(prev).add(imageId))
  }

  // Filter out images that have errors
  const availableImages = images.filter(img => !imageErrors.has(img.id))
  
  // Filter by category and search
  const filteredImages = useMemo(() => {
    let filtered = availableImages
    
    if (filter !== 'all') {
      filtered = filtered.filter(img => img.category === filter)
    }
    
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(img => 
        img.alt.toLowerCase().includes(query) ||
        img.description?.toLowerCase().includes(query) ||
        img.filename?.toLowerCase().includes(query)
      )
    }
    
    return filtered
  }, [availableImages, filter, searchQuery])

  const categories = [
    { value: 'all', label: 'All', count: availableImages.length },
    { value: 'performance', label: 'Performance', count: availableImages.filter(img => img.category === 'performance').length },
    { value: 'portrait', label: 'Portrait', count: availableImages.filter(img => img.category === 'portrait').length },
    { value: 'studio', label: 'Studio', count: availableImages.filter(img => img.category === 'studio').length },
    { value: 'landscape', label: 'Landscape', count: availableImages.filter(img => img.category === 'landscape').length },
  ]

  if (loading || loadingImages) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="text-white text-xl">Loading...</div>
      </div>
    )
  }

  if (!user || !isAdmin) {
    return null
  }

  return (
    <div className="pt-20 min-h-screen pb-40 relative z-10 bg-black">
      <div className="container mx-auto px-4 sm:px-6 py-4 sm:py-6 md:py-8 max-w-7xl relative z-10">
        {/* Header - Matching Frontend */}
        <div className="mb-8">
          <div className="flex flex-col items-center justify-center mb-4 sm:mb-6 w-full">
            <h1 
              className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-semibold mb-1 font-six-caps text-center border border-yellow-400 text-yellow-400 px-3 sm:px-4 py-1.5 sm:py-2 rounded text-wrap"
              style={{
                fontSize: '84px',
                lineHeight: '99px',
                letterSpacing: '3.7px',
              }}
            >
              Gallery - Admin
            </h1>
            <p className="text-gray-400 text-xs sm:text-sm mt-2 text-center">
              {availableImages.length} images • Admin Mode
            </p>
          </div>

          {/* Search Bar - Matching Frontend */}
          <div className="relative mb-4 sm:mb-6">
            <FaSearch className="absolute left-3 sm:left-4 top-1/2 transform -translate-y-1/2 text-gray-400 text-sm sm:text-base" />
            <input
              type="text"
              placeholder="Search gallery..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 sm:pl-11 pr-9 sm:pr-10 py-2.5 sm:py-3 text-sm sm:text-base bg-gray-800/40 border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-200 transition-colors"
                title="Clear search"
              >
                <FaTimes />
              </button>
            )}
          </div>

          {/* Admin Tools Bar */}
          <div className="flex flex-wrap gap-2 mb-4">
            <button
              onClick={() => setShowUploadModal(true)}
              className="px-3 py-2 bg-green-600 hover:bg-green-700 rounded text-sm flex items-center gap-2"
            >
              <FaUpload />
              Upload Images
            </button>
            <button
              onClick={fetchImages}
              className="px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm flex items-center gap-2"
            >
              Refresh
            </button>
          </div>
        </div>

        {/* Filter Buttons - Matching Frontend */}
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

        {/* Image Grid - Matching Frontend */}
        {filteredImages.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-gray-400 text-lg mb-4">No images found.</p>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="text-blue-400 hover:text-blue-300"
              >
                Clear search
              </button>
            )}
          </div>
        ) : (
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
                if (hasError) return null
                
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
                      loading={index < 8 ? 'eager' : 'lazy'}
                      priority={index < 8}
                      quality={index < 4 ? 85 : index < 8 ? 75 : 60}
                      unoptimized={shouldUnoptimizeImage(image.src)}
                    />
                    {/* Admin Actions Overlay */}
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 z-20">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setEditingImage(image)
                        }}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm transition"
                        title="Edit"
                      >
                        <FaEdit />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDelete(image)
                        }}
                        className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-sm transition"
                        title="Delete"
                      >
                        <FaTrash />
                      </button>
                    </div>
                  </motion.div>
                )
              })}
            </motion.div>
          </AnimatePresence>
        )}

        {/* Results Count */}
        <div className="mt-8 text-center text-gray-500 text-sm">
          Showing {filteredImages.length} of {availableImages.length} available image{availableImages.length !== 1 ? 's' : ''}
          {imageErrors.size > 0 && (
            <span className="block mt-2 text-xs text-gray-600">
              ({imageErrors.size} image{imageErrors.size > 1 ? 's' : ''} not found)
            </span>
          )}
        </div>

        {/* Lightbox Modal - Matching Frontend */}
        <AnimatePresence>
          {selectedImage && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/95 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4"
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
                  className="absolute top-2 sm:top-4 right-2 sm:right-4 text-white text-2xl sm:text-3xl hover:text-gray-300 transition-colors z-10 bg-black/70 rounded-full w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center hover:bg-black/90 backdrop-blur-sm"
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
                    unoptimized={shouldUnoptimizeImage(selectedImage.src)}
                  />
                </div>

                {/* Admin Actions in Modal */}
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 z-10">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setSelectedImage(null)
                      setEditingImage(selectedImage)
                    }}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2"
                  >
                    <FaEdit /> Edit
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDelete(selectedImage)
                      setSelectedImage(null)
                    }}
                    className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg flex items-center gap-2"
                  >
                    <FaTrash /> Delete
                  </button>
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
                      className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 text-white bg-black/70 hover:bg-black/90 rounded-full p-2.5 sm:p-3 backdrop-blur-sm transition-all z-10"
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
                      className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 text-white bg-black/70 hover:bg-black/90 rounded-full p-2.5 sm:p-3 backdrop-blur-sm transition-all z-10"
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

        {/* Edit Image Modal */}
        {editingImage && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full">
              <h2 className="text-xl font-semibold mb-4">Edit Image</h2>
              <div className="space-y-4">
                <div>
                  <label htmlFor="edit-alt" className="block text-sm mb-1">Alt Text</label>
                  <input
                    id="edit-alt"
                    type="text"
                    value={editingImage.alt}
                    onChange={(e) => setEditingImage({ ...editingImage, alt: e.target.value })}
                    className="w-full bg-gray-700 rounded p-2 text-white"
                    aria-label="Image alt text"
                  />
                </div>
                <div>
                  <label htmlFor="edit-category" className="block text-sm mb-1">Category</label>
                  <select
                    id="edit-category"
                    value={editingImage.category}
                    onChange={(e) => setEditingImage({ ...editingImage, category: e.target.value as any })}
                    className="w-full bg-gray-700 rounded p-2 text-white"
                    aria-label="Image category"
                  >
                    <option value="portrait">Portrait</option>
                    <option value="performance">Performance</option>
                    <option value="studio">Studio</option>
                    <option value="landscape">Landscape</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="edit-description" className="block text-sm mb-1">Description</label>
                  <textarea
                    id="edit-description"
                    value={editingImage.description || ''}
                    onChange={(e) => setEditingImage({ ...editingImage, description: e.target.value })}
                    className="w-full bg-gray-700 rounded p-2 text-white"
                    rows={4}
                    aria-label="Image description"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleSaveImage(editingImage)}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded flex-1 flex items-center justify-center gap-2"
                  >
                    <FaSave /> Save
                  </button>
                  <button
                    onClick={() => setEditingImage(null)}
                    className="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded flex-1"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Upload Modal */}
        {showUploadModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full">
              <h2 className="text-xl font-semibold mb-4">Upload Images</h2>
              <div className="space-y-4">
                <div>
                  <label htmlFor="upload-files" className="block text-sm mb-1">Image Files (Multiple)</label>
                  <input
                    id="upload-files"
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => setSelectedFiles(Array.from(e.target.files || []))}
                    className="w-full bg-gray-700 rounded p-2 text-white file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700"
                    disabled={uploading || uploadingToSupabase}
                    aria-label="Select image files to upload"
                    title="Select image files to upload"
                  />
                  {selectedFiles.length > 0 && (
                    <p className="text-sm text-gray-400 mt-2">
                      {selectedFiles.length} file(s) selected
                    </p>
                  )}
                </div>
                {(uploading || uploadingToSupabase) && (
                  <div>
                    <div className="w-full bg-gray-700 rounded-full h-2 mb-2">
                      <div
                        className="bg-green-600 h-2 rounded-full transition-all"
                        style={{ width: `${uploadProgress}%` }}
                      ></div>
                    </div>
                    <p className="text-sm text-gray-400">
                      Uploading... {Math.round(uploadProgress)}%
                    </p>
                  </div>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={handleUpload}
                    disabled={selectedFiles.length === 0 || uploading || uploadingToSupabase}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded flex-1 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <FaUpload /> Upload to Local
                  </button>
                  <button
                    onClick={handleUploadToSupabase}
                    disabled={selectedFiles.length === 0 || uploading || uploadingToSupabase}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded flex-1 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <FaUpload /> Upload to Supabase
                  </button>
                </div>
                <button
                  onClick={() => {
                    setShowUploadModal(false)
                    setSelectedFiles([])
                  }}
                  className="w-full px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
