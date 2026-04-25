'use client'

import Link from 'next/link'
import { FaSpotify, FaApple, FaAmazon, FaMusic, FaYoutube, FaSoundcloud, FaInstagram, FaLink, FaHome, FaFacebook, FaTwitter } from 'react-icons/fa'
import { SiTidal, SiBeatport, SiTiktok, SiDiscord } from 'react-icons/si'

export default function Follow() {
  const streamingPlatforms = [
    {
      name: 'Spotify',
      url: 'https://open.spotify.com/artist/7MnvMhWoSe4wYXuiI6iQ8H',
      icon: FaSpotify,
      color: 'text-green-500 hover:text-green-400',
      bgColor: 'hover:bg-green-500/10',
      description: 'All releases, albums, singles, discography'
    },
    {
      name: 'Apple Music',
      url: 'https://music.apple.com/us/artist/sergik/1577778284',
      icon: FaApple,
      color: 'text-pink-500 hover:text-pink-400',
      bgColor: 'hover:bg-pink-500/10',
      description: 'All albums, EPs, singles, discography'
    },
    {
      name: 'Amazon Music',
      url: 'https://music.amazon.com/artists/B09B2LNNSF/sergik',
      icon: FaAmazon,
      color: 'text-orange-500 hover:text-orange-400',
      bgColor: 'hover:bg-orange-500/10',
      description: 'All music, albums, discography'
    },
    {
      name: 'TIDAL',
      url: 'https://tidal.com/artist/27288636',
      icon: SiTidal,
      color: 'text-blue-400 hover:text-blue-300',
      bgColor: 'hover:bg-blue-500/10',
      description: 'All music, albums, discography'
    },
    {
      name: 'DEEZER',
      url: 'https://www.deezer.com/us/artist/140080312',
      icon: FaMusic,
      color: 'text-purple-500 hover:text-purple-400',
      bgColor: 'hover:bg-purple-500/10',
      description: 'All music, albums, discography'
    },
    {
      name: 'Pandora',
      url: 'https://www.pandora.com/artist/sergik/ARz95KfVdbj3P5Z',
      icon: FaMusic,
      color: 'text-blue-500 hover:text-blue-400',
      bgColor: 'hover:bg-blue-500/10',
      description: 'Artist station and all music'
    },
    {
      name: 'Beatport',
      url: 'https://www.beatport.com/artist/sergik/1002796',
      icon: SiBeatport,
      color: 'text-yellow-500 hover:text-yellow-400',
      bgColor: 'hover:bg-yellow-500/10',
      description: 'DJ-focused platform - tracks, releases, charts'
    },
    {
      name: 'YouTube Music',
      url: 'https://music.youtube.com/channel/UCBWcROfNv8PeY6KdrnNM_pw',
      icon: FaYoutube,
      color: 'text-red-500 hover:text-red-400',
      bgColor: 'hover:bg-red-500/10',
      description: 'All music, albums, singles, discography'
    },
    {
      name: 'Shazam',
      url: 'https://www.shazam.com/artist/sergik/1577778284',
      icon: FaMusic,
      color: 'text-cyan-500 hover:text-cyan-400',
      bgColor: 'hover:bg-cyan-500/10',
      description: 'Music discovery - top songs, latest releases'
    },
  ]

  const socialPlatforms = [
    {
      name: 'SoundCloud',
      url: 'https://soundcloud.com/sergikdropz',
      icon: FaSoundcloud,
      color: 'text-orange-500 hover:text-orange-400',
      bgColor: 'hover:bg-orange-500/10',
      description: 'Personal profile - all tracks and playlists'
    },
    {
      name: 'YouTube',
      url: 'https://youtube.com/@sergikdropz',
      icon: FaYoutube,
      color: 'text-red-500 hover:text-red-400',
      bgColor: 'hover:bg-red-500/10',
      description: 'Personal channel - all videos and music'
    },
    {
      name: 'Instagram',
      url: 'https://instagram.com/sergikdropz',
      icon: FaInstagram,
      color: 'text-pink-500 hover:text-pink-400',
      bgColor: 'hover:bg-pink-500/10',
      description: 'Personal profile'
    },
    {
      name: 'Linktree',
      url: 'https://linktr.ee/sergikdropz',
      icon: FaLink,
      color: 'text-green-400 hover:text-green-300',
      bgColor: 'hover:bg-green-500/10',
      description: 'All platform links in one place'
    },
    {
      name: 'Facebook',
      url: 'https://www.facebook.com/sergikdropz',
      icon: FaFacebook,
      color: 'text-blue-500 hover:text-blue-400',
      bgColor: 'hover:bg-blue-500/10',
      description: 'Personal profile'
    },
    {
      name: 'TikTok',
      url: 'https://www.tiktok.com/@sergikdropz',
      icon: SiTiktok,
      color: 'text-black hover:text-gray-800',
      bgColor: 'hover:bg-gray-500/10',
      description: 'Short-form videos and music'
    },
    {
      name: 'Twitter',
      url: 'https://twitter.com/sergikdropz',
      icon: FaTwitter,
      color: 'text-blue-400 hover:text-blue-300',
      bgColor: 'hover:bg-blue-500/10',
      description: 'Updates and announcements'
    },
    {
      name: 'Discord',
      url: 'https://discord.gg/QhfSmbek',
      icon: SiDiscord,
      color: 'text-indigo-500 hover:text-indigo-400',
      bgColor: 'hover:bg-indigo-500/10',
      description: 'Join the community server'
    },
  ]

  return (
    <div className="pt-20 min-h-screen relative">
      <div className="container mx-auto px-4 sm:px-6 py-8 sm:py-12 md:py-16 relative z-10">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="text-center mb-12">
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold mb-4">Follow SERGIK</h1>
            <p className="text-gray-400 text-lg leading-relaxed">
              Connect with SERGIK across all streaming platforms and social media
            </p>
          </div>

          {/* Streaming Platforms */}
          <section className="mb-16">
            <h2 className="text-2xl sm:text-3xl font-bold mb-6 text-center">🎵 Streaming Platforms</h2>
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

          {/* Social Media */}
          <section className="mb-16">
            <h2 className="text-2xl sm:text-3xl font-bold mb-6 text-center">📱 Social Media</h2>
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

          {/* Back to Home */}
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

