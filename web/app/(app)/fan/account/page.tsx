'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

type FanPlaylist = {
  id: string
  name: string
  description?: string
  trackIds: string[]
  createdAt?: string
}

type PurchaseRow = {
  id: string
  stripe_session_id: string
  track_id: string | null
  track_title: string | null
  format: string
  product_type: string | null
  amount_paid: number | null
  currency: string | null
  purchased_at: string | null
}

type FanMembership = {
  planId: string
  status: string
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean | null
}

export default function FanAccountPage() {
  const router = useRouter()
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [playlists, setPlaylists] = useState<FanPlaylist[]>([])
  const [purchases, setPurchases] = useState<PurchaseRow[]>([])
  const [membership, setMembership] = useState<{
    active: boolean
    membership: FanMembership | null
  }>({ active: false, membership: null })
  const [hasPasswordCredential, setHasPasswordCredential] = useState(false)
  const [newPlName, setNewPlName] = useState('')
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    const sessionRes = await fetch('/api/auth/session', { credentials: 'include' })
    const session = await sessionRes.json()
    if (!session.authenticated || !session.user) {
      router.replace('/fan/login?next=/fan/account')
      return
    }
    setHasPasswordCredential(Boolean(session.hasPasswordCredential))
    if (session.isAdmin) {
      setIsAdmin(true)
      setUser(session.user)
      setLoading(false)
      return
    }
    setUser(session.user)
    setIsAdmin(false)

    const [plRes, prRes, memRes] = await Promise.all([
      fetch('/api/fan/playlists', { credentials: 'include' }),
      fetch('/api/fan/purchases', { credentials: 'include' }),
      fetch('/api/fan/membership', { credentials: 'include' }),
    ])
    const plJson = await plRes.json().catch(() => ({}))
    const prJson = await prRes.json().catch(() => ({}))
    const memJson = await memRes.json().catch(() => ({}))
    setPlaylists(plRes.ok ? plJson.playlists || [] : [])
    setPurchases(prRes.ok ? prJson.purchases || [] : [])
    setMembership({
      active: Boolean(memJson.active),
      membership: memJson.membership || null,
    })
    setLoading(false)
  }, [router])

  useEffect(() => {
    load()
  }, [load])

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
    router.replace('/fan/login')
    router.refresh()
  }

  async function createPlaylist(e: React.FormEvent) {
    e.preventDefault()
    if (!newPlName.trim()) return
    setCreating(true)
    try {
      const res = await fetch('/api/fan/playlists', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newPlName.trim() }),
      })
      if (res.ok) {
        const j = await res.json()
        if (j.playlist) setPlaylists((p) => [j.playlist, ...p])
        setNewPlName('')
      }
    } finally {
      setCreating(false)
    }
  }

  async function removePlaylist(id: string) {
    if (!confirm('Delete this playlist?')) return
    const res = await fetch(`/api/fan/playlists/${id}`, { method: 'DELETE', credentials: 'include' })
    if (res.ok) setPlaylists((p) => p.filter((x) => x.id !== id))
  }

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center text-gray-400 text-sm">Loading…</div>
    )
  }

  if (isAdmin) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center text-gray-300">
        <p className="mb-4">You are signed in as an admin. Fan playlists and purchases are for public accounts.</p>
        <Link href="/admin" className="text-indigo-400 hover:text-indigo-300">
          Go to dashboard
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-12 space-y-10">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Your account</h1>
          <p className="text-sm text-gray-400 mt-1">{user?.email}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/music-library"
            className="px-4 py-2 rounded-lg border border-gray-600 text-sm text-gray-200 hover:bg-gray-800/60"
          >
            Music library
          </Link>
          <Link
            href="/shop"
            className="px-4 py-2 rounded-lg border border-gray-600 text-sm text-gray-200 hover:bg-gray-800/60"
          >
            Shop
          </Link>
          <button
            type="button"
            onClick={logout}
            className="px-4 py-2 rounded-lg bg-gray-800 text-sm text-gray-200 hover:bg-gray-700"
          >
            Sign out
          </button>
        </div>
      </div>

      {!hasPasswordCredential && (
        <section className="rounded-xl border border-amber-600/50 bg-amber-950/25 px-4 py-4">
          <h2 className="text-lg font-medium text-white mb-1">Shop purchases &amp; downloads</h2>
          <p className="text-sm text-gray-300 mb-3">
            Add a password to your account to check out and download music from the shop.
          </p>
          <Link
            href="/fan/set-password?next=%2Ffan%2Faccount"
            className="inline-block px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-sm font-semibold"
          >
            Add password
          </Link>
        </section>
      )}

      {membership.active && membership.membership ? (
        <section className="rounded-xl border border-purple-900/50 bg-purple-950/20 px-4 py-4">
          <h2 className="text-lg font-medium text-white mb-1">Membership</h2>
          <p className="text-sm text-gray-300">
            Plan <span className="font-medium text-white">{membership.membership.planId}</span>
            <span className="text-gray-500"> · </span>
            {membership.membership.status}
          </p>
          {membership.membership.currentPeriodEnd && (
            <p className="text-xs text-gray-400 mt-2">
              Current period ends{' '}
              {new Date(membership.membership.currentPeriodEnd).toLocaleDateString(undefined, {
                dateStyle: 'medium',
              })}
              {membership.membership.cancelAtPeriodEnd ? ' (cancels at period end)' : ''}
            </p>
          )}
          <Link
            href="/shop/membership/manage"
            className="inline-block mt-3 text-sm text-purple-300 hover:text-purple-200"
          >
            Manage subscription →
          </Link>
        </section>
      ) : (
        <section className="rounded-xl border border-emerald-900/50 bg-emerald-950/20 px-4 py-4">
          <h2 className="text-lg font-medium text-white mb-1">Free fan membership</h2>
          <p className="text-sm text-gray-300 mb-2">
            Your account includes the music vault, streaming in the library, personal playlist curation, and shop
            purchases linked here when you check out signed in.
          </p>
          <p className="text-sm text-gray-400 mb-3">
            Upgrade for paid perks (early drops, exclusive tiers, etc.)—optional.
          </p>
          <Link
            href="/shop/membership"
            className="inline-block text-sm text-emerald-300 hover:text-emerald-200"
          >
            View paid plans →
          </Link>
        </section>
      )}

      <section>
        <h2 className="text-lg font-medium text-white mb-3">Playlists</h2>
        <p className="text-sm text-gray-400 mb-4">
          Open the music library and expand <strong className="text-gray-300">My playlists</strong> to play or edit
          them.
        </p>
        <form onSubmit={createPlaylist} className="flex flex-col sm:flex-row gap-2 mb-4">
          <input
            value={newPlName}
            onChange={(e) => setNewPlName(e.target.value)}
            placeholder="New playlist name"
            className="flex-1 rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-white text-sm"
          />
          <button
            type="submit"
            disabled={creating}
            className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium disabled:opacity-50"
          >
            {creating ? '…' : 'Create'}
          </button>
        </form>
        <ul className="divide-y divide-gray-800 border border-gray-800 rounded-lg overflow-hidden">
          {playlists.length === 0 ? (
            <li className="px-4 py-6 text-sm text-gray-500">No playlists yet.</li>
          ) : (
            playlists.map((pl) => (
              <li key={pl.id} className="px-4 py-3 flex items-center justify-between gap-2">
                <div>
                  <div className="text-white text-sm font-medium">{pl.name}</div>
                  <div className="text-xs text-gray-500">{pl.trackIds.length} tracks</div>
                </div>
                <button
                  type="button"
                  onClick={() => removePlaylist(pl.id)}
                  className="text-xs text-red-400 hover:text-red-300"
                >
                  Delete
                </button>
              </li>
            ))
          )}
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-medium text-white mb-3">Purchases</h2>
        <p className="text-sm text-gray-400 mb-4">
          Buying while signed in links orders here. Older orders may only match by email.
        </p>
        <ul className="divide-y divide-gray-800 border border-gray-800 rounded-lg overflow-hidden">
          {purchases.length === 0 ? (
            <li className="px-4 py-6 text-sm text-gray-500">No purchases found yet.</li>
          ) : (
            purchases.map((p) => (
              <li key={p.id} className="px-4 py-3 text-sm">
                <div className="text-white">{p.track_title || p.track_id || 'Purchase'}</div>
                <div className="text-xs text-gray-500 mt-1 flex flex-wrap gap-x-3 gap-y-1">
                  <span>{p.product_type || p.format}</span>
                  {p.amount_paid != null && (
                    <span>
                      {((p.amount_paid || 0) / 100).toFixed(2)} {p.currency || 'usd'}
                    </span>
                  )}
                  {p.purchased_at && <span>{new Date(p.purchased_at).toLocaleDateString()}</span>}
                </div>
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  )
}
