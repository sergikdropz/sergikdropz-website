'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useNotifications } from '@/contexts/NotificationContext'
import { studioReleaseHref } from '@/lib/studio/studio-ia'
import { formatISRCDisplay } from '@/lib/studio/isrc-format'
import type { RegistryTrackRow, SoundExchangeRegistryStats } from '@/lib/studio/soundexchange'
import {
  FaCheckCircle,
  FaDownload,
  FaExclamationCircle,
  FaExternalLinkAlt,
  FaRedo,
  FaSearch,
  FaUpload,
} from 'react-icons/fa'

type RegistryResponse = {
  configured: boolean
  mode: 'local' | 'remote'
  registrant: {
    name: string
    prefix: string
    recordingArtist: string
    soundExchangeRegistrantId?: string
    membership?: {
      performer: {
        sxid: string
        type: string
        membershipDate: string
        mandateDate: string
        mandateTerritories: string
        status: string
      }
      rightsOwner: {
        sxid: string
        type: string
        membershipDate: string
        mandateDate: string
        mandateTerritories: string
        status: string
      }
    }
  }
  isrc: { prefix: string; year: number; example: string; exampleDisplay: string }
  stats: SoundExchangeRegistryStats
  catalog: RegistryTrackRow[]
  pending: RegistryTrackRow[]
  submissions: Array<{
    id: string
    isrc: string
    isrcDisplay?: string
    status: string
    submitted_at?: string | null
    error?: string | null
    track_id?: string | null
    trackTitle?: string | null
    trackVersion?: string | null
    artist?: string | null
    releaseId?: string | null
    releaseTitle?: string | null
  }>
}

type LookupResult = {
  isrc: string
  isrcDisplay: string | null
  found: boolean
  source: string
  track: RegistryTrackRow | null
  publicLookupUrl: string
  remoteConfigured: boolean
}

export default function SoundExchangePanel() {
  const { showNotification } = useNotifications()
  const [registry, setRegistry] = useState<RegistryResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [lookupIsrc, setLookupIsrc] = useState('')
  const [lookupResult, setLookupResult] = useState<LookupResult | null>(null)
  const [lookupLoading, setLookupLoading] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [filter, setFilter] = useState<'pending' | 'all' | 'submitted'>('pending')

  const loadRegistry = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/studio/soundexchange/registry')
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to load registry')
      setRegistry(data)
      setSelected(new Set((data.pending || []).slice(0, 25).map((row: RegistryTrackRow) => row.trackId)))
    } catch (error: unknown) {
      showNotification(error instanceof Error ? error.message : 'Registry load failed', 'error')
    } finally {
      setLoading(false)
    }
  }, [showNotification])

  useEffect(() => {
    void loadRegistry()
  }, [loadRegistry])

  const rows = useMemo(() => {
    if (!registry) return []
    if (filter === 'pending') return registry.pending
    if (filter === 'submitted') {
      return registry.catalog.filter(
        (row) => row.submissionStatus === 'submitted' || row.submissionStatus === 'accepted',
      )
    }
    return registry.catalog
  }, [registry, filter])

  async function handleLookup(e?: React.FormEvent) {
    e?.preventDefault()
    if (!lookupIsrc.trim()) {
      showNotification('Enter an ISRC', 'error')
      return
    }
    setLookupLoading(true)
    setLookupResult(null)
    try {
      const res = await fetch(
        `/api/studio/soundexchange/lookup?isrc=${encodeURIComponent(lookupIsrc.trim())}`,
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Lookup failed')
      setLookupResult(data)
    } catch (error: unknown) {
      showNotification(error instanceof Error ? error.message : 'Lookup failed', 'error')
    } finally {
      setLookupLoading(false)
    }
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectVisible() {
    setSelected(new Set(rows.filter((r) => r.selectable || filter !== 'pending').map((r) => r.trackId)))
  }

  async function registerSelected() {
    if (!selected.size) {
      showNotification('Select at least one track', 'error')
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/studio/soundexchange/batch-submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackIds: [...selected] }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Batch register failed')
      showNotification(
        `Registered ${data.successful || 0}/${data.total || 0} ISRCs (${data.mode || 'local'})`,
        'success',
      )
      await loadRegistry()
    } catch (error: unknown) {
      showNotification(error instanceof Error ? error.message : 'Register failed', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function markAccepted() {
    const isrcs = rows
      .filter((row) => selected.has(row.trackId) && row.submissionStatus === 'submitted')
      .map((row) => row.isrc)
    if (!isrcs.length) {
      showNotification('Select submitted ISRCs to mark accepted', 'error')
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/studio/soundexchange/submissions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isrcs, status: 'accepted' }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Update failed')
      showNotification(`Marked ${data.updated} accepted`, 'success')
      await loadRegistry()
    } catch (error: unknown) {
      showNotification(error instanceof Error ? error.message : 'Update failed', 'error')
    } finally {
      setBusy(false)
    }
  }

  function downloadCsv(scope: 'pending' | 'all') {
    window.location.href = `/api/studio/soundexchange/registry?format=csv&scope=${scope}`
  }

  if (loading && !registry) {
    return (
      <div className="flex items-center justify-center py-20 text-zinc-500">Loading ISRC registry…</div>
    )
  }

  const stats = registry?.stats

  return (
    <div className="space-y-6" data-testid="soundexchange-panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-sm text-zinc-500 max-w-2xl">
          Local-first SoundExchange registry for{' '}
          <span className="text-zinc-300 font-mono">{registry?.isrc.prefix || 'QTA53'}</span> codes.
          Register here to update Studio data, then export the USISRC locker CSV for{' '}
          <a
            href="https://isrc.soundexchange.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-violet-400 hover:text-violet-300"
          >
            isrc.soundexchange.com
          </a>
          . Mint missing codes from a release or{' '}
          <Link href="/studio/create?tab=track" className="text-violet-400 hover:text-violet-300">
            Create → Track
          </Link>
          .
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void loadRegistry()}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-zinc-700 text-xs text-zinc-300 hover:border-zinc-500"
          >
            <FaRedo className="text-[10px]" /> Refresh
          </button>
          <button
            type="button"
            onClick={() => downloadCsv('pending')}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-zinc-700 text-xs text-zinc-300 hover:border-zinc-500"
          >
            <FaDownload className="text-[10px]" /> Export pending CSV
          </button>
          <button
            type="button"
            onClick={() => downloadCsv('all')}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-zinc-700 text-xs text-zinc-300 hover:border-zinc-500"
          >
            <FaDownload className="text-[10px]" /> Export all CSV
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3" data-testid="sx-stats">
        {[
          { label: 'Minted', value: stats?.minted ?? 0 },
          { label: 'Our prefix', value: stats?.ourPrefix ?? 0 },
          { label: 'Pending', value: stats?.pending ?? 0 },
          { label: 'Submitted', value: stats?.submitted ?? 0 },
          { label: 'Accepted', value: stats?.accepted ?? 0 },
          { label: 'Mode', value: registry?.mode === 'remote' ? 'Remote' : 'Local' },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-3 py-3"
          >
            <p className="text-[11px] uppercase tracking-wider text-zinc-500">{card.label}</p>
            <p className="text-lg text-white mt-1 font-medium">{card.value}</p>
          </div>
        ))}
      </div>

      <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
        <h2 className="text-sm font-medium text-white mb-3">ISRC lookup</h2>
        <form onSubmit={handleLookup} className="flex flex-wrap gap-2">
          <input
            data-testid="sx-lookup-input"
            value={lookupIsrc}
            onChange={(e) => setLookupIsrc(e.target.value)}
            placeholder={registry?.isrc.exampleDisplay || 'QT-A53-26-00001'}
            className="flex-1 min-w-[220px] bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white font-mono"
          />
          <button
            type="submit"
            disabled={lookupLoading}
            data-testid="sx-lookup-submit"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium disabled:opacity-50"
          >
            <FaSearch className="text-xs" />
            {lookupLoading ? 'Looking up…' : 'Lookup'}
          </button>
        </form>

        {lookupResult ? (
          <div
            data-testid="sx-lookup-result"
            className="mt-4 rounded-lg border border-zinc-800 bg-zinc-950/70 p-4 space-y-2"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-white">
                {lookupResult.isrcDisplay || lookupResult.isrc}
              </span>
              <span
                className={`text-[11px] px-1.5 py-0.5 rounded ${
                  lookupResult.found
                    ? 'bg-emerald-500/15 text-emerald-300'
                    : 'bg-amber-500/15 text-amber-200'
                }`}
              >
                {lookupResult.found ? 'In catalog' : 'Not in catalog'}
              </span>
            </div>
            {lookupResult.track ? (
              <div className="text-sm text-zinc-300 space-y-1">
                <p>
                  <span className="text-zinc-500">Title</span> {lookupResult.track.title}
                </p>
                <p>
                  <span className="text-zinc-500">Artist</span> {lookupResult.track.artist}
                </p>
                {lookupResult.track.releaseTitle ? (
                  <p>
                    <span className="text-zinc-500">Release</span>{' '}
                    {lookupResult.track.releaseId ? (
                      <Link
                        href={studioReleaseHref(lookupResult.track.releaseId, 'catalog')}
                        className="text-violet-300 hover:text-violet-200"
                      >
                        {lookupResult.track.releaseTitle}
                      </Link>
                    ) : (
                      lookupResult.track.releaseTitle
                    )}
                  </p>
                ) : null}
                <p>
                  <span className="text-zinc-500">SX status</span>{' '}
                  {lookupResult.track.submissionStatus || 'not registered'}
                </p>
              </div>
            ) : (
              <p className="text-sm text-zinc-500">
                No distribution track owns this ISRC yet. Assign or import it from Create / DistroKid
                import.
              </p>
            )}
            <a
              href={lookupResult.publicLookupUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-violet-300 hover:text-violet-200"
            >
              Open on SoundExchange <FaExternalLinkAlt className="text-[9px]" />
            </a>
          </div>
        ) : null}
      </section>

      <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-sm font-medium text-white">Catalog registry</h2>
            <p className="text-xs text-zinc-500 mt-1">
              Register updates soundexchange_submissions so Pipeline / Launch can see SX progress.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(['pending', 'submitted', 'all'] as const).map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setFilter(id)}
                className={`px-2.5 py-1 rounded-md text-[11px] border ${
                  filter === id
                    ? 'border-violet-500/50 bg-violet-500/15 text-violet-100'
                    : 'border-zinc-700 text-zinc-400'
                }`}
              >
                {id}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          <button
            type="button"
            onClick={selectVisible}
            className="text-[11px] px-2.5 py-1 rounded-md border border-zinc-700 text-zinc-300"
          >
            Select visible
          </button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="text-[11px] px-2.5 py-1 rounded-md border border-zinc-700 text-zinc-300"
          >
            Clear
          </button>
          <button
            type="button"
            disabled={busy || !selected.size}
            data-testid="sx-register-selected"
            onClick={() => void registerSelected()}
            className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-md bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-50"
          >
            <FaUpload className="text-[10px]" />
            Register selected ({selected.size})
          </button>
          <button
            type="button"
            disabled={busy || !selected.size}
            onClick={() => void markAccepted()}
            className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-md border border-emerald-500/40 text-emerald-200 disabled:opacity-50"
          >
            <FaCheckCircle className="text-[10px]" />
            Mark accepted
          </button>
        </div>

        {rows.length ? (
          <div className="overflow-x-auto rounded-lg border border-zinc-800">
            <table className="min-w-full text-sm" data-testid="sx-catalog-table">
              <thead className="bg-zinc-950/80 text-[11px] uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-3 py-2 text-left w-10" />
                  <th className="px-3 py-2 text-left">ISRC</th>
                  <th className="px-3 py-2 text-left">Title</th>
                  <th className="px-3 py-2 text-left">Release</th>
                  <th className="px-3 py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const checked = selected.has(row.trackId)
                  return (
                    <tr key={row.trackId} className="border-t border-zinc-800/80">
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggle(row.trackId)}
                          aria-label={`Select ${row.isrcDisplay}`}
                        />
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-zinc-200 whitespace-nowrap">
                        {row.isrcDisplay}
                      </td>
                      <td className="px-3 py-2 text-zinc-300">
                        <div>{row.title}</div>
                        <div className="text-[11px] text-zinc-500">{row.artist}</div>
                      </td>
                      <td className="px-3 py-2 text-zinc-400">
                        {row.releaseId ? (
                          <Link
                            href={studioReleaseHref(row.releaseId, 'catalog')}
                            className="text-violet-300 hover:text-violet-200"
                          >
                            {row.releaseTitle || 'Release'}
                          </Link>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <StatusPill status={row.submissionStatus} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-10 text-zinc-500 text-sm">
            {filter === 'pending'
              ? 'No pending ISRCs — all catalog codes are registered, or none minted yet.'
              : 'No ISRCs in the catalog yet.'}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
        <h2 className="text-sm font-medium text-white mb-3">Submission history</h2>
        {(registry?.submissions || []).length ? (
          <ul className="space-y-2" data-testid="sx-submission-history">
            {registry!.submissions.slice(0, 40).map((submission) => (
              <li
                key={submission.id}
                data-testid="sx-submission-row"
                className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-950/50 px-3 py-2.5"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <p className="font-mono text-sm text-zinc-200">
                      {submission.isrcDisplay || formatISRCDisplay(submission.isrc)}
                    </p>
                    {submission.trackTitle ? (
                      <p className="text-sm text-zinc-100 truncate">
                        {submission.trackTitle}
                        {submission.trackVersion ? (
                          <span className="text-zinc-500"> · {submission.trackVersion}</span>
                        ) : null}
                      </p>
                    ) : (
                      <p className="text-xs text-zinc-500">Track not linked</p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-zinc-500">
                    {submission.artist ? <span>{submission.artist}</span> : null}
                    {submission.releaseTitle ? (
                      submission.releaseId ? (
                        <Link
                          href={studioReleaseHref(submission.releaseId, 'catalog')}
                          className="text-violet-300 hover:text-violet-200"
                        >
                          {submission.releaseTitle}
                        </Link>
                      ) : (
                        <span>{submission.releaseTitle}</span>
                      )
                    ) : null}
                    <span>
                      {submission.submitted_at
                        ? new Date(submission.submitted_at).toLocaleString()
                        : '—'}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <StatusPill status={submission.status} />
                  {submission.error ? (
                    <span className="text-[11px] text-rose-300 max-w-[220px] truncate">
                      {submission.error}
                    </span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-zinc-500">
            No submissions yet. Select pending ISRCs and hit Register selected.
          </p>
        )}
      </section>

      <section
        data-testid="sx-about"
        className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-4"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-medium text-white">US ISRC Agency · SoundExchange</h2>
            <p className="text-xs text-zinc-500 mt-1 max-w-2xl leading-relaxed">
              SoundExchange runs the US ISRC Agency. SERGIK mints codes under the allocated Rights
              Owner prefix, registers them in Studio, then finishes the public locker at{' '}
              <a
                href="https://isrc.soundexchange.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-violet-400 hover:text-violet-300"
              >
                isrc.soundexchange.com
              </a>
              .
            </p>
          </div>
          <span
            className={`text-[11px] px-2 py-1 rounded-md border ${
              registry?.configured
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                : 'border-zinc-700 bg-zinc-950/60 text-zinc-400'
            }`}
          >
            {registry?.configured ? 'Remote credentials on' : 'Local registry mode'}
          </span>
        </div>

        <dl className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 px-3 py-2">
            <dt className="text-zinc-500 uppercase tracking-wider text-[10px]">Registrant</dt>
            <dd className="text-zinc-200 mt-1">{registry?.registrant.name || 'Jordan Caboga'}</dd>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 px-3 py-2">
            <dt className="text-zinc-500 uppercase tracking-wider text-[10px]">SX registrant ID</dt>
            <dd className="text-zinc-200 mt-1 font-mono">
              {registry?.registrant.soundExchangeRegistrantId || '2181363681'}
            </dd>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 px-3 py-2">
            <dt className="text-zinc-500 uppercase tracking-wider text-[10px]">Prefix</dt>
            <dd className="text-zinc-200 mt-1 font-mono">
              {registry?.isrc.prefix || 'QTA53'}
            </dd>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 px-3 py-2">
            <dt className="text-zinc-500 uppercase tracking-wider text-[10px]">Recording artist</dt>
            <dd className="text-zinc-200 mt-1">
              {registry?.registrant.recordingArtist || 'SERGIK'}
            </dd>
          </div>
        </dl>

        {registry?.registrant.membership ? (
          <div className="grid sm:grid-cols-2 gap-3" data-testid="sx-membership">
            {([registry.registrant.membership.performer, registry.registrant.membership.rightsOwner] as const).map(
              (row) => (
                <div
                  key={row.sxid}
                  className="rounded-lg border border-zinc-800 bg-zinc-950/50 px-3 py-2.5 text-xs space-y-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-zinc-200 font-medium">{row.type}</p>
                    <span className="text-[10px] px-1.5 py-0.5 rounded border border-emerald-500/30 bg-emerald-500/10 text-emerald-200">
                      {row.status}
                    </span>
                  </div>
                  <p className="font-mono text-zinc-300">{row.sxid}</p>
                  <p className="text-[11px] text-zinc-500">
                    Membership {row.membershipDate} · Mandate {row.mandateDate} ·{' '}
                    {row.mandateTerritories}
                  </p>
                </div>
              ),
            )}
          </div>
        ) : null}

        <dl className="grid sm:grid-cols-2 gap-3 text-xs">
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 px-3 py-2">
            <dt className="text-zinc-500 uppercase tracking-wider text-[10px]">Example ISRC</dt>
            <dd className="text-zinc-200 mt-1 font-mono">
              {registry?.isrc.exampleDisplay || 'QT-A53-26-00001'}
            </dd>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 px-3 py-2">
            <dt className="text-zinc-500 uppercase tracking-wider text-[10px]">Primary contact</dt>
            <dd className="text-zinc-200 mt-1">sergikdrops@gmail.com</dd>
          </div>
        </dl>

        <ol className="list-decimal list-inside text-xs text-zinc-400 space-y-1.5 leading-relaxed">
          <li>Mint ISRCs on a release (Assign ISRC) or Create → Track.</li>
          <li>
            Register selected rows here — writes <span className="font-mono text-zinc-300">soundexchange_submissions</span>.
          </li>
          <li>Export pending CSV and upload it in the USISRC / SoundExchange locker.</li>
          <li>Mark accepted after the agency confirms the codes.</li>
        </ol>

        <div className="flex flex-wrap gap-2 pt-1">
          <a
            href="https://isrc.soundexchange.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-md border border-violet-500/40 text-violet-200 hover:border-violet-400"
          >
            Open ISRC locker <FaExternalLinkAlt className="text-[9px] opacity-70" />
          </a>
          <a
            href="https://www.soundexchange.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-md border border-zinc-700 text-zinc-300 hover:border-zinc-500"
          >
            SoundExchange Direct <FaExternalLinkAlt className="text-[9px] opacity-70" />
          </a>
          <button
            type="button"
            onClick={() => downloadCsv('pending')}
            className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-md border border-zinc-700 text-zinc-300 hover:border-zinc-500"
          >
            <FaDownload className="text-[10px]" /> Export pending CSV
          </button>
        </div>

        {!registry?.configured ? (
          <p className="text-[11px] text-zinc-500 leading-relaxed">
            Optional later: set <span className="font-mono text-zinc-400">SOUNDEXCHANGE_API_KEY</span>{' '}
            / <span className="font-mono text-zinc-400">SOUNDEXCHANGE_ACCOUNT_ID</span> for a direct
            API path. Until then, CSV + locker is the production finish line — Studio still keeps the
            registry current.
          </p>
        ) : (
          <p className="text-[11px] text-emerald-300/80 leading-relaxed">
            Remote credentials detected. Register selected still persists Studio history; remote
            submit uses the configured endpoint when live.
          </p>
        )}
      </section>
    </div>
  )
}

function StatusPill({ status }: { status: string | null | undefined }) {
  const value = status || 'pending'
  const tone =
    value === 'accepted'
      ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30'
      : value === 'submitted'
        ? 'text-sky-300 bg-sky-500/10 border-sky-500/30'
        : value === 'rejected' || value === 'error'
          ? 'text-rose-300 bg-rose-500/10 border-rose-500/30'
          : 'text-zinc-400 bg-zinc-800/80 border-zinc-700'
  const Icon =
    value === 'accepted'
      ? FaCheckCircle
      : value === 'rejected' || value === 'error'
        ? FaExclamationCircle
        : FaUpload
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded border ${tone}`}>
      <Icon className="text-[9px]" />
      {value}
    </span>
  )
}
