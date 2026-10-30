'use client'

import { useState } from 'react'
import Image from 'next/image'
import type { IconType } from 'react-icons'
import {
  FaBandcamp,
  FaChevronDown,
  FaDeezer,
  FaInstagram,
  FaMusic,
  FaSoundcloud,
  FaSpotify,
  FaTiktok,
  FaYoutube,
} from 'react-icons/fa'
import {
  SiAmazonmusic,
  SiApplemusic,
  SiBeatport,
  SiIheartradio,
  SiMixcloud,
  SiPandora,
  SiShazam,
  SiTidal,
  SiYoutubemusic,
} from 'react-icons/si'
import { smartLinkGoHref, type SmartLinkDestination, type SmartLinkLanding } from '@/lib/smartlinks/landing'

const LOGO = '/images/gallery/sergik-stone-eye-logo.webp'
const PLAYER_ORDER = ['site', 'spotify', 'apple_music']

const ICONS: Record<string, IconType> = {
  spotify: FaSpotify,
  apple_music: SiApplemusic,
  youtube_music: SiYoutubemusic,
  youtube: FaYoutube,
  amazon: SiAmazonmusic,
  deezer: FaDeezer,
  tidal: SiTidal,
  soundcloud: FaSoundcloud,
  shazam: SiShazam,
  beatport: SiBeatport,
  bandcamp: FaBandcamp,
  mixcloud: SiMixcloud,
  pandora: SiPandora,
  iheart: SiIheartradio,
  instagram: FaInstagram,
  tiktok: FaTiktok,
}

const HEADER_TONE: Record<string, string> = {
  spotify: 'bg-[#1DB954] text-black hover:bg-[#1ed760]',
  apple_music: 'bg-white text-black hover:bg-zinc-200',
  site: 'border border-white/30 bg-black/70 text-white hover:bg-white/10',
}

function coverDriftVariant(name: string): number {
  let hash = 2166136261
  for (let i = 0; i < name.length; i++) {
    hash ^= name.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) % 8
}

function Mark({ id }: { id: string }) {
  if (id === 'site') {
    return <Image src={LOGO} alt="" width={22} height={22} className="h-[22px] w-[22px] object-contain" />
  }
  const Icon = ICONS[id] || FaMusic
  return <Icon className="text-lg" aria-hidden />
}

function PlayerHeader({
  dest,
  open,
  onToggle,
  href,
}: {
  dest: SmartLinkDestination
  open: boolean
  onToggle: () => void
  href: string
}) {
  const tone = HEADER_TONE[dest.id] || 'border border-white/15 bg-black/50 text-white hover:bg-white/10'
  const className = `flex h-12 w-full items-center justify-between gap-3 px-5 text-sm font-semibold transition ${tone}`
  const label = (
    <span className="inline-flex items-center gap-3">
      <Mark id={dest.id} />
      <span>{dest.label}</span>
    </span>
  )

  if (!dest.embedUrl) {
    return (
      <a href={href} className={className}>
        {label}
      </a>
    )
  }

  return (
    <button type="button" className={className} aria-expanded={open} onClick={onToggle}>
      {label}
      <FaChevronDown className={`text-xs transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
    </button>
  )
}

export default function SmartLinkLandingView({
  landing,
  search = {},
}: {
  landing: SmartLinkLanding
  search?: Record<string, string | string[] | undefined>
}) {
  const [openId, setOpenId] = useState<string | null>('site')
  const players = PLAYER_ORDER.flatMap((id) => {
    const dest = landing.destinations.find((row) => row.id === id)
    return dest ? [dest] : []
  })
  const links = landing.destinations.filter((dest) => !PLAYER_ORDER.includes(dest.id))
  const drift = coverDriftVariant(landing.title || landing.slug)
  const eyebrow = landing.kind === 'presave' ? 'Pre-save' : 'Listen'
  const open = players.find((dest) => dest.id === openId && dest.embedUrl) || null

  return (
    <main className="relative min-h-screen bg-black text-white">
      {landing.artworkUrl ? (
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
          <div className="absolute inset-0 overflow-hidden brightness-[0.55]">
            <div className={`ep-release-cover-drift ep-release-cover-drift-${drift} absolute inset-0`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={landing.artworkUrl} alt="" className="h-full w-full object-cover" />
            </div>
          </div>
          <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-black/62 to-black/78" />
        </div>
      ) : null}

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-md flex-col items-center px-4 py-12 text-center">
        {landing.artworkUrl ? (
          <Image
            src={landing.artworkUrl}
            alt=""
            width={320}
            height={320}
            priority
            className="h-64 w-64 rounded-2xl object-cover shadow-[0_24px_80px_rgba(0,0,0,0.55)]"
          />
        ) : null}

        <p className="mt-8 text-[11px] uppercase tracking-[0.28em] text-zinc-400">{eyebrow}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">{landing.title}</h1>
        <p className="mt-1 text-zinc-300">{landing.artist}</p>

        <div className="mt-8 flex w-full flex-col gap-3">
          {players.map((dest) => {
            const expanded = open?.id === dest.id
            return (
              <section key={dest.id} className="w-full overflow-hidden rounded-2xl">
                <PlayerHeader
                  dest={dest}
                  open={expanded}
                  href={smartLinkGoHref(landing.slug, dest.id, search)}
                  onToggle={() => setOpenId((current) => (current === dest.id ? null : dest.id))}
                />
                {expanded && dest.embedUrl ? (
                  <iframe
                    title={dest.label}
                    src={dest.embedUrl}
                    width="100%"
                    height={dest.embedHeight || 352}
                    loading="lazy"
                    allow={
                      dest.id === 'apple_music'
                        ? 'autoplay *; encrypted-media *; fullscreen *; clipboard-write'
                        : 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture'
                    }
                    sandbox={
                      dest.id === 'apple_music'
                        ? 'allow-forms allow-popups allow-same-origin allow-scripts allow-storage-access-by-user-activation allow-top-navigation-by-user-activation'
                        : undefined
                    }
                    className="w-full border-0 bg-black"
                    style={{ height: dest.embedHeight || 352 }}
                  />
                ) : null}
              </section>
            )
          })}
        </div>

        {links.length ? (
          <div
            className="mt-6 flex flex-wrap items-center justify-center gap-2"
            role="group"
            aria-label="Store links"
          >
            {links.map((dest) => (
              <a
                key={dest.id}
                href={smartLinkGoHref(landing.slug, dest.id, search)}
                aria-label={dest.label}
                title={dest.label}
                className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-black/50 text-lg text-white backdrop-blur-sm transition hover:border-white/40 hover:bg-white/10"
              >
                <Mark id={dest.id} />
              </a>
            ))}
          </div>
        ) : null}
      </div>
    </main>
  )
}
