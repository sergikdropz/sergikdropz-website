'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'

interface ScheduledRelease {
  id: string
  title: string
  type: string
  track_count: number | null
  release_date: string
  presave_date: string
  genre: string
  status: string
  artwork: string | null
  smart_link: string | null
  description: string
}

function useCountdown(targetDate: string) {
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 })

  useEffect(() => {
    function calculate() {
      const now = new Date().getTime()
      const target = new Date(targetDate + 'T00:00:00').getTime()
      const diff = target - now

      if (diff <= 0) {
        return { days: 0, hours: 0, minutes: 0, seconds: 0 }
      }

      return {
        days: Math.floor(diff / (1000 * 60 * 60 * 24)),
        hours: Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
        minutes: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
        seconds: Math.floor((diff % (1000 * 60)) / 1000),
      }
    }

    setTimeLeft(calculate())
    const timer = setInterval(() => setTimeLeft(calculate()), 1000)
    return () => clearInterval(timer)
  }, [targetDate])

  return timeLeft
}

function CountdownDisplay({ targetDate }: { targetDate: string }) {
  const { days, hours, minutes, seconds } = useCountdown(targetDate)

  if (days === 0 && hours === 0 && minutes === 0 && seconds === 0) {
    return <span className="text-green-400 font-semibold">Out Now!</span>
  }

  return (
    <div className="flex gap-2 sm:gap-3 text-center">
      {[
        { value: days, label: 'Days' },
        { value: hours, label: 'Hrs' },
        { value: minutes, label: 'Min' },
        { value: seconds, label: 'Sec' },
      ].map(({ value, label }) => (
        <div key={label} className="bg-gray-800/80 rounded-lg px-2 sm:px-3 py-1.5">
          <div className="text-white font-bold text-lg sm:text-xl tabular-nums">
            {String(value).padStart(2, '0')}
          </div>
          <div className="text-gray-500 text-[10px] sm:text-xs uppercase tracking-wide">{label}</div>
        </div>
      ))}
    </div>
  )
}

export default function UpcomingReleases({ schedule }: { schedule: ScheduledRelease[] }) {
  const now = new Date()
  const upcoming = schedule
    .filter((r) => new Date(r.release_date) > now)
    .sort((a, b) => new Date(a.release_date).getTime() - new Date(b.release_date).getTime())
    .slice(0, 3)

  if (upcoming.length === 0) return null

  return (
    <div className="mb-12 sm:mb-16">
      <div className="mb-6 sm:mb-8">
        <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-2">Upcoming Releases</h2>
        <p className="text-gray-400 text-sm sm:text-base">
          New music dropping soon — pre-save to get notified
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        {upcoming.map((release) => {
          const releaseDate = new Date(release.release_date)
          const formattedDate = releaseDate.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'long',
            day: 'numeric',
            year: 'numeric',
          })
          const presaveOpen = new Date(release.presave_date) <= now

          return (
            <Link
              key={release.id}
              href={`/music/${release.id}`}
              className="group bg-gradient-to-br from-purple-900/30 to-gray-900/50 border border-purple-500/20 rounded-lg overflow-hidden hover:border-purple-500/40 transition-all duration-300"
            >
              {/* Artwork */}
              <div className="aspect-square bg-gray-800 relative overflow-hidden">
                {release.artwork ? (
                  <Image
                    src={release.artwork}
                    alt={release.title}
                    fill
                    className="object-cover group-hover:scale-105 transition-transform duration-500"
                    sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-900/40 to-gray-900">
                    <div className="text-center p-4">
                      <div className="text-5xl mb-3">🎵</div>
                      <div className="text-sm font-medium text-gray-400">{release.title}</div>
                    </div>
                  </div>
                )}
                {/* Status badge */}
                <div className="absolute top-3 right-3 bg-purple-600/90 backdrop-blur-sm text-white text-xs font-semibold px-2.5 py-1 rounded-full">
                  Coming Soon
                </div>
              </div>

              <div className="p-4 sm:p-5 space-y-3">
                <div>
                  <h3 className="text-lg sm:text-xl font-bold text-white group-hover:text-purple-300 transition-colors">
                    {release.title}
                  </h3>
                  <p className="text-gray-500 text-sm">
                    {release.type} &middot; {release.genre}
                  </p>
                </div>

                {/* Countdown */}
                <div>
                  <p className="text-gray-500 text-xs mb-1.5">{formattedDate}</p>
                  <CountdownDisplay targetDate={release.release_date} />
                </div>

                {/* Pre-save CTA */}
                {presaveOpen && (
                  <div
                    className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold rounded-lg transition-all"
                    onClick={(e) => {
                      if (release.smart_link) {
                        e.preventDefault()
                        window.open(release.smart_link, '_blank')
                      }
                    }}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
                    </svg>
                    Pre-save
                  </div>
                )}

                {release.track_count && (
                  <p className="text-gray-600 text-xs">{release.track_count} tracks</p>
                )}
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
