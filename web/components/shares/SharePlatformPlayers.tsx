'use client'

import { useState } from 'react'
import { FaApple, FaDeezer, FaSpotify } from 'react-icons/fa'
import { SiAmazonmusic, SiIheartradio, SiPandora, SiTidal, SiYoutubemusic } from 'react-icons/si'
import type { IconType } from 'react-icons'
import type { SharePlatformEmbed, SharePlatformId } from '@/lib/shares/types'

const ICONS: Record<SharePlatformId, IconType> = {
  spotify: FaSpotify,
  apple_music: FaApple,
  youtube_music: SiYoutubemusic,
  amazon: SiAmazonmusic,
  deezer: FaDeezer,
  tidal: SiTidal,
  pandora: SiPandora,
  iheart: SiIheartradio,
}

export default function SharePlatformPlayers({
  platforms,
  onOpen,
}: {
  platforms: SharePlatformEmbed[]
  onOpen?: () => void
}) {
  const [activeId, setActiveId] = useState<SharePlatformId | null>(null)
  if (!platforms.length) return null
  const active = platforms.find((platform) => platform.id === activeId && platform.embedUrl) || null

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <div
        className="flex max-w-full flex-wrap items-center justify-center gap-2"
        role="group"
        aria-label="Listen on a streaming service"
      >
        {platforms.map((platform) => {
          const Icon = ICONS[platform.id]
          const selected = platform.id === activeId && Boolean(platform.embedUrl)
          const className = `inline-flex h-9 w-9 items-center justify-center rounded-full border text-base transition ${
            selected
              ? 'border-white bg-white text-black'
              : 'border-white/20 bg-white/5 text-white/90 hover:border-white/35 hover:bg-white/10'
          }`
          if (!platform.embedUrl) {
            return (
              <a
                key={platform.id}
                href={platform.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Listen on ${platform.label}`}
                title={platform.label}
                onClick={() => onOpen?.()}
                className={className}
              >
                <Icon aria-hidden />
              </a>
            )
          }
          return (
            <button
              key={platform.id}
              type="button"
              aria-pressed={selected}
              aria-label={selected ? `Hide ${platform.label}` : `Play on ${platform.label}`}
              title={platform.label}
              onClick={() => {
                setActiveId((current) => (current === platform.id ? null : platform.id))
                if (!selected) onOpen?.()
              }}
              className={className}
            >
              <Icon aria-hidden />
            </button>
          )
        })}
      </div>
      {active?.embedUrl ? (
        <iframe
          key={active.embedUrl}
          title={`Play on ${active.label}`}
          src={active.embedUrl}
          width="100%"
          height={active.height || 352}
          loading="lazy"
          allow={
            active.id === 'apple_music'
              ? 'autoplay *; encrypted-media *; fullscreen *; clipboard-write'
              : 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture'
          }
          sandbox={
            active.id === 'apple_music'
              ? 'allow-forms allow-popups allow-same-origin allow-scripts allow-storage-access-by-user-activation allow-top-navigation-by-user-activation'
              : undefined
          }
          className="w-full overflow-hidden rounded-xl border-0 bg-black"
          style={{ maxHeight: active.height || 352 }}
        />
      ) : null}
    </div>
  )
}
