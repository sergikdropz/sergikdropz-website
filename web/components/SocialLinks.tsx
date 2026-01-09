import artistData from '@/data/artist.json'
import { FaInstagram, FaYoutube, FaSpotify, FaSoundcloud, FaLink } from 'react-icons/fa'

export default function SocialLinks() {
  const platforms = [
    { 
      name: 'Instagram', 
      url: artistData.platforms.instagram, 
      icon: FaInstagram,
      color: 'hover:text-pink-500'
    },
    { 
      name: 'YouTube', 
      url: artistData.platforms.youtube, 
      icon: FaYoutube,
      color: 'hover:text-red-500'
    },
    { 
      name: 'Spotify', 
      url: artistData.platforms.spotify, 
      icon: FaSpotify,
      color: 'hover:text-green-500'
    },
    { 
      name: 'SoundCloud', 
      url: artistData.platforms.soundcloud, 
      icon: FaSoundcloud,
      color: 'hover:text-orange-500'
    },
    { 
      name: 'Linktree', 
      url: artistData.platforms.linktree, 
      icon: FaLink,
      color: 'hover:text-green-400'
    },
  ]

  return (
    <div className="flex space-x-4">
      {platforms.map((platform) => {
        const Icon = platform.icon
        return (
          <a
            key={platform.name}
            href={platform.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`text-2xl text-gray-400 transition-colors ${platform.color}`}
            aria-label={platform.name}
          >
            <Icon />
          </a>
        )
      })}
    </div>
  )
}
