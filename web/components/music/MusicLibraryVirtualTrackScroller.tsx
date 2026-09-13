'use client'

import { useVirtualizer } from '@tanstack/react-virtual'
import type { ReactNode, RefObject } from 'react'

const VIRTUALIZE_THRESHOLD = 48
const ROW_ESTIMATE_PX = 76

type MusicLibraryVirtualTrackScrollerProps = {
  scrollRef: RefObject<HTMLDivElement | null>
  count: number
  enabled: boolean
  children: (index: number) => ReactNode
}

/**
 * Virtualizes long track lists inside the music library scroll container.
 * Falls back to a simple map when count is below threshold.
 */
export default function MusicLibraryVirtualTrackScroller({
  scrollRef,
  count,
  enabled,
  children,
}: MusicLibraryVirtualTrackScrollerProps) {
  const shouldVirtualize = enabled && count >= VIRTUALIZE_THRESHOLD

  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_ESTIMATE_PX,
    overscan: 12,
  })

  if (!shouldVirtualize) {
    return <>{Array.from({ length: count }, (_, index) => children(index))}</>
  }

  return (
    <div
      style={{
        height: virtualizer.getTotalSize(),
        width: '100%',
        position: 'relative',
      }}
    >
      {virtualizer.getVirtualItems().map((virtualRow) => (
        <div
          key={virtualRow.key}
          data-index={virtualRow.index}
          ref={virtualizer.measureElement}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            transform: `translateY(${virtualRow.start}px)`,
          }}
        >
          {children(virtualRow.index)}
        </div>
      ))}
    </div>
  )
}
