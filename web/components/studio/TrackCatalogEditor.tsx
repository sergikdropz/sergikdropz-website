'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useNotifications } from '@/contexts/NotificationContext'
import {
  parseSplitsString,
  validateSplitsTotal,
  type SplitRow,
} from '@/lib/studio/import-parse'
import AiField from '@/components/AiField'
import AddTracksModal from './AddTracksModal'
import { FaPlus, FaSave, FaSpinner, FaUnlink } from 'react-icons/fa'

export type CatalogTrack = {
  id: string
  title: string
  isrc_full: string | null
  wav_url: string | null
  splits: SplitRow[] | unknown
  version?: string | null
}

type Props = {
  tracks: CatalogTrack[]
  releaseId: string
  releaseTitle: string
  onUpdated: () => void
}

function normalizeSplits(raw: unknown): SplitRow[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((s) => s && typeof s === 'object')
    .map((s) => ({
      name: String((s as SplitRow).name || ''),
      percentage: Number((s as SplitRow).percentage) || 0,
    }))
}

export default function TrackCatalogEditor({
  tracks,
  releaseId,
  releaseTitle,
  onUpdated,
}: Props) {
  const { showNotification } = useNotifications()
  const [pickerOpen, setPickerOpen] = useState(false)
  const [assigningId, setAssigningId] = useState<string | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [splitDraft, setSplitDraft] = useState('')
  const [savingSplits, setSavingSplits] = useState(false)

  async function assignIsrc(trackId: string) {
    setAssigningId(trackId)
    try {
      const res = await fetch('/api/studio/isrc/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'ISRC failed')
      showNotification(`ISRC: ${data.isrc}`, 'success')
      onUpdated()
    } catch (e: unknown) {
      showNotification(e instanceof Error ? e.message : 'ISRC failed', 'error')
    } finally {
      setAssigningId(null)
    }
  }

  async function removeFromRelease(trackId: string, title: string) {
    if (
      !confirm(
        `Remove "${title}" from this release? The track stays in your catalog.`
      )
    ) {
      return
    }
    setRemovingId(trackId)
    try {
      const res = await fetch(
        `/api/studio/releases/${encodeURIComponent(releaseId)}/tracks?trackId=${encodeURIComponent(trackId)}`,
        { method: 'DELETE' }
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to remove')
      showNotification('Track removed from release', 'success')
      onUpdated()
    } catch (e: unknown) {
      showNotification(e instanceof Error ? e.message : 'Remove failed', 'error')
    } finally {
      setRemovingId(null)
    }
  }

  function startEditSplits(track: CatalogTrack) {
    const splits = normalizeSplits(track.splits)
    setEditingId(track.id)
    setSplitDraft(splits.map((s) => `${s.name}:${s.percentage}`).join(', '))
  }

  async function saveSplits(trackId: string) {
    const splits = parseSplitsString(splitDraft)
    const err = validateSplitsTotal(splits)
    if (err) {
      showNotification(err, 'error')
      return
    }
    setSavingSplits(true)
    try {
      const res = await fetch(`/api/studio/tracks/${trackId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ splits }),
      })
      if (!res.ok) throw new Error('Failed to save splits')
      showNotification('Splits saved', 'success')
      setEditingId(null)
      onUpdated()
    } catch (e: unknown) {
      showNotification(e instanceof Error ? e.message : 'Save failed', 'error')
    } finally {
      setSavingSplits(false)
    }
  }

  return (
    <>
      <AddTracksModal
        releaseId={releaseId}
        releaseTitle={releaseTitle}
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onAttached={onUpdated}
        excludeIds={tracks.map((t) => t.id)}
      />

      <div className="rounded-xl border border-zinc-800 overflow-hidden">
        <div className="p-4 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Catalog ({tracks.length})</h2>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-violet-600 hover:bg-violet-500 text-white font-medium transition"
            >
              <FaPlus className="text-[10px]" />
              Add tracks
            </button>
            <Link
              href="/studio/catalog/import"
              className="text-xs text-violet-400 hover:text-violet-300 px-2"
            >
              Bulk import
            </Link>
          </div>
        </div>

        {tracks.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm text-zinc-500 mb-4">
              No tracks on this release yet.
            </p>
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold"
            >
              <FaPlus />
              Add from catalog
            </button>
            <p className="text-xs text-zinc-600 mt-4">
              Or{' '}
              <Link href="/studio/tracks/new" className="text-violet-400">
                upload a new track
              </Link>
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-zinc-800">
            {tracks.map((track) => {
              const splits = normalizeSplits(track.splits)
              const splitTotal = splits.reduce((s, r) => s + r.percentage, 0)
              const isEditing = editingId === track.id

              return (
                <li key={track.id} className="p-4 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-white">{track.title}</p>
                      <p className="text-xs text-zinc-500 font-mono mt-1">
                        {track.isrc_full ? (
                          <span className="text-emerald-400">{track.isrc_full}</span>
                        ) : (
                          <span className="text-amber-400">No ISRC</span>
                        )}
                        {!track.wav_url && (
                          <span className="text-amber-400 ml-2">· No WAV</span>
                        )}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {!track.isrc_full && (
                        <button
                          type="button"
                          onClick={() => assignIsrc(track.id)}
                          disabled={assigningId === track.id}
                          className="text-xs px-3 py-1.5 rounded-full border border-violet-500/40 text-violet-200 hover:bg-violet-500/10 disabled:opacity-50"
                        >
                          {assigningId === track.id ? (
                            <FaSpinner className="animate-spin inline" />
                          ) : (
                            'Assign ISRC'
                          )}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          isEditing ? setEditingId(null) : startEditSplits(track)
                        }
                        className="text-xs px-3 py-1.5 rounded-full border border-zinc-600 text-zinc-300 hover:bg-zinc-800"
                      >
                        {isEditing ? 'Cancel' : 'Edit splits'}
                      </button>
                      <button
                        type="button"
                        onClick={() => removeFromRelease(track.id, track.title)}
                        disabled={removingId === track.id}
                        className="text-xs px-3 py-1.5 rounded-full border border-zinc-700 text-zinc-500 hover:text-red-400 hover:border-red-900/50 disabled:opacity-50"
                        title="Remove from release"
                      >
                        {removingId === track.id ? (
                          <FaSpinner className="animate-spin" />
                        ) : (
                          <FaUnlink className="inline" />
                        )}
                      </button>
                    </div>
                  </div>

                  {!isEditing && splits.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {splits.map((s) => (
                        <span
                          key={s.name}
                          className="text-xs px-2 py-1 rounded-full bg-zinc-800 text-zinc-300"
                        >
                          {s.name}: {s.percentage}%
                        </span>
                      ))}
                      {Math.abs(splitTotal - 100) > 0.01 && (
                        <span className="text-xs text-amber-400">
                          Total {splitTotal}%
                        </span>
                      )}
                    </div>
                  )}

                  {isEditing && (
                    <div className="flex gap-2">
                      <AiField
                        fieldKey="track.splits"
                        label="Track splits"
                        entityType="distribution_track"
                        entityId={track.id}
                        entityLabel={track.title}
                        hint="Comma-separated name:percentage, must total 100%"
                        formId="release_catalog"
                        type="text"
                        value={splitDraft}
                        onChange={(e) => setSplitDraft(e.target.value)}
                        placeholder="SERGIK:100 or SERGIK:50, Producer:50"
                        className="flex-1 bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => saveSplits(track.id)}
                        disabled={savingSplits}
                        className="inline-flex items-center gap-1 px-4 py-2 rounded-lg bg-violet-600 text-white text-sm disabled:opacity-50"
                      >
                        <FaSave />
                        Save
                      </button>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </>
  )
}
