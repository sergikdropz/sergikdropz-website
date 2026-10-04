'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { FaChevronDown } from 'react-icons/fa'
import {
  pickSavedBrowserEmail,
  preloadGoogleIdentity,
  renderGoogleSignInButton,
  setGoogleCredentialListener,
} from '@/lib/auth/browser-account'
import { SHARE_LISTEN_SOURCE } from '@/lib/shares/share-listen-gate'
import type { ShareKind } from '@/lib/shares/types'

export default function ShareListenUnlockGate({
  token,
  kind,
  variant = 'page',
  onUnlocked,
}: {
  token: string
  kind: ShareKind
  variant?: 'page' | 'embed'
  onUnlocked: () => Promise<void>
}) {
  const listenNoun = kind === 'track' ? 'track' : 'EP'
  const nextPath = `/s/${encodeURIComponent(token)}`

  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [googleClientId, setGoogleClientId] = useState<string | null>(null)
  const [savedBrowserEmail, setSavedBrowserEmail] = useState<string | null>(null)
  const [signInMenuOpen, setSignInMenuOpen] = useState(false)
  const emailRef = useRef<HTMLInputElement>(null)
  const signInMenuRef = useRef<HTMLDivElement>(null)
  const googleSlotRef = useRef<HTMLDivElement>(null)
  const unlockRef = useRef<(body: { email?: string; credential?: string; source?: string }) => Promise<void>>(
    async () => {},
  )

  useEffect(() => {
    let cancelled = false
    void fetch('/api/fan/vault-unlock/status', { credentials: 'include', cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { googleClientId?: string | null; unlocked?: boolean } | null) => {
        if (cancelled) return
        if (data?.unlocked) {
          void onUnlocked().catch((err: unknown) => {
            if (!cancelled) setError(err instanceof Error ? err.message : 'Could not unlock')
          })
          return
        }
        if (!data?.googleClientId) return
        setGoogleClientId(data.googleClientId)
        void preloadGoogleIdentity()
      })
      .catch(() => {
        /* the email field still accepts a typed address */
      })
    return () => {
      cancelled = true
    }
  }, [onUnlocked])

  useEffect(() => {
    let cancelled = false
    void pickSavedBrowserEmail('silent').then((saved) => {
      if (cancelled || !saved) return
      setSavedBrowserEmail(saved)
      setEmail((current) => current || saved)
    })
    return () => {
      cancelled = true
    }
  }, [])

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

  async function unlockWith(body: { email?: string; credential?: string; accessToken?: string; source?: string }) {
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
          source: body.source || SHARE_LISTEN_SOURCE,
          campaign: token,
        }),
      })
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
      if (!res.ok || data.ok !== true) {
        setError(typeof data.error === 'string' ? data.error : 'Could not unlock')
        return
      }
      await onUnlocked()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    await unlockWith({ email, source: SHARE_LISTEN_SOURCE })
  }

  unlockRef.current = unlockWith

  useEffect(() => {
    const slot = googleSlotRef.current
    if (!googleClientId || !slot) return
    let cancelled = false
    setGoogleCredentialListener((credential) => {
      void unlockRef.current({ credential, source: 'google' })
    })
    void renderGoogleSignInButton(slot, googleClientId).then((ok) => {
      if (!cancelled && !ok) setError('Google sign-in could not load. Use your email instead.')
    })
    return () => {
      cancelled = true
      setGoogleCredentialListener(null)
    }
  }, [googleClientId])

  return (
    <div
      className={`flex items-center justify-center bg-black px-4 py-16 ${
        variant === 'embed' ? 'h-full min-h-[560px] overflow-y-auto' : 'min-h-[70vh]'
      }`}
    >
      <div className="w-full max-w-md rounded-xl border border-gray-800 bg-gray-900/80 p-8 text-center shadow-xl">
        <h1 className="mb-4 w-full rounded border border-yellow-400 px-3 py-1.5 text-center font-six-caps text-3xl font-semibold text-yellow-400 sm:text-4xl">
          Enter email to listen
        </h1>
        <p className="mb-6 text-sm text-gray-400">
          Enter email or sign in with Google to unlock {listenNoun} listen. That Google email is added to the site
          list.
        </p>

        {googleClientId ? (
          <div className="mb-6">
            <div ref={googleSlotRef} className="flex min-h-11 w-full justify-center" />
            <p className="mt-2 text-center text-xs text-gray-500">
              The account chooser opens over this card. This page does not go to Google.
            </p>
          </div>
        ) : null}

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label htmlFor="share-listen-email" className="mb-1 block text-center text-xs font-medium text-gray-400">
              Email
            </label>
            <div ref={signInMenuRef} className="relative">
              <input
                ref={emailRef}
                id="share-listen-email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={`w-full rounded-lg border border-gray-700 bg-gray-800 py-2 text-center text-sm text-white focus:outline-none focus:ring-2 focus:ring-yellow-400 ${savedBrowserEmail ? 'px-10' : 'px-3'}`}
              />
              {savedBrowserEmail ? (
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
              ) : null}
              {signInMenuOpen && savedBrowserEmail ? (
                <div
                  role="menu"
                  aria-label="Sign-in options"
                  className="absolute right-0 top-full z-20 mt-1 w-full rounded-lg border border-gray-700 bg-gray-900 py-1 text-center shadow-xl"
                >
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
                </div>
              ) : null}
            </div>
          </div>
          <div>
            <label htmlFor="share-listen-name" className="mb-1 block text-center text-xs font-medium text-gray-400">
              Name, Username or Alias/AKA
            </label>
            <input
              id="share-listen-name"
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
            {loading ? 'Unlocking…' : 'Unlock music'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-400">
          Already use magic link sign-in?{' '}
          <Link href={`/fan/login?next=${encodeURIComponent(nextPath)}`} className="text-purple-400 hover:text-purple-300">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
