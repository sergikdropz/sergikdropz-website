'use client'

import { useEffect, useState } from 'react'
import { MAIL_ALLOWANCE, mailUsage, type MailSetting } from '@/lib/email/department-desk'

type DeskSnapshot = {
  audiences: { count: number }[]
  webhook: { endpoint: string; secretConfigured: boolean }
}

export default function DepartmentMailSettings({
  setting,
  domain,
  sentCount,
}: {
  setting: MailSetting
  domain: string
  sentCount: number
}) {
  const [desk, setDesk] = useState<DeskSnapshot | null>(null)

  useEffect(() => {
    let cancelled = false
    void fetch('/api/admin/email/desk')
      .then(async (res) => {
        if (!res.ok) return
        const data = (await res.json()) as DeskSnapshot
        if (!cancelled) setDesk(data)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  const contacts = (desk?.audiences || []).reduce((sum, row) => sum + (row.count || 0), 0)
  const usage = mailUsage({ sent: sentCount, contacts })

  if (setting === 'usage') {
    return (
      <div className="space-y-4">
        <h2 className="text-sm font-medium text-zinc-300">Usage</h2>
        <p className="text-sm text-zinc-500">Current plan {MAIL_ALLOWANCE.price}. Counts are what this desk can see.</p>
        <dl className="grid gap-2 sm:grid-cols-2">
          <UsageCard label="Transactional" used={usage.transactional.used} limit={usage.transactional.limit} detail="Emails sent from department mailboxes" />
          <UsageCard label="Marketing" used={usage.contacts.used} limit={usage.contacts.limit} detail="Contacts across department audiences" />
        </dl>
      </div>
    )
  }

  if (setting === 'sending') {
    return (
      <div className="space-y-3">
        <h2 className="text-sm font-medium text-zinc-300">Sending</h2>
        <p className="text-sm text-zinc-500">
          Mail leaves from <span className="text-zinc-200">{domain}</span> through the verified Resend domain. Mailboxes are edited under Team. There is no separate SMTP login on this desk.
        </p>
      </div>
    )
  }

  if (setting === 'integrations') {
    const webhook = desk?.webhook
    return (
      <div className="space-y-3">
        <h2 className="text-sm font-medium text-zinc-300">Integrations</h2>
        <p className="text-sm text-zinc-300 break-all">{webhook?.endpoint || 'https://sergikdropz.com/api/webhooks/resend'}</p>
        <p className="text-sm text-zinc-400">
          {webhook?.secretConfigured
            ? 'The signing secret is set. Delivery and inbound events update this desk and Release Studio.'
            : 'The signing secret is not on this running server yet. Production picks it up on the next deploy.'}
        </p>
        <a href="https://resend.com/webhooks" className="text-sm text-violet-200" target="_blank" rel="noreferrer">
          Open Resend webhooks
        </a>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-medium text-zinc-300">Unsubscribe</h2>
      <p className="text-sm text-zinc-400">
        List mail includes a one-click unsubscribe link. Opening it marks that subscriber inactive so later broadcasts skip them.
      </p>
      <p className="break-all text-sm text-violet-200">https://sergikdropz.com/api/email/unsubscribe</p>
    </div>
  )
}

function UsageCard({ label, used, limit, detail }: { label: string; used: number; limit: number; detail: string }) {
  const width = Math.min(100, Math.round((used / limit) * 100))
  return (
    <div className="rounded-md border border-zinc-800 px-3 py-3">
      <dt className="text-xs uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className="mt-1 text-xl font-semibold">
        {used.toLocaleString()} <span className="text-sm font-normal text-zinc-500">/ {limit.toLocaleString()}</span>
      </dd>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-800">
        <div className="h-full bg-violet-500" style={{ width: `${width}%` }} />
      </div>
      <p className="mt-2 text-xs text-zinc-500">{detail}</p>
    </div>
  )
}
