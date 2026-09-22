'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

type PortalPayload = {
  release: {
    id: string
    title: string
    artworkUrl: string | null
    albumArtist: string | null
  }
  collaborator: { name: string; email: string; role: string }
  messages: Array<{
    id: string
    author_type: string
    author_name: string
    body: string
    created_at: string
  }>
  review: { status: string; note: string | null } | null
  tracks: Array<{
    id: string
    title: string
    trackNumber: number | null
    duration: number | null
    playbackUrl: string | null
  }>
  expiresAt: string
}

export default function CollabPortalClient({ token }: { token: string }) {
  const [data, setData] = useState<PortalPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [reviewNote, setReviewNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [playingId, setPlayingId] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/collab/${encodeURIComponent(token)}`)
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json.error || 'Unable to open this review link')
        setData(null)
        return
      }
      setData(json)
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    return () => {
      audioRef.current?.pause()
    }
  }, [])

  async function playTrack(track: PortalPayload['tracks'][0]) {
    if (!track.playbackUrl) return
    if (!audioRef.current) {
      audioRef.current = new Audio()
    }
    const audio = audioRef.current
    if (playingId === track.id && !audio.paused) {
      audio.pause()
      setPlayingId(null)
      return
    }
    audio.src = track.playbackUrl
    try {
      await audio.play()
      setPlayingId(track.id)
    } catch {
      setError('Playback failed — try again or use another browser.')
    }
  }

  async function postMessage(e: React.FormEvent) {
    e.preventDefault()
    if (!message.trim()) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/collab/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'message', body: message }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json.error || 'Failed to send message')
        return
      }
      setMessage('')
      await load()
    } finally {
      setBusy(false)
    }
  }

  async function submitReview(status: 'approved' | 'changes_requested') {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/collab/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'review',
          status,
          note: reviewNote || undefined,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json.error || 'Failed to submit review')
        return
      }
      await load()
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-zinc-400 flex items-center justify-center">
        Loading review…
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center px-4">
        <p className="text-zinc-400 text-center max-w-md">{error}</p>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="min-h-screen bg-black text-white">
      <div
        className="pointer-events-none fixed inset-0 overflow-hidden"
        aria-hidden
      >
        <div className="absolute -top-32 right-0 w-[420px] h-[420px] rounded-full bg-violet-700/15 blur-3xl" />
      </div>

      <main className="relative max-w-xl mx-auto px-4 py-10 space-y-8">
        <header>
          <p className="text-xs uppercase tracking-[0.2em] text-violet-400/90 mb-2">
            SERGIK · Release review
          </p>
          <h1 className="text-3xl font-bold tracking-tight">{data.release.title}</h1>
          <p className="text-zinc-500 mt-2">
            Hi {data.collaborator.name} — listen and approve or request changes.
          </p>
        </header>

        {error && (
          <p className="text-sm text-amber-200 border border-amber-500/30 bg-amber-500/10 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <section className="space-y-2">
          <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wider">
            Tracks
          </h2>
          <ul className="space-y-2">
            {data.tracks.length === 0 && (
              <li className="text-sm text-zinc-600">No tracks attached yet.</li>
            )}
            {data.tracks.map((track) => (
              <li
                key={track.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-950/80 px-3 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {track.trackNumber != null ? `${track.trackNumber}. ` : ''}
                    {track.title}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={!track.playbackUrl}
                  onClick={() => playTrack(track)}
                  className="shrink-0 rounded-full border border-violet-500/40 px-3 py-1.5 text-xs text-violet-200 hover:bg-violet-600/20 disabled:opacity-30"
                >
                  {playingId === track.id ? 'Pause' : 'Play'}
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wider">
            Your review
          </h2>
          {data.review?.status && data.review.status !== 'pending' && (
            <p className="text-sm text-zinc-300">
              Current status: <span className="text-violet-300">{data.review.status}</span>
              {data.review.note ? ` — ${data.review.note}` : ''}
            </p>
          )}
          <textarea
            value={reviewNote}
            onChange={(e) => setReviewNote(e.target.value)}
            rows={2}
            placeholder="Optional note…"
            className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => submitReview('approved')}
              className="rounded-lg bg-emerald-600/80 hover:bg-emerald-600 px-4 py-2 text-sm font-medium"
            >
              Approve
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => submitReview('changes_requested')}
              className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-900"
            >
              Request changes
            </button>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wider">
            Thread
          </h2>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {data.messages.map((m) => (
              <div
                key={m.id}
                className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-sm"
              >
                <p className="text-xs text-zinc-500 mb-1">{m.author_name}</p>
                <p className="whitespace-pre-wrap text-zinc-200">{m.body}</p>
              </div>
            ))}
          </div>
          <form onSubmit={postMessage} className="space-y-2">
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={2}
              placeholder="Reply to the studio…"
              className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={busy || !message.trim()}
              className="rounded-lg bg-violet-600 hover:bg-violet-500 px-4 py-2 text-sm font-medium disabled:opacity-40"
            >
              Send message
            </button>
          </form>
        </section>
      </main>
    </div>
  )
}
