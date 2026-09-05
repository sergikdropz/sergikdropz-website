'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import MemberBadge from '@/components/shop/MemberBadge'

type MembershipInfo = {
  planId: string
  status: string
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean | null
  stripeCustomerId: string
}

export default function MemberManagePage() {
  const [email, setEmail] = useState('')
  const [membership, setMembership] = useState<MembershipInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [bootstrapping, setBootstrapping] = useState(true)
  const [checked, setChecked] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const s = await fetch('/api/auth/session', { credentials: 'include' })
        const j = await s.json()
        if (cancelled) return
        if (j.authenticated && j.user?.email) {
          setEmail(j.user.email)
        }
        if (j.authenticated && j.user && !j.isAdmin) {
          const res = await fetch('/api/membership/status', { credentials: 'include' })
          if (cancelled) return
          if (res.ok) {
            const data = await res.json()
            if (data.active && data.membership) {
              setMembership(data.membership)
              setChecked(true)
            }
          }
        }
      } finally {
        if (!cancelled) setBootstrapping(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const checkMembership = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) return

    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/membership/status?email=${encodeURIComponent(email)}`)
      if (res.ok) {
        const data = await res.json()
        setMembership(data.active ? data.membership : null)
      }
    } catch {
      setError('Failed to check membership status')
    } finally {
      setLoading(false)
      setChecked(true)
    }
  }

  const openPortal = async () => {
    if (!membership?.stripeCustomerId) return

    setLoading(true)
    try {
      const res = await fetch('/api/stripe/customer-portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId: membership.stripeCustomerId }),
      })

      if (res.ok) {
        const { url } = await res.json()
        if (url) window.location.href = url
      }
    } catch {
      setError('Failed to open billing portal')
    } finally {
      setLoading(false)
    }
  }

  if (bootstrapping) {
    return (
      <div className="min-h-screen pt-24 pb-16 px-4 flex items-center justify-center">
        <p className="text-gray-400 text-sm">Loading…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen pt-24 pb-16 px-4">
      <div className="max-w-lg mx-auto">
        <nav className="mb-8 flex flex-wrap items-center gap-4">
          <Link href="/shop" className="text-gray-400 hover:text-white text-sm transition-colors">
            ← Back to Shop
          </Link>
          <Link href="/fan/account" className="text-gray-500 hover:text-gray-300 text-sm transition-colors">
            Fan account
          </Link>
        </nav>

        <h1 className="text-2xl font-bold text-white mb-6 text-center">Member Dashboard</h1>

        {!checked ? (
          <form onSubmit={checkMembership} className="space-y-4">
            <p className="text-gray-400 text-sm text-center">
              Enter the email you used to subscribe, or sign in at Fan account — we prefill your email when you are
              logged in.
            </p>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
              className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-gray-500"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-white hover:bg-gray-200 disabled:bg-gray-700 text-black font-semibold rounded-lg transition-all"
            >
              {loading ? 'Checking...' : 'Check Membership'}
            </button>
          </form>
        ) : membership ? (
          <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-white font-semibold">Your Membership</h2>
              <MemberBadge planId={membership.planId} />
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">Status</span>
                <span className={`font-medium ${membership.status === 'active' ? 'text-green-400' : 'text-yellow-400'}`}>
                  {membership.status}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Current period ends</span>
                <span className="text-white">
                  {membership.currentPeriodEnd
                    ? new Date(membership.currentPeriodEnd).toLocaleDateString()
                    : '—'}
                </span>
              </div>
              {membership.cancelAtPeriodEnd && (
                <p className="text-yellow-400 text-xs mt-2">
                  Your subscription will cancel at the end of this period.
                </p>
              )}
            </div>

            <button
              onClick={openPortal}
              disabled={loading}
              className="w-full py-3 bg-gray-800 hover:bg-gray-700 text-white font-semibold rounded-lg text-sm transition-all"
            >
              {loading ? 'Opening...' : 'Manage Billing'}
            </button>

            <button
              onClick={() => { setChecked(false); setMembership(null); setEmail(''); }}
              className="w-full py-2 text-gray-500 hover:text-gray-300 text-sm transition-colors"
            >
              Check different email
            </button>
          </div>
        ) : (
          <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-6 text-center space-y-4">
            <p className="text-gray-400">No active membership found for {email}.</p>
            <Link
              href="/shop/membership"
              className="inline-block px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-all"
            >
              Become a Member
            </Link>
            <button
              onClick={() => { setChecked(false); setEmail(''); }}
              className="block w-full py-2 text-gray-500 hover:text-gray-300 text-sm transition-colors"
            >
              Try different email
            </button>
          </div>
        )}

        {error && <p className="text-red-400 text-sm text-center mt-4">{error}</p>}
      </div>
    </div>
  )
}
