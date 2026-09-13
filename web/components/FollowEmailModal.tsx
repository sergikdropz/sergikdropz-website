'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

type FollowEmailModalProps = {
  open: boolean
  onClose: () => void
}

export default function FollowEmailModal({ open, onClose }: FollowEmailModalProps) {
  const router = useRouter()
  const titleId = useId()
  const emailInputRef = useRef<HTMLInputElement>(null)

  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const goToFollow = useCallback(() => {
    onClose()
    router.push('/follow')
  }, [onClose, router])

  useEffect(() => {
    if (!open) return
    setError(null)
    const t = window.setTimeout(() => emailInputRef.current?.focus(), 50)
    return () => window.clearTimeout(t)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return

    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/email/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          name: name.trim() || undefined,
          source: 'homepage-follow',
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to subscribe')
      }

      setEmail('')
      setName('')
      goToFollow()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md rounded-xl border-2 border-white/30 bg-black/90 p-6 shadow-2xl text-left"
      >
        <h2 id={titleId} className="text-xl font-semibold text-white mb-1">
          Follow SERGIK
        </h2>
        <p className="text-sm text-gray-400 mb-3">
          Add your email for release updates, then continue to streaming and social links.
        </p>
        <p className="text-xs text-gray-500 mb-5">
          For playlists and shop purchases, create a{' '}
          <Link href="/fan/register?next=%2Ffan%2Faccount" className="text-emerald-400/90 hover:text-emerald-300 underline">
            free fan account with a password
          </Link>{' '}
          ($0). Email link sign-in is fine for listening if you add a password before checkout.
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label htmlFor="follow-modal-email" className="sr-only">
              Email
            </label>
            <input
              ref={emailInputRef}
              id="follow-modal-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              required
              className="w-full px-4 py-3 rounded-lg bg-white/10 border border-white/30 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-white/50"
            />
          </div>
          <div>
            <label htmlFor="follow-modal-name" className="sr-only">
              Name (optional)
            </label>
            <input
              id="follow-modal-name"
              type="text"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name (optional)"
              className="w-full px-4 py-3 rounded-lg bg-white/10 border border-white/30 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-white/50"
            />
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading || !email.trim()}
            className="w-full py-3 rounded-lg bg-white text-black font-semibold hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Saving…' : 'Continue'}
          </button>
        </form>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={goToFollow}
            className="text-sm text-gray-400 hover:text-white underline-offset-2 hover:underline"
          >
            Skip, show links only
          </button>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-gray-500 hover:text-gray-300"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
