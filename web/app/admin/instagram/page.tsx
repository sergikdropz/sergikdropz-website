'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { HOMEPAGE_INSTAGRAM_FEED_ENABLED_KEY } from '@/lib/site-settings-keys'
import { FaInstagram, FaExternalLinkAlt } from 'react-icons/fa'

export default function AdminInstagramDashboard() {
  const { user, isAdmin, loading } = useAuth()
  const router = useRouter()
  const [feedEnabled, setFeedEnabled] = useState(false)
  const [loadingSettings, setLoadingSettings] = useState(true)
  const [saving, setSaving] = useState(false)
  const [envNote, setEnvNote] = useState<string | null>(null)

  useEffect(() => {
    if (!loading && (!user || !isAdmin)) {
      router.push('/admin/login')
    }
  }, [user, isAdmin, loading, router])

  const loadSetting = useCallback(async () => {
    const env = process.env.NEXT_PUBLIC_SHOW_INSTAGRAM_FEED
    if (env === 'false') {
      setEnvNote(
        'Homepage feed is forced OFF by NEXT_PUBLIC_SHOW_INSTAGRAM_FEED=false (Vercel env). Remove or change it to use this toggle.'
      )
    } else if (env === 'true') {
      setEnvNote(
        'Homepage feed is forced ON by NEXT_PUBLIC_SHOW_INSTAGRAM_FEED=true. This toggle is ignored until that env var is removed.'
      )
    } else {
      setEnvNote(null)
    }

    try {
      const response = await fetch('/api/admin/settings')
      if (!response.ok) throw new Error('Failed to load settings')
      const data = await response.json()
      const raw = data.settings?.[HOMEPAGE_INSTAGRAM_FEED_ENABLED_KEY]?.value
      if (raw === true || raw === 'true') setFeedEnabled(true)
      else if (raw === false || raw === 'false') setFeedEnabled(false)
      else setFeedEnabled(false)
    } catch {
      setFeedEnabled(false)
    } finally {
      setLoadingSettings(false)
    }
  }, [])

  useEffect(() => {
    if (isAdmin) loadSetting()
  }, [isAdmin, loadSetting])

  async function saveFeedEnabled(next: boolean) {
    setSaving(true)
    try {
      const response = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: HOMEPAGE_INSTAGRAM_FEED_ENABLED_KEY,
          value: next,
          description:
            'When true, the public homepage shows the Instagram grid (unless NEXT_PUBLIC_SHOW_INSTAGRAM_FEED overrides).',
        }),
      })
      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error(err.error || 'Save failed')
      }
      setFeedEnabled(next)
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Could not save setting')
    } finally {
      setSaving(false)
    }
  }

  if (loading || !user || !isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-white">
        Loading…
      </div>
    )
  }

  const envLocked = process.env.NEXT_PUBLIC_SHOW_INSTAGRAM_FEED === 'true' || process.env.NEXT_PUBLIC_SHOW_INSTAGRAM_FEED === 'false'

  return (
    <div className="min-h-screen bg-black text-white p-6 md:p-10">
      <div className="max-w-2xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <FaInstagram className="text-pink-500" aria-hidden />
            Instagram
          </h1>
          <p className="text-gray-400 mt-2">
            Control the homepage Instagram section and open the helper to manage post URLs and API tools.
          </p>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-white">Homepage feed</h2>
              <p className="text-sm text-gray-400 mt-1">
                Show the Instagram grid on the public homepage (runtime setting in Supabase).
              </p>
            </div>
            <label className="inline-flex items-center gap-3 cursor-pointer select-none">
              <span className="text-sm text-gray-300">{feedEnabled ? 'On' : 'Off'}</span>
              <button
                type="button"
                role="switch"
                aria-checked={feedEnabled ? 'true' : 'false'}
                disabled={loadingSettings || saving || envLocked}
                onClick={() => saveFeedEnabled(!feedEnabled)}
                className={`relative inline-flex h-8 w-14 shrink-0 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 disabled:opacity-50 ${
                  feedEnabled ? 'bg-pink-600' : 'bg-gray-600'
                }`}
              >
                <span
                  className={`inline-block h-7 w-7 mt-0.5 ml-0.5 rounded-full bg-white shadow transition-transform ${
                    feedEnabled ? 'translate-x-6' : 'translate-x-0'
                  }`}
                />
              </button>
            </label>
          </div>

          {envNote && (
            <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 px-4 py-3 text-sm text-amber-100">
              {envNote}
            </div>
          )}

          {!envLocked && (
            <p className="text-xs text-gray-500">
              Changes apply within about a minute on the live site (short CDN cache). Hard-refresh the homepage to verify.
            </p>
          )}
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-lg font-semibold mb-2">Instagram Helper</h2>
          <p className="text-sm text-gray-400 mb-4">
            Add post URLs, refresh from the API, OAuth, and scripts — same tools as before, now reachable from the dashboard.
          </p>
          <Link
            href="/instagram-helper"
            className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 px-5 py-3 text-sm font-semibold text-white hover:opacity-90 transition-opacity"
          >
            Open Instagram Helper
            <FaExternalLinkAlt className="w-3 h-3 opacity-90" aria-hidden />
          </Link>
        </div>

        <p className="text-xs text-gray-600">
          Setting key: <code className="text-gray-400">{HOMEPAGE_INSTAGRAM_FEED_ENABLED_KEY}</code>
        </p>
      </div>
    </div>
  )
}
