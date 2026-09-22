'use client'

import { useMemo, useState } from 'react'
import { useNotifications } from '@/contexts/NotificationContext'
import {
  ISRC_IMPORT_TEMPLATE,
  SPLITS_IMPORT_TEMPLATE,
  parseIsrcImportCsv,
  parseSplitsImportCsv,
} from '@/lib/studio/import-parse'
import {
  parseDistroKidCatalogJson,
  summarizeDistroKidCatalog,
  type DistroKidCatalogExport,
} from '@/lib/studio/distrokid-import'
import { FaFileImport, FaSpinner } from 'react-icons/fa'

type Tab = 'isrc' | 'splits' | 'distrokid' | 'store-url'

type Props = {
  onApplied?: () => void
}

const DISTROKID_PLACEHOLDER = `{
  "version": 1,
  "source": "distrokid",
  "extracted_at": "2026-09-17T00:00:00.000Z",
  "releases": []
}`

const TAB_LABEL: Record<Tab, string> = {
  isrc: 'Bulk ISRC',
  splits: 'Split sheets',
  distrokid: 'DistroKid',
  'store-url': 'Store URL',
}

export default function CatalogImportPanel({ onApplied }: Props) {
  const { showNotification } = useNotifications()
  const [tab, setTab] = useState<Tab>('distrokid')
  const [csv, setCsv] = useState(ISRC_IMPORT_TEMPLATE)
  const [dkJson, setDkJson] = useState(DISTROKID_PLACEHOLDER)
  const [seedUrl, setSeedUrl] = useState('')
  const [applying, setApplying] = useState(false)
  const [dryRunning, setDryRunning] = useState(false)
  const [matchVault, setMatchVault] = useState(true)
  const [lastResult, setLastResult] = useState<{
    successful: number
    failed: number
  } | null>(null)
  const [dkLastResult, setDkLastResult] = useState<string | null>(null)
  const [urlLastResult, setUrlLastResult] = useState<string | null>(null)
  const [urlPreview, setUrlPreview] = useState<{
    title: string
    trackCount: number
    withIsrc: number
    upc: string | null
    storeLinkCount: number
    notes: string[]
  } | null>(null)

  const preview = useMemo(() => {
    if (tab === 'isrc') return parseIsrcImportCsv(csv)
    if (tab === 'splits') return parseSplitsImportCsv(csv)
    return []
  }, [tab, csv])

  const dkPreview = useMemo(() => {
    if (tab !== 'distrokid') return null
    const trimmed = dkJson.trim()
    if (!trimmed || trimmed === DISTROKID_PLACEHOLDER.trim()) {
      return { catalog: null as DistroKidCatalogExport | null, summary: null, error: null as string | null }
    }
    try {
      const catalog = parseDistroKidCatalogJson(dkJson)
      return { catalog, summary: summarizeDistroKidCatalog(catalog), error: null as string | null }
    } catch (e: unknown) {
      return {
        catalog: null as DistroKidCatalogExport | null,
        summary: null,
        error: e instanceof Error ? e.message : 'Invalid JSON',
      }
    }
  }, [tab, dkJson])

  const validCount = preview.filter((r) => !('error' in r && r.error)).length
  const errorCount = preview.filter((r) => 'error' in r && r.error).length

  async function handleApply() {
    setApplying(true)
    setLastResult(null)
    try {
      const url =
        tab === 'isrc' ? '/api/studio/isrc/bulk-assign' : '/api/studio/tracks/bulk-splits'
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Import failed')
      setLastResult({ successful: data.successful, failed: data.failed })
      showNotification(
        `Applied ${data.successful} of ${data.total} rows`,
        data.failed ? 'warning' : 'success'
      )
      onApplied?.()
    } catch (e: unknown) {
      showNotification(e instanceof Error ? e.message : 'Import failed', 'error')
    } finally {
      setApplying(false)
    }
  }

  async function handleDistroKid(dryRun: boolean) {
    if (!dkPreview?.catalog) {
      showNotification(dkPreview?.error || 'Fix DistroKid JSON first', 'error')
      return
    }
    if (dryRun) setDryRunning(true)
    else setApplying(true)
    setDkLastResult(null)
    try {
      const res = await fetch('/api/studio/releases/from-distrokid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          catalog: dkPreview.catalog,
          dryRun,
          matchVault,
          fillEmptyOnly: true,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'DistroKid import failed')
      const msg = dryRun
        ? `Dry run: ${data.created} would create, ${data.updated} would update`
        : `Imported: ${data.created} created, ${data.updated} updated`
      setDkLastResult(msg)
      showNotification(msg, 'success')
      if (!dryRun) onApplied?.()
    } catch (e: unknown) {
      showNotification(e instanceof Error ? e.message : 'DistroKid import failed', 'error')
    } finally {
      setApplying(false)
      setDryRunning(false)
    }
  }

  function onDkFile(file: File | null) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setDkJson(String(reader.result || ''))
      setDkLastResult(null)
    }
    reader.readAsText(file)
  }

  async function handleStoreUrl(dryRun: boolean) {
    if (!seedUrl.trim()) {
      showNotification('Paste a Spotify or Apple Music URL first', 'error')
      return
    }
    if (dryRun) setDryRunning(true)
    else setApplying(true)
    setUrlLastResult(null)
    setUrlPreview(null)
    try {
      const res = await fetch('/api/studio/releases/from-store-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seedUrl: seedUrl.trim(),
          dryRun,
          matchVault,
          fillEmptyOnly: true,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Store URL import failed')
      const draft = data.draft
      if (draft) {
        setUrlPreview({
          title: draft.title,
          trackCount: draft.tracks?.length || 0,
          withIsrc: (draft.tracks || []).filter((t: { isrc_full?: string }) => t.isrc_full).length,
          upc: draft.upc || null,
          storeLinkCount: draft.store_links?.length || 0,
          notes: draft.notes || [],
        })
      }
      const msg = dryRun
        ? `Dry run: would ${data.status?.replace('would_', '') || 'import'} “${draft?.title || 'release'}”`
        : `Imported “${draft?.title || 'release'}” (${data.status})`
      setUrlLastResult(msg)
      showNotification(msg, 'success')
      if (!dryRun) onApplied?.()
    } catch (e: unknown) {
      showNotification(e instanceof Error ? e.message : 'Store URL import failed', 'error')
    } finally {
      setApplying(false)
      setDryRunning(false)
    }
  }

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
      <div className="px-4 pt-3 text-xs text-zinc-500">
        Migrate & keep streams: DistroKid JSON for precision, Store URL for LANDR-style capture — both
        reuse live ISRCs/UPC and open the dual-live checklist on the release.
      </div>
      <div className="flex border-b border-zinc-800 mt-2 overflow-x-auto">
        {(['distrokid', 'store-url', 'isrc', 'splits'] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              setTab(t)
              if (t === 'isrc') setCsv(ISRC_IMPORT_TEMPLATE)
              if (t === 'splits') setCsv(SPLITS_IMPORT_TEMPLATE)
              setLastResult(null)
              setDkLastResult(null)
              setUrlLastResult(null)
            }}
            className={`flex-1 min-w-[7rem] px-3 py-3 text-sm font-medium transition ${
              tab === t
                ? 'bg-violet-600/15 text-violet-200 border-b-2 border-violet-500'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>

      {tab === 'store-url' ? (
        <div className="p-6 space-y-4">
          <p className="text-sm text-zinc-500">
            Paste a Spotify or Apple Music album/track URL. We pull titles, UPC/ISRCs when the APIs
            expose them, fan out store links, and mark the release previously released — then attach
            the <em>exact</em> original masters before redistributing.
          </p>
          <label className="inline-flex items-center gap-2 text-xs text-zinc-400">
            <input
              type="checkbox"
              checked={matchVault}
              onChange={(e) => setMatchVault(e.target.checked)}
              className="rounded border-zinc-600"
            />
            Match Music Vault by title
          </label>
          <input
            type="url"
            value={seedUrl}
            onChange={(e) => {
              setSeedUrl(e.target.value)
              setUrlLastResult(null)
              setUrlPreview(null)
            }}
            placeholder="https://open.spotify.com/album/… or music.apple.com/…"
            className="w-full font-mono text-sm bg-zinc-950 border border-zinc-700 rounded-xl px-4 py-3 text-emerald-100/90 focus:outline-none focus:border-violet-500"
          />
          {urlPreview ? (
            <div className="rounded-lg border border-zinc-800 px-3 py-3 text-xs space-y-1">
              <p className="text-zinc-200 font-medium">{urlPreview.title}</p>
              <p className="text-zinc-500">
                {urlPreview.trackCount} tracks · {urlPreview.withIsrc} ISRCs · UPC{' '}
                {urlPreview.upc || '—'} · {urlPreview.storeLinkCount} store links
              </p>
              {urlPreview.notes.slice(0, 4).map((note) => (
                <p key={note} className="text-amber-400/90">
                  {note}
                </p>
              ))}
            </div>
          ) : null}
          {urlLastResult ? <p className="text-xs text-zinc-400">{urlLastResult}</p> : null}
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => handleStoreUrl(true)}
              disabled={dryRunning || applying || !seedUrl.trim()}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-full border border-zinc-600 text-zinc-200 font-semibold text-sm disabled:opacity-50 transition hover:border-zinc-400"
            >
              {dryRunning ? <FaSpinner className="animate-spin" /> : null}
              Dry run
            </button>
            <button
              type="button"
              onClick={() => handleStoreUrl(false)}
              disabled={applying || dryRunning || !seedUrl.trim()}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-violet-600 hover:bg-violet-500 text-white font-semibold text-sm disabled:opacity-50 transition"
            >
              {applying ? <FaSpinner className="animate-spin" /> : <FaFileImport />}
              Import release
            </button>
          </div>
        </div>
      ) : tab === 'distrokid' ? (
        <div className="p-6 space-y-4">
          <p className="text-sm text-zinc-500">
            Paste a DistroKid My Music export JSON (UPC, ISRCs, artwork, store links). While logged
            into DistroKid, run the extractor in{' '}
            <code className="text-zinc-400">web/docs/admin/DISTROKID_IMPORT.md</code>, then paste
            here. Masters stay metadata-first; unique vault title matches attach provisional audio.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
              <input
                type="file"
                accept="application/json,.json"
                className="text-xs text-zinc-500 file:mr-2 file:rounded-full file:border-0 file:bg-zinc-800 file:px-3 file:py-1.5 file:text-zinc-200"
                onChange={(e) => onDkFile(e.target.files?.[0] || null)}
              />
            </label>
            <label className="inline-flex items-center gap-2 text-xs text-zinc-400">
              <input
                type="checkbox"
                checked={matchVault}
                onChange={(e) => setMatchVault(e.target.checked)}
                className="rounded border-zinc-600"
              />
              Match Music Vault by title
            </label>
          </div>

          <textarea
            value={dkJson}
            onChange={(e) => {
              setDkJson(e.target.value)
              setDkLastResult(null)
            }}
            rows={14}
            className="w-full font-mono text-xs bg-zinc-950 border border-zinc-700 rounded-xl px-4 py-3 text-emerald-100/90 focus:outline-none focus:border-violet-500"
            spellCheck={false}
          />

          <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
            {dkPreview?.error ? (
              <span className="text-amber-400">{dkPreview.error}</span>
            ) : dkPreview?.summary ? (
              <span className="text-zinc-500">
                Preview:{' '}
                <span className="text-emerald-400">
                  {dkPreview.summary.releaseCount} releases
                </span>
                {' · '}
                {dkPreview.summary.trackCount} tracks · {dkPreview.summary.withUpc} with UPC ·{' '}
                {dkPreview.summary.withIsrc} ISRCs
                {dkPreview.summary.missingIsrc > 0 && (
                  <>
                    {' '}
                    · <span className="text-amber-400">{dkPreview.summary.missingIsrc} missing ISRC</span>
                  </>
                )}
              </span>
            ) : (
              <span className="text-zinc-600">Paste DistroKid JSON to preview</span>
            )}
            {dkLastResult && <span className="text-zinc-400">{dkLastResult}</span>}
          </div>

          {dkPreview?.summary && (
            <div className="max-h-48 overflow-y-auto rounded-lg border border-zinc-800 divide-y divide-zinc-800">
              {dkPreview.summary.releases.map((row) => (
                <div
                  key={row.albumuuid}
                  className="px-3 py-2 text-xs flex justify-between gap-2 font-mono"
                >
                  <span className="text-zinc-300 truncate flex-1">
                    {row.title}{' '}
                    <span className="text-zinc-600">({row.type})</span>
                  </span>
                  <span className="text-zinc-500 shrink-0">
                    {row.trackCount} tr · UPC {row.upc || '—'} · {row.isrcCount} ISRC
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => handleDistroKid(true)}
              disabled={dryRunning || applying || !dkPreview?.catalog}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-full border border-zinc-600 text-zinc-200 font-semibold text-sm disabled:opacity-50 transition hover:border-zinc-400"
            >
              {dryRunning ? <FaSpinner className="animate-spin" /> : null}
              Dry run
            </button>
            <button
              type="button"
              onClick={() => handleDistroKid(false)}
              disabled={applying || dryRunning || !dkPreview?.catalog}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-violet-600 hover:bg-violet-500 text-white font-semibold text-sm disabled:opacity-50 transition"
            >
              {applying ? <FaSpinner className="animate-spin" /> : <FaFileImport />}
              Import releases
            </button>
          </div>
        </div>
      ) : (
        <div className="p-6 space-y-4">
          <p className="text-sm text-zinc-500">
            {tab === 'isrc'
              ? 'Paste CSV with track_id or title. Use AUTO to generate new ISRCs, or paste existing codes.'
              : 'Paste CSV with splits as Name:50, Name2:50 — must total 100% per row.'}
          </p>

          <textarea
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            rows={12}
            className="w-full font-mono text-xs bg-zinc-950 border border-zinc-700 rounded-xl px-4 py-3 text-emerald-100/90 focus:outline-none focus:border-violet-500"
            spellCheck={false}
          />

          <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
            <span className="text-zinc-500">
              Preview: <span className="text-emerald-400">{validCount} ok</span>
              {errorCount > 0 && (
                <>
                  {' '}
                  · <span className="text-amber-400">{errorCount} issues</span>
                </>
              )}
            </span>
            {lastResult && (
              <span className="text-zinc-400">
                Last run: {lastResult.successful} ok, {lastResult.failed} failed
              </span>
            )}
          </div>

          <div className="max-h-40 overflow-y-auto rounded-lg border border-zinc-800 divide-y divide-zinc-800">
            {preview.slice(0, 20).map((row, i) => (
              <div
                key={i}
                className="px-3 py-2 text-xs flex justify-between gap-2 font-mono"
              >
                <span className="text-zinc-400">L{row.line}</span>
                <span className="text-zinc-300 truncate flex-1">
                  {'track_id' in row && row.track_id}
                  {'title' in row && row.title}
                  {'isrc' in row && row.isrc && ` → ${row.isrc}`}
                  {'splits' in row &&
                    row.splits?.map((s) => `${s.name}:${s.percentage}`).join(', ')}
                </span>
                {'error' in row && row.error ? (
                  <span className="text-amber-400 shrink-0">{row.error}</span>
                ) : (
                  <span className="text-emerald-500 shrink-0">✓</span>
                )}
              </div>
            ))}
            {preview.length > 20 && (
              <p className="px-3 py-2 text-xs text-zinc-600">+{preview.length - 20} more rows</p>
            )}
          </div>

          <button
            type="button"
            onClick={handleApply}
            disabled={applying || validCount === 0}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-violet-600 hover:bg-violet-500 text-white font-semibold text-sm disabled:opacity-50 transition"
          >
            {applying ? <FaSpinner className="animate-spin" /> : <FaFileImport />}
            Apply {validCount} row{validCount !== 1 ? 's' : ''}
          </button>
        </div>
      )}
    </div>
  )
}
