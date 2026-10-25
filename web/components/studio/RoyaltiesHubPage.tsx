'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import StudioPageShell from './StudioPageShell'
import RoyaltyLedgerTable from './RoyaltyLedgerTable'
import { MetaBusinessAgentPanel } from './MetaBusinessAgentPanel'
import { LABEL_LEGAL_ENTITY_NAME } from '@/lib/studio/royalties/constants'
import type { MonetizationMeasurement } from '@/lib/studio/royalties/measurement'
import type {
  PayeeLedgerSummary,
  RoyaltyLedgerEntry,
  RoyaltyOpsSignals,
  RoyaltyPayout,
  RoyaltyPayee,
  RoyaltyStatement,
} from '@/lib/studio/royalties/types'
import { groupLedgerByTrack, type TrackMedia } from '@/lib/studio/royalties/ledger-groups'
import videosData from '@/data/videos.json'
import {
  FaCheckCircle,
  FaFileUpload,
  FaMoneyBillWave,
  FaUniversity,
  FaUsers,
} from 'react-icons/fa'

type OverviewResponse = {
  signals: RoyaltyOpsSignals
  payees: RoyaltyPayee[]
  payeeSummary: PayeeLedgerSummary[]
  statements: RoyaltyStatement[]
  ledger: RoyaltyLedgerEntry[]
  payouts: RoyaltyPayout[]
  totals: {
    owedLabel: string
    paidLabel: string
    labelRetainLabel: string
  }
  measurement?: MonetizationMeasurement
  updatedAt: string
}

type TabId = 'overview' | 'ingest' | 'ledger' | 'payouts'

const TRACK_MEDIA: TrackMedia[] = (videosData.videos || []).map((video) => ({
  title: video.title,
  text: `${video.title} ${video.description || ''}`,
  youtubeId: video.youtube_id,
}))

const TABS: { id: TabId; label: string; hint: string }[] = [
  { id: 'overview', label: 'Overview', hint: 'Owed by payee + LLC retain' },
  { id: 'ingest', label: 'Ingest', hint: 'Royalties, creator payouts, ad spend' },
  { id: 'ledger', label: 'Ledger', hint: 'Allocated line items' },
  { id: 'payouts', label: 'Payouts', hint: 'Mark collaborator paid' },
]

function moneyClass(cents: number): string {
  if (cents > 0) return 'text-emerald-300'
  if (cents < 0) return 'text-amber-300'
  return 'text-zinc-400'
}

export default function RoyaltiesHubPage() {
  const [tab, setTab] = useState<TabId>('overview')
  const [data, setData] = useState<OverviewResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [csvText, setCsvText] = useState('')
  const [filename, setFilename] = useState('statement.csv')
  const [ingestNotes, setIngestNotes] = useState('')
  const [ingestBusy, setIngestBusy] = useState(false)
  const [ingestResult, setIngestResult] = useState<string | null>(null)
  const [pullStatus, setPullStatus] = useState<RoyaltyPullStatus | null>(null)
  const [pullBusy, setPullBusy] = useState<string | null>(null)
  const [pullMessage, setPullMessage] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [payVia, setPayVia] = useState('venmo')
  const [payNotes, setPayNotes] = useState('')
  const [payBusy, setPayBusy] = useState(false)
  const [filterPayee, setFilterPayee] = useState('')
  const [trackMedia, setTrackMedia] = useState<TrackMedia[]>(TRACK_MEDIA)
  const [mediaNote, setMediaNote] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch('/api/studio/royalties')
      if (!res.ok) throw new Error('Failed to load royalty ops')
      const json = (await res.json()) as OverviewResponse
      setData(json)
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : 'Load failed')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    let cancelled = false
    void fetch('/api/studio/royalties/media')
      .then(async (response) => {
        if (!response.ok || cancelled) return
        const json = (await response.json()) as { media?: TrackMedia[]; note?: string | null }
        if (cancelled || !Array.isArray(json.media) || json.media.length === 0) return
        setTrackMedia(json.media)
        setMediaNote(json.note || null)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  const collabOwed = useMemo(
    () => (data?.payeeSummary || []).filter((p) => !p.isLabelEntity && p.owedCents !== 0),
    [data],
  )

  const ledgerRows = useMemo(() => {
    const rows = data?.ledger || []
    if (!filterPayee) return rows
    return rows.filter((r) => r.payeeId === filterPayee)
  }, [data, filterPayee])

  const trackGroups = useMemo(() => groupLedgerByTrack(ledgerRows, trackMedia), [ledgerRows, trackMedia])

  async function onFile(file: File | null) {
    if (!file) return
    setFilename(file.name)
    setCsvText(await file.text())
  }

  async function ingest() {
    if (!csvText.trim()) {
      setIngestResult('Paste or upload a CSV first')
      return
    }
    try {
      setIngestBusy(true)
      setIngestResult(null)
      const res = await fetch('/api/studio/royalties/statements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csvText, filename, notes: ingestNotes || null }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Ingest failed')
      const warn =
        json.warningCount > 0 ? ` · ${json.warningCount} warning(s)` : ''
      setIngestResult(
        json.duplicate
          ? `Already ingested (${json.statement?.id})${warn}`
          : `Ingested ${json.lineCount} lines → ${json.ledgerCreated} ledger rows (${json.statement?.source})${warn}`,
      )
      setCsvText('')
      await load()
      setTab('ledger')
    } catch (err) {
      setIngestResult(err instanceof Error ? err.message : 'Ingest failed')
    } finally {
      setIngestBusy(false)
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

  function selectOwedForPayee(payeeId: string) {
    const ids = (data?.ledger || [])
      .filter((e) => e.payeeId === payeeId && e.status === 'owed')
      .map((e) => e.id)
    setSelected(new Set(ids))
    setFilterPayee(payeeId)
    setTab('payouts')
  }

  async function markPaid() {
    if (!selected.size) return
    try {
      setPayBusy(true)
      const res = await fetch('/api/studio/royalties/payouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ledgerEntryIds: Array.from(selected),
          paidVia: payVia,
          notes: payNotes || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Payout failed')
      setSelected(new Set())
      setPayNotes('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payout failed')
    } finally {
      setPayBusy(false)
    }
  }

  return (
    <StudioPageShell
      title="Royalties"
      subtitle={`Partner statements land on ${LABEL_LEGAL_ENTITY_NAME}. Studio allocates split sheets and pays collaborators — DistroKid / Revelator never pay collabs directly.`}
    >
      <div className="flex flex-wrap gap-2 mb-6" role="tablist" aria-label="Royalty ops">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-full text-sm border transition ${
              tab === t.id
                ? 'bg-violet-600/20 border-violet-500/50 text-violet-100'
                : 'bg-zinc-900/80 border-zinc-800 text-zinc-400 hover:text-white'
            }`}
          >
            {t.label}
            <span className="ml-2 text-[10px] uppercase tracking-wide text-zinc-500">{t.hint}</span>
          </button>
        ))}
      </div>

      {error && (
        <p className="mb-4 text-sm text-amber-300 border border-amber-500/30 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {loading && !data ? (
        <p className="text-zinc-500">Loading royalty ops…</p>
      ) : (
        <>
          {tab === 'overview' && data && (
            <div className="space-y-6" data-testid="royalties-overview">
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <Stat
                  icon={<FaFileUpload />}
                  label="Statements"
                  value={String(data.signals.statementCount)}
                />
                <Stat
                  icon={<FaUsers />}
                  label="Collab payees"
                  value={String(data.signals.payeeCount)}
                />
                <Stat
                  icon={<FaMoneyBillWave />}
                  label="Owed to collabs"
                  value={data.totals.owedLabel}
                  emphasize
                />
                <Stat
                  icon={<FaUniversity />}
                  label="LLC retain (owed)"
                  value={data.totals.labelRetainLabel}
                />
              </div>

              <MonetizationSystems />
              <MetaBusinessAgentPanel />

              {data.measurement && (
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5" data-testid="monetization-measurement">
                  <h2 className="text-lg font-semibold mb-1">Actuals by category</h2>
                  <p className="text-sm text-zinc-500 mb-4">{data.measurement.note}</p>
                  <dl className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
                    <div>
                      <dt className="text-zinc-500">Recording royalties</dt>
                      <dd className="text-zinc-100 font-mono">{formatCents(data.measurement.recordingRoyaltyCents)}</dd>
                    </div>
                    <div>
                      <dt className="text-zinc-500">Meta creator payouts</dt>
                      <dd className="text-zinc-100 font-mono">{formatCents(data.measurement.metaCreatorCents)}</dd>
                    </div>
                    <div>
                      <dt className="text-zinc-500">Meta ad spend</dt>
                      <dd className="text-zinc-100 font-mono">{formatCents(data.measurement.adSpendCents)}</dd>
                    </div>
                    <div>
                      <dt className="text-zinc-500">ROAS</dt>
                      <dd className="text-zinc-100 font-mono">{data.measurement.roasLabel}</dd>
                    </div>
                  </dl>
                  <p className="text-xs text-zinc-500 mt-4">
                    Amount basis: {data.measurement.amountBasis}. Reported figures are stored as-is.
                    Licensing link: {data.measurement.licensingUrl}
                  </p>
                </div>
              )}

              <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
                <h2 className="text-lg font-semibold mb-1">Payee ledger</h2>
                <p className="text-sm text-zinc-500 mb-4">
                  Collab balances first. Label retain stays with the LLC — not a payout batch.
                </p>
                {data.payeeSummary.length === 0 ? (
                  <p className="text-zinc-500 text-sm">No ledger yet — ingest a statement.</p>
                ) : (
                  <ul className="divide-y divide-zinc-800">
                    {data.payeeSummary.map((row) => (
                      <li
                        key={row.payeeId}
                        className="flex flex-wrap items-center justify-between gap-3 py-3"
                      >
                        <div>
                          <p className="text-zinc-100 font-medium">
                            {row.payeeName}
                            {row.isLabelEntity && (
                              <span className="ml-2 text-[10px] uppercase tracking-wide text-sky-400">
                                LLC retain
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-zinc-500">
                            {row.entryCount} entries · paid {formatCents(row.paidCents)}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <p className={`text-sm font-mono ${moneyClass(row.owedCents)}`}>
                            {formatCents(row.owedCents)} owed
                          </p>
                          {!row.isLabelEntity && row.owedCents > 0 && (
                            <button
                              type="button"
                              onClick={() => selectOwedForPayee(row.payeeId)}
                              className="text-xs px-3 py-1.5 rounded-full border border-violet-500/40 text-violet-200 hover:bg-violet-600/20"
                            >
                              Pay
                            </button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {collabOwed.length === 0 && data.signals.statementCount === 0 && (
                <div className="rounded-xl border border-dashed border-zinc-700 px-5 py-8 text-center">
                  <p className="text-zinc-300 mb-2">Ready for partner statements</p>
                  <p className="text-sm text-zinc-500 mb-4 max-w-lg mx-auto">
                    Export earnings CSV from DistroKid or Revelator, then ingest here. Split sheets
                    on Rights auto-allocate collab shares.
                  </p>
                  <button
                    type="button"
                    onClick={() => setTab('ingest')}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-violet-600 text-white text-sm font-medium hover:bg-violet-500"
                  >
                    <FaFileUpload /> Ingest statement
                  </button>
                </div>
              )}
            </div>
          )}

          {tab === 'ingest' && (
            <div className="space-y-4 max-w-3xl" data-testid="royalties-ingest">
              <PullPanel
                status={pullStatus}
                busy={pullBusy}
                message={pullMessage}
                onStatus={setPullStatus}
                onPull={async (source) => {
                  setPullBusy(source)
                  setPullMessage(null)
                  try {
                    const response = await fetch('/api/studio/royalties/pull', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ source }),
                    })
                    const body = await response.json()
                    if (!response.ok) throw new Error(body.error || 'Pull failed')
                    setPullMessage(
                      body.note ||
                        (body.duplicate
                          ? 'That snapshot is already in the ledger.'
                          : `Imported ${body.lineCount} rows${body.replaced ? ' and replaced the previous snapshot' : ''}.`),
                    )
                    await load()
                  } catch (err) {
                    setPullMessage(err instanceof Error ? err.message : 'Pull failed')
                  } finally {
                    setPullBusy(null)
                  }
                }}
              />
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-4">
                <h2 className="text-lg font-semibold">Statement ingest</h2>
                <p className="text-sm text-zinc-500">
                  DistroKid and Revelator stay CSV. Amounts stay as reported. Ad spend is not allocated to collaborators.
                  Matching ISRCs use Rights split sheets; unknown lines stay 100% with the LLC until splits exist.
                </p>
                <label className="block">
                  <span className="text-xs uppercase tracking-wide text-zinc-500">Upload CSV</span>
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    className="mt-1 block w-full text-sm text-zinc-400 file:mr-3 file:rounded-full file:border-0 file:bg-zinc-800 file:px-3 file:py-1.5 file:text-zinc-200"
                    onChange={(e) => void onFile(e.target.files?.[0] || null)}
                  />
                </label>
                <label className="block">
                  <span className="text-xs uppercase tracking-wide text-zinc-500">Or paste CSV</span>
                  <textarea
                    value={csvText}
                    onChange={(e) => setCsvText(e.target.value)}
                    rows={10}
                    className="mt-1 w-full rounded-lg border border-zinc-700 bg-black/40 px-3 py-2 text-sm font-mono text-zinc-200"
                    placeholder="Reporting Date,Sale Month,Store,...,Earnings (USD)"
                  />
                </label>
                <div className="grid sm:grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-xs uppercase tracking-wide text-zinc-500">Filename</span>
                    <input
                      value={filename}
                      onChange={(e) => setFilename(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-zinc-700 bg-black/40 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs uppercase tracking-wide text-zinc-500">Notes</span>
                    <input
                      value={ingestNotes}
                      onChange={(e) => setIngestNotes(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-zinc-700 bg-black/40 px-3 py-2 text-sm"
                      placeholder="Q4 2025 DistroKid"
                    />
                  </label>
                </div>
                <button
                  type="button"
                  disabled={ingestBusy || !csvText.trim()}
                  onClick={() => void ingest()}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-violet-600 text-white text-sm font-medium disabled:opacity-40 hover:bg-violet-500"
                >
                  <FaFileUpload /> {ingestBusy ? 'Ingesting…' : 'Ingest & allocate'}
                </button>
                {ingestResult && (
                  <p className="text-sm text-zinc-300 flex items-start gap-2">
                    <FaCheckCircle className="text-emerald-400 mt-0.5 shrink-0" />
                    {ingestResult}
                  </p>
                )}
              </div>

              {data && data.statements.length > 0 && (
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
                  <h3 className="text-sm font-semibold text-zinc-300 mb-3">Recent statements</h3>
                  <ul className="space-y-2 text-sm">
                    {data.statements.slice(0, 8).map((s) => (
                      <li key={s.id} className="flex justify-between gap-3 text-zinc-400">
                        <span>
                          {s.filename || s.id}{' '}
                          <span className="text-zinc-600">({s.source})</span>
                        </span>
                        <span className="font-mono text-zinc-300">
                          {formatCents(s.grossCents)} · {s.lineCount} lines
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {tab === 'ledger' && data && (
            <div className="space-y-4" data-testid="royalties-ledger">
              <div className="flex flex-wrap gap-3 items-center">
                <label className="text-sm text-zinc-400">
                  Payee{' '}
                  <select
                    value={filterPayee}
                    onChange={(e) => setFilterPayee(e.target.value)}
                    className="ml-2 rounded-lg border border-zinc-700 bg-black/40 px-2 py-1.5 text-sm text-zinc-200"
                  >
                    <option value="">All</option>
                    {data.payees.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="text-xs text-zinc-500">
                  {trackGroups.length} tracks · {ledgerRows.length} rows
                </p>
                {mediaNote ? <p className="text-xs text-amber-300/90">{mediaNote}</p> : null}
              </div>
              {!trackGroups.length ? (
                <p className="px-3 py-8 text-center text-zinc-500 text-sm">No ledger entries yet.</p>
              ) : (
                <RoyaltyLedgerTable groups={trackGroups} />
              )}
            </div>
          )}

          {tab === 'payouts' && data && (
            <div className="space-y-6" data-testid="royalties-payouts">
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-4">
                <h2 className="text-lg font-semibold">Mark collaborator paid</h2>
                <p className="text-sm text-zinc-500">
                  Select owed rows for one payee. LLC retain cannot be paid out here — that’s your
                  operating profit.
                </p>
                <div className="flex flex-wrap gap-3">
                  <label className="text-sm text-zinc-400">
                    Filter{' '}
                    <select
                      value={filterPayee}
                      onChange={(e) => setFilterPayee(e.target.value)}
                      className="ml-2 rounded-lg border border-zinc-700 bg-black/40 px-2 py-1.5 text-sm"
                    >
                      <option value="">All collabs</option>
                      {data.payees
                        .filter((p) => !p.isLabelEntity)
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <input
                    value={payVia}
                    onChange={(e) => setPayVia(e.target.value)}
                    className="rounded-lg border border-zinc-700 bg-black/40 px-3 py-1.5 text-sm"
                    placeholder="Paid via (venmo, wire…)"
                  />
                  <input
                    value={payNotes}
                    onChange={(e) => setPayNotes(e.target.value)}
                    className="rounded-lg border border-zinc-700 bg-black/40 px-3 py-1.5 text-sm min-w-[12rem]"
                    placeholder="Notes"
                  />
                  <button
                    type="button"
                    disabled={payBusy || selected.size === 0}
                    onClick={() => void markPaid()}
                    className="px-4 py-1.5 rounded-full bg-emerald-600/90 text-white text-sm font-medium disabled:opacity-40"
                  >
                    {payBusy ? 'Saving…' : `Mark paid (${selected.size})`}
                  </button>
                </div>

                <ul className="divide-y divide-zinc-800 max-h-[28rem] overflow-y-auto">
                  {ledgerRows
                    .filter((e) => e.status === 'owed')
                    .filter((e) => {
                      const payee = data.payees.find((p) => p.id === e.payeeId)
                      return !payee?.isLabelEntity
                    })
                    .map((row) => (
                      <li key={row.id} className="flex items-center gap-3 py-2 text-sm">
                        <input
                          type="checkbox"
                          checked={selected.has(row.id)}
                          onChange={() => toggle(row.id)}
                          className="rounded border-zinc-600"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-zinc-200 truncate">
                            {row.payeeName} · {row.trackTitle || row.isrc || 'line'}
                          </p>
                          <p className="text-xs text-zinc-500">{row.store || '—'}</p>
                        </div>
                        <span className={`font-mono ${moneyClass(row.amountCents)}`}>
                          {formatCents(row.amountCents)}
                        </span>
                      </li>
                    ))}
                </ul>
              </div>

              {data.payouts.length > 0 && (
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
                  <h3 className="text-sm font-semibold mb-3">Payout history</h3>
                  <ul className="space-y-2 text-sm">
                    {data.payouts.map((p) => (
                      <li key={p.id} className="flex justify-between gap-3 text-zinc-400">
                        <span>
                          {p.payeeName}{' '}
                          <span className="text-zinc-600">via {p.paidVia}</span>
                        </span>
                        <span className="font-mono text-emerald-300">
                          {formatCents(p.amountCents)} · {p.paidAt.slice(0, 10)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </StudioPageShell>
  )
}

function Stat({
  icon,
  label,
  value,
  emphasize,
}: {
  icon: ReactNode
  label: string
  value: string
  emphasize?: boolean
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3">
      <p className="text-[10px] uppercase tracking-wide text-zinc-500 flex items-center gap-2">
        <span className="text-violet-400/80">{icon}</span>
        {label}
      </p>
      <p className={`text-xl font-semibold mt-1 ${emphasize ? 'text-emerald-300' : 'text-white'}`}>
        {value}
      </p>
    </div>
  )
}

type RoyaltyPullStatus = {
  distrokid: { reason: string }
  metaAds: { ready: boolean; reason: string }
  metaCreator: { ready: boolean; reason: string }
  metaCreatorInstagram: { ready: boolean; reason: string }
  connectPath: string
}

function MonetizationSystems() {
  const [systems, setSystems] = useState<Array<{ id: string; label: string; state: string; detail: string }>>([])
  useEffect(() => {
    let cancelled = false
    void fetch('/api/studio/royalties/monetization')
      .then(async (response) => {
        if (!response.ok || cancelled) return
        const body = await response.json()
        if (!cancelled && Array.isArray(body.systems)) setSystems(body.systems)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])
  if (!systems.length) return null
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5" data-testid="monetization-systems">
      <h2 className="text-lg font-semibold mb-1">Monetization systems</h2>
      <p className="text-sm text-zinc-500 mb-4">
        Stars and Subscriptions stay closed until Meta’s follower rules are met. A view is not turned into a royalty.
      </p>
      <ul className="divide-y divide-zinc-800">
        {systems.map((system) => (
          <li key={system.id} className="py-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm text-zinc-100">{system.label}</p>
              <p className="text-xs text-zinc-500 mt-1 max-w-2xl">{system.detail}</p>
            </div>
            <span className="text-[10px] uppercase tracking-wide text-zinc-400">{system.state}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function formatCents(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
}

function PullPanel({
  status,
  busy,
  message,
  onStatus,
  onPull,
}: {
  status: RoyaltyPullStatus | null
  busy: string | null
  message: string | null
  onStatus: (status: RoyaltyPullStatus) => void
  onPull: (source: 'meta_ads' | 'meta_creator' | 'meta_creator_instagram') => Promise<void>
}) {
  useEffect(() => {
    let cancelled = false
    void fetch('/api/studio/royalties/pull')
      .then(async (response) => {
        if (!response.ok || cancelled) return
        onStatus(await response.json())
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [onStatus])

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-3" data-testid="royalty-pull">
      <h2 className="text-lg font-semibold">Pull from the source</h2>
      <p className="text-sm text-zinc-400">{status?.distrokid.reason || 'Checking which sources can be pulled.'}</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!status?.metaAds.ready || Boolean(busy)}
          onClick={() => void onPull('meta_ads')}
          className="px-3 py-1.5 rounded-full bg-violet-600 text-white text-xs font-medium disabled:opacity-40"
        >
          {busy === 'meta_ads' ? 'Pulling ad spend…' : 'Pull Meta ad spend'}
        </button>
        <button
          type="button"
          disabled={!status?.metaCreator.ready || Boolean(busy)}
          onClick={() => void onPull('meta_creator')}
          className="px-3 py-1.5 rounded-full border border-zinc-600 text-zinc-100 text-xs font-medium disabled:opacity-40"
        >
          {busy === 'meta_creator' ? 'Pulling creator earnings…' : 'Pull Facebook creator earnings'}
        </button>
        <button
          type="button"
          disabled={!status?.metaCreatorInstagram.ready || Boolean(busy)}
          onClick={() => void onPull('meta_creator_instagram')}
          className="px-3 py-1.5 rounded-full border border-zinc-600 text-zinc-100 text-xs font-medium disabled:opacity-40"
        >
          {busy === 'meta_creator_instagram' ? 'Pulling Instagram earnings…' : 'Pull Instagram creator earnings'}
        </button>
        <a href={status?.connectPath || '/api/studio/meta/connect?earnings=1&next=/studio/royalties'} className="px-3 py-1.5 rounded-full border border-sky-500/40 text-sky-200 text-xs">
          Reconnect Meta earnings
        </a>
      </div>
      {status ? (
        <div className="text-xs text-zinc-500 space-y-1">
          <p>{status.metaAds.reason}</p>
          <p>{status.metaCreator.reason}</p>
          <p>{status.metaCreatorInstagram.reason}</p>
        </div>
      ) : null}
      {message ? <p className="text-sm text-zinc-200">{message}</p> : null}
    </div>
  )
}
