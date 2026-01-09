'use client'

import { useEffect, useRef, useState } from 'react'

interface SoundCloudEmbedProps {
  url: string
  height?: number
  autoPlay?: boolean
  showArtwork?: boolean
  showComments?: boolean
  showUser?: boolean
  visual?: boolean
  color?: string
  className?: string
}

export default function SoundCloudEmbed({
  url,
  height = 300,
  autoPlay = false,
  showArtwork = true,
  showComments = true,
  showUser = true,
  visual = false,
  color = '#ff5500',
  className = ''
}: SoundCloudEmbedProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Build SoundCloud embed URL
  const embedUrl = `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}&color=${encodeURIComponent(color)}&auto_play=${autoPlay}&hide_related=false&show_comments=${showComments}&show_user=${showUser}&show_reposts=false&show_teaser=true&visual=${visual}`

  useEffect(() => {
    // Check if SoundCloud API is already loaded
    if ((window as any).SC) {
      setIsLoading(false)
      return
    }

    // Load SoundCloud widget API
    const script = document.createElement('script')
    script.src = 'https://w.soundcloud.com/player/api.js'
    script.async = true
    
    script.onload = () => {
      // Wait a bit for the API to be fully ready
      setTimeout(() => {
        setIsLoading(false)
      }, 500)
    }

    script.onerror = () => {
      // If script fails to load, still show the iframe
      setIsLoading(false)
    }

    document.body.appendChild(script)

    // Fallback: hide loading after 3 seconds even if API doesn't load
    const timeout = setTimeout(() => {
      setIsLoading(false)
    }, 3000)

    return () => {
      clearTimeout(timeout)
      // Cleanup
      if (document.body.contains(script)) {
        document.body.removeChild(script)
      }
    }
  }, [])

  useEffect(() => {
    // Set up widget event listeners when iframe is ready
    if (iframeRef.current && (window as any).SC) {
      try {
        const widget = (window as any).SC.Widget(iframeRef.current)
        
        widget.bind((window as any).SC.Widget.Events.READY, () => {
          setIsLoading(false)
        })
      } catch (error) {
        // If widget initialization fails, still show the iframe
        setIsLoading(false)
      }
    }
  }, [url])

  return (
    <div className={`relative ${className}`}>
      {isLoading && (
        <div className="absolute inset-0 bg-gray-900 rounded-lg flex items-center justify-center z-10">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#ff5500] mx-auto mb-2"></div>
            <p className="text-gray-400 text-sm">Loading SoundCloud player...</p>
          </div>
        </div>
      )}
      <iframe
        ref={iframeRef}
        width="100%"
        height={height}
        scrolling="no"
        frameBorder="no"
        allow="autoplay"
        src={embedUrl}
        className="rounded-lg"
        style={{ opacity: isLoading ? 0 : 1, transition: 'opacity 0.3s' }}
      />
    </div>
  )
}

