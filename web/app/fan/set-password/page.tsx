'use client'

import { useState, useEffect, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'

function SetPasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const nextPath = searchParams.get('next') || '/fan/account'

  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch('/api/auth/session', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return
        if (!d.authenticated) {
          router.replace(`/fan/login?next=${encodeURIComponent(`/fan/set-password?next=${encodeURIComponent(nextPath)}`)}`)
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [router, nextPath])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password !== passwordConfirm) {
      setError('Passwords do not match.')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/auth/fan/set-password', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, passwordConfirm }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Could not update password')
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

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-md rounded-xl border border-gray-800 bg-gray-900/80 p-8 shadow-xl">
        <h1 className="text-2xl font-semibold text-white mb-1">Add a password</h1>
        <p className="text-sm text-gray-400 mb-6">
          Required to purchase or download from the shop. You can keep using email link sign-in if you prefer; this
          password is for checkout and managing purchases.
        </p>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label htmlFor="password" className="block text-xs font-medium text-gray-400 mb-1">
              New password (min. 8 characters)
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
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold text-sm transition-colors"
          >
            {loading ? 'Saving…' : 'Save password'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-400">
          <Link href={`/fan/account`} className="text-indigo-400 hover:text-indigo-300">
            Back to account
          </Link>
        </p>
      </div>
    </div>
  )
}

export default function FanSetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[50vh] flex items-center justify-center text-gray-500 text-sm">Loading…</div>
      }
    >
      <SetPasswordForm />
    </Suspense>
  )
}
