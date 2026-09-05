'use client'

import { useEffect, useState } from 'react'
import {
  FaPause,
  FaPlay,
  FaRandom,
  FaRedo,
  FaStepBackward,
  FaStepForward,
} from 'react-icons/fa'
import { useMusicPlayer } from '@/contexts/MusicPlayerContext'
import {
  dispatchPlayerTransport,
  readPlayerTransportSettings,
  PLAYER_SETTINGS_EVENT,
  type PlayerTransportSettingsSnapshot,
} from '@/lib/audio/player-transport'

/**
 * Visual + functional mirror of the MusicPlayer desktop transport cluster
 * (shuffle · prev · play · next · repeat).
 */
export default function NowPlayingTransportMirror({
  className = '',
}: {
  className?: string
}) {
  const { isPlaying, queue } = useMusicPlayer()
  const [chrome, setChrome] = useState<PlayerTransportSettingsSnapshot>(() =>
    readPlayerTransportSettings()
  )

  useEffect(() => {
    const onSettings = (ev: Event) => {
      const detail = (ev as CustomEvent<PlayerTransportSettingsSnapshot>).detail
      if (!detail) return
      setChrome({
        isShuffled: Boolean(detail.isShuffled),
        repeatMode:
          detail.repeatMode === 'all' || detail.repeatMode === 'one' || detail.repeatMode === 'off'
            ? detail.repeatMode
            : 'off',
      })
    }
    window.addEventListener(PLAYER_SETTINGS_EVENT, onSettings)
    setChrome(readPlayerTransportSettings())
    return () => window.removeEventListener(PLAYER_SETTINGS_EVENT, onSettings)
  }, [])

  const queueDisabled = queue.length <= 1

  return (
    <div className={`flex shrink-0 items-center gap-1 ${className}`} data-now-playing-transport>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          dispatchPlayerTransport('toggleShuffle')
        }}
        className={`flex min-h-[36px] min-w-[36px] items-center justify-center rounded p-1.5 transition-colors touch-manipulation ${
          chrome.isShuffled ? 'bg-gray-800/40 text-white' : 'text-gray-400 hover:text-white'
        }`}
        title="Shuffle"
        disabled={queueDisabled}
        aria-label="Shuffle"
      >
        <FaRandom className="h-3 w-3" />
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          dispatchPlayerTransport('previous')
        }}
        className="flex min-h-[36px] min-w-[36px] items-center justify-center p-1.5 text-white transition-colors hover:text-gray-300 disabled:cursor-not-allowed disabled:opacity-50 touch-manipulation"
        disabled={queueDisabled}
        title="Previous"
        aria-label="Previous track"
      >
        <FaStepBackward className="h-3 w-3" />
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          dispatchPlayerTransport('togglePlay')
        }}
        className="flex min-h-[40px] min-w-[40px] shrink-0 items-center justify-center rounded-full bg-white p-2 text-black transition-colors hover:bg-gray-200 touch-manipulation"
        aria-label={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? <FaPause className="h-3 w-3" /> : <FaPlay className="ml-0.5 h-3 w-3" />}
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          dispatchPlayerTransport('next')
        }}
        className="flex min-h-[36px] min-w-[36px] items-center justify-center p-1.5 text-white transition-colors hover:text-gray-300 disabled:cursor-not-allowed disabled:opacity-50 touch-manipulation"
        disabled={queueDisabled}
        title="Next"
        aria-label="Next track"
      >
        <FaStepForward className="h-3 w-3" />
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          dispatchPlayerTransport('cycleRepeat')
        }}
        className={`relative flex min-h-[36px] min-w-[36px] items-center justify-center rounded p-1.5 transition-colors touch-manipulation ${
          chrome.repeatMode !== 'off' ? 'bg-gray-800/40 text-white' : 'text-gray-400 hover:text-white'
        }`}
        title={`Repeat: ${chrome.repeatMode}`}
        aria-label={`Repeat: ${chrome.repeatMode}`}
      >
        <FaRedo className="h-3 w-3" />
        {chrome.repeatMode === 'one' && (
          <span className="absolute -right-0.5 -top-0.5 flex h-2.5 w-2.5 items-center justify-center rounded-full bg-blue-500 text-[6px]">
            1
          </span>
        )}
        {chrome.repeatMode === 'all' && (
          <span className="absolute -right-0.5 -top-0.5 text-[6px]">∞</span>
        )}
      </button>
    </div>
  )
}
