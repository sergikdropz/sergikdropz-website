'use client'

import InstagramMediaGrid from './InstagramMediaGrid'

interface InstagramEmbedProps {
  username: string
  className?: string
  maxPosts?: number
}

export default function InstagramEmbed({ 
  username, 
  className = '',
  maxPosts = 100
}: InstagramEmbedProps) {

  return (
    <div className={`relative ${className}`}>
      <InstagramMediaGrid
        username={username}
        maxPosts={maxPosts}
        className="w-full"
      />
    </div>
  )
}

