'use client'

import { useMemo, useState } from 'react'
import { useNotifications } from '@/contexts/NotificationContext'
import {
  ISRC_IMPORT_TEMPLATE,
  SPLITS_IMPORT_TEMPLATE,
  parseIsrcImportCsv,
  parseSplitsImportCsv,
} from '@/lib/studio/import-parse'
import { FaFileImport, FaSpinner } from 'react-icons/fa'

type Tab = 'isrc' | 'splits'

type Props = {
  onApplied?: () => void
}

export default function CatalogImportPanel({ onApplied }: Props) {
  const { showNotification } = useNotifications()
  const [tab, setTab] = useState<Tab>('isrc')
  const [csv, setCsv] = useState(ISRC_IMPORT_TEMPLATE)
  const [applying, setApplying] = useState(false)
  const [lastResult, setLastResult] = useState<{
    successful: number
    failed: number
  } | null>(null)

  const preview = useMemo(() => {
    if (tab === 'isrc') return parseIsrcImportCsv(csv)
    return parseSplitsImportCsv(csv)
  }, [tab, csv])

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

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
      <div className="flex border-b border-zinc-800">
        {(['isrc', 'splits'] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              setTab(t)
              setCsv(t === 'isrc' ? ISRC_IMPORT_TEMPLATE : SPLITS_IMPORT_TEMPLATE)
              setLastResult(null)
            }}
            className={`flex-1 px-4 py-3 text-sm font-medium transition ${
              tab === t
                ? 'bg-violet-600/15 text-violet-200 border-b-2 border-violet-500'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {t === 'isrc' ? 'Bulk ISRC' : 'Split sheets'}
          </button>
        ))}
      </div>

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
          {applying ? (
            <FaSpinner className="animate-spin" />
          ) : (
            <FaFileImport />
          )}
          Apply {validCount} row{validCount !== 1 ? 's' : ''}
        </button>
      </div>
    </div>
  )
}
