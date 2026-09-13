'use client'

import Link from 'next/link'
import { useState, useEffect, useCallback } from 'react'
import type { FanJourneyMetrics } from '@/app/api/admin/fan-journey/route'

const FUNNEL_STAGES = [
  { key: 'visitors' as const, label: 'Page Visitors (30d)', color: '#8b5cf6', icon: '👁' },
  { key: 'emailSubscribers' as const, label: 'Email Subscribers', color: '#6d28d9', icon: '✉️' },
  { key: 'fanAccounts' as const, label: 'Fan Accounts', color: '#5b21b6', icon: '👤' },
  { key: 'purchasers' as const, label: 'Purchasers', color: '#4c1d95', icon: '💳' },
  { key: 'activeMembers' as const, label: 'Active Members', color: '#3b0764', icon: '⭐' },
]

function conversionRate(from: number, to: number): string {
  if (!from) return '—'
  return `${((to / from) * 100).toFixed(1)}%`
}

function formatCurrency(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

function FunnelBar({
  label,
  icon,
  color,
  count,
  maxCount,
  convRate,
}: {
  label: string
  icon: string
  color: string
  count: number
  maxCount: number
  convRate?: string
}) {
  const pct = maxCount > 0 ? Math.max(4, Math.round((count / maxCount) * 100)) : 4

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-1 text-sm">
        <span className="flex items-center gap-2">
          <span>{icon}</span>
          <span className="text-gray-200">{label}</span>
        </span>
        <span className="text-white font-semibold tabular-nums">
          {count.toLocaleString()}
          {convRate && (
            <span className="ml-2 text-xs text-gray-400 font-normal">({convRate})</span>
          )}
        </span>
      </div>
      <div className="h-7 w-full rounded bg-gray-800 overflow-hidden">
        <div
          className="h-full rounded transition-all duration-700"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  )
}

export default function FanJourneyPage() {
  const [metrics, setMetrics] = useState<FanJourneyMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)

  const fetchMetrics = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/fan-journey')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: FanJourneyMetrics = await res.json()
      setMetrics(data)
      setLastRefresh(new Date())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load metrics')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchMetrics()
    const interval = setInterval(fetchMetrics, 60_000)
    return () => clearInterval(interval)
  }, [fetchMetrics])

  const maxCount = metrics ? Math.max(metrics.visitors, 1) : 1

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 text-white">
      <p className="text-sm text-gray-400">
        <Link href="/admin" className="text-purple-400 hover:text-purple-300">
          ← Admin
        </Link>
      </p>

      <div className="mt-4 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Fan journey</h1>
          <p className="mt-1 text-sm text-gray-400">
            Live funnel — visitor → subscriber → fan → purchaser → member
          </p>
        </div>
        <button
          type="button"
          onClick={fetchMetrics}
          className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-xs text-gray-300 hover:border-gray-500 transition"
        >
          ↻ Refresh
        </button>
      </div>

      {lastRefresh && (
        <p className="mt-1 text-xs text-gray-600">
          Last updated: {lastRefresh.toLocaleTimeString()}
        </p>
      )}

      {/* Live Funnel */}
      <div className="mt-8 rounded-xl border border-gray-800 bg-gray-950/80 p-6">
        <h2 className="text-sm font-semibold text-gray-300 mb-6 uppercase tracking-widest">
          Live funnel metrics
        </h2>

        {loading && (
          <div className="space-y-4">
            {FUNNEL_STAGES.map((s) => (
              <div key={s.key} className="h-7 w-full rounded bg-gray-800 animate-pulse" />
            ))}
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-red-950/40 border border-red-800 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {!loading && !error && metrics && (
          <>
            {FUNNEL_STAGES.map((stage, i) => (
              <FunnelBar
                key={stage.key}
                label={stage.label}
                icon={stage.icon}
                color={stage.color}
                count={metrics[stage.key]}
                maxCount={maxCount}
                convRate={
                  i > 0
                    ? conversionRate(
                        metrics[FUNNEL_STAGES[i - 1]!.key],
                        metrics[stage.key]
                      )
                    : undefined
                }
              />
            ))}

            <div className="mt-6 pt-4 border-t border-gray-800 flex gap-6 text-sm">
              <div>
                <p className="text-gray-400 text-xs">Total revenue</p>
                <p className="text-white font-semibold text-lg">
                  {formatCurrency(metrics.totalRevenue)}
                </p>
              </div>
              <div>
                <p className="text-gray-400 text-xs">Visitor → member</p>
                <p className="text-white font-semibold text-lg">
                  {conversionRate(metrics.visitors, metrics.activeMembers)}
                </p>
              </div>
              <div>
                <p className="text-gray-400 text-xs">Subscriber → buyer</p>
                <p className="text-white font-semibold text-lg">
                  {conversionRate(metrics.emailSubscribers, metrics.purchasers)}
                </p>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Existing copy-paste scaffolding */}
      <FanJourneyGuide />
    </div>
  )
}

const STEP_TITLES = ['Landing first paint', 'Smartlink + UTM', 'Email / nurture'] as const

function FanJourneyGuide() {
  const [step, setStep] = useState(0)

  const copy =
    step === 0
      ? `Hero: one primary CTA + one proof line (playlist, quote, or live date).
Above the fold: no autoplay audio — user-initiated preview only.
Mobile: tap targets ≥44px; headline ≤6 words with a clear subline for the offer.`
      : step === 1
        ? `Smartlink discipline: one canonical URL per active campaign week.
UTM pattern: ?utm_source=&utm_medium=&utm_campaign= (keep slugs short, lowercase, hyphenated).
Archive or redirect old smartlinks when the window closes so attribution stays clean.`
        : `Email beat 1 (~24h): thank + set expectation for what comes next.
Beat 2 (~72h): one proof point + single CTA back to the smartlink.
Never invent open/click rates — say exactly where to read them in the ESP or analytics stack.`

  return (
    <div className="mt-8">
      <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-widest mb-4">
        Journey scaffolding
      </h2>
      <div className="flex flex-wrap gap-2 mb-4">
        {STEP_TITLES.map((label, i) => (
          <button
            key={label}
            type="button"
            onClick={() => setStep(i)}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
              step === i
                ? 'border-purple-500/70 bg-purple-950/60 text-purple-100'
                : 'border-gray-700 bg-gray-900 text-gray-300 hover:border-gray-600'
            }`}
          >
            {i + 1}. {label}
          </button>
        ))}
      </div>
      <div className="rounded-xl border border-gray-800 bg-gray-950/80 p-4">
        <h3 className="text-sm font-semibold text-gray-200">{STEP_TITLES[step]}</h3>
        <pre className="mt-3 whitespace-pre-wrap font-sans text-sm leading-relaxed text-gray-300">
          {copy}
        </pre>
        <button
          type="button"
          className="mt-4 rounded-lg bg-purple-600 px-3 py-2 text-xs font-semibold text-white hover:bg-purple-500"
          onClick={() => void navigator.clipboard.writeText(copy)}
        >
          Copy block
        </button>
      </div>
    </div>
  )
}
