'use client'

import { useEffect, useState } from 'react'

type Desk = {
  publicId: string
  status: string
  trackTitle: string | null
  projectName: string
  quoteStatus: string
  quoteCents: number | null
  quoteCurrency: string
  quoteNote: string | null
  paymentStatus: string
  licenseStatus: string
  licensePublicId: string | null
  hold: boolean
}

export default function LicensingDesk({ token, payment }: { token: string; payment?: string }) {
  const [desk, setDesk] = useState<Desk | null>(null)
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  async function load() {
    const response = await fetch(`/api/licensing/desk/${token}`)
    const body = await response.json()
    if (!response.ok) throw new Error(body.error || 'Could not load this inquiry.')
    setDesk(body)
  }

  useEffect(() => {
    load().catch((loadError) => setError(loadError instanceof Error ? loadError.message : 'Could not load this inquiry.'))
  }, [token])

  async function accept() {
    setPending(true)
    setError('')
    try {
      const response = await fetch(`/api/licensing/desk/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'accept_quote' }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'Could not accept the quote.')
      setDesk(body)
    } catch (acceptError) {
      setError(acceptError instanceof Error ? acceptError.message : 'Could not accept the quote.')
    } finally {
      setPending(false)
    }
  }

  async function pay() {
    setPending(true)
    setError('')
    try {
      const response = await fetch('/api/licensing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const body = await response.json()
      if (!response.ok || !body.url) throw new Error(body.error || 'Could not start payment.')
      window.location.href = body.url
    } catch (payError) {
      setError(payError instanceof Error ? payError.message : 'Could not start payment.')
      setPending(false)
    }
  }

  if (error && !desk) return <p className="text-red-300">{error}</p>
  if (!desk) return <p className="text-gray-400">Loading your inquiry…</p>

  const fee = desk.quoteCents != null ? `${(desk.quoteCurrency || 'usd').toUpperCase()} ${(desk.quoteCents / 100).toFixed(2)}` : null

  return (
    <div className="space-y-4 rounded-xl border border-white/10 bg-gray-900/60 p-6">
      <h1 className="text-3xl text-white">{desk.publicId}</h1>
      <p className="text-gray-300">{desk.trackTitle || desk.projectName}</p>
      <p className="text-sm text-gray-400">Status: {desk.status.replace(/_/g, ' ')}</p>
      {payment === 'pending' && (
        <p className="text-amber-100 text-sm">Stripe sent you back here. The license stays unpaid until the signed webhook confirms the payment.</p>
      )}
      {desk.hold && <p className="text-amber-100 text-sm">This inquiry is on hold until SERGIK finishes verification.</p>}
      {fee && <p className="text-white">Quote: {fee}</p>}
      {desk.quoteNote && <p className="text-gray-400 text-sm">{desk.quoteNote}</p>}
      {desk.quoteStatus === 'sent' && (
        <button type="button" disabled={pending} onClick={accept} className="rounded-full bg-white text-black px-4 py-2">
          Accept quote
        </button>
      )}
      {(desk.status === 'QUOTE_ACCEPTED' || desk.status === 'PAYMENT_PENDING') && desk.paymentStatus !== 'paid' && (
        <button type="button" disabled={pending} onClick={pay} className="rounded-full bg-white text-black px-4 py-2">
          Pay with Stripe
        </button>
      )}
      {desk.paymentStatus === 'paid' && desk.licenseStatus !== 'active' && (
        <p className="text-gray-300 text-sm">Payment is confirmed. The license is not active until SERGIK activates it against the signed agreement.</p>
      )}
      {desk.licensePublicId && (
        <p className="text-gray-300 text-sm">Verification reference: {desk.licensePublicId}</p>
      )}
      {error && <p className="text-red-300 text-sm">{error}</p>}
    </div>
  )
}
