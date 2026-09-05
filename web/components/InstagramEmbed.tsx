'use client'

import InstagramMediaGrid from './InstagramMediaGrid'

interface InstagramEmbedProps {
  username: string
  className?: string
  maxPosts?: number
  gridClassName?: string
}

export default function InstagramEmbed({ 
  username, 
  className = '',
  maxPosts = 100,
  gridClassName,
}: InstagramEmbedProps) {

  return (
    <div className={`relative ${className}`}>
      <InstagramMediaGrid
        username={username}
        maxPosts={maxPosts}
        className="w-full"
        gridClassName={gridClassName}
      />
    </div>
  )
}

