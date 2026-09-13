'use client'

import { useEffect, useState } from 'react'
import InstagramPost from './InstagramPost'

interface InstagramPostGridProps {
  username: string
  postUrls?: string[]
  maxPosts?: number
  className?: string
}

export default function InstagramPostGrid({
  username,
  postUrls,
  maxPosts = 6,
  className = '',
}: InstagramPostGridProps) {
  const [posts, setPosts] = useState<string[]>(postUrls || [])
  const [isLoading, setIsLoading] = useState(!postUrls || postUrls.length === 0)
  const [error, setError] = useState<string | null>(null)

  // Extract username from URL if it's a full URL
  const cleanUsername = username.replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/$/, '').replace('@', '')

  useEffect(() => {
    // If no post URLs provided, try to fetch from API
    if (!postUrls || postUrls.length === 0) {
      fetchPosts()
    } else {
      setPosts(postUrls)
      setIsLoading(false)
    }
  }, [postUrls?.length])

  const fetchPosts = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/instagram/posts?username=${cleanUsername}&limit=${maxPosts}`)
      if (response.ok) {
        const data = await response.json()
        if (data.posts && data.posts.length > 0) {
          setPosts(data.posts)
        } else {
          setError(data.message || 'No posts found')
        }
      } else {
        setError('Failed to fetch posts')
      }
    } catch (error) {
      console.error('Error fetching Instagram posts:', error)
      setError('Failed to load Instagram posts')
    } finally {
      setIsLoading(false)
    }
  }

  // Display posts if available, otherwise show message
  const displayPosts = posts.slice(0, maxPosts)

  if (isLoading) {
    return (
      <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 ${className}`}>
        {[...Array(maxPosts)].map((_, i) => (
          <div key={i} className="bg-gray-900 rounded-lg p-4 animate-pulse">
            <div className="h-64 bg-gray-800 rounded"></div>
          </div>
        ))}
      </div>
    )
  }

  if (displayPosts.length === 0 || error) {
    return (
      <div className={`text-center py-12 bg-gray-900 rounded-lg ${className}`}>
        <p className="text-gray-400 mb-2">{error || 'No Instagram posts configured yet.'}</p>
        <p className="text-gray-500 text-sm mb-4">
          Add your Instagram post URLs to{' '}
          <code className="bg-gray-800 px-2 py-1 rounded text-xs">web/data/instagram-posts.json</code>
        </p>
        <a
          href={`https://instagram.com/${cleanUsername}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-pink-500 hover:text-pink-400 transition-colors inline-flex items-center gap-2 text-sm"
        >
          <span>View profile on Instagram</span>
          <span>→</span>
        </a>
        <div className="mt-6">
          <a
            href="/instagram-helper"
            className="inline-flex items-center gap-2 px-4 py-2 bg-pink-600 hover:bg-pink-700 rounded-lg text-white text-sm transition-colors"
          >
            <span>📸 Add Instagram Posts</span>
            <span>→</span>
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 ${className}`}>
      {displayPosts.map((postUrl, index) => (
        <InstagramPost key={index} url={postUrl} className="w-full" />
      ))}
    </div>
  )
}

