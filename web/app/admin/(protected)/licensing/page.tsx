'use client'

import { useEffect, useState } from 'react'

type QuoteHint = { cents: number | null; hold: boolean; estimate: boolean; reason: string }

type Inquiry = {
  id: string
  public_id: string
  status: string
  kind: string
  track_title: string | null
  risk_level: string
  risk_reasons: string[]
  rights_cleared: boolean | null
  rights_reasons: string[]
  quote_cents: number | null
  quote_status: string
  payment_status: string
  license_status: string
  agreement_production_enabled: boolean
  rights?: {
    usageType?: string
    reach?: string
    mediaBudget?: string
    needsStems?: boolean
    territory?: string
    term?: string
    exclusivity?: string
    authorizedUse?: { licenseId?: string; paidAdvertising?: boolean }
  }
  quoteHint?: QuoteHint
  licensing_clients?: { company_name?: string; email?: string; full_name?: string } | null
}

type Desk = {
  quoteSheet: {
    catalog: { usage: string; cents: number }[]
    customProductionCents: number
    exclusive: string
  }
  operator: {
    copyrightOwner: 'unconfirmed' | 'llc' | 'personal'
    stripeAccountName: string | null
    stripeNameMatchesLlc: boolean
    stripeChecked: boolean
    attorneyBlock: string | null
  }
  inbound: { ready: boolean; detail: string }
}

function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

export default function AdminLicensingPage() {
  const [rows, setRows] = useState<Inquiry[]>([])
  const [desk, setDesk] = useState<Desk | null>(null)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<string>('')
  const [cents, setCents] = useState('')
  const [note, setNote] = useState('')
  const [draft, setDraft] = useState('')

  async function load() {
    const response = await fetch('/api/admin/licensing/inquiries')
    const body = await response.json()
    if (!response.ok) throw new Error(body.error || 'Could not load inquiries.')
    setRows(body.inquiries || [])
    setDesk({
      quoteSheet: body.quoteSheet,
      operator: body.operator,
      inbound: body.inbound,
    })
  }

  async function saveFact(action: 'owner' | 'stripe', owner?: 'llc' | 'personal') {
    setError('')
    const response = await fetch('/api/admin/licensing/operator', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, owner }),
    })
    const body = await response.json()
    if (!response.ok) {
      setError(body.error || 'Could not save that fact.')
      return
    }
    await load()
  }

  useEffect(() => {
    load().catch((loadError) => setError(loadError instanceof Error ? loadError.message : 'Could not load inquiries.'))
  }, [])

  async function act(action: string) {
    if (!selected) return
    setError('')
    const response = await fetch(`/api/admin/licensing/inquiries/${selected}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, note, cents: cents ? Number(cents) : undefined }),
    })
    const body = await response.json()
    if (!response.ok) {
      setError(body.error || 'Update failed.')
      return
    }
    if (body.agreement) setDraft(body.agreement)
    if (body.licensePublicId) setNote(body.licensePublicId)
    await load()
  }

  const current = rows.find((row) => row.id === selected)

  return (
    <div className="p-6 text-gray-100 max-w-6xl">
      <h1 className="text-3xl font-semibold mb-2">Sync licensing</h1>
      <p className="text-gray-400 mb-6">Shop beat licenses stay on the Licenses page. The amounts below stay on this desk. A draft cannot be marked reviewed, and a paid quote cannot be activated, until the checks under this paragraph are clear.</p>
      {desk && (
        <div className="mb-6 grid gap-4 md:grid-cols-2">
          <section className="rounded-lg border border-white/10 p-4">
            <h2 className="text-lg font-medium mb-2">Private quote sheet</h2>
            <ul className="text-sm text-gray-300 space-y-1">
              {desk.quoteSheet.catalog.map((row) => (
                <li key={row.usage}>{row.usage}: starts at {dollars(row.cents)}</li>
              ))}
              <li>Custom production estimate: starts at {dollars(desk.quoteSheet.customProductionCents)}</li>
              <li>{desk.quoteSheet.exclusive}</li>
            </ul>
          </section>
          <section className="rounded-lg border border-white/10 p-4 space-y-3">
            <h2 className="text-lg font-medium">Before any license goes out</h2>
            <p className="text-sm text-gray-300">Copyright owner: {desk.operator.copyrightOwner}</p>
            <div className="flex flex-wrap gap-2">
              <button className="rounded border border-white/20 px-3 py-2 text-sm" type="button" onClick={() => saveFact('owner', 'llc')}>LLC owns the rights</button>
              <button className="rounded border border-white/20 px-3 py-2 text-sm" type="button" onClick={() => saveFact('owner', 'personal')}>Songwriter owns them personally</button>
            </div>
            <p className="text-sm text-gray-300">
              Stripe account: {desk.operator.stripeChecked ? desk.operator.stripeAccountName || 'No name returned' : 'Not checked'}
              {desk.operator.stripeChecked ? (desk.operator.stripeNameMatchesLlc ? ' — matches the LLC' : ' — does not match the LLC') : ''}
            </p>
            <button className="rounded border border-white/20 px-3 py-2 text-sm" type="button" onClick={() => saveFact('stripe')}>Check Stripe account name</button>
            {desk.operator.attorneyBlock && <p className="text-sm text-amber-200">{desk.operator.attorneyBlock}</p>}
            <p className="text-sm text-gray-400">{desk.inbound.detail}</p>
          </section>
        </div>
      )}
      {error && <p className="mb-4 text-red-300">{error}</p>}
      <div className="overflow-x-auto rounded-lg border border-white/10">
        <table className="w-full text-sm">
          <thead className="text-left text-gray-400">
            <tr>
              <th className="p-3">Inquiry</th>
              <th>Company</th>
              <th>Status</th>
              <th>Risk</th>
              <th>Payment</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className={row.id === selected ? 'bg-white/10' : ''} onClick={() => setSelected(row.id)}>
                <td className="p-3">{row.public_id}<div className="text-gray-500">{row.track_title || row.kind}</div></td>
                <td>{row.licensing_clients?.company_name}</td>
                <td>{row.status}</td>
                <td>{row.risk_level}</td>
                <td>{row.payment_status}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td className="p-4 text-gray-500" colSpan={5}>No licensing inquiries yet.</td></tr>}
          </tbody>
        </table>
      </div>
      {current && (
        <div className="mt-6 space-y-3">
          <h2 className="text-xl">{current.public_id}</h2>
          <p className="text-sm text-gray-300">
            {current.rights?.usageType || 'Usage not set'} · {current.rights?.reach || 'unknown'} distribution
            {current.rights?.needsStems ? ' · stems requested' : ''}
            {current.rights?.mediaBudget ? ` · budget ${current.rights.mediaBudget}` : ''}
          </p>
          {current.rights?.authorizedUse?.licenseId && (
            <p className="text-sm text-emerald-200">
              Authorized use {current.rights.authorizedUse.licenseId}. Paid advertising {current.rights.authorizedUse.paidAdvertising ? 'included' : 'not included'}.
            </p>
          )}
          <p className="text-sm text-gray-400">{(current.risk_reasons || []).join(' · ')}</p>
          {current.rights_cleared === false && <p className="text-sm text-amber-200">{(current.rights_reasons || []).join(' ')}</p>}
          {current.quoteHint && <p className="text-sm text-gray-300">{current.quoteHint.reason}{current.quoteHint.cents ? ` Suggested cents: ${current.quoteHint.cents}.` : ''}</p>}
          <label className="block text-sm">
            Quote amount in cents
            <input className="mt-1 block rounded bg-black border border-white/20 px-3 py-2" value={cents} onChange={(event) => setCents(event.target.value)} />
          </label>
          <label className="block text-sm">
            Note
            <textarea className="mt-1 block w-full rounded bg-black border border-white/20 px-3 py-2" value={note} onChange={(event) => setNote(event.target.value)} />
          </label>
          <div className="flex flex-wrap gap-2">
            <button className="rounded border border-white/20 px-3 py-2" type="button" onClick={() => act('clear')}>Clear verification</button>
            <button className="rounded border border-white/20 px-3 py-2" type="button" onClick={() => act('quote')}>Send quote</button>
            <button className="rounded border border-white/20 px-3 py-2" type="button" onClick={() => act('draft')}>Save draft</button>
            <button className="rounded border border-white/20 px-3 py-2 disabled:opacity-40" type="button" disabled={Boolean(desk?.operator.attorneyBlock)} onClick={() => act('review')}>Record attorney review</button>
            <button className="rounded border border-white/20 px-3 py-2 disabled:opacity-40" type="button" disabled={Boolean(desk?.operator.attorneyBlock)} onClick={() => act('activate')}>Activate</button>
            <button className="rounded border border-red-400/40 px-3 py-2 text-red-200" type="button" onClick={() => act('reject')}>Reject</button>
          </div>
          {draft && <pre className="whitespace-pre-wrap text-xs text-gray-300 bg-black/40 p-4 rounded">{draft}</pre>}
        </div>
      )}
    </div>
  )
}
