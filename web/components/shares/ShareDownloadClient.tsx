'use client'

import { useEffect, useState } from 'react'
import OrderDownloadStage from '@/components/shop/OrderDownloadStage'

type FileRow = {
  id: string
  title: string
  artist: string
  filename: string
  available: boolean
  href: string | null
  playback?: string
}

type Manifest = {
  access: 'granted' | 'restricted'
  title: string
  artist: string
  artwork?: string | null
  format: 'mp3' | 'wav'
  scope: 'track' | 'release'
  email?: string | null
  files?: FileRow[]
  packHref?: string | null
}

export default function ShareDownloadClient({
  token,
  format,
  scope,
  trackId,
}: {
  token: string
  format: string
  scope: string
  trackId: string
}) {
  const [data, setData] = useState<Manifest | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    let cancelled = false
    const params = new URLSearchParams({ format, scope })
    if (scope === 'track' && trackId) params.set('track', trackId)
    ;(async () => {
      try {
        const res = await fetch(`/api/shares/${encodeURIComponent(token)}/download?${params}`, {
          cache: 'no-store',
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json.error || 'This download is unavailable')
        if (!cancelled) setData(json as Manifest)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'This download is unavailable')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [format, scope, token, trackId])

  async function requestLink() {
    setSending(true)
    setError(null)
    try {
      const res = await fetch(`/api/shares/${encodeURIComponent(token)}/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, format, scope, trackId }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Could not open the download')
      setData(json as Manifest)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open the download')
    } finally {
      setSending(false)
    }
  }

  if (!data && !error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black px-6 text-sm text-zinc-400">
        Checking access…
      </main>
    )
  }

  if (!data) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black px-6 text-center text-sm text-rose-300">
        {error}
      </main>
    )
  }

  const kindLabel = data.scope === 'release' ? 'EP' : 'TRACK'
  const formatLabel = data.format.toUpperCase()
  const tracks = (data.files || [])
    .filter((file) => file.available && file.href)
    .map((file) => ({
      id: file.id,
      title: file.title,
      artist: file.artist,
      href: file.href || '',
      filename: file.filename,
      playback: file.playback || '',
    }))

  return (
    <OrderDownloadStage
      title={data.title}
      artist={data.artist}
      artwork={data.artwork || null}
      kindLabel={kindLabel}
      formatLabel={formatLabel}
      tracks={data.access === 'granted' ? tracks : []}
      packHref={data.access === 'granted' ? data.packHref : null}
      packLabel={`Download all (${formatLabel} zip)`}
      aside={
        data.access === 'restricted' ? (
          <form
            className="space-y-3 rounded-2xl border border-white/10 bg-black/75 p-4 shadow-2xl backdrop-blur-md"
            onSubmit={(event) => {
              event.preventDefault()
              void requestLink()
            }}
          >
            {error ? <p className="text-sm text-rose-300">{error}</p> : null}
            <label className="block text-sm text-zinc-300" htmlFor="download-email">
              Enter the email this was shared with
            </label>
            <input
              id="download-email"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@email.com"
              className="w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm outline-none focus:border-zinc-400"
            />
            <button
              type="submit"
              disabled={sending}
              className="w-full rounded-lg bg-white py-2.5 text-sm font-medium text-black disabled:opacity-50"
            >
              {sending ? 'Opening…' : 'Open download'}
            </button>
          </form>
        ) : error ? (
          <p className="text-center text-sm text-rose-300">{error}</p>
        ) : null
      }
    />
  )
}
