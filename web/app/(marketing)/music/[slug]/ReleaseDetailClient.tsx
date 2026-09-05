'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { FaSpotify, FaApple, FaSoundcloud, FaYoutube, FaMusic, FaAmazon, FaShare } from 'react-icons/fa'
import { shouldUnoptimizeImage } from '@/utils/imageOptimization'
import { resolveImageUrl } from '@/utils/resolveImageUrl'

interface Release {
  id: string
  title: string
  type: string
  year?: number
  release_date?: string
  genre?: string
  description?: string
  artwork?: string | null
  image?: string | null
  status?: string
  platforms?: string[]
  spotify_url?: string
  soundcloud_url?: string
  track_count?: number | null
  presave_date?: string | null
  smart_link?: string | null
}

function useCountdown(targetDate: string | undefined) {
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0, expired: true })

  useEffect(() => {
    if (!targetDate) return

    function calculate() {
      const now = new Date().getTime()
      const target = new Date(targetDate + 'T00:00:00').getTime()
      const diff = target - now
      if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, expired: true }
      return {
        days: Math.floor(diff / (1000 * 60 * 60 * 24)),
        hours: Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
        minutes: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
        seconds: Math.floor((diff % (1000 * 60)) / 1000),
        expired: false,
      }
    }

    setTimeLeft(calculate())
    const timer = setInterval(() => setTimeLeft(calculate()), 1000)
    return () => clearInterval(timer)
  }, [targetDate])

  return timeLeft
}

const platformLinks: Record<string, { icon: any; label: string; color: string }> = {
  Spotify: { icon: FaSpotify, label: 'Spotify', color: 'text-green-500 hover:text-green-400' },
  'Apple Music': { icon: FaApple, label: 'Apple Music', color: 'text-pink-500 hover:text-pink-400' },
  SoundCloud: { icon: FaSoundcloud, label: 'SoundCloud', color: 'text-[#ff5500] hover:text-[#ff6600]' },
  'YouTube Music': { icon: FaYoutube, label: 'YouTube Music', color: 'text-red-500 hover:text-red-400' },
  'Amazon Music': { icon: FaAmazon, label: 'Amazon Music', color: 'text-orange-500 hover:text-orange-400' },
  TIDAL: { icon: FaMusic, label: 'TIDAL', color: 'text-blue-400 hover:text-blue-300' },
  Beatport: { icon: FaMusic, label: 'Beatport', color: 'text-yellow-500 hover:text-yellow-400' },
}

export default function ReleaseDetailClient({ release }: { release: Release }) {
  const [copied, setCopied] = useState(false)
  const isUpcoming = release.status === 'upcoming' || release.status === 'scheduled'
  const countdown = useCountdown(isUpcoming ? release.release_date : undefined)
  const imageUrl = release.artwork || release.image
    ? resolveImageUrl(release.artwork || release.image || '')
    : null
  const releaseYear =
    release.year || (release.release_date ? new Date(release.release_date).getFullYear() : null)

  const formattedDate = release.release_date
    ? new Date(release.release_date + 'T00:00:00').toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : null

  function handleShare() {
    const url = window.location.href
    if (navigator.share) {
      navigator.share({ title: `${release.title} — SERGIK`, url })
    } else {
      navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className="pt-20 min-h-screen">
      <div className="container mx-auto px-4 sm:px-6 py-8 sm:py-12 max-w-5xl">
        {/* Back link */}
        <Link
          href="/music"
          className="inline-flex items-center gap-2 text-gray-400 hover:text-white text-sm mb-8 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          All Music
        </Link>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12">
          {/* Artwork */}
          <div className="aspect-square bg-gray-800 rounded-xl overflow-hidden relative shadow-2xl">
            {imageUrl ? (
              <Image
                src={imageUrl}
                alt={release.title}
                fill
                className="object-cover"
                sizes="(max-width: 768px) 100vw, 50vw"
                unoptimized={shouldUnoptimizeImage(imageUrl)}
                priority
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-900/40 to-gray-900">
                <div className="text-center">
                  <div className="text-7xl mb-4">🎵</div>
                  <div className="text-lg text-gray-400">{release.title}</div>
                </div>
              </div>
            )}
          </div>

          {/* Details */}
          <div className="flex flex-col justify-center space-y-6">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-purple-400 mb-2 block">
                {release.type} {releaseYear && `· ${releaseYear}`}
              </span>
              <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-3">
                {release.title}
              </h1>
              <p className="text-gray-400 text-sm">by SERGIK</p>
            </div>

            {release.genre && (
              <p className="text-gray-500 text-sm">{release.genre}</p>
            )}

            {release.description && (
              <p className="text-gray-300 text-base leading-relaxed">
                {release.description}
              </p>
            )}

            {release.track_count && (
              <p className="text-gray-500 text-sm">{release.track_count} tracks</p>
            )}

            {/* Release date / Countdown */}
            {isUpcoming && formattedDate && (
              <div className="space-y-3">
                <p className="text-gray-400 text-sm">
                  Releasing {formattedDate}
                </p>
                {!countdown.expired && (
                  <div className="flex gap-3">
                    {[
                      { value: countdown.days, label: 'Days' },
                      { value: countdown.hours, label: 'Hours' },
                      { value: countdown.minutes, label: 'Min' },
                      { value: countdown.seconds, label: 'Sec' },
                    ].map(({ value, label }) => (
                      <div key={label} className="bg-gray-800 rounded-lg px-3 py-2 text-center min-w-[60px]">
                        <div className="text-white font-bold text-xl tabular-nums">
                          {String(value).padStart(2, '0')}
                        </div>
                        <div className="text-gray-500 text-[10px] uppercase tracking-wide">{label}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Pre-save button for upcoming */}
            {isUpcoming && release.smart_link && (
              <a
                href={release.smart_link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-all w-fit"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
                </svg>
                Pre-save Now
              </a>
            )}

            {/* Streaming platform links for released */}
            {!isUpcoming && release.platforms && release.platforms.length > 0 && (
              <div className="space-y-3">
                <p className="text-gray-500 text-xs uppercase tracking-wider font-semibold">
                  Listen on
                </p>
                <div className="flex flex-wrap gap-2">
                  {release.platforms.map((platform) => {
                    const config = platformLinks[platform]
                    if (!config) return null
                    const Icon = config.icon

                    let href = '#'
                    if (platform === 'Spotify' && release.spotify_url) href = release.spotify_url
                    else if (platform === 'SoundCloud' && release.soundcloud_url) href = release.soundcloud_url

                    return (
                      <a
                        key={platform}
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-gray-700 hover:border-gray-600 transition-all ${config.color}`}
                      >
                        <Icon className="text-lg" />
                        <span className="text-sm text-gray-300">{config.label}</span>
                      </a>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Spotify embed */}
            {!isUpcoming && release.spotify_url && release.spotify_url.includes('/album/') && (
              <div className="mt-4">
                <iframe
                  src={`https://open.spotify.com/embed/album/${release.spotify_url.split('/album/')[1]?.split('?')[0]}?utm_source=generator&theme=0`}
                  width="100%"
                  height="152"
                  frameBorder="0"
                  allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                  loading="lazy"
                  className="rounded-xl"
                />
              </div>
            )}

            {/* Share */}
            <button
              onClick={handleShare}
              className="inline-flex items-center gap-2 text-gray-400 hover:text-white text-sm transition-colors w-fit"
            >
              <FaShare className="text-sm" />
              {copied ? 'Link copied!' : 'Share'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
