'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { FaDownload, FaLink, FaLock, FaTimes } from 'react-icons/fa'
import { FloatingMenuPortal } from '@/components/ui/FloatingMenuPortal'
import { createMusicShare, shareClipboardOrigin } from '@/lib/shares/client'
import {
  normalizeDownloadEmails,
  shareDownloadUrl,
  type ShareDownloadFormat,
  type ShareDownloadScope,
} from '@/lib/shares/share-download'
import type { ReleaseShareTrack } from '@/lib/shares/release-share-tracks'

type GrantRow = {
  format: ShareDownloadFormat
  scope: ShareDownloadScope
  trackId: string
  emails: string[]
}

type Props = {
  open: boolean
  folderId: string
  releaseTitle: string
  tracks: ReleaseShareTrack[]
  initialTrackId?: string
  onClose: () => void
}

function grantKey(format: ShareDownloadFormat, scope: ShareDownloadScope, trackId: string) {
  return `${scope}:${format}:${scope === 'track' ? trackId : ''}`
}

function formatDuration(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return ''
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function ShareDownloadFloater({
  open,
  folderId,
  releaseTitle,
  tracks,
  initialTrackId,
  onClose,
}: Props) {
  const [token, setToken] = useState('')
  const [grants, setGrants] = useState<GrantRow[]>([])
  const [format, setFormat] = useState<ShareDownloadFormat>('mp3')
  const [scope, setScope] = useState<ShareDownloadScope>(tracks.length > 1 ? 'release' : 'track')
  const [trackId, setTrackId] = useState(initialTrackId || tracks[0]?.id || '')
  const [draft, setDraft] = useState('')
  const [notify, setNotify] = useState(true)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const selectionTrackId = scope === 'track' ? trackId : ''
  const emails = useMemo(() => {
    const match = grants.find(
      (grant) => grantKey(grant.format, grant.scope, grant.trackId) === grantKey(format, scope, selectionTrackId),
    )
    return match?.emails || []
  }, [format, grants, scope, selectionTrackId])

  useEffect(() => {
    if (!open) return
    setTrackId(initialTrackId || tracks[0]?.id || '')
    setError(null)
    setStatus(null)
    let cancelled = false
    ;(async () => {
      try {
        const payload = await createMusicShare({
          kind: 'folder',
          targetId: folderId,
        })
        if (cancelled) return
        setToken(payload.share.token)
        const res = await fetch(`/api/shares/${encodeURIComponent(payload.share.token)}/download/access`)
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json.error || 'Could not load people with access')
        if (!cancelled) setGrants(Array.isArray(json.grants) ? json.grants : [])
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not open sharing')
      }
    })()
    const focus = window.setTimeout(() => inputRef.current?.focus(), 40)
    return () => {
      cancelled = true
      window.clearTimeout(focus)
    }
    // Reload when the dialog opens. Track list identity changes every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folderId, initialTrackId, open])

  useEffect(() => {
    if (!open) return
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, open])

  const selectedTrack = tracks.find((track) => track.id === trackId) || tracks[0]
  const shareName =
    scope === 'track' ? selectedTrack?.title || releaseTitle || 'This track' : releaseTitle || 'This EP'
  const link =
    token && emails.length
      ? shareDownloadUrl(shareClipboardOrigin(), token, {
          format,
          scope,
          trackId: selectionTrackId,
        })
      : ''

  async function persist(nextEmails: string[], notifyEmails: string[] = []) {
    if (!token) throw new Error('Share link is still opening')
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/shares/${encodeURIComponent(token)}/download/access`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          format,
          scope,
          trackId: selectionTrackId,
          emails: nextEmails,
          notifyEmails,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Could not save access')
      const saved = json.grant as GrantRow
      setGrants((prev) => {
        const key = grantKey(saved.format, saved.scope, saved.trackId || '')
        const rest = prev.filter(
          (grant) => grantKey(grant.format, grant.scope, grant.trackId) !== key,
        )
        return [...rest, { ...saved, trackId: saved.trackId || '' }]
      })
      return json as { notified?: string[]; notifyErrors?: string[] }
    } finally {
      setBusy(false)
    }
  }

  async function addEmail() {
    const parsed = normalizeDownloadEmails(draft)
    if (!parsed.emails.length) {
      setError(parsed.rejected[0] ? `${parsed.rejected[0]} is not an email` : 'Add an email address')
      return
    }
    const next = [...emails]
    for (const email of parsed.emails) {
      if (!next.includes(email)) next.push(email)
    }
    setDraft('')
    try {
      const result = await persist(next, notify ? parsed.emails.filter((email) => next.includes(email)) : [])
      const notified = result.notified || []
      const failed = result.notifyErrors?.[0]
      if (failed && notified.length === 0) {
        setStatus('Access saved.')
        setError(failed)
        return
      }
      setError(null)
      setStatus(notified.length ? `Emailed ${notified.join(', ')}.` : 'Access saved.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add that email')
    }
  }

  async function removeEmail(email: string) {
    try {
      await persist(emails.filter((row) => row !== email))
      setStatus(`Removed ${email}.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove that email')
    }
  }

  async function copyLink() {
    if (!emails.length) {
      setError('Add at least one email. This link stays locked to people you choose.')
      return
    }
    try {
      await persist(emails)
      await navigator.clipboard.writeText(link)
      setStatus('Restricted link copied.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not copy the link')
    }
  }

  async function sendAll() {
    if (!emails.length) {
      setError('Add the emails that should receive this download.')
      return
    }
    try {
      const result = await persist(emails, emails)
      const notified = result.notified || []
      const failed = result.notifyErrors?.[0]
      if (failed && notified.length === 0) {
        setStatus(null)
        setError(failed)
        return
      }
      setError(null)
      setStatus(
        failed
          ? `Emailed ${notified.join(', ')}. ${failed}`
          : `Sent to ${notified.length} ${notified.length === 1 ? 'person' : 'people'}.`,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the email')
    }
  }

  if (!open) return null

  return (
    <FloatingMenuPortal>
      <div className="fixed inset-0 flex items-start justify-center px-4 pt-[10vh]">
        <button type="button" className="absolute inset-0 bg-black/65" aria-label="Close share dialog" onClick={onClose} />
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="share-download-title"
          className="relative w-full max-w-md overflow-hidden rounded-2xl border border-gray-700 bg-gray-950 text-white shadow-[0_24px_80px_rgba(0,0,0,0.55)]"
        >
          <div className="flex items-start justify-between gap-3 px-4 pb-2 pt-4">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-500">Share download</p>
              <h2 id="share-download-title" className="truncate text-base font-semibold">
                {shareName}
              </h2>
            </div>
            <button
              type="button"
              className="rounded-md p-1 text-gray-400 hover:bg-gray-800 hover:text-white"
              aria-label="Close"
              onClick={onClose}
            >
              <FaTimes className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="space-y-4 px-4 pb-4">
            <div>
              <p className="mb-1.5 text-xs text-gray-400">What do you want to share?</p>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  disabled={tracks.length === 0}
                  className={`rounded-full px-3 py-1 text-xs ${scope === 'track' ? 'bg-white text-black' : 'bg-gray-800 text-gray-200'}`}
                  onClick={() => setScope('track')}
                >
                  This track
                </button>
                <button
                  type="button"
                  disabled={tracks.length < 2}
                  className={`rounded-full px-3 py-1 text-xs disabled:opacity-40 ${scope === 'release' ? 'bg-white text-black' : 'bg-gray-800 text-gray-200'}`}
                  onClick={() => setScope('release')}
                >
                  Whole EP
                </button>
                <span className="mx-1 w-px self-stretch bg-gray-800" />
                {(['mp3', 'wav'] as const).map((id) => (
                  <button
                    key={id}
                    type="button"
                    className={`rounded-full px-3 py-1 text-xs uppercase ${format === id ? 'bg-white text-black' : 'bg-gray-800 text-gray-200'}`}
                    onClick={() => setFormat(id)}
                  >
                    {id}
                  </button>
                ))}
              </div>
              {scope === 'track' && tracks.length > 1 ? (
                <select
                  value={trackId}
                  onChange={(event) => setTrackId(event.target.value)}
                  className="mt-2 w-full rounded-md border border-gray-700 bg-gray-900 px-2 py-1.5 text-xs text-white outline-none focus:border-gray-400"
                >
                  {tracks.map((track) => (
                    <option key={track.id} value={track.id}>
                      {track.title}
                      {formatDuration(track.duration) ? ` (${formatDuration(track.duration)})` : ''}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>

            <div>
              <label htmlFor="share-download-email" className="mb-1.5 block text-xs text-gray-400">
                Who can download this?
              </label>
              <div className="flex gap-2">
                <input
                  id="share-download-email"
                  ref={inputRef}
                  type="email"
                  value={draft}
                  placeholder="name@email.com"
                  disabled={busy || !token}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      void addEmail()
                    }
                  }}
                  className="min-w-0 flex-1 rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm outline-none placeholder:text-gray-600 focus:border-gray-400"
                />
                <button
                  type="button"
                  disabled={busy || !token}
                  className="rounded-lg bg-white px-3 text-sm font-medium text-black disabled:opacity-40"
                  onClick={() => void addEmail()}
                >
                  Add
                </button>
              </div>
              <label className="mt-2 flex items-center gap-2 text-[11px] text-gray-400">
                <input
                  type="checkbox"
                  checked={notify}
                  onChange={(event) => setNotify(event.target.checked)}
                />
                Email them a private link
              </label>
            </div>

            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-500">
                People with access
              </p>
              {emails.length === 0 ? (
                <p className="rounded-lg border border-dashed border-gray-800 px-3 py-2 text-xs text-gray-500">
                  Nobody yet. Only emails you add can download.
                </p>
              ) : (
                <ul className="max-h-36 space-y-1 overflow-y-auto">
                  {emails.map((email) => (
                    <li key={email} className="flex items-center gap-2 rounded-lg px-1 py-1 hover:bg-gray-900">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-rose-900/70 text-[11px] font-semibold uppercase">
                        {email.slice(0, 1)}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm">{email}</span>
                      <button
                        type="button"
                        disabled={busy}
                        className="px-1 text-[11px] text-gray-500 hover:text-white"
                        onClick={() => void removeEmail(email)}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex items-center gap-2 rounded-lg bg-gray-900 px-3 py-2 text-xs text-gray-300">
              <FaLock className="h-3 w-3 text-amber-300" aria-hidden />
              <span>Restricted. Anyone with the link still has to be on this list.</span>
            </div>

            {error ? <p className="text-xs text-rose-300">{error}</p> : null}
            {status ? <p className="text-xs text-emerald-300">{status}</p> : null}
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-gray-800 px-4 py-3">
            <button
              type="button"
              disabled={busy || !emails.length}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-100 hover:bg-gray-900 disabled:opacity-40"
              onClick={() => void copyLink()}
            >
              <FaLink className="h-3 w-3" aria-hidden />
              Copy link
            </button>
            <button
              type="button"
              disabled={busy || !emails.length}
              className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-500 disabled:opacity-40"
              onClick={() => void sendAll()}
            >
              <FaDownload className="h-3 w-3" aria-hidden />
              Send
            </button>
          </div>
        </div>
      </div>
    </FloatingMenuPortal>
  )
}
