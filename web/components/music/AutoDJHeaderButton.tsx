'use client'

import { useRef } from 'react'
import { useMusicPlayer } from '@/contexts/MusicPlayerContext'

export default function AutoDJHeaderButton({
  className = '',
  size = 'header',
}: {
  className?: string
  /** `compact` fits the transport control rows; `header` is the wide vault header slot. */
  size?: 'header' | 'compact'
}) {
  const { isAutoDJEnabled, toggleAutoDJ, openAutoDJSettingsMenu } = useMusicPlayer()
  const longPressRef = useRef<number | null>(null)
  const openedByHoldRef = useRef(false)

  const clearHold = () => {
    if (longPressRef.current != null) {
      window.clearTimeout(longPressRef.current)
      longPressRef.current = null
    }
  }

  const openMenuFromEl = (el: HTMLElement) => {
    const rect = el.getBoundingClientRect()
    openAutoDJSettingsMenu({
      x: rect.right,
      y: rect.bottom + 6,
    })
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        if (openedByHoldRef.current) {
          openedByHoldRef.current = false
          return
        }
        // Shift/Alt+click opens settings (reliable for Playwright / trackpads).
        if (e.shiftKey || e.altKey) {
          e.preventDefault()
          openMenuFromEl(e.currentTarget)
          return
        }
        toggleAutoDJ()
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
        openMenuFromEl(e.currentTarget)
      }}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        clearHold()
        const el = e.currentTarget
        longPressRef.current = window.setTimeout(() => {
          openedByHoldRef.current = true
          openMenuFromEl(el)
        }, 500)
      }}
      onPointerUp={clearHold}
      onPointerCancel={clearHold}
      onPointerLeave={clearHold}
      className={`relative flex shrink-0 items-center justify-center rounded-lg transition-colors touch-manipulation ${
        size === 'compact'
          ? 'h-11 min-w-[88px] px-2 py-1'
          : 'min-h-[36px] min-w-[72px] px-2.5 py-2'
      } ${
        isAutoDJEnabled
          ? 'bg-emerald-600/30 text-emerald-200'
          : 'text-gray-400 hover:bg-gray-800 hover:text-white'
      } ${className}`}
      title={
        isAutoDJEnabled
          ? 'Auto DJ on · right-click or Shift+click for settings'
          : 'Auto DJ off · right-click or Shift+click for settings'
      }
      aria-label={isAutoDJEnabled ? 'Disable Auto DJ' : 'Enable Auto DJ'}
      aria-pressed={isAutoDJEnabled}
      aria-haspopup="dialog"
    >
      <span className="text-xs font-semibold tracking-tight">AutoDJ</span>
    </button>
  )
}
