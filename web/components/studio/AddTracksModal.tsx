'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNotifications } from '@/contexts/NotificationContext'
import { studioCreateHref } from '@/lib/studio/studio-ia'
import { FaPlus, FaSearch, FaSpinner, FaTimes } from 'react-icons/fa'

type AvailableTrack = {
  id: string
  title: string
  isrc_full: string | null
  wav_url: string | null
  version?: string | null
  source?: 'studio' | 'vault'
  genre?: string | null
  availability?: 'available' | 'on_other_release'
  availability_release_id?: string | null
  availability_release_title?: string | null
  folder_id?: string | null
  folder_name?: string | null
  folder_type?: string | null
  catalog_kind?: 'ep' | 'single'
  catalog_label?: string
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
  const [source, setSource] = useState<'studio' | 'vault'>('studio')
  const [tracks, setTracks] = useState<AvailableTrack[]>([])
  const [loading, setLoading] = useState(false)
  const [attaching, setAttaching] = useState(false)
  const [kind, setKind] = useState<'all' | 'ep' | 'single'>('all')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const excludeSet = useMemo(() => new Set(excludeIds), [excludeIds])

  const loadAvailable = useCallback(
    async (search = '') => {
      setLoading(true)
      try {
        const qs =
          source === 'vault'
            ? `available=true&source=vault&kind=${kind}${
                search.trim() ? `&q=${encodeURIComponent(search.trim())}` : ''
              }`
            : `available=true`
        const res = await fetch(
          `/api/studio/releases/${encodeURIComponent(releaseId)}/tracks?${qs}`,
        )
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}))
          throw new Error(errBody.error || 'Failed to load tracks')
        }
        const data = await res.json()
        setTracks(data.tracks || [])
      } catch (e: unknown) {
        showNotification(e instanceof Error ? e.message : 'Load failed', 'error')
      } finally {
        setLoading(false)
      }
    },
    [releaseId, showNotification, source, kind],
  )

  useEffect(() => {
    if (!open) return
    setSelected(new Set())
    setQuery('')
    setKind('all')
  }, [open, source])

  useEffect(() => {
    if (!open) return
    if (source !== 'vault') {
      void loadAvailable()
      return
    }
    const handle = window.setTimeout(() => {
      void loadAvailable(query)
    }, query ? 250 : 0)
    return () => window.clearTimeout(handle)
  }, [open, source, query, kind, loadAvailable])

  const filtered = useMemo(() => {
    const list = tracks.filter((t) => !excludeSet.has(t.id))
    if (source === 'vault') return list
    const q = query.trim().toLowerCase()
    if (!q) return list
    return list.filter((t) => {
      return (
        t.title.toLowerCase().includes(q) ||
        t.id.toLowerCase().includes(q) ||
        (t.isrc_full || '').toLowerCase().includes(q) ||
        (t.genre || '').toLowerCase().includes(q)
      )
    })
  }, [tracks, query, excludeSet, source])

  const groups = useMemo(() => {
    if (source !== 'vault') return []
    const map = new Map<
      string,
      { id: string; name: string; label: string; kind: 'ep' | 'single'; tracks: AvailableTrack[] }
    >()
    for (const track of filtered) {
      const id = track.folder_id || 'single'
      const existing = map.get(id)
      if (existing) {
        existing.tracks.push(track)
        continue
      }
      map.set(id, {
        id,
        name: track.folder_name || 'Singles',
        label: track.catalog_label || (track.catalog_kind === 'single' ? 'Single' : 'EP'),
        kind: track.catalog_kind || 'ep',
        tracks: [track],
      })
    }
    return Array.from(map.values()).sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'ep' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
  }, [filtered, source])

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleGroup(trackIds: string[]) {
    const unlocked = trackIds.filter((id) => {
      const track = tracks.find((t) => t.id === id)
      return track?.availability !== 'on_other_release'
    })
    if (!unlocked.length) return
    setSelected((prev) => {
      const next = new Set(prev)
      const allOn = unlocked.every((id) => next.has(id))
      for (const id of unlocked) {
        if (allOn) next.delete(id)
        else next.add(id)
      }
      return next
    })
  }

  async function handleAttach() {
    if (selected.size === 0) return
    setAttaching(true)
    try {
      const body =
        source === 'vault'
          ? { vaultTrackIds: Array.from(selected) }
          : { trackIds: Array.from(selected) }
      const res = await fetch(
        `/api/studio/releases/${encodeURIComponent(releaseId)}/tracks`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to add tracks')

      showNotification(
        `Added ${data.successful} track${data.successful !== 1 ? 's' : ''} to "${releaseTitle}"`,
        data.failed ? 'warning' : 'success',
      )
      const mastersMissing = Number(data.masters?.missing || 0)
      const mastersPulled =
        Number(data.masters?.linked || 0) + Number(data.masters?.ingested || 0)
      if (mastersPulled > 0) {
        showNotification(
          `Pulled ${mastersPulled} master${mastersPulled === 1 ? '' : 's'} from local drive / DSP Masters`,
          'success',
        )
      }
      if (mastersMissing > 0) {
        showNotification(
          `Locate ${mastersMissing} missing master WAV${mastersMissing === 1 ? '' : 's'} in Catalog`,
          'error',
        )
      }
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

        <div className="p-4 border-b border-zinc-800 space-y-3">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setSource('studio')}
              className={`px-3 py-1.5 rounded-full text-xs font-medium ${
                source === 'studio'
                  ? 'bg-violet-600 text-white'
                  : 'bg-zinc-800 text-zinc-400'
              }`}
            >
              Studio catalog
            </button>
            <button
              type="button"
              onClick={() => setSource('vault')}
              className={`px-3 py-1.5 rounded-full text-xs font-medium ${
                source === 'vault'
                  ? 'bg-violet-600 text-white'
                  : 'bg-zinc-800 text-zinc-400'
              }`}
            >
              Music Vault
            </button>
          </div>
          <div className="relative">
            <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600 text-sm" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                source === 'vault'
                  ? 'Search EPs and singles…'
                  : 'Search by title, ID, or ISRC…'
              }
              className="w-full pl-9 pr-4 py-2.5 bg-zinc-900 border border-zinc-700 rounded-xl text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-violet-500"
              autoFocus
            />
          </div>
          {source === 'vault' ? (
            <div className="flex gap-2">
              {(
                [
                  ['all', 'EPs & singles'],
                  ['ep', 'EPs'],
                  ['single', 'Singles'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setKind(id)}
                  className={`px-3 py-1 rounded-full text-[11px] font-medium ${
                    kind === id ? 'bg-zinc-100 text-zinc-900' : 'bg-zinc-800 text-zinc-400'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : null}
          <p className="text-xs text-zinc-600">
            {source === 'vault'
              ? 'EPs plus catalog tracks not assigned to an EP. Playlists stay in the vault.'
              : 'Showing unassigned studio catalog tracks only'}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto min-h-[200px] p-2">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-zinc-500">
              <FaSpinner className="animate-spin mr-2" />
              Loading…
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 px-4 text-sm text-zinc-500">
              {tracks.length === 0 ? (
                source === 'vault' ? (
                  query.trim() ? (
                    'No vault tracks match that search.'
                  ) : (
                    'No vault catalog tracks found.'
                  )
                ) : (
                  <>
                    No unassigned tracks.{' '}
                    <a href={studioCreateHref('track')} className="text-violet-400 hover:underline">
                      Upload a track
                    </a>{' '}
                    first.
                  </>
                )
              ) : (
                'No tracks match your search.'
              )}
            </div>
          ) : (
            <ul className="space-y-3">
              {(source === 'vault' ? groups : [{ id: 'studio', name: '', label: '', kind: 'ep' as const, tracks: filtered }]).map(
                (group) => (
                  <li key={group.id}>
                    {source === 'vault' && group.name ? (
                      <div className="flex items-center justify-between gap-2 px-3 py-1.5">
                        <p className="text-[11px] uppercase tracking-wide text-zinc-500">
                          <span className="text-violet-300">{group.label}</span>
                          <span className="text-zinc-600"> · </span>
                          <span className="text-zinc-300 normal-case tracking-normal font-medium">
                            {group.name}
                          </span>
                          <span className="text-zinc-600"> · {group.tracks.length}</span>
                        </p>
                        <button
                          type="button"
                          onClick={() => toggleGroup(group.tracks.map((t) => t.id))}
                          className="text-[11px] text-violet-300 hover:text-violet-200"
                        >
                          {group.kind === 'single' ? 'Select all' : 'Select EP'}
                        </button>
                      </div>
                    ) : null}
                    <ul className="space-y-1">
                      {group.tracks.map((track) => {
                        const checked = selected.has(track.id)
                        const locked = track.availability === 'on_other_release'
                        return (
                          <li key={track.id}>
                            <label
                              className={`flex items-center gap-3 p-3 rounded-xl transition ${
                                locked
                                  ? 'opacity-60 cursor-not-allowed border border-transparent'
                                  : checked
                                    ? 'cursor-pointer bg-violet-600/15 border border-violet-500/40'
                                    : 'cursor-pointer hover:bg-zinc-900 border border-transparent'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={locked}
                                onChange={() => toggle(track.id)}
                                className="rounded border-zinc-600"
                              />
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-white truncate">{track.title}</p>
                                <p className="text-xs text-zinc-500 font-mono mt-0.5">
                                  {locked ? (
                                    <span className="text-amber-400">
                                      {track.availability_release_title
                                        ? `Already on “${track.availability_release_title}”`
                                        : 'Already on another release'}
                                    </span>
                                  ) : source === 'vault' ? (
                                    <>
                                      {track.catalog_kind === 'single' && track.folder_name ? (
                                        <span className="text-zinc-400">{track.folder_name}</span>
                                      ) : null}
                                      {track.catalog_kind === 'single' && track.folder_name && track.genre
                                        ? ' · '
                                        : null}
                                      {track.genre && (
                                        <span className="text-zinc-400">{track.genre}</span>
                                      )}
                                    </>
                                  ) : track.isrc_full ? (
                                    <span className="text-emerald-400/90">{track.isrc_full}</span>
                                  ) : (
                                    <span className="text-amber-400">No ISRC</span>
                                  )}
                                  {!track.wav_url && (
                                    <span className="text-amber-400"> · No audio</span>
                                  )}
                                </p>
                              </div>
                            </label>
                          </li>
                        )
                      })}
                    </ul>
                  </li>
                ),
              )}
            </ul>
          )}
        </div>

        <div className="p-4 border-t border-zinc-800 flex items-center justify-between gap-3">
          <span className="text-sm text-zinc-500">{selected.size} selected</span>
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
