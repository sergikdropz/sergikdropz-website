'use client'

import { useEffect, useState, useRef } from 'react'
import Image from 'next/image'

interface InstagramMedia {
  url: string
  mediaUrl: string
  type: 'image' | 'video'
  permalink: string
}

interface InstagramMediaModalProps {
  media: InstagramMedia | null
  isOpen: boolean
  onClose: () => void
}

export default function InstagramMediaModal({ media, isOpen, onClose }: InstagramMediaModalProps) {
  const [isVideoLoading, setIsVideoLoading] = useState(true)
  const embedRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isOpen) {
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }

    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen])

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    if (isOpen) {
      window.addEventListener('keydown', handleEscape)
    }

    return () => {
      window.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen, onClose])

  // Load Instagram embed script for videos
  useEffect(() => {
    if (!isOpen || !media || media.type !== 'video') return

    // Load Instagram embed script if not already loaded
    if ((window as any).instgrm) {
      // Script already loaded, just process embeds
      setTimeout(() => {
        ;(window as any).instgrm.Embeds.process()
        setIsVideoLoading(false)
      }, 100)
      return
    }

    const script = document.createElement('script')
    script.src = 'https://www.instagram.com/embed.js'
    script.async = true
    
    script.onload = () => {
      // Process embeds after script loads
      if ((window as any).instgrm) {
        setTimeout(() => {
          ;(window as any).instgrm.Embeds.process()
          setIsVideoLoading(false)
        }, 100)
      }
    }

    script.onerror = () => {
      setIsVideoLoading(false)
    }

    document.body.appendChild(script)

    return () => {
      if (document.body.contains(script)) {
        document.body.removeChild(script)
      }
    }
  }, [isOpen, media])

  if (!isOpen || !media) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-10 text-white hover:text-gray-300 transition-colors p-2 rounded-full hover:bg-white/10"
        aria-label="Close"
      >
        <svg
          className="w-6 h-6"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>

      {/* Media container */}
      <div
        className="relative max-w-7xl max-h-[90vh] w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {media.type === 'video' ? (
          <div className="relative w-full bg-black rounded-lg overflow-hidden">
            {isVideoLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black z-10">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-2"></div>
                  <p className="text-white text-sm">Loading video...</p>
                </div>
              </div>
            )}
            <div
              ref={embedRef}
              className="w-full"
              style={{ minHeight: '600px' }}
            >
              <blockquote
                className="instagram-media"
                data-instgrm-captioned
                data-instgrm-permalink={media.permalink}
                data-instgrm-version="14"
                style={{
                  background: '#000',
                  border: '0',
                  borderRadius: '3px',
                  margin: '1px',
                  maxWidth: '100%',
                  minWidth: '326px',
                  padding: '0',
                  width: '100%',
                  opacity: isVideoLoading ? 0 : 1,
                  transition: 'opacity 0.3s',
                }}
              />
            </div>
          </div>
        ) : (
          <div className="relative w-full max-h-[90vh] flex items-center justify-center">
            <Image
              src={media.mediaUrl}
              alt="Instagram post"
              width={1200}
              height={1200}
              className="max-w-full max-h-[90vh] object-contain rounded-lg"
              unoptimized
            />
          </div>
        )}

        {/* Link to Instagram */}
        <div className="mt-4 text-center">
          <a
            href={media.permalink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-white/70 hover:text-white transition-colors text-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <svg
              className="w-5 h-5"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
            </svg>
            <span>View on Instagram</span>
          </a>
        </div>
      </div>
    </div>
  )
}

