'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import FreeDownloadTrack from '@/components/shop/FreeDownloadTrack'

export default function FreeDownloadsPage() {
  const [tracks, setTracks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/shop/products')
        if (res.ok) {
          const data = await res.json()
          setTracks(data.tracks.filter((t: any) => t.freeDownload))
        }
      } catch (err) {
        console.error('Error loading free tracks:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  return (
    <div className="min-h-screen pt-24 pb-16 px-4">
      <div className="max-w-3xl mx-auto">
        <nav className="mb-8">
          <Link href="/shop" className="text-gray-400 hover:text-white text-sm transition-colors">
            ← Back to Shop
          </Link>
        </nav>

        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white">Free Downloads</h1>
          <p className="text-gray-400 mt-2">
            Enter your email to unlock free tracks. No strings attached.
          </p>
        </div>

        {loading ? (
          <div className="space-y-4">
            {[1, 2].map((i) => (
              <div key={i} className="bg-gray-800 rounded-lg h-40 animate-pulse" />
            ))}
          </div>
        ) : tracks.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-gray-400">No free downloads available right now. Check back soon!</p>
          </div>
        ) : (
          <div className="space-y-6">
            {tracks.map((track) => (
              <FreeDownloadTrack key={track.id} track={track} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
