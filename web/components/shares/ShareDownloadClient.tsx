'use client'

import { useEffect, useState } from 'react'

type FileRow = {
  id: string
  title: string
  artist: string
  filename: string
  available: boolean
  href: string | null
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

  return (
    <main className="flex min-h-screen items-center justify-center bg-black px-4 py-10 text-white">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-zinc-950 p-5 shadow-2xl">
        {data?.artwork ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={data.artwork} alt="" className="mb-4 h-40 w-40 rounded-xl object-cover" />
        ) : null}
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">SERGIK download</p>
        <h1 className="mt-1 text-xl font-semibold">{data?.title || 'Private download'}</h1>
        <p className="mt-1 text-sm text-zinc-400">
          {data ? `${data.artist} · ${data.format.toUpperCase()} · ${data.scope === 'release' ? 'Whole EP' : 'Single track'}` : 'Restricted link'}
        </p>

        {!data && !error ? <p className="mt-6 text-sm text-zinc-500">Checking access…</p> : null}
        {error ? <p className="mt-4 text-sm text-rose-300">{error}</p> : null}

        {data?.access === 'restricted' ? (
          <form
            className="mt-6 space-y-3"
            onSubmit={(event) => {
              event.preventDefault()
              void requestLink()
            }}
          >
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
              className="w-full rounded-lg bg-white py-2 text-sm font-medium text-black disabled:opacity-50"
            >
              {sending ? 'Opening…' : 'Open download'}
            </button>
          </form>
        ) : null}

        {data?.access === 'granted' ? (
          <div className="mt-6 space-y-3">
            {data.email ? <p className="text-xs text-zinc-500">Signed in as {data.email}</p> : null}
            {data.packHref ? (
              <a
                href={data.packHref}
                className="flex w-full items-center justify-center rounded-lg bg-rose-600 py-2.5 text-sm font-medium text-white"
              >
                Download all ({data.format.toUpperCase()} zip)
              </a>
            ) : null}
            <ul className="space-y-2">
              {(data.files || []).map((file) => (
                <li key={file.id} className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 px-3 py-2">
                  <span className="min-w-0 truncate text-sm">{file.title}</span>
                  {file.available && file.href ? (
                    <a href={file.href} className="shrink-0 text-xs font-medium text-white underline">
                      {file.filename.endsWith('.wav') ? 'WAV' : 'MP3'}
                    </a>
                  ) : (
                    <span className="shrink-0 text-xs text-zinc-500">Not in vault</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </main>
  )
}
