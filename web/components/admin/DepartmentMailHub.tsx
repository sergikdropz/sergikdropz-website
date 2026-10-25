'use client'

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  ADMIN_MAIL_ROUTES,
  MAIL_AUTOMATIONS,
  campaignBroadcastDraft,
  deskMetrics,
  deskTemplates,
  type DeskSection,
} from '@/lib/email/department-desk'
import type { DepartmentMailMessage } from '@/lib/email/department-mailbox'

type Department = {
  id: string
  name: string
  address: string
  purpose: string
}

type AudienceRow = {
  accountId: string
  label: string
  handles: string
  count: number
  sample: { email: string; name: string }[]
}

type BroadcastRow = {
  id: string
  name: string
  description?: string
  status: string
  scheduledAt: string | null
  accountId: string
}

type DeskPayload = {
  audiences: AudienceRow[]
  broadcasts: BroadcastRow[]
  webhook: { endpoint: string; secretConfigured: boolean }
}

const emptyDesk: DeskPayload = {
  audiences: [],
  broadcasts: [],
  webhook: { endpoint: '/api/webhooks/resend', secretConfigured: false },
}

export default function DepartmentMailHub({
  pane,
  departments,
  accountId,
  messages,
  onCompose,
  onAccountChange,
}: {
  pane: DeskSection
  departments: Department[]
  accountId: string
  messages: DepartmentMailMessage[]
  onCompose: (seed: { accountId: string; subject: string; body: string }) => void
  onAccountChange: (accountId: string) => void
}) {
  const [desk, setDesk] = useState<DeskPayload>(emptyDesk)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [fromId, setFromId] = useState(accountId !== 'all' ? accountId : 'promo')
  const [audienceId, setAudienceId] = useState(accountId !== 'all' ? accountId : 'fans')
  const [subject, setSubject] = useState('')
  const [text, setText] = useState('')
  const [skip, setSkip] = useState(0)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [routeDetails, setRouteDetails] = useState(false)
  const [draftedId, setDraftedId] = useState<string | null>(null)
  const subjectRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false
    void fetch('/api/admin/email/desk')
      .then(async (res) => {
        const data = (await res.json()) as DeskPayload & { error?: string }
        if (!res.ok) throw new Error(data.error || 'Could not load the mail desk')
        if (!cancelled) setDesk(data)
      })
      .catch((load: unknown) => {
        if (!cancelled) setLoadError(load instanceof Error ? load.message : 'Could not load the mail desk')
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (accountId === 'all') return
    setFromId(accountId)
    setAudienceId(accountId)
    setSkip(0)
  }, [accountId])

  const addressFor = (id: string) => departments.find((item) => item.id === id)?.address || ''
  const nameFor = (id: string) => departments.find((item) => item.id === id)?.name || id
  const visible = (id: string) => accountId === 'all' || id === accountId || id === ''

  const metrics = useMemo(() => deskMetrics(messages, accountId), [messages, accountId])
  const templates = deskTemplates().filter((template) => visible(template.accountId))
  const automations = MAIL_AUTOMATIONS.filter((item) => visible(item.accountId))
  const audiences = (desk.audiences.length ? desk.audiences : ADMIN_MAIL_ROUTES.map((route) => ({
    accountId: route.accountId,
    label: route.label,
    handles: route.handles,
    count: 0,
    sample: [],
  }))).filter((row) => visible(row.accountId))
  const selectedAudience = audiences.find((row) => row.accountId === audienceId) || audiences[0]
  const broadcasts = desk.broadcasts.filter((row) => visible(row.accountId))

  async function onBroadcast(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setNotice(null)
    setError(null)
    try {
      const res = await fetch('/api/admin/email/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ department: fromId, audienceId, subject, text, skip }),
      })
      const data = (await res.json()) as { error?: string; sent?: number; failed?: number; remaining?: number; nextSkip?: number }
      if (!res.ok) throw new Error(data.error || 'Broadcast failed')
      const failed = data.failed ? ` ${data.failed} did not send.` : ''
      const more = data.remaining ? ` ${data.remaining} still waiting.` : ''
      setNotice(`Sent to ${data.sent || 0}.${failed}${more}`)
      setSkip(data.remaining ? data.nextSkip || 0 : 0)
    } catch (sendError: unknown) {
      setError(sendError instanceof Error ? sendError.message : 'Broadcast failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <label className="flex flex-col gap-1 text-xs text-zinc-400">
        Department
        <select
          value={accountId}
          onChange={(event) => onAccountChange(event.target.value)}
          aria-label="Department filter"
          className="w-full max-w-sm rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
        >
          <option value="all">All departments</option>
          {departments.map((item) => (
            <option key={item.id} value={item.id}>{item.name}</option>
          ))}
        </select>
      </label>
      {loadError ? <p className="text-sm text-red-300">{loadError}</p> : null}
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      {notice ? <p className="text-sm text-emerald-300">{notice}</p> : null}

      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Departments</p>
        <button
          type="button"
          onClick={() => setRouteDetails((open) => !open)}
          aria-expanded={routeDetails}
          className="text-xs text-zinc-400 hover:text-zinc-200"
        >
          {routeDetails ? 'Compact' : 'Details'}
        </button>
      </div>
      <ul className={routeDetails ? 'grid gap-2 sm:grid-cols-2' : 'flex flex-wrap gap-1.5'}>
        {ADMIN_MAIL_ROUTES.filter((route) => visible(route.accountId)).map((route) => {
          const address = addressFor(route.accountId) || nameFor(route.accountId)
          if (!routeDetails) {
            return (
              <li key={route.id}>
                <a
                  href={route.href}
                  className="inline-flex max-w-full items-baseline gap-2 rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1 text-xs text-zinc-100 hover:text-violet-200"
                >
                  <span className="font-medium">{route.label}</span>
                  <span className="truncate text-zinc-500">{address}</span>
                </a>
              </li>
            )
          }
          return (
            <li key={route.id} className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2">
              <a href={route.href} className="text-sm font-medium text-zinc-100 hover:text-violet-200">
                {route.label}
              </a>
              <p className="text-sm text-violet-200">{address}</p>
              <p className="text-xs text-zinc-500">{route.handles}</p>
            </li>
          )
        })}
      </ul>

      {pane === 'broadcasts' ? (
        <div className="space-y-4">
          <form onSubmit={onBroadcast} className="space-y-3 rounded-md border border-zinc-800 p-3">
            <h2 className="text-sm font-medium text-zinc-300">Broadcast</h2>
            <p className="text-xs text-zinc-500">
              Each person gets their own copy. Use {'{{name}}'} where you want their name. Sends 40 at a time.
            </p>
            <label className="block text-sm">
              <span className="text-zinc-400">From</span>
              <select value={fromId} onChange={(event) => setFromId(event.target.value)} aria-label="Broadcast from" className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2">
                {departments.map((item) => (
                  <option key={item.id} value={item.id}>{item.name} — {item.address}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-zinc-400">Audience</span>
              <select
                value={selectedAudience?.accountId || audienceId}
                onChange={(event) => {
                  setAudienceId(event.target.value)
                  setSkip(0)
                }}
                aria-label="Broadcast audience"
                className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2"
              >
                {audiences.map((row) => (
                  <option key={row.accountId} value={row.accountId}>{row.label} ({row.count})</option>
                ))}
              </select>
            </label>
            <input ref={subjectRef} value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Subject" aria-label="Broadcast subject" maxLength={200} required className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm" />
            <textarea value={text} onChange={(event) => setText(event.target.value)} placeholder="Message" aria-label="Broadcast message" rows={6} required className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm" />
            <button type="submit" disabled={busy || !selectedAudience?.count} className="rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
              {busy ? 'Sending…' : skip ? `Send next ${Math.min(40, (selectedAudience?.count || 0) - skip)}` : `Send to ${Math.min(40, selectedAudience?.count || 0)}`}
            </button>
          </form>
          <section>
            <h2 className="mb-2 text-sm font-medium text-zinc-300">Campaigns</h2>
            {broadcasts.length === 0 ? <p className="text-sm text-zinc-500">No nurturing campaigns yet.</p> : (
              <ul className="space-y-2">
                {broadcasts.map((row) => (
                  <li key={row.id} className={`flex items-start justify-between gap-3 rounded-md border px-3 py-2 ${draftedId === row.id ? 'border-violet-500' : 'border-zinc-800'}`}>
                    <div>
                      <a href="/admin/nurturing/campaigns" className="text-sm text-zinc-100 hover:text-violet-200">{row.name}</a>
                      <p className="text-xs text-zinc-500">{nameFor(row.accountId)} · {addressFor(row.accountId)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const draft = campaignBroadcastDraft(row)
                        setFromId(draft.accountId)
                        setAudienceId(draft.audienceId)
                        setSkip(0)
                        setSubject(draft.subject)
                        setText(draft.body)
                        setDraftedId(row.id)
                        setNotice(`Drafted “${row.name}” into the broadcast. Nothing has been sent.`)
                        setError(null)
                        subjectRef.current?.focus()
                      }}
                      className="shrink-0 rounded-md border border-zinc-700 px-2 py-1 text-xs uppercase tracking-wide text-zinc-300 hover:border-violet-400 hover:text-white"
                    >
                      Draft
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      ) : null}

      {pane === 'automations' ? (
        <ul className="space-y-2">
          {automations.map((item) => (
            <li key={item.id} className="rounded-md border border-zinc-800 px-3 py-3">
              <div className="flex items-start justify-between gap-3">
                <a href={item.href} className="text-sm font-medium text-zinc-100 hover:text-violet-200">{item.name}</a>
                <span className="text-xs text-zinc-500">{item.schedule}</span>
              </div>
              <p className="mt-1 text-sm text-violet-200">{item.accountId ? addressFor(item.accountId) || nameFor(item.accountId) : 'Whichever mailbox the draft used'}</p>
              <p className="mt-1 text-xs text-zinc-500">{item.detail}</p>
            </li>
          ))}
        </ul>
      ) : null}

      {pane === 'templates' ? (
        <ul className="space-y-2">
          {templates.map((template) => (
            <li key={`${template.accountId}-${template.id}`} className="rounded-md border border-zinc-800 px-3 py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{template.label}</p>
                  <p className="text-xs text-violet-200">{nameFor(template.accountId)} · {template.subject}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onCompose({ accountId: template.accountId, subject: template.subject, body: template.body })}
                  className="rounded-md bg-violet-600 px-3 py-1.5 text-sm"
                >
                  Use
                </button>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-xs text-zinc-500">{template.body}</p>
            </li>
          ))}
        </ul>
      ) : null}

      {pane === 'audience' ? (
        <ul className="space-y-2">
          {audiences.map((row) => (
            <li key={row.accountId} className="rounded-md border border-zinc-800 px-3 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm font-medium">{row.label}</p>
                <span className="text-sm text-zinc-400">{row.count}</span>
              </div>
              <p className="text-xs text-violet-200">{addressFor(row.accountId)}</p>
              <p className="mt-1 text-xs text-zinc-500">{row.handles}</p>
              {row.sample.length ? (
                <p className="mt-2 text-xs text-zinc-400">{row.sample.map((person) => person.name || person.email).join(', ')}</p>
              ) : (
                <p className="mt-2 text-xs text-zinc-500">No contacts in this lane yet. Named mail still goes through Compose.</p>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      {pane === 'metrics' ? (
        <div className="space-y-3">
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ['Sent', metrics.sent],
              ['Inbox', metrics.inbox],
              ['Scheduled', metrics.scheduled],
              ['Failed', metrics.failed],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-md border border-zinc-800 px-3 py-3">
                <dt className="text-xs uppercase tracking-wide text-zinc-500">{label}</dt>
                <dd className="mt-1 text-xl font-semibold">{value}</dd>
              </div>
            ))}
          </dl>
          <ul className="space-y-2">
            {metrics.byAccount.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-3 rounded-md border border-zinc-800 px-3 py-2 text-sm">
                <span>{nameFor(row.id)}</span>
                <span className="text-zinc-500">{row.sent} sent · {row.inbox} in · {row.failed} failed</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-zinc-500">
            Opens and clicks for campaigns stay on <a href="/admin/nurturing/analytics" className="text-violet-200">nurturing analytics</a>.
          </p>
        </div>
      ) : null}

      {pane === 'webhooks' ? (
        <div className="space-y-3 rounded-md border border-zinc-800 px-3 py-3">
          <h2 className="text-sm font-medium">Resend events</h2>
          <p className="text-sm text-zinc-300 break-all">{desk.webhook.endpoint}</p>
          <p className="text-sm text-zinc-400">
            {desk.webhook.secretConfigured
              ? 'The webhook secret is set. Delivery, bounce, and inbound mail update this desk and Release Studio collab.'
              : 'Add RESEND_WEBHOOK_SECRET so Resend can prove these events are real. Until then, inbound mail and delivery stamps stay off.'}
          </p>
          <a href="https://resend.com/webhooks" className="text-sm text-violet-200" target="_blank" rel="noreferrer">
            Open Resend webhooks
          </a>
        </div>
      ) : null}
    </div>
  )
}
