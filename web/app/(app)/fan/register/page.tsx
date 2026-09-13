'use client'

import { useState, useEffect, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'

function FanRegisterForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const nextPath = searchParams.get('next') || '/fan/account'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [rememberMe, setRememberMe] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const [magicEmail, setMagicEmail] = useState('')
  const [magicDisplayName, setMagicDisplayName] = useState('')
  const [magicError, setMagicError] = useState<string | null>(null)
  const [magicDone, setMagicDone] = useState<string | null>(null)
  const [magicLoading, setMagicLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch('/api/auth/session', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled || !d.authenticated) return
        if (!d.isAdmin) router.replace(nextPath)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [router, nextPath])

  async function onSubmitPassword(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setDone(null)
    if (password !== passwordConfirm) {
      setError('Passwords do not match.')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/auth/fan/signup', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          displayName: displayName.trim() || undefined,
          next: nextPath,
          rememberMe,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Could not create account')
        return
      }
      if (data.session) {
        router.replace(nextPath)
        router.refresh()
        return
      }
      setDone(data.message || 'Check your email to confirm, then sign in with your password.')
    } catch {
      setError('Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  async function onSubmitMagic(e: React.FormEvent) {
    e.preventDefault()
    setMagicError(null)
    setMagicDone(null)
    setMagicLoading(true)
    try {
      const res = await fetch('/api/auth/fan/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: magicEmail,
          displayName: magicDisplayName.trim() || undefined,
          next: nextPath,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setMagicError(data.error || 'Could not start sign-up')
        return
      }
      setMagicDone(data.message || 'Check your email for the link.')
    } catch {
      setMagicError('Something went wrong')
    } finally {
      setMagicLoading(false)
    }
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-md rounded-xl border border-gray-800 bg-gray-900/80 p-8 shadow-xl">
        <h1 className="text-2xl font-semibold text-white mb-1">Create fan account</h1>
        <p className="text-sm text-gray-400 mb-6">
          Use an email and password to buy and download from the shop. Same account includes the vault and playlists.{' '}
          <Link href="/fan" className="text-emerald-400 hover:text-emerald-300">
            Overview
          </Link>
          .
        </p>

        <form onSubmit={onSubmitPassword} className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-xs font-medium text-gray-400 mb-1">
              Display name (optional)
            </label>
            <input
              id="name"
              type="text"
              autoComplete="nickname"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
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
              className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-xs font-medium text-gray-400 mb-1">
              Password (min. 8 characters)
            </label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label htmlFor="passwordConfirm" className="block text-xs font-medium text-gray-400 mb-1">
              Confirm password
            </label>
            <input
              id="passwordConfirm"
              type="password"
              autoComplete="new-password"
              required
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
              className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="rounded border-gray-600"
            />
            Keep me signed in on this device
          </label>

          {error && <p className="text-sm text-red-400">{error}</p>}
          {done && <p className="text-sm text-green-400">{done}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold text-sm transition-colors"
          >
            {loading ? 'Creating…' : 'Create account'}
          </button>
        </form>

        <details className="mt-8 rounded-lg border border-gray-800 bg-gray-950/50 p-4">
          <summary className="text-sm text-gray-300 cursor-pointer">Prefer email link only?</summary>
          <p className="text-xs text-gray-500 mt-2 mb-4">
            Magic link works for the vault and playlists. To purchase or download from the shop, add a password later
            under account settings.
          </p>
          <form onSubmit={onSubmitMagic} className="space-y-3">
            <input
              type="email"
              required
              placeholder="Email"
              value={magicEmail}
              onChange={(e) => setMagicEmail(e.target.value)}
              className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-white text-sm"
            />
            <input
              type="text"
              placeholder="Display name (optional)"
              value={magicDisplayName}
              onChange={(e) => setMagicDisplayName(e.target.value)}
              className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-white text-sm"
            />
            {magicError && <p className="text-xs text-red-400">{magicError}</p>}
            {magicDone && <p className="text-xs text-green-400">{magicDone}</p>}
            <button
              type="submit"
              disabled={magicLoading}
              className="w-full py-2 rounded-lg border border-gray-600 text-gray-200 text-sm hover:bg-gray-800 disabled:opacity-50"
            >
              {magicLoading ? 'Sending…' : 'Email me a sign-up link'}
            </button>
          </form>
        </details>

        <p className="mt-6 text-center text-sm text-gray-400">
          Already have an account?{' '}
          <Link href={`/fan/login?next=${encodeURIComponent(nextPath)}`} className="text-indigo-400 hover:text-indigo-300">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}

export default function FanRegisterPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[50vh] flex items-center justify-center text-gray-500 text-sm">Loading…</div>
      }
    >
      <FanRegisterForm />
    </Suspense>
  )
}
