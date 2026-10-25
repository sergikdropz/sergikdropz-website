'use client'

import { useEffect, useState } from 'react'
import { contractMailboxHref } from '@/lib/studio/contract-mail-link'
import type { RightsPacketKind } from '@/lib/studio/rights-packets'

type MailRow = {
  id: string
  folder: string
  direction: 'in' | 'out'
  subject: string
  to: string
  fromName: string
  fromAddress: string
  status: string
  createdAt: string
  unread: boolean
}

type MailPayload = {
  available?: boolean
  account?: { name?: string; address?: string } | null
  messages?: MailRow[]
  error?: string
}

function when(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default function ContractMailboxStrip({
  releaseId,
  releaseTitle,
  packetLabel,
  kind,
  refreshKey = 0,
}: {
  releaseId: string
  releaseTitle?: string | null
  packetLabel: string
  kind: RightsPacketKind
  refreshKey?: number
}) {
  const [mail, setMail] = useState<MailPayload | null>(null)
  const href = contractMailboxHref({ releaseTitle, packetLabel })

  useEffect(() => {
    let cancelled = false
    const params = new URLSearchParams({ releaseId, kind })
    if (releaseTitle) params.set('releaseTitle', releaseTitle)
    void fetch(`/api/admin/email/mailbox?${params.toString()}`)
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as MailPayload
        if (!res.ok) throw new Error(data.error || 'Could not load the mailbox')
        return data
      })
      .then((data) => {
        if (!cancelled) setMail(data)
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setMail({
            available: false,
            error: error instanceof Error ? error.message : 'Could not load the mailbox',
          })
        }
      })
    return () => {
      cancelled = true
    }
  }, [releaseId, releaseTitle, kind, refreshKey])

  const rows = mail?.messages || []
  const address = mail?.account?.address || 'release.studio@sergikdropz.com'
  const name = mail?.account?.name || 'Release Studio'

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] uppercase tracking-wide text-zinc-500">Department mailbox</p>
        <a href={href} className="text-[11px] text-violet-300 hover:text-violet-200">
          Open mailbox
        </a>
      </div>
      <p className="text-xs text-zinc-300">
        {name} <span className="text-zinc-500">{address}</span>
      </p>
      {mail === null ? <p className="text-xs text-zinc-500">Loading mailbox…</p> : null}
      {mail?.error ? <p className="text-xs text-amber-300">{mail.error}</p> : null}
      {mail && mail.available === false && !mail.error ? (
        <p className="text-xs text-zinc-500">Department mail is not set up yet.</p>
      ) : null}
      {mail && mail.available !== false && rows.length === 0 && !mail.error ? (
        <p className="text-xs text-zinc-500">
          No mail for this contract yet. Email for signing files the PDF in this mailbox, and replies come back here.
        </p>
      ) : null}
      {rows.length ? (
        <ul className="space-y-1.5">
          {rows.slice(0, 6).map((row) => (
            <li key={row.id}>
              <a href={href} className="flex items-baseline justify-between gap-3 text-xs hover:text-white">
                <span className="min-w-0 truncate text-zinc-200">
                  <span className={row.direction === 'in' ? 'text-cyan-300' : 'text-zinc-500'}>
                    {row.direction === 'in' ? 'Reply' : 'Sent'}
                  </span>
                  <span className="mx-1.5 text-zinc-600">·</span>
                  {row.direction === 'in' ? row.fromName || row.fromAddress : row.to}
                  <span className="mx-1.5 text-zinc-600">·</span>
                  {row.subject || '(no subject)'}
                </span>
                <span className="shrink-0 text-zinc-600">{when(row.createdAt)}</span>
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
