'use client'

import { useState, useEffect, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'

function FanLoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const nextPath = searchParams.get('next') || '/fan/account'
  const err = searchParams.get('error')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(true)
  const [error, setError] = useState<string | null>(err ? 'Sign-in link expired or invalid. Try again.' : null)
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
        if (d.isAdmin) {
          router.replace('/admin')
        } else {
          router.replace(nextPath)
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [router, nextPath])

  async function onSubmitPassword(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/auth/fan/password-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email,
          password,
          rememberMe,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Could not sign in')
        return
      }
      router.replace(nextPath)
      router.refresh()
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
      const res = await fetch('/api/auth/fan/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email: magicEmail,
          displayName: magicDisplayName.trim() || undefined,
          next: nextPath,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setMagicError(data.error || 'Could not send link')
        return
      }
      setMagicDone(data.message || 'Check your email for the sign-in link.')
    } catch {
      setMagicError('Something went wrong')
    } finally {
      setMagicLoading(false)
    }
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-md rounded-xl border border-gray-800 bg-gray-900/80 p-8 shadow-xl">
        <h1 className="text-2xl font-semibold text-white mb-1">Fan sign in</h1>
        <p className="text-sm text-gray-400 mb-6">
          Purchases and downloads use your email and password.{' '}
          <Link href="/fan" className="text-emerald-400 hover:text-emerald-300">
            Free fan membership
          </Link>{' '}
          also covers the vault and playlists.
        </p>

        <form onSubmit={onSubmitPassword} className="space-y-4">
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
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold text-sm transition-colors"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="mt-4 text-center text-sm">
          <Link
            href={`/fan/set-password?next=${encodeURIComponent(nextPath)}`}
            className="text-gray-400 hover:text-gray-300"
          >
            Signed in with email link before? Add a password for the shop
          </Link>
        </p>

        <details className="mt-8 rounded-lg border border-gray-800 bg-gray-950/50 p-4">
          <summary className="text-sm text-gray-300 cursor-pointer">Sign in with email link instead</summary>
          <p className="text-xs text-gray-500 mt-2 mb-4">
            Fine for listening and playlists only. You will need a password to check out.
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
              placeholder="Name (optional, first time)"
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
              {magicLoading ? 'Sending…' : 'Email me a sign-in link'}
            </button>
          </form>
        </details>

        <p className="mt-6 text-center text-sm text-gray-400">
          New here?{' '}
          <Link href={`/fan/register?next=${encodeURIComponent(nextPath)}`} className="text-indigo-400 hover:text-indigo-300">
            Create account
          </Link>
        </p>
        <p className="mt-3 text-center text-sm text-gray-400">
          Only need the vault?{' '}
          <Link href="/music-library/unlock" className="text-indigo-400 hover:text-indigo-300">
            Unlock with email
          </Link>
        </p>
        <p className="mt-2 text-center text-xs text-gray-500">
          Artist / admin?{' '}
          <Link href="/admin/login" className="text-gray-400 hover:text-gray-300 underline">
            Admin login
          </Link>
        </p>
      </div>
    </div>
  )
}

export default function FanLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[50vh] flex items-center justify-center text-gray-500 text-sm">Loading…</div>
      }
    >
      <FanLoginForm />
    </Suspense>
  )
}
