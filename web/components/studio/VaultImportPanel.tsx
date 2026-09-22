'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { FaCompactDisc, FaSpinner, FaMagic } from 'react-icons/fa'

export type VaultFolderOption = {
  id: string
  name: string
  type: string
  artwork_url?: string | null
  year?: number | null
  trackCount?: number
  genre?: string | null
}

type Props = {
  /** When set, fills this release instead of creating a new one. */
  releaseId?: string
  onImported: (result: {
    releaseId: string
    created: boolean
    title: string
    trackCount: number
  }) => void
  compact?: boolean
}

export default function VaultImportPanel({ releaseId, onImported, compact }: Props) {
  const [folders, setFolders] = useState<VaultFolderOption[]>([])
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/studio/vault-folders')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load vault folders')
      setFolders(data.folders || [])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load vault')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return folders
    return folders.filter(
      (f) =>
        f.name.toLowerCase().includes(q) ||
        f.id.toLowerCase().includes(q) ||
        f.type.toLowerCase().includes(q),
    )
  }, [folders, query])

  async function handleImport() {
    if (!selectedId) return
    setImporting(true)
    setError(null)
    try {
      const res = await fetch('/api/studio/releases/from-vault', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          folderId: selectedId,
          releaseId: releaseId || undefined,
          fillEmptyOnly: Boolean(releaseId),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Import failed')
      onImported({
        releaseId: data.release?.id,
        created: Boolean(data.created),
        title: data.release?.title || 'Release',
        trackCount: Array.isArray(data.tracks) ? data.tracks.length : 0,
      })
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div
      className={
        compact
          ? 'rounded-xl border border-violet-500/30 bg-violet-950/20 p-4 space-y-3'
          : 'rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 space-y-4'
      }
    >
      <div className="flex items-start gap-3">
        <FaCompactDisc className="text-violet-400 mt-1 shrink-0" />
        <div>
          <h3 className="font-semibold text-white text-sm">
            {releaseId ? 'Fill from Music Vault' : 'Import from Music Vault'}
          </h3>
          <p className="text-xs text-zinc-500 mt-1">
            Pull title, artwork, genre/subgenre (Sonic DNA), dates, and link vault tracks
            from EPs and singles. Crates and playlists stay in Music Vault.
          </p>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-zinc-500 flex items-center gap-2">
          <FaSpinner className="animate-spin" /> Loading vault folders…
        </p>
      ) : (
        <>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search EPs and singles…"
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
          />
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-violet-500"
          >
            <option value="">Select an EP or single…</option>
            {filtered.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name} ({f.type === 'single' ? 'single' : 'EP'}
                {f.trackCount != null ? ` · ${f.trackCount} tracks` : ''}
                {f.year ? ` · ${f.year}` : ''})
              </option>
            ))}
          </select>
        </>
      )}

      {error && <p className="text-sm text-amber-400">{error}</p>}

      <button
        type="button"
        disabled={!selectedId || importing || loading}
        onClick={handleImport}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold disabled:opacity-40"
      >
        {importing ? <FaSpinner className="animate-spin" /> : <FaMagic />}
        {releaseId ? 'Fill metadata & link tracks' : 'Create release from vault'}
      </button>
    </div>
  )
}
