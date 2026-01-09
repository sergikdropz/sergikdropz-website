'use client'

import SoundCloudPlayer from './SoundCloudPlayer'
import { FaMusic } from 'react-icons/fa'

interface UnreleasedTrack {
  id: string
  title: string
  filename: string
  description?: string
  uploadDate: string
  duration?: number
  genre?: string
  artwork?: string
  likes?: number
  plays?: number
  isPrivate?: boolean
}

interface UnreleasedMusicSectionProps {
  tracks: UnreleasedTrack[]
}

export default function UnreleasedMusicSection({ 
  tracks 
}: UnreleasedMusicSectionProps) {
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/a346b04a-1680-490e-a42d-0a05edd129a0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'UnreleasedMusicSection.tsx:24',message:'UnreleasedMusicSection rendered',data:{totalTracks:tracks.length,tracksIsArray:Array.isArray(tracks)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
  // #endregion
  const publicTracks = tracks.filter(t => !t.isPrivate)

  if (publicTracks.length === 0) {
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/a346b04a-1680-490e-a42d-0a05edd129a0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'UnreleasedMusicSection.tsx:29',message:'No public tracks, returning null',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion
    return null
  }

  return (
    <div className="mt-20 pt-20 border-t border-gray-800">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <FaMusic className="text-[#ff5500] text-2xl" />
          <h2 className="text-3xl md:text-4xl font-bold">
            Unreleased Music
          </h2>
        </div>
        <p className="text-gray-400">
          Exclusive tracks and works in progress
        </p>
      </div>

      <div className="space-y-4">
        {publicTracks.map((track) => (
          <SoundCloudPlayer
            key={track.id}
            src={`/audio/unreleased/${track.filename}`}
            title={track.title}
            artist="SERGIK"
            artwork={track.artwork}
            duration={track.duration}
            likes={track.likes || 0}
            plays={track.plays || 0}
          />
        ))}
      </div>
    </div>
  )
}

