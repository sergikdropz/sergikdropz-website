'use client'

import { useEffect, useRef, useState } from 'react'

interface InstagramPostProps {
  url: string
  className?: string
}

export default function InstagramPost({ url, className = '' }: InstagramPostProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(false)
  const containerRef = useRef<HTMLQuoteElement>(null)

  // Extract clean URL from HTML if needed, or clean the URL
  const cleanUrl = (() => {
    if (!url) return ''
    
    // If it's HTML, extract the permalink
    if (url.includes('<blockquote') || url.includes('data-instgrm-permalink')) {
      const match = url.match(/data-instgrm-permalink=["']([^"']+)["']/)
      if (match && match[1]) {
        return match[1].replace(/&amp;/g, '&').split('?')[0] // Remove query params and decode
      }
    }
    
    // Clean the URL - remove query params and ensure it's just the post/reel URL
    let clean = url.trim()
    // Remove query parameters
    clean = clean.split('?')[0]
    // Remove trailing slash
    clean = clean.replace(/\/$/, '')
    // Ensure it's a valid Instagram post or reel URL
    if (clean.includes('instagram.com/p/') || clean.includes('instagram.com/reel/')) {
      return clean
    }
    
    return url // Return original if we can't clean it
  })()

  useEffect(() => {
    // Load Instagram embed script if not already loaded
    if ((window as any).instgrm) {
      // Script already loaded, just process embeds
      ;(window as any).instgrm.Embeds.process()
      setIsLoading(false)
      return
    }

    const script = document.createElement('script')
    script.src = 'https://www.instagram.com/embed.js'
    script.async = true
    
    script.onload = () => {
      // Process embeds after script loads
      if ((window as any).instgrm) {
        ;(window as any).instgrm.Embeds.process()
      }
      setIsLoading(false)
    }

    script.onerror = () => {
      setError(true)
      setIsLoading(false)
    }

    document.body.appendChild(script)

    return () => {
      // Cleanup
      if (document.body.contains(script)) {
        document.body.removeChild(script)
      }
    }
  }, [cleanUrl])

  if (error) {
    return (
      <div className={`bg-gray-900 rounded-lg p-4 flex items-center justify-center min-h-[400px] ${className}`}>
        <p className="text-gray-400 text-sm">Failed to load Instagram post</p>
      </div>
    )
  }

  return (
    <div className={`relative ${className}`}>
      {isLoading && (
        <div className="absolute inset-0 bg-gray-900 rounded-lg flex items-center justify-center z-10">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-500 mx-auto mb-2"></div>
            <p className="text-gray-400 text-sm">Loading...</p>
          </div>
        </div>
      )}
      <blockquote
        ref={containerRef}
        className="instagram-media"
        data-instgrm-captioned
        data-instgrm-permalink={cleanUrl}
        data-instgrm-version="14"
        style={{
          background: '#FFF',
          border: '0',
          borderRadius: '3px',
          boxShadow: '0 0 1px 0 rgba(0,0,0,0.5), 0 1px 10px 0 rgba(0,0,0,0.15)',
          margin: '1px',
          maxWidth: '100%',
          minWidth: '326px',
          padding: '0',
          width: '99.375%',
          opacity: isLoading ? 0 : 1,
          transition: 'opacity 0.3s',
        }}
      >
        <div style={{ padding: '16px' }}>
          <a
            href={cleanUrl}
            style={{
              background: '#FFFFFF',
              lineHeight: 0,
              padding: '0 0',
              textAlign: 'center',
              textDecoration: 'none',
              width: '100%',
            }}
            target="_blank"
            rel="noopener noreferrer"
          >
            <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center' }}>
              <div
                style={{
                  backgroundColor: '#F4F4F4',
                  borderRadius: '50%',
                  flexGrow: 0,
                  height: '40px',
                  marginRight: '14px',
                  width: '40px',
                }}
              ></div>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  flexGrow: 1,
                  justifyContent: 'center',
                }}
              >
                <div
                  style={{
                    backgroundColor: '#F4F4F4',
                    borderRadius: '4px',
                    flexGrow: 0,
                    height: '14px',
                    marginBottom: '6px',
                    width: '100px',
                  }}
                ></div>
                <div
                  style={{
                    backgroundColor: '#F4F4F4',
                    borderRadius: '4px',
                    flexGrow: 0,
                    height: '14px',
                    width: '60px',
                  }}
                ></div>
              </div>
            </div>
            <div style={{ padding: '19% 0' }}></div>
            <div
              style={{
                display: 'block',
                height: '50px',
                margin: '0 auto 12px',
                width: '50px',
              }}
            ></div>
            <div style={{ paddingTop: '8px' }}>
              <div
                style={{
                  color: '#3897f0',
                  fontFamily: 'Arial,sans-serif',
                  fontSize: '14px',
                  fontStyle: 'normal',
                  fontWeight: 550,
                  lineHeight: '18px',
                }}
              >
                View this post on Instagram
              </div>
            </div>
            <div style={{ padding: '12.5% 0' }}></div>
          </a>
        </div>
      </blockquote>
    </div>
  )
}

