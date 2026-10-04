'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/contexts/AdminAuthContext'
import StudioPageShell from './StudioPageShell'
import { useStudioReleases } from '@/lib/api/studio-hooks'
import { COLLAB_ROLES, type CollabRole } from '@/lib/studio/release-collab'
import {
  studioCollabHref,
  studioCreateHref,
  studioReleaseHref,
} from '@/lib/studio/studio-ia'
import {
  formatSnippetForComposer,
  type CollabPromoSnippet,
} from '@/lib/studio/collab-promo-snippets'
import { RELEASE_COLLAB_FROM_EMAIL } from '@/lib/studio/release-collab'
import type { ReleaseCollabContext } from '@/lib/studio/collab-context'
import type { RightsPacketKind } from '@/lib/studio/rights-packets'

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
    channel?: string
    email_subject?: string | null
    created_at: string
  }>
  sends: Array<{
    id: string
    to_email: string
    subject: string
    kind: string
    status: string
    error_message?: string | null
    created_at: string
  }>
  reviews: Array<{
    collaborator_id: string
    status: string
    note: string | null
  }>
  rightsContactSeeds: Array<{ name: string; email: string; role: CollabRole }>
  context: ReleaseCollabContext | null
  promoSnippets: CollabPromoSnippet[]
}

type InboxRow = {
  id: string
  title: string
  artworkUrl: string | null
  trackCount: number
  projectKind: 'single' | 'ep' | 'release'
  collaboratorCount: number
  messageCount: number
  pendingReviews: number
  lastMessageAt: string | null
  lastMessageAuthor: string | null
  lastMessagePreview: string | null
}

function messageChannelLabel(channel?: string): string | null {
  if (channel === 'inbound_email') return 'Email in'
  if (channel === 'system') return 'System'
  return null
}

function statusPill(status: string | null | undefined) {
  const s = status || 'missing'
  const tone =
    s === 'approved'
      ? 'text-emerald-300 bg-emerald-950/40 ring-emerald-800/50'
      : s === 'pending'
        ? 'text-amber-200 bg-amber-950/35 ring-amber-800/50'
        : 'text-zinc-400 bg-zinc-900 ring-zinc-800'
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full ring-1 ${tone}`}>{s}</span>
  )
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
  const { data: allReleases = [] } = useStudioReleases(null, Boolean(isAdmin))
  const [overview, setOverview] = useState<InboxRow[]>([])
  const [inboxQuery, setInboxQuery] = useState('')
  const [emailSubject, setEmailSubject] = useState('')
  const [emailRecipientIds, setEmailRecipientIds] = useState<string[]>([])
  const [promoLinkIds, setPromoLinkIds] = useState<string[]>([])
  const [bundle, setBundle] = useState<CollabBundle | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [resendReady, setResendReady] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<CollabRole>('collaborator')
  const [message, setMessage] = useState('')
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
    if (!isAdmin) return
    fetch('/api/health/deps')
      .then((r) => r.json())
      .then((d) => setResendReady(Boolean(d?.checks?.dependencies?.resendConfigured)))
      .catch(() => setResendReady(null))
  }, [isAdmin])

  useEffect(() => {
    if (!bundle?.collaborators.length) {
      setEmailRecipientIds([])
      return
    }
    setEmailRecipientIds((prev) => {
      if (prev.length) {
        return prev.filter((id) => bundle.collaborators.some((c) => c.id === id))
      }
      return bundle.collaborators.map((c) => c.id)
    })
  }, [bundle?.collaborators])

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

  function insertSnippet(snippet: CollabPromoSnippet) {
    const block = formatSnippetForComposer(snippet)
    setMessage((prev) => (prev.trim() ? `${prev.trim()}\n\n${block}` : block))
    if (snippet.url) {
      setPromoLinkIds((prev) => (prev.includes(snippet.id) ? prev : [...prev, snippet.id]))
    }
  }

  async function sendHubEmail(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedId || !message.trim()) return
    setBusy(true)
    setError(null)
    setSuccess(null)
    try {
      const promoLinks = (bundle?.promoSnippets || [])
        .filter((s) => promoLinkIds.includes(s.id) && s.url)
        .map((s) => ({ label: s.label, url: s.url! }))
      const res = await fetch(
        `/api/studio/releases/${encodeURIComponent(selectedId)}/collab/email`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            body: message,
            subject: emailSubject || undefined,
            collaboratorIds: emailRecipientIds,
            promoLinks,
          }),
        },
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Failed to send email')
        return
      }
      setSuccess(
        `Sent to ${data.sent ?? 1} recipient(s). Check spam/promotions if you don’t see it in a minute.`,
      )
      setMessage('')
      setEmailSubject('')
      setPromoLinkIds([])
      await loadBundle(selectedId)
      await loadOverview()
    } finally {
      setBusy(false)
    }
  }

  async function sendContract(kind: RightsPacketKind) {
    if (!selectedId) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/studio/releases/${encodeURIComponent(selectedId)}/contracts/send`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind }),
        },
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Failed to send contract')
        if (data.blockers?.length) {
          setError(`${data.error} (${data.blockers[0]?.title || ''})`)
        }
        return
      }
      await loadBundle(selectedId)
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

  const inboxRows = overview.filter((row) => {
    const q = inboxQuery.trim().toLowerCase()
    if (!q) return true
    return row.title.toLowerCase().includes(q)
  })

  const projectKindLabel = (kind: InboxRow['projectKind']) => {
    if (kind === 'single') return 'Single'
    if (kind === 'ep') return 'EP'
    return 'Project'
  }

  return (
    <StudioPageShell
      title="Collab Hub"
      subtitle={`Email collaborators in Gmail, get replies here, send contracts and promo links. From ${RELEASE_COLLAB_FROM_EMAIL}.`}
    >
      {resendReady === false && (
        <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          Email is off until Resend is configured. In{' '}
          <code className="text-amber-50/90">web/.env.local</code>, set an{' '}
          <strong>uncommented</strong> line{' '}
          <code className="text-amber-50/90">RESEND_API_KEY=re_...</code> (from{' '}
          <a href="https://resend.com/api-keys" className="underline" target="_blank" rel="noreferrer">
            resend.com/api-keys
          </a>
          ), then run <code className="text-amber-50/90">cd web && npm run dev:restart</code>.
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
          {success}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(260px,300px)_minmax(0,1fr)_minmax(260px,300px)]">
        <aside className="space-y-3 min-h-[420px]">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xs uppercase tracking-wider text-zinc-500">Projects</h2>
            <Link
              href={studioCreateHref('track')}
              className="text-xs text-violet-300 hover:text-violet-200"
            >
              + New
            </Link>
          </div>
          <input
            value={inboxQuery}
            onChange={(e) => setInboxQuery(e.target.value)}
            placeholder="Search EPs & singles…"
            className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
          />
          <ul className="space-y-1 max-h-[calc(100vh-280px)] overflow-y-auto pr-1">
            {inboxRows.length === 0 && (
              <li className="text-sm text-zinc-600 px-1">
                No projects with collaborators yet. Add people on a release below.
              </li>
            )}
            {inboxRows.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => selectRelease(row.id)}
                  className={`w-full text-left rounded-lg px-3 py-2.5 text-sm transition border ${
                    selectedId === row.id
                      ? 'border-violet-500/50 bg-violet-600/15 text-white'
                      : 'border-transparent hover:bg-zinc-900 text-zinc-300'
                  }`}
                >
                  <div className="flex gap-2 items-start">
                    {row.artworkUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={row.artworkUrl} alt="" className="h-9 w-9 rounded object-cover shrink-0" />
                    ) : (
                      <div className="h-9 w-9 rounded bg-zinc-900 border border-zinc-800 shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <span className="block font-medium truncate">{row.title}</span>
                      <span className="text-[11px] text-zinc-500">
                        {projectKindLabel(row.projectKind)}
                        {row.collaboratorCount ? ` · ${row.collaboratorCount} people` : ''}
                        {row.pendingReviews ? ` · ${row.pendingReviews} pending` : ''}
                      </span>
                      {row.lastMessagePreview && (
                        <span className="block text-xs text-zinc-500 truncate mt-0.5">
                          {row.lastMessageAuthor}: {row.lastMessagePreview}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
          <div className="pt-3 border-t border-zinc-800">
            <label className="block text-[11px] uppercase tracking-wider text-zinc-500 mb-1.5">
              Start collab on
            </label>
            <select
              className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white"
              value={
                selectedId && !inboxRows.some((r) => r.id === selectedId) ? selectedId : ''
              }
              onChange={(e) => {
                const id = e.target.value
                if (id) selectRelease(id)
              }}
            >
              <option value="">Choose a single or EP…</option>
              {(allReleases as Array<{ id: string; title: string }>).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title}
                </option>
              ))}
            </select>
          </div>
        </aside>

        <section className="min-w-0 space-y-4 flex flex-col min-h-[420px]">
          {!selectedId && (
            <p className="text-zinc-500 text-sm">
              Select a project on the left — singles and EPs share the same hub. Add collaborators,
              then email them; they reply from Gmail and it lands in the thread.
            </p>
          )}

          {selectedId && bundle && (
            <>
              <div className="flex flex-wrap items-center gap-4 shrink-0">
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

              <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 space-y-4 flex-1 flex flex-col min-h-0">
                <h3 className="font-medium">Conversation</h3>
                <div className="flex-1 min-h-[200px] max-h-[min(420px,45vh)] overflow-y-auto space-y-3 pr-1">
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
                        <span className="flex items-center gap-2">
                          {m.author_name}
                          {messageChannelLabel(m.channel) && (
                            <span className="text-[10px] uppercase tracking-wider text-violet-300/90">
                              {messageChannelLabel(m.channel)}
                            </span>
                          )}
                        </span>
                        <span>{formatWhen(m.created_at)}</span>
                      </div>
                      {m.email_subject && (
                        <p className="text-[11px] text-zinc-500 mb-1">Re: {m.email_subject}</p>
                      )}
                      <p className="whitespace-pre-wrap text-zinc-200">{m.body}</p>
                    </div>
                  ))}
                </div>
                <form onSubmit={sendHubEmail} className="space-y-3 border-t border-zinc-800 pt-4 shrink-0">
                  <p className="text-xs uppercase tracking-wider text-zinc-500">Email composer</p>
                  <input
                    value={emailSubject}
                    onChange={(e) => setEmailSubject(e.target.value)}
                    placeholder="Subject (optional — auto-prefixes with project name)"
                    className="w-full rounded-lg border border-zinc-800 bg-black px-3 py-2 text-sm"
                  />
                  {bundle.collaborators.length > 0 && (
                    <div className="flex flex-wrap gap-2 text-xs">
                      {bundle.collaborators.map((c) => (
                        <label
                          key={c.id}
                          className="inline-flex items-center gap-1.5 rounded-full border border-zinc-800 px-2 py-1"
                        >
                          <input
                            type="checkbox"
                            checked={emailRecipientIds.includes(c.id)}
                            onChange={(e) => {
                              setEmailRecipientIds((prev) =>
                                e.target.checked
                                  ? [...prev, c.id]
                                  : prev.filter((id) => id !== c.id),
                              )
                            }}
                          />
                          {c.name}
                        </label>
                      ))}
                    </div>
                  )}
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={4}
                    placeholder="Write the email they will see in Gmail…"
                    className="w-full rounded-lg border border-zinc-800 bg-black px-3 py-2 text-sm"
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      disabled={busy || !message.trim()}
                      onClick={async () => {
                        if (!selectedId || !message.trim()) return
                        setBusy(true)
                        setError(null)
                        try {
                          const res = await fetch(
                            `/api/studio/releases/${encodeURIComponent(selectedId)}/collab/messages`,
                            {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ body: message, notify: false }),
                            },
                          )
                          const data = await res.json().catch(() => ({}))
                          if (!res.ok) {
                            setError(data.error || 'Failed to post note')
                            return
                          }
                          setMessage('')
                          await loadBundle(selectedId)
                        } finally {
                          setBusy(false)
                        }
                      }}
                      className="text-xs text-zinc-500 hover:text-zinc-300"
                    >
                      Studio-only note (no email)
                    </button>
                    <button
                      type="submit"
                      disabled={busy || !message.trim() || !emailRecipientIds.length}
                      className="rounded-lg bg-violet-600 hover:bg-violet-500 px-4 py-2 text-sm font-medium disabled:opacity-40"
                    >
                      Send email
                    </button>
                  </div>
                </form>
              </div>
            </>
          )}

          {selectedId && busy && !bundle && (
            <p className="text-zinc-500 text-sm">Loading collab…</p>
          )}
        </section>

        <aside className="space-y-4 min-h-[420px] max-h-[calc(100vh-200px)] overflow-y-auto">
          {selectedId && bundle && (
            <>
              <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 space-y-3">
                <h3 className="font-medium text-sm">Promo & links</h3>
                <ul className="space-y-1">
                  {(bundle.promoSnippets || []).map((snippet) => (
                    <li key={snippet.id}>
                      <button
                        type="button"
                        onClick={() => insertSnippet(snippet)}
                        className="w-full text-left text-xs rounded-lg border border-zinc-800 px-2 py-2 hover:bg-zinc-900 text-zinc-300"
                      >
                        + {snippet.label}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>

              {bundle.context && (
                <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 space-y-3 text-sm">
                  <h3 className="font-medium">Legal</h3>
                  <p className="text-xs text-zinc-500 break-all">
                    Replies: <span className="text-violet-300">{bundle.context.replyToAddress}</span>
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {statusPill(bundle.context.ops.split_sheet_status)}
                    {statusPill(bundle.context.ops.producer_agreement_status)}
                  </div>
                  {bundle.context.packets
                    .filter((p) => p.needed)
                    .map((packet) => (
                      <div key={packet.kind} className="rounded-lg border border-zinc-800/80 p-2 space-y-1">
                        <p className="text-xs font-medium">{packet.label}</p>
                        <button
                          type="button"
                          disabled={busy || !packet.ready}
                          onClick={() => void sendContract(packet.kind)}
                          className="text-xs text-violet-300 disabled:opacity-40"
                        >
                          Email contract
                        </button>
                      </div>
                    ))}
                </div>
              )}

              <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 space-y-3">
                <div className="flex justify-between gap-2 items-center">
                  <h3 className="font-medium text-sm">People</h3>
                  {bundle.rightsContactSeeds.length > 0 && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={importRightsContacts}
                      className="text-xs text-violet-300"
                    >
                      Import Rights
                    </button>
                  )}
                </div>
                <ul className="space-y-2 text-sm">
                  {bundle.collaborators.map((c) => (
                    <li key={c.id} className="border border-zinc-800 rounded-lg px-2 py-2">
                      <p className="font-medium truncate">{c.name}</p>
                      <p className="text-xs text-zinc-500 truncate">{c.email}</p>
                      <div className="flex gap-2 mt-1">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => sendInvite(c.id)}
                          className="text-[11px] text-violet-300"
                        >
                          Review link
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => removeCollaborator(c.id)}
                          className="text-[11px] text-zinc-500"
                        >
                          Remove
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
                <form onSubmit={addCollaborator} className="grid gap-2">
                  <input
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Name"
                    className="rounded-lg border border-zinc-800 bg-black px-2 py-1.5 text-xs"
                  />
                  <input
                    required
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Email"
                    className="rounded-lg border border-zinc-800 bg-black px-2 py-1.5 text-xs"
                  />
                  <button type="submit" disabled={busy} className="text-xs rounded-lg bg-zinc-800 py-1.5">
                    Add collaborator
                  </button>
                </form>
              </div>

              <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
                <h3 className="font-medium text-sm mb-2">Delivery log</h3>
                <ul className="space-y-1 text-xs text-zinc-500">
                  {bundle.sends.slice(0, 8).map((s) => (
                    <li key={s.id} className={s.status === 'failed' ? 'text-amber-300' : ''}>
                      {s.to_email} · {s.status}
                      {s.error_message ? ` — ${s.error_message}` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </aside>
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
