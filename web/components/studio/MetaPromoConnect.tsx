'use client'

import { useCallback, useEffect, useState } from 'react'
import { FaFacebook, FaInstagram, FaSpinner } from 'react-icons/fa'
import { useNotifications } from '@/contexts/NotificationContext'
import type { SocialPromoPlan, SocialPromoSummary } from '@/lib/studio/social-promo'

type MetaStatus = {
  app_configured: boolean
  connected: boolean
  ig_username: string | null
  page_name: string | null
  can_publish_instagram: boolean
  can_publish_facebook: boolean
  can_link_env: boolean
  oauth_redirect_path: string
  hint: string | null
  can_message_followers: false
}

type Props = {
  releaseId: string
  saving: boolean
  onPublished: (plan: SocialPromoPlan, summary: SocialPromoSummary) => void
}

export default function MetaPromoConnect({ releaseId, saving, onPublished }: Props) {
  const { showNotification } = useNotifications()
  const [status, setStatus] = useState<MetaStatus | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/studio/meta/status')
      const data = await res.json().catch(() => ({}))
      if (!res.ok) return
      setStatus(data)
    } catch {
      setStatus(null)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const url = new URL(window.location.href)
    const flag = url.searchParams.get('meta')
    if (!flag) return
    if (flag === 'connected') {
      showNotification('Instagram and the Facebook Page are connected for this schedule.', 'success')
    } else if (flag === 'denied') {
      showNotification('Meta connection was cancelled.', 'error')
    } else if (flag === 'missing_app') {
      showNotification('Add META_APP_ID and META_APP_SECRET, then connect again.', 'error')
    } else {
      showNotification('Meta connection failed. Confirm the OAuth redirect URI on the Meta app.', 'error')
    }
    url.searchParams.delete('meta')
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
    void load()
  }, [load, showNotification])

  async function publishDue() {
    setBusy('due')
    try {
      const res = await fetch(
        `/api/studio/releases/${encodeURIComponent(releaseId)}/social-promo/publish`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'due' }),
        }
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Publish failed')
      if (data.plan && data.summary) onPublished(data.plan, data.summary)
      const results = Array.isArray(data.results) ? data.results : []
      const posted = results.filter((row: { ok?: boolean }) => row.ok)
      const failed = results.filter(
        (row: { ok?: boolean; quiet?: boolean }) => row.ok === false && !row.quiet
      )
      if (posted.length) {
        showNotification(
          `Sent ${posted.length} promo slot${posted.length === 1 ? '' : 's'} to Meta.`,
          'success'
        )
      } else if (failed.length) {
        showNotification(failed[0]?.reason || 'Meta rejected the post.', 'error')
      } else {
        showNotification('No ready image slots are due yet.', 'success')
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Publish failed'
      showNotification(message, 'error')
    } finally {
      setBusy(null)
    }
  }

  async function linkEnv() {
    setBusy('link')
    try {
      const res = await fetch('/api/studio/meta/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not link the saved token')
      setStatus(data)
      showNotification('Linked the Facebook Page from the saved Instagram token.', 'success')
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Link failed'
      showNotification(message, 'error')
    } finally {
      setBusy(null)
    }
  }

  function connect() {
    const next = `${window.location.pathname}${window.location.search}`
    window.location.assign(`/api/studio/meta/connect?next=${encodeURIComponent(next)}`)
  }

  const redirect =
    typeof window !== 'undefined' ? `${window.location.origin}${status?.oauth_redirect_path || '/api/studio/meta/callback'}` : ''

  return (
    <div
      className="mb-4 rounded-lg border border-zinc-800 bg-black/40 px-3 py-3"
      data-testid="meta-promo-connect"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-xl">
          <p className="text-xs font-medium text-white flex items-center gap-2">
            <FaInstagram className="text-pink-400" />
            <FaFacebook className="text-blue-400" />
            Meta publish
          </p>
          <p className="text-xs text-zinc-400 mt-1">
            {status?.hint || 'Connect Instagram and the Facebook Page to publish ready image slots on their scheduled time.'}
            {status?.connected && status.ig_username ? ` @${status.ig_username}` : ''}
            {status?.connected && status.page_name ? ` · ${status.page_name}` : ''}
          </p>
          <p className="text-[11px] text-zinc-500 mt-1">
            Promo goes out as these scheduled posts. Instagram does not allow an app to message every follower, so Studio does not send promo DMs.
          </p>
          {!status?.connected && redirect ? (
            <p className="text-[11px] text-zinc-600 mt-1 break-all">
              Meta app redirect URI: {redirect}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={connect}
            disabled={busy !== null || !status?.app_configured}
            title={status?.app_configured ? 'Connect Instagram and Facebook' : 'Set META_APP_ID and META_APP_SECRET'}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium bg-blue-600/90 hover:bg-blue-500 text-white disabled:opacity-40"
          >
            {status?.connected ? 'Reconnect Meta' : 'Connect Meta'}
          </button>
          {status?.can_link_env ? (
            <button
              type="button"
              onClick={() => void linkEnv()}
              disabled={busy !== null}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs border border-zinc-700 text-zinc-200 hover:bg-zinc-800 disabled:opacity-40"
            >
              {busy === 'link' ? <FaSpinner className="animate-spin" /> : null}
              Link saved token
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => void publishDue()}
            disabled={busy !== null || saving || !status?.connected}
            data-testid="meta-publish-due"
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border border-violet-700 text-violet-200 hover:bg-violet-950/40 disabled:opacity-40"
          >
            {busy === 'due' ? <FaSpinner className="animate-spin" /> : null}
            Publish due slots
          </button>
        </div>
      </div>
    </div>
  )
}
