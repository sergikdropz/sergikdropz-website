'use client'

import Link from 'next/link'
import artistData from '@/data/artist.json'
import releasesData from '@/data/releases.json'
import galleryData from '@/data/gallery.json'
import SocialLinks from '@/components/SocialLinks'
import ReleaseCard from '@/components/ReleaseCard'
import InstagramEmbed from '@/components/InstagramEmbed'
import FollowEmailModal from '@/components/FollowEmailModal'
import { useState } from 'react'

export default function Home() {
  const [followModalOpen, setFollowModalOpen] = useState(false)

  const latestReleases = releasesData.releases.slice(0, 3)
  const galleryImages = galleryData.images

  return (
    <div className="pt-20">
      <FollowEmailModal open={followModalOpen} onClose={() => setFollowModalOpen(false)} />
      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
        {/* Gradient overlays - background images are now visible from BackgroundImages component */}
        <div className="absolute inset-0 z-[1]">
          {/* Gradient overlays */}
          <div className="absolute right-0 bottom-0 w-full h-full bg-gradient-to-b from-black/70 via-black/50 to-black/80 opacity-0" />
          <div 
            className="absolute inset-0 opacity-30 invisible"
            style={{
              background: 'linear-gradient(180deg, rgba(129, 101, 101, 0.02) 0%, rgba(0, 0, 0, 0) 2%)',
              backgroundColor: 'rgba(255, 255, 255, 1)',
              backgroundImage: 'none'
            }}
          />
          <div 
            className="absolute right-0 bottom-0 w-full h-full bg-gradient-to-br from-blue-900/20 via-transparent to-purple-900/20 animate-pulse-glow"
            style={{ 
              opacity: 0.05,
              background: 'transparent',
              backgroundColor: 'transparent',
              backgroundImage: 'none',
              boxShadow: 'none',
              pointerEvents: 'none',
              left: '-1px',
              top: '1px'
            }}
          />
        </div>
        
        <div className="relative z-10 container mx-auto px-4 sm:px-6 text-center">
          <h1 className="text-5xl sm:text-7xl md:text-[12rem] lg:text-[14rem] font-bold mb-4 sm:mb-6 md:mb-8 tracking-tight font-six-caps-hero">
            SERGIK
          </h1>
          <p className="text-sm sm:text-base md:text-lg lg:text-xl xl:text-2xl text-gray-200 mb-6 sm:mb-8 md:mb-10 max-w-2xl mx-auto leading-relaxed drop-shadow-lg px-2">
            {artistData.bio.short}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-3 md:gap-4 lg:gap-5 gap-y-4 sm:gap-y-3 mb-6 sm:mb-8 md:mb-12 max-w-3xl mx-auto px-2 sm:px-0">
            <Link
              href="/music"
              className="group px-4 sm:px-6 md:px-8 py-3 sm:py-3.5 md:py-4 bg-white text-black font-semibold rounded-lg hover:bg-gray-100 active:bg-gray-200 transition-all duration-300 text-sm sm:text-base md:text-lg text-center shadow-lg hover:shadow-xl active:scale-95 touch-manipulation min-h-[48px] flex items-center justify-center"
            >
              Listen
            </Link>
            <Link
              href="/videos"
              className="group px-4 sm:px-6 md:px-8 py-3 sm:py-3.5 md:py-4 bg-white text-black font-semibold rounded-lg hover:bg-gray-100 active:bg-gray-200 transition-all duration-300 text-sm sm:text-base md:text-lg text-center shadow-lg hover:shadow-xl active:scale-95 touch-manipulation min-h-[48px] flex items-center justify-center"
            >
              Watch
            </Link>
            <button
              type="button"
              onClick={() => setFollowModalOpen(true)}
              className="group px-4 sm:px-6 md:px-8 py-3 sm:py-3.5 md:py-4 border-2 border-white text-white font-semibold rounded-lg hover:bg-white hover:text-black active:bg-gray-100 active:text-black transition-all duration-300 text-sm sm:text-base md:text-lg text-center shadow-lg hover:shadow-xl active:scale-95 touch-manipulation min-h-[48px] flex items-center justify-center backdrop-blur-sm bg-white/10"
            >
              Follow
            </button>
            <Link
              href="/epk"
              className="group px-4 sm:px-6 md:px-8 py-3 sm:py-3.5 md:py-4 border-2 border-white text-white font-semibold rounded-lg hover:bg-white hover:text-black active:bg-gray-100 active:text-black transition-all duration-300 text-sm sm:text-base md:text-lg text-center shadow-lg hover:shadow-xl active:scale-95 touch-manipulation min-h-[48px] flex items-center justify-center backdrop-blur-sm bg-white/10"
            >
              Press / EPK
            </Link>
          </div>
          <div className="animate-fade-in">
            <SocialLinks />
          </div>
        </div>
      </section>

      {/* Instagram Feed — set NEXT_PUBLIC_SHOW_INSTAGRAM_FEED=false in Vercel to hide the entire block */}
      {(process.env.NEXT_PUBLIC_SHOW_INSTAGRAM_FEED ?? 'true') !== 'false' && (
        <section className="py-8 sm:py-12 md:py-16 lg:py-20 relative z-10 bg-gradient-to-b from-transparent via-black/30 to-transparent">
          <div className="container mx-auto px-4 sm:px-6">
            <div className="max-w-6xl mx-auto">
              <div className="overflow-hidden rounded-lg">
                <div className="max-h-[600px] overflow-y-auto overflow-x-hidden" style={{ scrollbarWidth: 'thin', scrollbarColor: '#4B5563 #111827' }}>
                  <InstagramEmbed 
                    username={artistData.platforms.instagram.replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/$/, '').replace('@', '')}
                    className="w-full"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Latest Releases */}
      <section className="py-8 sm:py-12 md:py-16 lg:py-20 relative z-10">
        <div className="container mx-auto px-4 sm:px-6">
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-6 sm:mb-8 md:mb-12 text-center">Latest Releases</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6 md:gap-8">
            {latestReleases.map((release) => (
              <ReleaseCard key={release.id} release={release} />
            ))}
          </div>
          <div className="text-center mt-12">
            <Link
              href="/music"
              className="text-gray-400 hover:text-white transition-colors"
            >
              View All Releases →
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}

