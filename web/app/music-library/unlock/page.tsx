'use client'

import { useState, useEffect, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { safeInternalPath } from '@/lib/safe-internal-path'

function UnlockVaultForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const nextPath = safeInternalPath(searchParams.get('next')) || '/music-library'
  const prefEmail = searchParams.get('email')?.trim() || ''
  const source = searchParams.get('src') || searchParams.get('utm_source') || ''
  const campaign = searchParams.get('campaign') || searchParams.get('utm_campaign') || ''

  const [email, setEmail] = useState(prefEmail)
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (prefEmail) setEmail(prefEmail)
  }, [prefEmail])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/fan/vault-unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email,
          displayName: displayName.trim() || undefined,
          source: source || undefined,
          campaign: campaign || undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Could not unlock')
        return
      }
      router.push(nextPath)
      router.refresh()
    } catch {
      setError('Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-md rounded-xl border border-gray-800 bg-gray-900/80 p-8 shadow-xl">
        <h1 className="text-2xl font-semibold text-white mb-1">Unlock the Music Vault</h1>
        <p className="text-sm text-gray-400 mb-6">
          Enter your email to listen in the vault. For playlists and checkout, create a free fan account with magic link
          sign-in—no paid plan required.
        </p>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-xs font-medium text-gray-400 mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
          <div>
            <label htmlFor="name" className="block text-xs font-medium text-gray-400 mb-1">
              Name or username (optional)
            </label>
            <input
              id="name"
              type="text"
              autoComplete="nickname"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-semibold text-sm transition-colors"
          >
            {loading ? 'Unlocking…' : 'Unlock vault'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-400">
          Already use magic link sign-in?{' '}
          <Link href={`/fan/login?next=${encodeURIComponent(nextPath)}`} className="text-purple-400 hover:text-purple-300">
            Sign in
          </Link>
        </p>
        <p className="mt-3 text-center text-xs text-gray-500">
          <Link href="/fan/register" className="text-gray-400 hover:text-gray-300 underline">
            Free fan signup
          </Link>{' '}
          unlocks playlists.{' '}
          <Link href="/shop/membership" className="text-gray-400 hover:text-gray-300 underline">
            Paid plans
          </Link>{' '}
          add extra perks.
        </p>
      </div>
    </div>
  )
}

export default function UnlockVaultPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[50vh] flex items-center justify-center text-gray-500 text-sm">Loading…</div>
      }
    >
      <UnlockVaultForm />
    </Suspense>
  )
}
