'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter, useSearchParams } from 'next/navigation'
import type { TrackSearchResult } from '@/app/api/music/search/route'
import { shouldUnoptimizeImage } from '@/utils/imageOptimization'

const KEYS = [
  '1A','2A','3A','4A','5A','6A','7A','8A','9A','10A','11A','12A',
  '1B','2B','3B','4B','5B','6B','7B','8B','9B','10B','11B','12B',
]

const MOODS = ['Dark', 'Energetic', 'Hypnotic', 'Melancholic', 'Euphoric', 'Driving', 'Ambient']
const GENRES = ['House', 'Techno', 'Tech House', 'Deep House', 'Progressive', 'Minimal', 'EBM']

function TrackCard({ track }: { track: TrackSearchResult }) {
  const mins = track.duration_seconds ? Math.floor(track.duration_seconds / 60) : null
  const secs = track.duration_seconds ? String(track.duration_seconds % 60).padStart(2, '0') : null
  const energyPct = track.energy_level ? Math.round(track.energy_level * 100) : null

  return (
    <div className="group relative rounded-xl border border-gray-800 bg-gray-900/50 overflow-hidden hover:border-purple-700/60 transition-colors">
      <div className="aspect-square bg-gray-800 relative overflow-hidden">
        {track.artwork_url ? (
          <Image
            src={track.artwork_url}
            alt={track.title}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-500"
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            unoptimized={shouldUnoptimizeImage(track.artwork_url)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gray-800">
            <span className="text-4xl opacity-30">🎵</span>
          </div>
        )}
        {track.is_purchasable && track.price_usd && (
          <div className="absolute bottom-2 right-2 bg-black/80 backdrop-blur-sm rounded px-2 py-0.5 text-xs text-green-400 font-semibold">
            ${track.price_usd}
          </div>
        )}
      </div>

      <div className="p-3">
        <h3 className="font-semibold text-white text-sm truncate">{track.title}</h3>
        <p className="text-gray-400 text-xs truncate mt-0.5">{track.artist}</p>

        <div className="flex flex-wrap gap-1 mt-2">
          {track.bpm && (
            <span className="text-xs bg-purple-950/60 border border-purple-800/40 text-purple-300 rounded px-1.5 py-0.5">
              {track.bpm} BPM
            </span>
          )}
          {track.key_signature && (
            <span className="text-xs bg-blue-950/60 border border-blue-800/40 text-blue-300 rounded px-1.5 py-0.5">
              {track.key_signature}
            </span>
          )}
          {track.mood && (
            <span className="text-xs bg-pink-950/60 border border-pink-800/40 text-pink-300 rounded px-1.5 py-0.5">
              {track.mood}
            </span>
          )}
          {track.genre && (
            <span className="text-xs bg-gray-800 border border-gray-700 text-gray-300 rounded px-1.5 py-0.5">
              {track.genre}
            </span>
          )}
          {energyPct !== null && (
            <span className="text-xs bg-orange-950/60 border border-orange-800/40 text-orange-300 rounded px-1.5 py-0.5">
              {energyPct}% energy
            </span>
          )}
          {mins !== null && (
            <span className="text-xs text-gray-500 rounded px-1.5 py-0.5">
              {mins}:{secs}
            </span>
          )}
        </div>

        {track.is_purchasable && (
          <Link
            href={`/shop/${track.id}`}
            className="mt-3 block w-full text-center text-xs bg-purple-700 hover:bg-purple-600 text-white rounded py-1.5 transition-colors"
          >
            Buy track
          </Link>
        )}
      </div>
    </div>
  )
}

export default function MusicSearchPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [query, setQuery] = useState(searchParams.get('q') ?? '')
  const [mood, setMood] = useState(searchParams.get('mood') ?? '')
  const [genre, setGenre] = useState(searchParams.get('genre') ?? '')
  const [key, setKey] = useState(searchParams.get('key') ?? '')
  const [bpmMin, setBpmMin] = useState(searchParams.get('bpm_min') ?? '')
  const [bpmMax, setBpmMax] = useState(searchParams.get('bpm_max') ?? '')
  const [energyMin, setEnergyMin] = useState(searchParams.get('energy_min') ?? '')

  const [tracks, setTracks] = useState<TrackSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [total, setTotal] = useState<number | null>(null)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const buildQueryString = useCallback(
    (overrides: Record<string, string> = {}) => {
      const params = new URLSearchParams()
      const vals: Record<string, string> = {
        q: query, mood, genre, key, bpm_min: bpmMin, bpm_max: bpmMax,
        energy_min: energyMin, ...overrides,
      }
      Object.entries(vals).forEach(([k, v]) => { if (v) params.set(k, v) })
      return params.toString()
    },
    [query, mood, genre, key, bpmMin, bpmMax, energyMin]
  )

  const search = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const qs = buildQueryString()
      router.replace(`/music/search${qs ? `?${qs}` : ''}`, { scroll: false })
      const res = await fetch(`/api/music/search?${qs}&limit=48`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setTracks(data.tracks)
      setTotal(data.total)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Search failed')
    } finally {
      setLoading(false)
    }
  }, [buildQueryString, router])

  // Debounced auto-search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => { void search() }, 350)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, mood, genre, key, bpmMin, bpmMax, energyMin])

  const clearFilters = () => {
    setQuery(''); setMood(''); setGenre(''); setKey('')
    setBpmMin(''); setBpmMax(''); setEnergyMin('')
  }

  const hasFilters = query || mood || genre || key || bpmMin || bpmMax || energyMin

  return (
    <div className="min-h-screen pt-20 px-4 pb-16">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Link href="/music" className="text-sm text-gray-400 hover:text-white transition-colors">
            ← All music
          </Link>
          <h1 className="mt-3 text-3xl font-bold text-white">Search by sound</h1>
          <p className="mt-1 text-gray-400 text-sm">
            Find tracks by BPM, key, mood, energy — powered by Sonic DNA analysis
          </p>
        </div>

        {/* Search + Filters */}
        <div className="mb-8 space-y-4 rounded-xl border border-gray-800 bg-gray-900/40 p-5">
          {/* Text search */}
          <input
            type="search"
            placeholder="Search by title or artist…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-lg bg-gray-800 border border-gray-700 px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 transition-colors"
          />

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {/* Mood */}
            <div>
              <label className="block text-xs text-gray-400 mb-1">Mood</label>
              <select
                value={mood}
                onChange={(e) => setMood(e.target.value)}
                className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
              >
                <option value="">Any mood</option>
                {MOODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>

            {/* Genre */}
            <div>
              <label className="block text-xs text-gray-400 mb-1">Genre</label>
              <select
                value={genre}
                onChange={(e) => setGenre(e.target.value)}
                className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
              >
                <option value="">Any genre</option>
                {GENRES.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>

            {/* Key */}
            <div>
              <label className="block text-xs text-gray-400 mb-1">Key (Camelot)</label>
              <select
                value={key}
                onChange={(e) => setKey(e.target.value)}
                className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
              >
                <option value="">Any key</option>
                {KEYS.map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>

            {/* Energy */}
            <div>
              <label className="block text-xs text-gray-400 mb-1">Min energy</label>
              <select
                value={energyMin}
                onChange={(e) => setEnergyMin(e.target.value)}
                className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
              >
                <option value="">Any energy</option>
                <option value="0.3">Low 30%+</option>
                <option value="0.5">Medium 50%+</option>
                <option value="0.7">High 70%+</option>
                <option value="0.85">Peak 85%+</option>
              </select>
            </div>

            {/* BPM range */}
            <div>
              <label className="block text-xs text-gray-400 mb-1">BPM min</label>
              <input
                type="number"
                placeholder="e.g. 120"
                value={bpmMin}
                onChange={(e) => setBpmMin(e.target.value)}
                className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">BPM max</label>
              <input
                type="number"
                placeholder="e.g. 140"
                value={bpmMax}
                onChange={(e) => setBpmMax(e.target.value)}
                className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
              />
            </div>
          </div>

          {hasFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="text-xs text-gray-400 hover:text-white transition-colors"
            >
              × Clear all filters
            </button>
          )}
        </div>

        {/* Results header */}
        {total !== null && (
          <p className="text-sm text-gray-400 mb-4">
            {loading ? 'Searching…' : `${total.toLocaleString()} track${total !== 1 ? 's' : ''} found`}
          </p>
        )}

        {error && (
          <div className="mb-4 rounded-lg bg-red-950/40 border border-red-800 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-gray-800 bg-gray-900/40 overflow-hidden animate-pulse">
                <div className="aspect-square bg-gray-800" />
                <div className="p-3 space-y-2">
                  <div className="h-3 bg-gray-700 rounded w-3/4" />
                  <div className="h-3 bg-gray-800 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Results grid */}
        {!loading && tracks.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {tracks.map((track) => (
              <TrackCard key={track.id} track={track} />
            ))}
          </div>
        )}

        {!loading && tracks.length === 0 && total !== null && (
          <div className="text-center py-16">
            <p className="text-4xl mb-4">🎵</p>
            <p className="text-gray-400">No tracks found with those filters.</p>
            <button
              type="button"
              onClick={clearFilters}
              className="mt-4 text-sm text-purple-400 hover:text-purple-300"
            >
              Clear filters and browse all
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
