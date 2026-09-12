'use client'

import { useRef } from 'react'
import { useMusicPlayer } from '@/contexts/MusicPlayerContext'

export default function IDJHeaderButton({
  className = '',
  size = 'header',
}: {
  className?: string
  /** `compact` fits the transport control rows; `header` is the wide vault header slot. */
  size?: 'header' | 'compact'
}) {
  const { isIDJEnabled, toggleIDJ, openIDJSettingsMenu } = useMusicPlayer()
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
    openIDJSettingsMenu({
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
        if (e.shiftKey || e.altKey) {
          e.preventDefault()
          openMenuFromEl(e.currentTarget)
          return
        }
        toggleIDJ()
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
          ? 'h-11 min-w-[72px] px-2 py-1'
          : 'min-h-[36px] min-w-[64px] px-2.5 py-2'
      } ${
        isIDJEnabled
          ? 'bg-violet-600/30 text-violet-200'
          : 'text-gray-400 hover:bg-gray-800 hover:text-white'
      } ${className}`}
      title={
        isIDJEnabled
          ? 'iDJ on — right-click or Shift+click for settings'
          : 'iDJ off — tap to mix both decks · right-click for settings'
      }
      aria-label={isIDJEnabled ? 'Disable iDJ' : 'Enable iDJ'}
      aria-pressed={isIDJEnabled}
      aria-haspopup="dialog"
    >
      <span className="text-xs font-semibold tracking-tight">iDJ</span>
    </button>
  )
}
