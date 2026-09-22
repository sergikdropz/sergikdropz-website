'use client'

import Link from 'next/link'
import { FaSpotify, FaApple, FaAmazon, FaMusic, FaYoutube, FaSoundcloud, FaInstagram, FaLink, FaHome, FaFacebook, FaTwitter } from 'react-icons/fa'
import { artistPlatformUrl } from '@/lib/artist-platforms'

export default function Follow() {
  const streamingPlatforms = [
    {
      name: 'Spotify',
      url: artistPlatformUrl('spotify'),
      icon: FaSpotify,
      color: 'text-green-500 hover:text-green-400',
      bgColor: 'hover:bg-green-500/10',
      description: 'All releases, albums, singles, discography'
    },
    {
      name: 'Apple Music',
      url: artistPlatformUrl('apple_music'),
      icon: FaApple,
      color: 'text-pink-500 hover:text-pink-400',
      bgColor: 'hover:bg-pink-500/10',
      description: 'All albums, EPs, singles, discography'
    },
    {
      name: 'Amazon Music',
      url: artistPlatformUrl('amazon_music'),
      icon: FaAmazon,
      color: 'text-orange-500 hover:text-orange-400',
      bgColor: 'hover:bg-orange-500/10',
      description: 'All music, albums, discography'
    },
    {
      name: 'TIDAL',
      url: artistPlatformUrl('tidal'),
      icon: FaMusic,
      color: 'text-blue-400 hover:text-blue-300',
      bgColor: 'hover:bg-blue-500/10',
      description: 'All music, albums, discography'
    },
    {
      name: 'DEEZER',
      url: artistPlatformUrl('deezer'),
      icon: FaMusic,
      color: 'text-purple-500 hover:text-purple-400',
      bgColor: 'hover:bg-purple-500/10',
      description: 'All music, albums, discography'
    },
    {
      name: 'Pandora',
      url: artistPlatformUrl('pandora'),
      icon: FaMusic,
      color: 'text-blue-500 hover:text-blue-400',
      bgColor: 'hover:bg-blue-500/10',
      description: 'Artist station and all music'
    },
    {
      name: 'Beatport',
      url: artistPlatformUrl('beatport'),
      icon: FaMusic,
      color: 'text-yellow-500 hover:text-yellow-400',
      bgColor: 'hover:bg-yellow-500/10',
      description: 'DJ-focused platform - tracks, releases, charts'
    },
    {
      name: 'Traxsource',
      url: artistPlatformUrl('traxsource'),
      icon: FaMusic,
      color: 'text-orange-400 hover:text-orange-300',
      bgColor: 'hover:bg-orange-500/10',
      description: 'House and DJ storefront - tracks and charts'
    },
    {
      name: 'Bandcamp',
      url: artistPlatformUrl('bandcamp'),
      icon: FaMusic,
      color: 'text-cyan-400 hover:text-cyan-300',
      bgColor: 'hover:bg-cyan-500/10',
      description: 'Direct-to-fan releases and merch'
    },
    {
      name: 'YouTube Music',
      url: artistPlatformUrl('youtube_music'),
      icon: FaYoutube,
      color: 'text-red-500 hover:text-red-400',
      bgColor: 'hover:bg-red-500/10',
      description: 'All music, albums, singles, discography'
    },
    {
      name: 'Shazam',
      url: artistPlatformUrl('shazam'),
      icon: FaMusic,
      color: 'text-cyan-500 hover:text-cyan-400',
      bgColor: 'hover:bg-cyan-500/10',
      description: 'Music discovery - top songs, latest releases'
    },
  ].filter((platform): platform is typeof platform & { url: string } => Boolean(platform.url))

  const socialPlatforms = [
    {
      name: 'SoundCloud',
      url: artistPlatformUrl('soundcloud'),
      icon: FaSoundcloud,
      color: 'text-orange-500 hover:text-orange-400',
      bgColor: 'hover:bg-orange-500/10',
      description: 'Personal profile - all tracks and playlists'
    },
    {
      name: 'Mixcloud',
      url: artistPlatformUrl('mixcloud'),
      icon: FaMusic,
      color: 'text-violet-400 hover:text-violet-300',
      bgColor: 'hover:bg-violet-500/10',
      description: 'DJ mixes and radio shows'
    },
    {
      name: 'YouTube',
      url: artistPlatformUrl('youtube'),
      icon: FaYoutube,
      color: 'text-red-500 hover:text-red-400',
      bgColor: 'hover:bg-red-500/10',
      description: 'Personal channel - all videos and music'
    },
    {
      name: 'Instagram',
      url: artistPlatformUrl('instagram'),
      icon: FaInstagram,
      color: 'text-pink-500 hover:text-pink-400',
      bgColor: 'hover:bg-pink-500/10',
      description: 'Personal profile'
    },
    {
      name: 'Linktree',
      url: artistPlatformUrl('linktree'),
      icon: FaLink,
      color: 'text-green-400 hover:text-green-300',
      bgColor: 'hover:bg-green-500/10',
      description: 'All platform links in one place'
    },
    {
      name: 'Facebook',
      url: artistPlatformUrl('facebook'),
      icon: FaFacebook,
      color: 'text-blue-500 hover:text-blue-400',
      bgColor: 'hover:bg-blue-500/10',
      description: 'Personal profile'
    },
    {
      name: 'TikTok',
      url: artistPlatformUrl('tiktok'),
      icon: FaMusic,
      color: 'text-black hover:text-gray-800',
      bgColor: 'hover:bg-gray-500/10',
      description: 'Short-form videos and music'
    },
    {
      name: 'Twitter',
      url: artistPlatformUrl('twitter'),
      icon: FaTwitter,
      color: 'text-blue-400 hover:text-blue-300',
      bgColor: 'hover:bg-blue-500/10',
      description: 'Updates and announcements'
    },
    {
      name: 'Discord',
      url: artistPlatformUrl('discord'),
      icon: FaLink,
      color: 'text-indigo-500 hover:text-indigo-400',
      bgColor: 'hover:bg-indigo-500/10',
      description: 'Join the community server'
    },
  ].filter((platform): platform is typeof platform & { url: string } => Boolean(platform.url))

  return (
    <div className="pt-20 min-h-screen relative">
      <div className="container mx-auto px-4 sm:px-6 py-8 sm:py-12 md:py-16 relative z-10">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold mb-4">Follow SERGIK</h1>
            <p className="text-gray-400 text-lg leading-relaxed">
              Connect with SERGIK across all streaming platforms and social media
            </p>
          </div>

          <section className="mb-16">
            <h2 className="text-2xl sm:text-3xl font-bold mb-6 text-center">Streaming Platforms</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {streamingPlatforms.map((platform) => {
                const Icon = platform.icon
                return (
                  <a
                    key={platform.name}
                    href={platform.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`group p-6 rounded-lg border border-gray-800 ${platform.bgColor} transition-all duration-300 hover:border-gray-600 hover:scale-105`}
                  >
                    <div className="flex items-center gap-4 mb-3">
                      <Icon className={`text-3xl ${platform.color} transition-transform group-hover:scale-110`} />
                      <h3 className="text-xl font-semibold text-white">{platform.name}</h3>
                    </div>
                    <p className="text-sm text-gray-400">{platform.description}</p>
                  </a>
                )
              })}
            </div>
          </section>

          <section className="mb-16">
            <h2 className="text-2xl sm:text-3xl font-bold mb-6 text-center">Social Media</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {socialPlatforms.map((platform) => {
                const Icon = platform.icon
                return (
                  <a
                    key={platform.name}
                    href={platform.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`group p-6 rounded-lg border border-gray-800 ${platform.bgColor} transition-all duration-300 hover:border-gray-600 hover:scale-105`}
                  >
                    <div className="flex items-center gap-4 mb-3">
                      <Icon className={`text-3xl ${platform.color} transition-transform group-hover:scale-110`} />
                      <h3 className="text-xl font-semibold text-white">{platform.name}</h3>
                    </div>
                    <p className="text-sm text-gray-400">{platform.description}</p>
                  </a>
                )
              })}
            </div>
          </section>

          <div className="text-center">
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-6 py-3 bg-white text-black font-semibold rounded-lg hover:bg-gray-100 transition-all duration-300"
            >
              <FaHome />
              Back to Home
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
