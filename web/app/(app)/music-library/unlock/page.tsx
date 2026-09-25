'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { FaChevronDown } from 'react-icons/fa'
import { pickSavedBrowserEmail, requestGoogleAccessToken } from '@/lib/auth/browser-account'
import { safeInternalPath } from '@/lib/safe-internal-path'

function UnlockVaultForm() {
  const searchParams = useSearchParams()
  const nextPath = safeInternalPath(searchParams.get('next')) || '/music-library'
  const prefEmail = searchParams.get('email')?.trim() || ''
  const source = searchParams.get('src') || searchParams.get('utm_source') || ''
  const campaign = searchParams.get('campaign') || searchParams.get('utm_campaign') || ''

  const [email, setEmail] = useState(prefEmail)
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [googleClientId, setGoogleClientId] = useState<string | null>(null)
  const [savedBrowserEmail, setSavedBrowserEmail] = useState<string | null>(prefEmail || null)
  const [signInMenuOpen, setSignInMenuOpen] = useState(false)
  const emailRef = useRef<HTMLInputElement>(null)
  const signInMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (prefEmail) setEmail(prefEmail)
  }, [prefEmail])

  useEffect(() => {
    let cancelled = false
    void fetch('/api/fan/vault-unlock/status', { credentials: 'include', cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { googleClientId?: string | null } | null) => {
        if (!cancelled && data?.googleClientId) setGoogleClientId(data.googleClientId)
      })
      .catch(() => {
        /* the email field still accepts a typed address */
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (prefEmail) return
    let cancelled = false
    void pickSavedBrowserEmail('silent').then((saved) => {
      if (cancelled || !saved) return
      setSavedBrowserEmail(saved)
      setEmail((current) => current || saved)
    })
    return () => {
      cancelled = true
    }
  }, [prefEmail])

  useEffect(() => {
    if (!signInMenuOpen || savedBrowserEmail) return
    let cancelled = false
    void pickSavedBrowserEmail('optional').then((saved) => {
      if (cancelled || !saved) return
      setSavedBrowserEmail(saved)
      setEmail((current) => current || saved)
    })
    return () => {
      cancelled = true
    }
  }, [signInMenuOpen, savedBrowserEmail])

  useEffect(() => {
    if (!signInMenuOpen) return
    function onPointerDown(event: MouseEvent) {
      if (!signInMenuRef.current?.contains(event.target as Node)) setSignInMenuOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setSignInMenuOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [signInMenuOpen])

  async function unlockWith(body: { email?: string; accessToken?: string; source?: string }) {
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/fan/vault-unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ...body,
          displayName: displayName.trim() || undefined,
          source: body.source || source || 'vault_unlock',
          campaign: campaign || undefined,
        }),
      })
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
      if (!res.ok || data.ok !== true) {
        setError(typeof data.error === 'string' ? data.error : 'Could not unlock')
        return
      }
      window.location.assign(nextPath)
    } catch {
      setError('Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    await unlockWith({ email, source: source || 'vault_unlock' })
  }

  async function onGoogle() {
    setSignInMenuOpen(false)
    if (googleClientId) {
      setLoading(true)
      const accessToken = await requestGoogleAccessToken(googleClientId)
      if (accessToken) {
        await unlockWith({ accessToken, source: 'google' })
        return
      }
      setLoading(false)
    }
    const saved = await pickSavedBrowserEmail('optional')
    if (saved) setEmail(saved)
    emailRef.current?.focus()
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-md rounded-xl border border-gray-800 bg-gray-900/80 p-8 text-center shadow-xl">
        <h1 className="mb-4 w-full rounded border border-yellow-400 px-3 py-1.5 text-center font-six-caps text-3xl font-semibold text-yellow-400 sm:text-4xl">
          Exclusive ID SoundBank
        </h1>
        <p className="mb-6 text-sm text-gray-400">
          Use the email already saved in this browser, or pick a sign-in from the menu.
        </p>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="mb-1 block text-center text-xs font-medium text-gray-400">
              Email
            </label>
            <div ref={signInMenuRef} className="relative">
              <input
                ref={emailRef}
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-10 py-2 text-center text-sm text-white focus:outline-none focus:ring-2 focus:ring-yellow-400"
              />
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={signInMenuOpen}
                aria-label="Sign-in options"
                disabled={loading}
                onClick={() => setSignInMenuOpen((open) => !open)}
                className="absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded border border-gray-600 text-gray-300 transition-colors hover:border-yellow-400 hover:text-yellow-400 disabled:opacity-50"
              >
                <FaChevronDown
                  className={`h-3 w-3 transition-transform ${signInMenuOpen ? 'rotate-180' : ''}`}
                  aria-hidden
                />
              </button>
              {signInMenuOpen ? (
                <div
                  role="menu"
                  aria-label="Sign-in options"
                  className="absolute right-0 top-full z-20 mt-1 w-full rounded-lg border border-gray-700 bg-gray-900 py-1 text-center shadow-xl"
                >
                  {savedBrowserEmail ? (
                    <button
                      type="button"
                      role="menuitem"
                      disabled={loading}
                      onClick={() => {
                        setEmail(savedBrowserEmail)
                        setSignInMenuOpen(false)
                        emailRef.current?.focus()
                      }}
                      className="w-full px-3 py-2 text-center text-sm text-gray-100 transition-colors hover:bg-gray-800 hover:text-yellow-400 disabled:opacity-50"
                    >
                      Sign in with {savedBrowserEmail}
                    </button>
                  ) : null}
                  {googleClientId || !savedBrowserEmail ? (
                    <button
                      type="button"
                      role="menuitem"
                      disabled={loading}
                      onClick={() => void onGoogle()}
                      className="w-full px-3 py-2 text-center text-sm text-gray-100 transition-colors hover:bg-gray-800 hover:text-yellow-400 disabled:opacity-50"
                    >
                      Sign in with Google
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
          <div>
            <label htmlFor="name" className="mb-1 block text-center text-xs font-medium text-gray-400">
              Name, Username or Alias/AKA
            </label>
            <input
              id="name"
              name="name"
              type="text"
              autoComplete="nickname"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-center text-sm text-white focus:outline-none focus:ring-2 focus:ring-yellow-400"
            />
          </div>

          {error ? <p className="text-center text-sm text-red-400">{error}</p> : null}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded border border-yellow-400 px-3 py-1.5 text-center font-six-caps text-3xl font-semibold text-yellow-400 transition-colors hover:bg-yellow-400/10 disabled:opacity-50 sm:text-4xl"
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
