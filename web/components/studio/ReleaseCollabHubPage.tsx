'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/contexts/AdminAuthContext'
import StudioPageShell from './StudioPageShell'
import { useStudioReleases } from '@/lib/api/studio-hooks'
import { COLLAB_ROLES, type CollabRole } from '@/lib/studio/release-collab'
import { studioCollabHref, studioReleaseHref } from '@/lib/studio/studio-ia'
import { RELEASE_COLLAB_FROM_EMAIL } from '@/lib/studio/release-collab'

type CollabBundle = {
  release: {
    id: string
    title: string
    artworkUrl?: string | null
    albumArtist?: string | null
  }
  collaborators: Array<{
    id: string
    name: string
    email: string
    role: CollabRole
    notes: string | null
  }>
  messages: Array<{
    id: string
    author_type: string
    author_name: string
    body: string
    created_at: string
  }>
  sends: Array<{
    id: string
    to_email: string
    subject: string
    kind: string
    status: string
    created_at: string
  }>
  reviews: Array<{
    collaborator_id: string
    status: string
    note: string | null
  }>
  rightsContactSeeds: Array<{ name: string; email: string; role: CollabRole }>
}

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function CollabHubInner() {
  const { user, isAdmin, loading } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const selectedId = searchParams.get('release') || ''
  const { data: releases = [] } = useStudioReleases(null, Boolean(isAdmin))

  const [overview, setOverview] = useState<
    Array<{
      id: string
      title: string
      artworkUrl: string | null
      collaboratorCount: number
      messageCount: number
      pendingReviews: number
      lastMessageAt: string | null
    }>
  >([])
  const [bundle, setBundle] = useState<CollabBundle | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<CollabRole>('collaborator')
  const [message, setMessage] = useState('')
  const [notify, setNotify] = useState(true)
  const [inviteNote, setInviteNote] = useState('')
  const [lastPortalUrl, setLastPortalUrl] = useState<string | null>(null)

  const loadOverview = useCallback(async () => {
    const res = await fetch('/api/studio/collab')
    const data = await res.json().catch(() => ({}))
    if (res.status === 503) {
      setError(data.error || 'Apply add_release_collab.sql migration')
      return
    }
    if (!res.ok) {
      setError(data.error || 'Failed to load collab overview')
      return
    }
    setOverview(data.releases || [])
  }, [])

  const loadBundle = useCallback(async (releaseId: string) => {
    setBusy(true)
    setError(null)
    setLastPortalUrl(null)
    try {
      const res = await fetch(`/api/studio/releases/${encodeURIComponent(releaseId)}/collab`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Failed to load release collab')
        setBundle(null)
        return
      }
      setBundle(data)
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    if (!isAdmin) return
    loadOverview()
  }, [isAdmin, loadOverview])

  useEffect(() => {
    if (!isAdmin || !selectedId) {
      setBundle(null)
      return
    }
    loadBundle(selectedId)
  }, [isAdmin, selectedId, loadBundle])

  function selectRelease(id: string) {
    router.push(studioCollabHref(id))
  }

  async function addCollaborator(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedId) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/studio/releases/${encodeURIComponent(selectedId)}/collab/collaborators`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, role }),
        },
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Failed to add collaborator')
        return
      }
      setName('')
      setEmail('')
      setRole('collaborator')
      await loadBundle(selectedId)
      await loadOverview()
    } finally {
      setBusy(false)
    }
  }

  async function importRightsContacts() {
    if (!bundle?.rightsContactSeeds?.length || !selectedId) return
    setBusy(true)
    setError(null)
    try {
      for (const seed of bundle.rightsContactSeeds) {
        await fetch(
          `/api/studio/releases/${encodeURIComponent(selectedId)}/collab/collaborators`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(seed),
          },
        )
      }
      await loadBundle(selectedId)
      await loadOverview()
    } finally {
      setBusy(false)
    }
  }

  async function removeCollaborator(id: string) {
    if (!selectedId) return
    setBusy(true)
    try {
      await fetch(
        `/api/studio/releases/${encodeURIComponent(selectedId)}/collab/collaborators?id=${encodeURIComponent(id)}`,
        { method: 'DELETE' },
      )
      await loadBundle(selectedId)
      await loadOverview()
    } finally {
      setBusy(false)
    }
  }

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedId || !message.trim()) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/studio/releases/${encodeURIComponent(selectedId)}/collab/messages`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body: message, notify }),
        },
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Failed to post message')
        return
      }
      setMessage('')
      await loadBundle(selectedId)
      await loadOverview()
    } finally {
      setBusy(false)
    }
  }

  async function sendInvite(collaboratorId: string) {
    if (!selectedId) return
    setBusy(true)
    setError(null)
    setLastPortalUrl(null)
    try {
      const res = await fetch(
        `/api/studio/releases/${encodeURIComponent(selectedId)}/collab/invites`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ collaboratorId, note: inviteNote || undefined }),
        },
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Failed to send invite')
        return
      }
      setLastPortalUrl(data.portalUrl || null)
      await loadBundle(selectedId)
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center text-zinc-500">
        Loading…
      </div>
    )
  }

  if (!user || !isAdmin) return null

  const reviewByCollab = new Map(
    (bundle?.reviews || []).map((r) => [r.collaborator_id, r]),
  )

  return (
    <StudioPageShell
      title="Release Collab"
      subtitle={`Per-release collaborators, thread, and review invites. Outbound from ${RELEASE_COLLAB_FROM_EMAIL}.`}
    >
      {error && (
        <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          {error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <div>
            <label className="block text-xs uppercase tracking-wider text-zinc-500 mb-2">
              Open release
            </label>
            <select
              className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white"
              value={selectedId}
              onChange={(e) => selectRelease(e.target.value)}
            >
              <option value="">Select a release…</option>
              {releases.map((r: { id: string; title: string }) => (
                <option key={r.id} value={r.id}>
                  {r.title}
                </option>
              ))}
            </select>
          </div>

          <div>
            <h2 className="text-xs uppercase tracking-wider text-zinc-500 mb-2">
              Active threads
            </h2>
            <ul className="space-y-1">
              {overview.length === 0 && (
                <li className="text-sm text-zinc-600">No collab activity yet.</li>
              )}
              {overview.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => selectRelease(row.id)}
                    className={`w-full text-left rounded-lg px-3 py-2 text-sm transition border ${
                      selectedId === row.id
                        ? 'border-violet-500/50 bg-violet-600/15 text-white'
                        : 'border-transparent hover:bg-zinc-900 text-zinc-300'
                    }`}
                  >
                    <span className="block font-medium truncate">{row.title}</span>
                    <span className="text-xs text-zinc-500">
                      {row.collaboratorCount} people · {row.messageCount} msgs
                      {row.pendingReviews ? ` · ${row.pendingReviews} pending` : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </aside>

        <section className="min-w-0 space-y-6">
          {!selectedId && (
            <p className="text-zinc-500 text-sm">
              Pick a release to add collaborators, post to the thread, and send review magic links.
            </p>
          )}

          {selectedId && bundle && (
            <>
              <div className="flex flex-wrap items-center gap-4">
                {bundle.release.artworkUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={bundle.release.artworkUrl}
                    alt=""
                    className="h-16 w-16 rounded-md object-cover"
                  />
                ) : (
                  <div className="h-16 w-16 rounded-md bg-zinc-900 border border-zinc-800" />
                )}
                <div className="min-w-0">
                  <h2 className="text-xl font-semibold truncate">{bundle.release.title}</h2>
                  <Link
                    href={studioReleaseHref(bundle.release.id)}
                    className="text-sm text-violet-300 hover:text-violet-200"
                  >
                    Open release workspace →
                  </Link>
                </div>
              </div>

              <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-medium">Collaborators</h3>
                  {bundle.rightsContactSeeds.length > 0 && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={importRightsContacts}
                      className="text-xs text-violet-300 hover:text-violet-200"
                    >
                      Import from Rights contacts ({bundle.rightsContactSeeds.length})
                    </button>
                  )}
                </div>

                <ul className="space-y-2">
                  {bundle.collaborators.length === 0 && (
                    <li className="text-sm text-zinc-600">No collaborators yet.</li>
                  )}
                  {bundle.collaborators.map((c) => {
                    const review = reviewByCollab.get(c.id)
                    return (
                      <li
                        key={c.id}
                        className="flex flex-wrap items-center gap-2 justify-between rounded-lg border border-zinc-800/80 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">
                            {c.name}{' '}
                            <span className="text-zinc-500 font-normal">· {c.role}</span>
                          </p>
                          <p className="text-xs text-zinc-500 truncate">{c.email}</p>
                          {review && (
                            <p className="text-xs mt-0.5 text-zinc-400">
                              Review: {review.status}
                              {review.note ? ` — ${review.note}` : ''}
                            </p>
                          )}
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => sendInvite(c.id)}
                            className="text-xs px-2 py-1 rounded border border-violet-500/40 text-violet-200 hover:bg-violet-600/20"
                          >
                            Email review link
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => removeCollaborator(c.id)}
                            className="text-xs px-2 py-1 rounded border border-zinc-700 text-zinc-400 hover:text-white"
                          >
                            Remove
                          </button>
                        </div>
                      </li>
                    )
                  })}
                </ul>

                <form onSubmit={addCollaborator} className="grid gap-2 sm:grid-cols-4">
                  <input
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Name"
                    className="rounded-lg border border-zinc-800 bg-black px-3 py-2 text-sm"
                  />
                  <input
                    required
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Email"
                    className="rounded-lg border border-zinc-800 bg-black px-3 py-2 text-sm"
                  />
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as CollabRole)}
                    className="rounded-lg border border-zinc-800 bg-black px-3 py-2 text-sm"
                  >
                    {COLLAB_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    disabled={busy}
                    className="rounded-lg bg-violet-600/80 hover:bg-violet-600 px-3 py-2 text-sm font-medium"
                  >
                    Add
                  </button>
                </form>

                <div>
                  <label className="block text-xs text-zinc-500 mb-1">
                    Optional note on next review invite
                  </label>
                  <input
                    value={inviteNote}
                    onChange={(e) => setInviteNote(e.target.value)}
                    placeholder="Please check the mix and approve splits…"
                    className="w-full rounded-lg border border-zinc-800 bg-black px-3 py-2 text-sm"
                  />
                </div>
                {lastPortalUrl && (
                  <p className="text-xs text-zinc-400 break-all">
                    Portal link:{' '}
                    <a href={lastPortalUrl} className="text-violet-300 underline" target="_blank" rel="noreferrer">
                      {lastPortalUrl}
                    </a>
                  </p>
                )}
              </div>

              <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 space-y-4">
                <h3 className="font-medium">Thread</h3>
                <div className="max-h-80 overflow-y-auto space-y-3 pr-1">
                  {bundle.messages.length === 0 && (
                    <p className="text-sm text-zinc-600">No messages yet.</p>
                  )}
                  {bundle.messages.map((m) => (
                    <div
                      key={m.id}
                      className={`rounded-lg px-3 py-2 text-sm ${
                        m.author_type === 'studio'
                          ? 'bg-violet-600/15 border border-violet-500/20'
                          : 'bg-zinc-900 border border-zinc-800'
                      }`}
                    >
                      <div className="flex justify-between gap-2 text-xs text-zinc-500 mb-1">
                        <span>{m.author_name}</span>
                        <span>{formatWhen(m.created_at)}</span>
                      </div>
                      <p className="whitespace-pre-wrap text-zinc-200">{m.body}</p>
                    </div>
                  ))}
                </div>
                <form onSubmit={sendMessage} className="space-y-2">
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={3}
                    placeholder="Write to collaborators…"
                    className="w-full rounded-lg border border-zinc-800 bg-black px-3 py-2 text-sm"
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="inline-flex items-center gap-2 text-sm text-zinc-400">
                      <input
                        type="checkbox"
                        checked={notify}
                        onChange={(e) => setNotify(e.target.checked)}
                      />
                      Email notify (from {RELEASE_COLLAB_FROM_EMAIL})
                    </label>
                    <button
                      type="submit"
                      disabled={busy || !message.trim()}
                      className="rounded-lg bg-violet-600 hover:bg-violet-500 px-4 py-2 text-sm font-medium disabled:opacity-40"
                    >
                      Post
                    </button>
                  </div>
                </form>
              </div>

              <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
                <h3 className="font-medium mb-3">Email log</h3>
                <ul className="space-y-2 text-sm">
                  {bundle.sends.length === 0 && (
                    <li className="text-zinc-600">No emails sent yet.</li>
                  )}
                  {bundle.sends.map((s) => (
                    <li key={s.id} className="flex flex-wrap justify-between gap-2 text-zinc-400">
                      <span>
                        <span className="text-zinc-200">{s.to_email}</span> · {s.kind} ·{' '}
                        <span className="text-violet-300">{s.status}</span>
                      </span>
                      <span className="text-xs">{formatWhen(s.created_at)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}

          {selectedId && busy && !bundle && (
            <p className="text-zinc-500 text-sm">Loading release collab…</p>
          )}
        </section>
      </div>
    </StudioPageShell>
  )
}

export default function ReleaseCollabHubPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[40vh] flex items-center justify-center text-zinc-500">
          Loading…
        </div>
      }
    >
      <CollabHubInner />
    </Suspense>
  )
}
