'use client'

import InstagramMediaGrid from './InstagramMediaGrid'

interface InstagramEmbedProps {
  username: string
  className?: string
  maxPosts?: number
  gridClassName?: string
  deferUntilVisible?: boolean
}

export default function InstagramEmbed({ 
  username, 
  className = '',
  maxPosts = 100,
  gridClassName,
  deferUntilVisible = false,
}: InstagramEmbedProps) {

  return (
    <div className={`relative ${className}`}>
      <InstagramMediaGrid
        username={username}
        maxPosts={maxPosts}
        className="w-full"
        gridClassName={gridClassName}
        deferUntilVisible={deferUntilVisible}
      />
    </div>
  )
}

