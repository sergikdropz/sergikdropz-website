'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNotifications } from '@/contexts/NotificationContext'
import { FaPlus, FaSearch, FaSpinner, FaTimes } from 'react-icons/fa'

type AvailableTrack = {
  id: string
  title: string
  isrc_full: string | null
  wav_url: string | null
  version?: string | null
}

type Props = {
  releaseId: string
  releaseTitle: string
  open: boolean
  onClose: () => void
  onAttached: () => void
  /** IDs already on this release — hidden from picker */
  excludeIds?: string[]
}

export default function AddTracksModal({
  releaseId,
  releaseTitle,
  open,
  onClose,
  onAttached,
  excludeIds = [],
}: Props) {
  const { showNotification } = useNotifications()
  const [tracks, setTracks] = useState<AvailableTrack[]>([])
  const [loading, setLoading] = useState(false)
  const [attaching, setAttaching] = useState(false)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const excludeSet = useMemo(() => new Set(excludeIds), [excludeIds])

  const loadAvailable = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(
        `/api/studio/releases/${encodeURIComponent(releaseId)}/tracks?available=true`
      )
      if (!res.ok) throw new Error('Failed to load tracks')
      const data = await res.json()
      setTracks(data.tracks || [])
    } catch (e: unknown) {
      showNotification(e instanceof Error ? e.message : 'Load failed', 'error')
    } finally {
      setLoading(false)
    }
  }, [releaseId, showNotification])

  useEffect(() => {
    if (open) {
      setSelected(new Set())
      setQuery('')
      loadAvailable()
    }
  }, [open, loadAvailable])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return tracks
      .filter((t) => !excludeSet.has(t.id))
      .filter((t) => {
        if (!q) return true
        return (
          t.title.toLowerCase().includes(q) ||
          t.id.toLowerCase().includes(q) ||
          (t.isrc_full || '').toLowerCase().includes(q)
        )
      })
  }, [tracks, query, excludeSet])

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleAttach() {
    if (selected.size === 0) return
    setAttaching(true)
    try {
      const res = await fetch(
        `/api/studio/releases/${encodeURIComponent(releaseId)}/tracks`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ trackIds: Array.from(selected) }),
        }
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to add tracks')

      showNotification(
        `Added ${data.successful} track${data.successful !== 1 ? 's' : ''} to "${releaseTitle}"`,
        data.failed ? 'warning' : 'success'
      )
      onAttached()
      onClose()
    } catch (e: unknown) {
      showNotification(e instanceof Error ? e.message : 'Failed to add tracks', 'error')
    } finally {
      setAttaching(false)
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-tracks-title"
    >
      <div className="w-full max-w-lg max-h-[85vh] flex flex-col rounded-2xl border border-zinc-700 bg-zinc-950 shadow-2xl shadow-violet-900/20">
        <div className="flex items-start justify-between gap-4 p-5 border-b border-zinc-800">
          <div>
            <h2 id="add-tracks-title" className="text-lg font-semibold text-white">
              Add tracks to release
            </h2>
            <p className="text-sm text-zinc-500 mt-1 truncate">{releaseTitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 transition"
            aria-label="Close"
          >
            <FaTimes />
          </button>
        </div>

        <div className="p-4 border-b border-zinc-800">
          <div className="relative">
            <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600 text-sm" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by title, ID, or ISRC…"
              className="w-full pl-9 pr-4 py-2.5 bg-zinc-900 border border-zinc-700 rounded-xl text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-violet-500"
              autoFocus
            />
          </div>
          <p className="text-xs text-zinc-600 mt-2">
            Showing unassigned catalog tracks only
          </p>
        </div>

        <div className="flex-1 overflow-y-auto min-h-[200px] p-2">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-zinc-500">
              <FaSpinner className="animate-spin mr-2" />
              Loading catalog…
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 px-4 text-sm text-zinc-500">
              {tracks.length === 0 ? (
                <>
                  No unassigned tracks.{' '}
                  <a href="/studio/tracks/new" className="text-violet-400 hover:underline">
                    Upload a track
                  </a>{' '}
                  first.
                </>
              ) : (
                'No tracks match your search.'
              )}
            </div>
          ) : (
            <ul className="space-y-1">
              {filtered.map((track) => {
                const checked = selected.has(track.id)
                return (
                  <li key={track.id}>
                    <label
                      className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition ${
                        checked
                          ? 'bg-violet-600/15 border border-violet-500/40'
                          : 'hover:bg-zinc-900 border border-transparent'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(track.id)}
                        className="rounded border-zinc-600"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-white truncate">{track.title}</p>
                        <p className="text-xs text-zinc-500 font-mono mt-0.5">
                          {track.isrc_full ? (
                            <span className="text-emerald-400/90">{track.isrc_full}</span>
                          ) : (
                            <span className="text-amber-400">No ISRC</span>
                          )}
                          {!track.wav_url && (
                            <span className="text-amber-400"> · No WAV</span>
                          )}
                        </p>
                      </div>
                    </label>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="p-4 border-t border-zinc-800 flex items-center justify-between gap-3">
          <span className="text-sm text-zinc-500">
            {selected.size} selected
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-full text-sm text-zinc-400 border border-zinc-700 hover:bg-zinc-800 transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleAttach}
              disabled={attaching || selected.size === 0}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold disabled:opacity-50 transition"
            >
              {attaching ? (
                <FaSpinner className="animate-spin" />
              ) : (
                <FaPlus className="text-xs" />
              )}
              Add to release
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
