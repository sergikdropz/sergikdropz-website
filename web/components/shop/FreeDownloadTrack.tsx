'use client'

import { useState } from 'react'
import Image from 'next/image'
import EmailGate from './EmailGate'

interface FreeDownloadTrackProps {
  track: {
    id: string
    title: string
    description: string
    artwork?: string
    freeDownloadFormats?: string[]
  }
}

export default function FreeDownloadTrack({ track }: FreeDownloadTrackProps) {
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)

  return (
    <div className="bg-gray-900/50 border border-gray-800 rounded-lg overflow-hidden">
      <div className="flex flex-col sm:flex-row">
        {track.artwork && (
          <div className="relative w-full sm:w-40 h-40 flex-shrink-0">
            <Image
              src={track.artwork}
              alt={track.title}
              fill
              className="object-cover"
              sizes="160px"
            />
            <div className="absolute top-2 left-2 bg-green-600 text-white text-xs font-bold px-2 py-1 rounded">
              FREE
            </div>
          </div>
        )}
        <div className="p-4 flex-1">
          <h3 className="text-white font-semibold">{track.title}</h3>
          <p className="text-gray-400 text-sm mt-1">{track.description}</p>

          {track.freeDownloadFormats && (
            <div className="flex gap-1.5 mt-2">
              {track.freeDownloadFormats.map((fmt) => (
                <span
                  key={fmt}
                  className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded"
                >
                  {fmt}
                </span>
              ))}
            </div>
          )}

          <div className="mt-4">
            {downloadUrl ? (
              <div className="space-y-2">
                <a
                  href={downloadUrl}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-lg transition-all"
                  download
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                  </svg>
                  Download Now
                </a>
                <p className="text-gray-500 text-xs">Check your email too!</p>
              </div>
            ) : (
              <EmailGate trackId={track.id} onSuccess={setDownloadUrl} />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
