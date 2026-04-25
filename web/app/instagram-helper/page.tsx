'use client'

import React, { useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import { useAuth } from '@/contexts/AuthContext'

export default function InstagramHelper() {
  // Safely get auth - handle case where AuthProvider might not be available during SSG
  let user, isAdmin, authLoading
  try {
    const auth = useAuth()
    user = auth.user
    isAdmin = auth.isAdmin
    authLoading = auth.loading
  } catch (error) {
    // During static generation, auth might not be available
    user = null
    isAdmin = false
    authLoading = true
  }
  const [posts, setPosts] = useState<string[]>([''])
  const [saving, setSaving] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshStatus, setRefreshStatus] = useState<{lastUpdated?: string, total?: number} | null>(null)
  const [origin, setOrigin] = useState<string>('http://localhost:3000') // Default for SSR
  const [previewMedia, setPreviewMedia] = useState<Record<string, { mediaUrl?: string; type?: string }>>({})
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const scrollIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const router = useRouter()
  const searchParams = useSearchParams()
  
  // Admin-only state
  const [adminPosts, setAdminPosts] = useState<any[]>([])
  const [loadingAdminPosts, setLoadingAdminPosts] = useState(false)
  const [scraping, setScraping] = useState(false)
  const [processing, setProcessing] = useState(false)
  
  // Set origin on client side to avoid hydration mismatch
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setOrigin(window.location.origin)
    }
    
    // Cleanup scroll interval on unmount
    return () => {
      if (scrollIntervalRef.current) {
        clearInterval(scrollIntervalRef.current)
        scrollIntervalRef.current = null
      }
    }
  }, [])

  const addPostField = () => {
    setPosts([...posts, ''])
  }

  const updatePost = (index: number, value: string) => {
    const newPosts = [...posts]
    newPosts[index] = value
    setPosts(newPosts)
  }

  const removePost = (index: number) => {
    setPosts(posts.filter((_, i) => i !== index))
  }

  // Track current scroll direction
  const scrollDirectionRef = useRef<'up' | 'down' | null>(null)

  // Auto-scroll during drag
  const startAutoScroll = React.useCallback((direction: 'up' | 'down') => {
    // If already scrolling in the same direction, don't restart
    if (scrollIntervalRef.current && scrollDirectionRef.current === direction) {
      return
    }

    // Stop any existing scroll
    if (scrollIntervalRef.current) {
      clearInterval(scrollIntervalRef.current)
    }

    scrollDirectionRef.current = direction
    const scrollSpeed = 15 // pixels per interval
    const scrollInterval = 16 // milliseconds (~60fps)

    scrollIntervalRef.current = setInterval(() => {
      if (direction === 'up') {
        window.scrollBy({ top: -scrollSpeed, behavior: 'auto' })
      } else {
        window.scrollBy({ top: scrollSpeed, behavior: 'auto' })
      }
    }, scrollInterval)
  }, [])

  const stopAutoScroll = React.useCallback(() => {
    if (scrollIntervalRef.current) {
      clearInterval(scrollIntervalRef.current)
      scrollIntervalRef.current = null
      scrollDirectionRef.current = null
    }
  }, [])

  // Global drag over handler for auto-scroll
  useEffect(() => {
    if (draggedIndex === null) {
      stopAutoScroll()
      return
    }

    const handleGlobalDragOver = (e: DragEvent) => {
      const scrollThreshold = 150 // pixels from top/bottom to trigger scroll
      const mouseY = e.clientY
      const windowHeight = window.innerHeight

      if (mouseY < scrollThreshold) {
        // Near top - scroll up
        startAutoScroll('up')
      } else if (mouseY > windowHeight - scrollThreshold) {
        // Near bottom - scroll down
        startAutoScroll('down')
      } else {
        // In middle - stop scrolling
        stopAutoScroll()
      }
    }

    // Add global listener when dragging starts
    document.addEventListener('dragover', handleGlobalDragOver)
    return () => {
      document.removeEventListener('dragover', handleGlobalDragOver)
      stopAutoScroll()
    }
  }, [draggedIndex, startAutoScroll, stopAutoScroll])

  // Drag and drop handlers for reordering posts
  // We work with the actual post indices, not filtered indices
  const handleDragStart = (postIndex: number) => {
    setDraggedIndex(postIndex)
  }

  const handleDragOver = (e: React.DragEvent, postIndex: number) => {
    e.preventDefault()
    e.stopPropagation()
    
    if (draggedIndex !== null && draggedIndex !== postIndex) {
      setDragOverIndex(postIndex)
    }
  }

  const handleDragLeave = () => {
    setDragOverIndex(null)
  }

  const handleDrop = (e: React.DragEvent, dropPostIndex: number) => {
    e.preventDefault()
    e.stopPropagation()
    stopAutoScroll()
    
    if (draggedIndex === null || draggedIndex === dropPostIndex) {
      setDraggedIndex(null)
      setDragOverIndex(null)
      return
    }

    // Reorder posts in the array
    const newPosts = [...posts]
    const [draggedItem] = newPosts.splice(draggedIndex, 1)
    newPosts.splice(dropPostIndex, 0, draggedItem)

    setPosts(newPosts)
    setDraggedIndex(null)
    setDragOverIndex(null)
  }

  const handleDragEnd = () => {
    stopAutoScroll()
    setDraggedIndex(null)
    setDragOverIndex(null)
  }

  const handlePaste = async (index: number) => {
    try {
      const text = await navigator.clipboard.readText()
      if (text) {
        updatePost(index, text)
      }
    } catch (error) {
      console.error('Failed to paste:', error)
      // Fallback: try to read from clipboard using execCommand
      const input = document.createElement('input')
      input.style.position = 'fixed'
      input.style.opacity = '0'
      document.body.appendChild(input)
      input.focus()
      document.execCommand('paste')
      const pastedText = input.value
      document.body.removeChild(input)
      if (pastedText) {
        updatePost(index, pastedText)
      }
    }
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      const response = await fetch('/api/instagram/refresh', {
        method: 'POST',
      })

      if (response.ok) {
        const data = await response.json()
        alert(`✅ Successfully refreshed ${data.total} post(s) from Instagram API!`)
        // Reload status
        fetchRefreshStatus()
        // Optionally reload the page to show new posts
        setTimeout(() => {
          router.refresh()
        }, 500)
      } else {
        const errorData = await response.json().catch(() => ({}))
        const errorMessage = errorData.error || 'Failed to refresh posts'
        const details = errorData.message || errorData.details || ''
        
        if (errorData.error === 'Instagram API credentials not configured') {
          alert(`⚠️ Instagram API Not Configured\n\n${errorData.message || 'Please set up Instagram API credentials in .env.local to use auto-fetch.\n\nYou can still add posts manually using the form above.'}`)
        } else {
          alert(`❌ Error: ${errorMessage}${details ? `\n\n${details}` : ''}`)
        }
      }
    } catch (error) {
      console.error('Error:', error)
      alert('❌ Error refreshing posts. Please check the console.')
    } finally {
      setRefreshing(false)
    }
  }

  const fetchRefreshStatus = async () => {
    try {
      const response = await fetch('/api/instagram/refresh')
      if (response.ok) {
        const data = await response.json()
        setRefreshStatus(data)
      }
    } catch (error) {
      // Ignore errors
    }
  }

  // Fetch preview media for saved posts
  useEffect(() => {
    const validPosts = posts.filter(p => isValidInstagramUrl(p))
    if (validPosts.length === 0) {
      setPreviewMedia({})
      return
    }

    // Fetch media for each post
    const fetchPreviewMedia = async () => {
      const mediaMap: Record<string, { mediaUrl?: string; type?: string }> = {}
      
      await Promise.all(
        validPosts.map(async (post) => {
          try {
            const cleanUrl = post.split('?')[0]
            // Try to get media from our API first
            const response = await fetch(`/api/instagram/media?limit=100`)
            if (response.ok) {
              const data = await response.json()
              // Find matching post by permalink
              const matchingMedia = data.media?.find((m: any) => 
                m.permalink === cleanUrl || m.url === cleanUrl
              )
              if (matchingMedia?.mediaUrl) {
                mediaMap[post] = {
                  mediaUrl: matchingMedia.mediaUrl,
                  type: matchingMedia.type,
                }
                return
              }
            }
            
            // Fallback: Try to get thumbnail from Instagram oEmbed
            try {
              const oembedUrl = `https://api.instagram.com/oembed?url=${encodeURIComponent(cleanUrl)}`
              const oembedResponse = await fetch(oembedUrl)
              if (oembedResponse.ok) {
                const oembedData = await oembedResponse.json()
                if (oembedData.thumbnail_url) {
                  // Use our proxy to avoid CORS
                  mediaMap[post] = {
                    mediaUrl: `/api/instagram/proxy-image?url=${encodeURIComponent(oembedData.thumbnail_url)}`,
                    type: cleanUrl.includes('/reel/') ? 'video' : 'image',
                  }
                }
              }
            } catch (oembedError) {
              // oEmbed failed, will show loading state
            }
          } catch (error) {
            console.error(`Error fetching preview for ${post}:`, error)
          }
        })
      )
      
      setPreviewMedia(mediaMap)
    }

    fetchPreviewMedia()
  }, [posts])

  // Load existing posts on mount
  useEffect(() => {
    const loadExistingPosts = async () => {
      try {
        const response = await fetch('/api/instagram/posts?limit=50')
        if (response.ok) {
          const data = await response.json()
          if (data.posts && data.posts.length > 0) {
            setPosts(data.posts)
          }
        }
      } catch (error) {
        console.error('Error loading existing posts:', error)
      }
    }

    loadExistingPosts()
    fetchRefreshStatus()
    
    // Check for OAuth callback results
    const success = searchParams.get('success')
    const error = searchParams.get('error')
    const userId = searchParams.get('user_id')
    
    if (success === 'true' && userId) {
      alert(`✅ Instagram API connected successfully! User ID: ${userId}\n\nYour credentials have been saved. You can now use the refresh button to fetch posts automatically.\n\nPlease restart your Next.js dev server for the changes to take effect.`)
      fetchRefreshStatus()
      // Clean up URL
      router.replace('/instagram-helper')
    } else if (error) {
      const reason = searchParams.get('reason') || searchParams.get('message') || 'Unknown error'
      
      // Show specific error message for invalid platform app
      if (error === 'invalid_platform_app') {
        alert(`❌ Instagram Connection Failed\n\nError: Invalid platform app\n\nThis means your Facebook app is not properly configured for Instagram Graph API.\n\n⚠️ IMPORTANT: Instagram Basic Display API was deprecated on December 4, 2024. You must use Instagram Graph API.\n\nPlease:\n1. Go to: https://developers.facebook.com/apps/1186575606889765/dashboard/\n2. Add "Instagram Graph API" product (NOT "Instagram Basic Display")\n3. Go to Instagram Graph API → Basic Display\n4. Add OAuth Redirect URI: ${window.location.origin}/api/instagram/callback\n5. Save changes\n\nAlso make sure:\n- You have an Instagram Business or Creator account (not personal)\n- Your Instagram account is connected to a Facebook Page\n- If not connected: Instagram Settings → Account → Linked Accounts → Facebook\n\nYou can still add posts manually using the form below.`)
      } else if (error === 'access_denied') {
        alert(`❌ Instagram Connection Cancelled\n\nYou cancelled the authorization.\n\nYou can still add posts manually using the form below.`)
      } else {
        alert(`❌ Instagram OAuth failed: ${error}\n\nReason: ${reason}\n\nYou can still add posts manually using the form below.`)
      }
      router.replace('/instagram-helper')
    }
  }, [searchParams, router])

  const isValidInstagramUrl = (url: string): boolean => {
    if (!url || typeof url !== 'string' || url.trim() === '') return false
    return url.includes('instagram.com/p/') || url.includes('instagram.com/reel/')
  }

  // Admin functions
  useEffect(() => {
    if (isAdmin) {
      fetchAdminPosts()
    }
  }, [isAdmin])

  async function fetchAdminPosts() {
    try {
      setLoadingAdminPosts(true)
      const response = await fetch('/api/instagram/media?limit=100')
      const data = await response.json()
      setAdminPosts(data.media || [])
    } catch (error) {
      console.error('Error fetching admin posts:', error)
    } finally {
      setLoadingAdminPosts(false)
    }
  }

  async function handleScrapePosts() {
    setScraping(true)
    try {
      const postUrls = adminPosts
        .filter((p) => !p.video_url && !p.media_url)
        .map((p) => p.post_url)
        .slice(0, 10) // Limit to 10 at a time

      if (postUrls.length === 0) {
        alert('No posts need scraping')
        setScraping(false)
        return
      }

      const response = await fetch('/api/instagram/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postUrls }),
      })

      const data = await response.json()
      if (response.ok) {
        alert(`Scraped ${data.processed || 0} posts successfully!`)
        fetchAdminPosts()
      } else {
        alert('Scrape failed: ' + (data.error || 'Unknown error'))
      }
    } catch (error: any) {
      alert('Scrape error: ' + error.message)
    } finally {
      setScraping(false)
    }
  }

  async function handleProcessVideos() {
    setProcessing(true)
    try {
      const response = await fetch('/api/instagram/process-posts', {
        method: 'POST',
      })

      const data = await response.json()
      if (response.ok) {
        alert('Video processing started! This may take a while.')
        fetchAdminPosts()
      } else {
        alert('Processing failed: ' + (data.error || 'Unknown error'))
      }
    } catch (error: any) {
      alert('Processing error: ' + error.message)
    } finally {
      setProcessing(false)
    }
  }

  async function handleDeletePost(id: string) {
    if (!confirm('Are you sure you want to delete this post?')) return

    try {
      const response = await fetch(`/api/instagram/media/${id}`, { method: 'DELETE' })
      if (response.ok) {
        fetchAdminPosts()
        alert('Post deleted successfully')
      } else {
        alert('Delete failed')
      }
    } catch (error) {
      alert('Delete error')
    }
  }

  const handleSave = async () => {
    setSaving(true)
    const validPosts = posts.filter(p => isValidInstagramUrl(p))
    
    // Allow saving empty array to delete all posts
    if (validPosts.length === 0 && posts.some(p => p.trim() !== '')) {
      // User has entered invalid URLs
      alert('⚠️ Please add valid Instagram post or reel URLs (must include instagram.com/p/ or instagram.com/reel/)')
      setSaving(false)
      return
    }
    
    try {
      const response = await fetch('/api/instagram/save-posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ posts: validPosts }),
      })

      if (response.ok) {
        const data = await response.json()
        alert(`✅ Successfully saved ${validPosts.length} post(s)!`)
        // Update local state to reflect saved posts
        setPosts(validPosts.length > 0 ? validPosts : [''])
        // Optionally redirect to homepage
        setTimeout(() => {
          router.refresh()
        }, 500)
      } else {
        const errorData = await response.json().catch(() => ({}))
        alert(`❌ Error saving posts: ${errorData.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Error:', error)
      alert('❌ Error saving posts. Please check the console.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="pt-20 min-h-screen relative">
      <div className="container mx-auto px-4 py-16 relative z-10 max-w-3xl">
        <h1 className="text-4xl font-bold mb-4">Add Instagram Posts</h1>
        <p className="text-gray-400 mb-8">
          Add your Instagram post URLs to display them on your homepage.
        </p>

        {/* Collaboration Posts Note */}
        <div className="bg-green-900/30 border border-green-700 rounded-lg p-4 mb-6">
          <h2 className="text-lg font-semibold text-green-300 mb-2">✅ Automatic Collaboration Posts</h2>
          <p className="text-sm text-gray-300 mb-2">
            <strong>Good news!</strong> Collaboration posts are now automatically fetched when you click "Refresh" on the Instagram feed.
          </p>
          <p className="text-sm text-gray-400">
            The system automatically scrapes your profile page to get ALL posts, including ones where you were added as a collaborator. No manual addition needed! You can still use this page to add posts from other accounts or specific posts you want to feature.
          </p>
        </div>

        <div className="bg-gray-900 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">📋 How to Get Post URLs:</h2>
          <div className="space-y-4">
            <div>
              <h3 className="font-semibold text-gray-200 mb-2">On Mobile (Instagram App):</h3>
              <ol className="list-decimal list-inside space-y-1 text-gray-300 text-sm ml-2">
                <li>Open the Instagram app</li>
                <li>Navigate to a post you want to display</li>
                <li>Tap the <strong>three dots (⋯)</strong> in the top right</li>
                <li>Tap <strong>&quot;Copy link&quot;</strong></li>
                <li>Paste it in the field below</li>
              </ol>
            </div>
            <div>
              <h3 className="font-semibold text-gray-200 mb-2">On Desktop (Instagram Web):</h3>
              <ol className="list-decimal list-inside space-y-1 text-gray-300 text-sm ml-2">
                <li>Go to instagram.com and log in</li>
                <li>Click on a post to open it</li>
                <li>Copy the URL from your browser address bar</li>
                <li>Or right-click the post → &quot;Copy link address&quot;</li>
                <li>Paste it in the field below</li>
              </ol>
            </div>
          </div>
        </div>

        {/* Preview Section for Saved Posts with Drag & Drop */}
        {posts.filter(p => isValidInstagramUrl(p)).length > 0 && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">📸 Preview of Saved Posts ({posts.filter(p => isValidInstagramUrl(p)).length})</h2>
              <p className="text-xs text-gray-400">💡 Drag and drop to reorder</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {posts.filter(p => isValidInstagramUrl(p)).map((post, displayIndex) => {
                const postIndex = posts.findIndex(p => p === post)
                const cleanUrl = post.split('?')[0]
                const isReel = cleanUrl.includes('/reel/')
                const preview = previewMedia[post]
                const hasPreview = preview?.mediaUrl
                const isDragging = draggedIndex === postIndex
                const isDragOver = dragOverIndex === postIndex
                
                return (
                  <div
                    key={`preview-${postIndex}`}
                    draggable
                    onDragStart={() => handleDragStart(postIndex)}
                    onDragOver={(e) => handleDragOver(e, postIndex)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, postIndex)}
                    onDragEnd={handleDragEnd}
                    className={`
                      bg-gray-900 rounded-lg p-3 border transition-all cursor-move
                      ${isDragging ? 'opacity-50 border-pink-500 scale-95' : ''}
                      ${isDragOver ? 'border-pink-500 border-2 scale-105 shadow-lg shadow-pink-500/50' : 'border-gray-700 hover:border-pink-500'}
                    `}
                  >
                    {/* Drag handle indicator */}
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <svg 
                          className="w-4 h-4 text-gray-500" 
                          fill="currentColor" 
                          viewBox="0 0 24 24"
                        >
                          <path d="M11 18c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2zm-2-8c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0-6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm6 4c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
                        </svg>
                        <span className="text-xs text-gray-500 font-medium">#{displayIndex + 1}</span>
                      </div>
                    </div>
                    
                    <div className="aspect-square bg-gray-800 rounded mb-2 overflow-hidden relative">
                      {hasPreview && preview.mediaUrl ? (
                        <Image
                          src={preview.mediaUrl}
                          alt={isReel ? 'Instagram Reel' : 'Instagram Post'}
                          fill
                          className="object-cover"
                          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                          unoptimized
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <div className="text-center p-4">
                            <svg
                              className="w-12 h-12 text-gray-600 mx-auto mb-2"
                              fill="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                            </svg>
                            <p className="text-gray-500 text-xs">Loading preview...</p>
                          </div>
                        </div>
                      )}
                      {isReel && hasPreview && (
                        <div className="absolute top-2 right-2 bg-black/70 backdrop-blur-sm rounded-full px-2 py-1">
                          <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M8 5v14l11-7z"/>
                          </svg>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs text-gray-400 truncate flex-1" title={cleanUrl}>
                        {isReel ? '🎬 Reel' : '📷 Post'}
                      </p>
                      <a
                        href={cleanUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-pink-500 hover:text-pink-400 text-xs ml-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        View →
                      </a>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        const newPosts = [...posts]
                        newPosts[postIndex] = ''
                        setPosts(newPosts)
                      }}
                      className="w-full px-3 py-1.5 bg-red-600 hover:bg-red-700 rounded text-white text-xs transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <div className="space-y-4 mb-6">
          {posts.length === 0 ? (
            <div className="bg-gray-900 rounded-lg p-4 text-center text-gray-400">
              No posts yet. Click "Add Another Post" to get started.
            </div>
          ) : (
            posts.map((post, index) => {
              const isValid = post.trim() === '' || isValidInstagramUrl(post)
              const isEmpty = post.trim() === ''
              return (
                <div key={index} className="space-y-1">
                  <div className="flex gap-2">
                    <div className="flex-1 relative">
                      <input
                        type="text"
                        value={post}
                        onChange={(e) => updatePost(index, e.target.value)}
                        placeholder="https://www.instagram.com/p/YOUR_POST_ID/ or https://www.instagram.com/reel/YOUR_REEL_ID/"
                        className={`w-full bg-gray-900 border rounded-lg px-4 py-3 pr-12 text-white focus:outline-none transition-colors ${
                          isValid 
                            ? 'border-gray-700 focus:border-pink-500' 
                            : 'border-red-500 focus:border-red-600'
                        }`}
                      />
                      {isEmpty && (
                        <button
                          onClick={() => handlePaste(index)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-white text-sm transition-colors flex items-center gap-1.5"
                          title="Paste from clipboard"
                        >
                          <span>📋</span>
                          <span className="hidden sm:inline">Paste</span>
                        </button>
                      )}
                    </div>
                    <button
                      onClick={() => removePost(index)}
                      className="px-4 py-3 bg-red-600 hover:bg-red-700 rounded-lg text-white transition-colors"
                      title="Delete this post"
                    >
                      ✕
                    </button>
                  </div>
                  {!isValid && post.trim() !== '' && (
                    <p className="text-red-400 text-xs ml-2">⚠️ This doesn't look like a valid Instagram post or reel URL</p>
                  )}
                </div>
              )
            })
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <button
            onClick={addPostField}
            className="px-6 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg text-white transition-colors"
          >
            + Add Another Post
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-3 bg-pink-600 hover:bg-pink-700 rounded-lg text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? 'Saving...' : (() => {
              const validCount = posts.filter(p => isValidInstagramUrl(p)).length
              return validCount > 0 ? `Save ${validCount} Post(s)` : 'Clear All Posts'
            })()}
          </button>
        </div>

        {/* Connect Instagram Account Section */}
        <div className="bg-gradient-to-r from-pink-900/20 to-purple-900/20 border border-pink-700/30 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-2">🔗 Connect Instagram Account</h2>
          <p className="text-gray-300 text-sm mb-4">
            Connect your Instagram account using <strong>Instagram Graph API</strong> to automatically fetch posts, download videos, and enable full media playback. This requires an <strong>Instagram Business or Creator account</strong>.
          </p>
          
          {/* Important Notice */}
          <div className="bg-blue-900/20 border border-blue-700/30 rounded-lg p-4 mb-4">
            <p className="text-blue-300 text-sm font-semibold mb-2">📢 Important: API Updates</p>
            <p className="text-blue-200 text-xs mb-2">
              Instagram Basic Display API was <strong>deprecated on December 4, 2024</strong>. We now support two methods:
            </p>
            <ul className="list-disc list-inside space-y-1 text-blue-200 text-xs ml-2">
              <li><strong>Instagram Login</strong> (Recommended): No Facebook Page required, simpler setup</li>
              <li><strong>Facebook Login</strong>: Requires Facebook Page connection, more features</li>
              <li>Both require an <strong>Instagram Business or Creator account</strong> (personal accounts won't work)</li>
            </ul>
          </div>
          
          {/* Setup Instructions */}
          <div className="bg-yellow-900/20 border border-yellow-700/30 rounded-lg p-4 mb-4">
            <p className="text-yellow-300 text-sm font-semibold mb-2">⚙️ First-Time Setup (Required):</p>
            <ol className="list-decimal list-inside space-y-1 text-yellow-200 text-xs ml-2 mb-3">
              <li>Go to: <a href="https://developers.facebook.com/apps/1186575606889765/dashboard/" target="_blank" rel="noopener noreferrer" className="underline text-yellow-300 hover:text-yellow-200">Facebook App Dashboard</a></li>
              <li>Click <strong>"Add Product"</strong> or find <strong>"Instagram Graph API"</strong> in the products list</li>
              <li>Click <strong>"Set Up"</strong> on Instagram Graph API</li>
              <li>Navigate to <strong>Settings → Basic</strong> in the left sidebar</li>
              <li>Under <strong>"App Domains"</strong>, add: <code className="bg-black/30 px-1 rounded text-yellow-100">localhost</code> (for development) or your production domain</li>
              <li>Navigate to <strong>Instagram Graph API → Basic Display</strong> in the left sidebar</li>
              <li>Under <strong>"Valid OAuth Redirect URIs"</strong>, add: <code className="bg-black/30 px-1 rounded text-yellow-100">{origin}/api/instagram/callback</code></li>
              <li><strong>Important:</strong> Make sure your app is configured for <strong>"Instagram API with Instagram Login"</strong> (not just Facebook Login)</li>
              <li>Click <strong>"Save Changes"</strong></li>
            </ol>
            <div className="bg-red-900/20 border border-red-700/30 rounded-lg p-3 mt-3">
              <p className="text-red-300 text-xs font-semibold mb-1">⚠️ Domain Error Fix:</p>
              <p className="text-red-200 text-xs mb-2">
                If you see <strong>"The domain of this URL isn't included in the app's domains"</strong>:
              </p>
              <ol className="list-decimal list-inside space-y-1 text-red-200 text-xs ml-2">
                <li>Go to: <a href="https://developers.facebook.com/apps/1186575606889765/settings/basic/" target="_blank" rel="noopener noreferrer" className="underline text-red-300 hover:text-red-200">App Settings → Basic</a></li>
                <li>Scroll to <strong>"App Domains"</strong> section</li>
                <li>Add: <code className="bg-black/30 px-1 rounded text-red-100">localhost</code> (for development)</li>
                <li>For production, add your actual domain (e.g., <code className="bg-black/30 px-1 rounded text-red-100">yourdomain.com</code>)</li>
                <li>Click <strong>"Save Changes"</strong></li>
              </ol>
            </div>
            <div className="bg-blue-900/20 border border-blue-700/30 rounded-lg p-3 mt-3">
              <p className="text-blue-300 text-xs font-semibold mb-1">💡 About the Login Screen:</p>
              <p className="text-blue-200 text-xs">
                If you see Facebook login instead of Instagram, it means your app needs to be configured for "Instagram API with Instagram Login" in the Facebook Developer Console. 
                The OAuth dialog will show Instagram branding once the app is properly configured with Instagram Graph API product.
              </p>
            </div>
            <p className="text-yellow-300 text-sm font-semibold mb-2 mt-3">✅ Account Requirements:</p>
            <ul className="list-disc list-inside space-y-1 text-yellow-200 text-xs ml-2">
              <li>Your Instagram account must be a <strong>Business or Creator account</strong></li>
              <li><strong>Instagram Login:</strong> No Facebook Page connection needed ✅</li>
              <li><strong>Facebook Login:</strong> Instagram account must be <strong>connected to a Facebook Page</strong></li>
              <li>If using Facebook Login and not connected, go to Instagram Settings → Account → Linked Accounts → Facebook</li>
            </ul>
            <div className="bg-orange-900/20 border border-orange-700/30 rounded-lg p-3 mt-3">
              <p className="text-orange-300 text-xs font-semibold mb-1">⚠️ App Review May Be Required:</p>
              <p className="text-orange-200 text-xs">
                Instagram permissions (<code className="bg-black/30 px-1 rounded">instagram_basic</code>, <code className="bg-black/30 px-1 rounded">instagram_business_basic</code>) may require Facebook App Review before they work for all users. 
                In Development mode, these permissions work for app admins, developers, and testers. 
                For production use, submit your app for review at: <a href="https://developers.facebook.com/apps/1186575606889765/app-review/" target="_blank" rel="noopener noreferrer" className="underline text-orange-300 hover:text-orange-200">App Review Dashboard</a>
              </p>
            </div>
          </div>

          {/* Authentication Method Selection */}
          <div className="mb-4">
            <p className="text-sm font-semibold mb-2">Choose Authentication Method:</p>
            <div className="flex gap-4 mb-4">
              <label className="flex items-center cursor-pointer">
                <input
                  type="radio"
                  name="authMethod"
                  value="instagram_login"
                  defaultChecked
                  className="mr-2"
                />
                <span className="text-sm">
                  <strong>Instagram Login</strong> (Recommended - No Facebook Page required)
                </span>
              </label>
              <label className="flex items-center cursor-pointer">
                <input
                  type="radio"
                  name="authMethod"
                  value="facebook_login"
                  className="mr-2"
                />
                <span className="text-sm">
                  <strong>Facebook Login</strong> (Requires Facebook Page)
                </span>
              </label>
            </div>
          </div>

          <button
            onClick={() => {
              const APP_ID = '1186575606889765'
              const REDIRECT_URI = `${origin}/api/instagram/callback`
              
              // Check which authentication method is selected
              const authMethod = (document.querySelector('input[name="authMethod"]:checked') as HTMLInputElement)?.value || 'instagram_login'
              
              let SCOPE: string
              let AUTH_URL: string
              
              if (authMethod === 'instagram_login') {
                // Instagram Login: Use Instagram business scopes (no Facebook Page required)
                // These are the valid OAuth scope names for Instagram Graph API
                // Added instagram_business_manage for potentially broader access
                SCOPE = 'instagram_business_basic,instagram_business_content_publish,instagram_business_manage'
                // Use Facebook OAuth with Instagram scopes - the app configuration determines the branding
                // Add state parameter to track auth method
                const state = encodeURIComponent(JSON.stringify({ auth_method: 'instagram_login' }))
                AUTH_URL = `https://www.facebook.com/v18.0/dialog/oauth?client_id=${APP_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=${SCOPE}&response_type=code&state=${state}`
              } else {
                // Facebook Login: Use Facebook's OAuth endpoint
                // Facebook Login scopes (requires Facebook Page)
                // Added pages_show_list for potentially broader page access
                SCOPE = 'instagram_basic,pages_read_engagement,pages_show_list'
                // Use Facebook OAuth endpoint
                const state = encodeURIComponent(JSON.stringify({ auth_method: 'facebook_login' }))
                AUTH_URL = `https://www.facebook.com/v18.0/dialog/oauth?client_id=${APP_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=${SCOPE}&response_type=code&state=${state}`
              }
              
              window.location.href = AUTH_URL
            }}
            className="px-6 py-3 bg-pink-600 hover:bg-pink-700 rounded-lg text-white transition-colors mb-4 w-full sm:w-auto"
          >
            🔗 Connect Instagram Account
          </button>
          <p className="text-xs text-gray-400 mb-4">
            After connecting, you'll be redirected back here and your credentials will be saved automatically.
            {typeof window !== 'undefined' && (document.querySelector('input[name="authMethod"]:checked') as HTMLInputElement)?.value === 'facebook_login' 
              ? ' The system will automatically retrieve your Instagram Business Account ID from your Facebook Page.'
              : ' With Instagram Login, no Facebook Page connection is required.'}
          </p>
          <div className="bg-blue-900/20 border border-blue-700/30 rounded-lg p-3 mt-3 mb-3">
            <p className="text-blue-300 text-xs font-semibold mb-1">📅 Scope Information:</p>
            <p className="text-blue-200 text-xs">
              <strong>Instagram Login:</strong> Uses <code className="bg-black/30 px-1 rounded">instagram_business_basic</code> and <code className="bg-black/30 px-1 rounded">instagram_business_content_publish</code> (no Facebook Page required).
              <br />
              <strong>Facebook Login:</strong> Uses <code className="bg-black/30 px-1 rounded">instagram_basic</code> and <code className="bg-black/30 px-1 rounded">pages_read_engagement</code> (requires Facebook Page connection).
            </p>
          </div>
          <div className="bg-red-900/20 border border-red-700/30 rounded-lg p-4 mt-3">
            <p className="text-red-300 text-sm font-semibold mb-2">⚠️ Action Required: Wrong User ID Type</p>
            <p className="text-red-200 text-xs mb-3">
              Your current <code className="bg-black/30 px-1 rounded">INSTAGRAM_USER_ID</code> is a <strong>Facebook User ID</strong> (<code className="bg-black/30 px-1 rounded">3069209489931302</code>), not an <strong>Instagram Business Account ID</strong>.
            </p>
            <p className="text-red-200 text-xs mb-3">
              This is why the Instagram API calls are failing with error: <code className="bg-black/30 px-1 rounded">(#100) Tried accessing nonexisting field (media) on node type (User)</code>
            </p>
            <div className="bg-black/30 rounded p-3 mb-3">
              <p className="text-red-300 text-xs font-semibold mb-2">✅ Solution:</p>
              <ol className="list-decimal list-inside space-y-1 text-red-200 text-xs ml-2">
                <li>Select <strong>"Instagram Login"</strong> method above (recommended - no Facebook Page needed)</li>
                <li>Click <strong>"🔗 Connect Instagram Account"</strong></li>
                <li>Authorize the app</li>
                <li>The system will automatically get the correct Instagram Business Account ID</li>
              </ol>
            </div>
            <p className="text-red-200 text-xs">
              <strong>Alternative:</strong> If you prefer to use Facebook Login, first connect your Instagram account to a Facebook Page, then reconnect.
            </p>
          </div>
          
          {/* Error Help */}
          {searchParams.get('error') === 'invalid_platform_app' && (
            <div className="bg-red-900/20 border border-red-700/30 rounded-lg p-4 mt-4">
              <p className="text-red-300 text-sm font-semibold mb-2">❌ Connection Error: Invalid Platform App</p>
              <p className="text-red-200 text-xs mb-2">
                This error means your Facebook app is not properly configured for Instagram Graph API. Please:
              </p>
              <ol className="list-decimal list-inside space-y-1 text-red-200 text-xs ml-2 mb-2">
                <li>Go to: <a href="https://developers.facebook.com/apps/1186575606889765/dashboard/" target="_blank" rel="noopener noreferrer" className="underline text-red-300">Facebook App Dashboard</a></li>
                <li>Add <strong>"Instagram Graph API"</strong> product (NOT "Instagram Basic Display")</li>
                <li>Go to <strong>Instagram Graph API → Basic Display</strong></li>
                <li>Add OAuth Redirect URI: <code className="bg-black/30 px-1 rounded">{origin}/api/instagram/callback</code></li>
                <li>Click <strong>"Save Changes"</strong></li>
              </ol>
              <p className="text-red-200 text-xs mt-2">
                <strong>Note:</strong> Instagram Basic Display API was deprecated. You must use Instagram Graph API.
              </p>
            </div>
          )}
        </div>

        {/* Auto-Fetch Section - Instagram Graph API */}
        <div className="bg-gradient-to-r from-pink-900/20 to-purple-900/20 border border-pink-700/30 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-2">🤖 Auto-Fetch from Instagram Graph API</h2>
          <p className="text-gray-300 text-sm mb-4">
            Once connected, you can automatically fetch your latest Instagram posts using <strong>Instagram Graph API</strong>. This will:
          </p>
          <ul className="list-disc list-inside space-y-1 text-gray-300 text-xs ml-2 mb-4">
            <li>Fetch your latest posts directly from Instagram</li>
            <li>Download videos and upload them to Supabase Storage</li>
            <li>Enable direct video playback from your own storage</li>
            <li>Automatically update your feed with new posts</li>
          </ul>
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="px-6 py-3 bg-pink-600 hover:bg-pink-700 rounded-lg text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {refreshing ? '🔄 Refreshing...' : '🔄 Refresh from Instagram Graph API'}
            </button>
            {refreshStatus && (
              <div className="text-sm text-gray-400">
                {refreshStatus.lastUpdated ? (
                  <span>Last updated: {new Date(refreshStatus.lastUpdated).toLocaleString()}</span>
                ) : (
                  <span>Not yet refreshed</span>
                )}
                {refreshStatus.total !== undefined && (
                  <span className="ml-2">• {refreshStatus.total} posts</span>
                )}
              </div>
            )}
          </div>
          <div className="bg-green-900/20 border border-green-700/30 rounded-lg p-3 mt-4">
            <p className="text-green-300 text-xs font-semibold mb-1">✅ How It Works:</p>
            <p className="text-green-200 text-xs">
              After connecting, the system uses <strong>Instagram Graph API</strong> (via <code className="bg-black/30 px-1 rounded">graph.facebook.com</code>) to fetch your media. Videos are automatically downloaded and stored in Supabase for reliable playback.
            </p>
          </div>
        </div>

        {/* Admin Section - Only visible to admins */}
        {isAdmin && (
          <div className="bg-gradient-to-r from-purple-900/20 to-pink-900/20 border border-purple-700/30 rounded-lg p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-2xl font-semibold mb-2">🔧 Admin Tools</h2>
                <p className="text-gray-300 text-sm">Manage all Instagram posts in the database</p>
              </div>
              <a
                href="/admin"
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-white text-sm transition"
              >
                Admin Dashboard →
              </a>
            </div>

            {/* Admin Actions */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <button
                onClick={handleScrapePosts}
                disabled={scraping}
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-lg transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {scraping ? '⏳ Scraping...' : '🔍 Scrape Posts'}
              </button>
              <button
                onClick={handleProcessVideos}
                disabled={processing}
                className="bg-green-600 hover:bg-green-700 text-white font-semibold px-6 py-3 rounded-lg transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {processing ? '⏳ Processing...' : '🎬 Process Videos'}
              </button>
            </div>

            {/* Admin Posts List */}
            <div className="bg-gray-900/50 rounded-lg p-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">All Posts ({adminPosts.length})</h3>
                <button
                  onClick={fetchAdminPosts}
                  disabled={loadingAdminPosts}
                  className="text-gray-400 hover:text-white transition text-sm"
                >
                  {loadingAdminPosts ? 'Loading...' : '🔄 Refresh'}
                </button>
              </div>

              {loadingAdminPosts ? (
                <div className="text-center py-8 text-gray-400">Loading posts...</div>
              ) : adminPosts.length === 0 ? (
                <div className="text-center py-8 text-gray-400">No posts found in database.</div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {adminPosts.map((post) => (
                    <div
                      key={post.id}
                      className="bg-gray-800/50 border border-gray-700 rounded-lg overflow-hidden hover:border-pink-500 transition"
                    >
                      <div className="aspect-square bg-gray-700 relative">
                        {post.thumbnail_url ? (
                          <img
                            src={post.thumbnail_url}
                            alt={post.caption || 'Instagram post'}
                            className="w-full h-full object-cover"
                          />
                        ) : post.media_type === 'VIDEO' && post.video_url ? (
                          <video
                            src={post.video_url}
                            className="w-full h-full object-cover"
                            controls
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <span className="text-gray-500 text-xs">No preview</span>
                          </div>
                        )}
                        {post.media_type === 'VIDEO' && (
                          <div className="absolute top-2 right-2 bg-black/50 px-2 py-1 rounded text-xs text-white">
                            VIDEO
                          </div>
                        )}
                      </div>
                      <div className="p-3">
                        <p className="text-xs text-gray-400 mb-2 line-clamp-2">
                          {post.caption || 'No caption'}
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => window.open(post.post_url, '_blank')}
                            className="text-pink-400 hover:text-pink-300 text-xs transition flex-1"
                          >
                            View
                          </button>
                          <button
                            onClick={() => handleDeletePost(post.id)}
                            className="text-red-400 hover:text-red-300 text-xs transition"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="bg-blue-900/20 border border-blue-700/30 rounded-lg p-4 text-sm text-gray-300">
          <p className="font-semibold text-blue-300 mb-2">💡 Tips:</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>You can add 6-12 posts. The most recent ones will be displayed on your homepage.</li>
            <li>Posts will appear in a responsive grid (1 column mobile, 2 tablet, 3 desktop).</li>
            <li>After saving, refresh your homepage to see the posts.</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

