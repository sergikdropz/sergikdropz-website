'use client'

import { useCallback, useEffect, useState } from 'react'
import { FaExternalLinkAlt } from 'react-icons/fa'

type WindowInfo = {
  kind: string
  label: string
  upload_by: string | null
  release_date: string | null
  days_until_street: number | null
}

type Packet = {
  ok: boolean
  blockers: string[]
  warnings: string[]
  upload_url: string
  my_music_url: string
  worksheet: string
  release: {
    artist: string
    label: string
    title: string
    language: string
    primary_genre: string
    secondary_genre: string
    release_date: string
    upc: string
  }
  tracks: Array<{ track_number: number; title: string; isrc: string; songwriters: string }>
}

type Payload = {
  pipe: { id: string; label: string; revelatorLive: boolean }
  window: WindowInfo
  packet: Packet
  record: { status: string; albumuuid?: string | null; submitted_at?: string } | null
  distributorStatus?: string | null
}

export default function DistroKidDeliveryCard({ releaseId }: { releaseId: string }) {
  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [albumuuid, setAlbumuuid] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetch(`/api/studio/releases/${encodeURIComponent(releaseId)}/distrokid`)
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(json.error || 'Could not load DistroKid packet')
      return
    }
    setError(null)
    setData(json as Payload)
    if (json.record?.albumuuid) setAlbumuuid(String(json.record.albumuuid))
  }, [releaseId])

  useEffect(() => {
    void load()
  }, [load])

  async function act(action: string) {
    setBusy(true)
    setNotice(null)
    try {
      const res = await fetch(`/api/studio/releases/${encodeURIComponent(releaseId)}/distrokid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, albumuuid: albumuuid.trim() || undefined }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setNotice(json.error || 'Action failed')
        return
      }
      setNotice(
        action === 'mark_submitted'
          ? 'Marked submitted. Confirm store pages in Delivery after DistroKid shows it live.'
          : action === 'mark_live'
            ? 'Marked live.'
            : action === 'clear'
              ? 'Cleared the DistroKid stamp.'
              : 'Queued for DistroKid.',
      )
      await load()
    } finally {
      setBusy(false)
    }
  }

  if (error) return <p className="text-sm text-amber-300">{error}</p>
  if (!data) return <p className="text-sm text-zinc-500">Loading DistroKid packet…</p>

  const revelator = data.pipe.revelatorLive
  const submitted = data.record?.status === 'submitted' || data.distributorStatus === 'live'

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="text-lg font-semibold text-white">DistroKid schedule</h3>
          <p className="text-sm text-zinc-500 mt-1">
            {data.pipe.label}. Upload on DistroKid about four weeks before street date, then mark it
            submitted here. This does not log into DistroKid.
          </p>
        </div>
        <span className="text-xs px-3 py-1 rounded-full bg-zinc-800 text-zinc-200">{data.window.label}</span>
      </div>

      {revelator ? (
        <p className="text-sm text-emerald-300 mb-4">
          Revelator keys are live. New DSP delivery should use Distribute to stores. This packet stays
          for anything already on the DistroKid slate.
        </p>
      ) : null}

      <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm mb-4">
        <div><dt className="text-zinc-500">Artist</dt><dd className="text-zinc-100">{data.packet.release.artist}</dd></div>
        <div><dt className="text-zinc-500">Label</dt><dd className="text-zinc-100">{data.packet.release.label}</dd></div>
        <div><dt className="text-zinc-500">Street date</dt><dd className="text-zinc-100">{data.packet.release.release_date || '—'}</dd></div>
        <div><dt className="text-zinc-500">Upload by</dt><dd className="text-zinc-100">{data.window.upload_by || '—'}</dd></div>
        <div><dt className="text-zinc-500">Genre</dt><dd className="text-zinc-100">{data.packet.release.primary_genre || '—'}</dd></div>
        <div><dt className="text-zinc-500">Language</dt><dd className="text-zinc-100">{data.packet.release.language}</dd></div>
      </dl>

      <ul className="text-sm text-zinc-300 space-y-1 mb-4">
        {data.packet.tracks.map((track) => (
          <li key={track.track_number}>
            {track.track_number}. {track.title}
            <span className="text-zinc-500"> · {track.isrc || 'no ISRC'} · {track.songwriters || 'no songwriter'}</span>
          </li>
        ))}
      </ul>

      {data.packet.blockers.length > 0 && (
        <ul className="text-sm text-amber-200 mb-4 space-y-1">
          {data.packet.blockers.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
      {data.packet.warnings.length > 0 && (
        <ul className="text-sm text-zinc-400 mb-4 space-y-1">
          {data.packet.warnings.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}

      <label className="block text-xs text-zinc-500 mb-3">
        DistroKid album UUID (optional, from the My Music URL after upload)
        <input
          value={albumuuid}
          onChange={(event) => setAlbumuuid(event.target.value)}
          className="mt-1 w-full max-w-md rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white"
          placeholder="album uuid"
        />
      </label>

      {notice ? <p className="text-sm text-violet-200 mb-3">{notice}</p> : null}

      <div className="flex flex-wrap gap-2">
        <a
          href={data.packet.upload_url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-violet-600 text-sm font-semibold"
        >
          Open DistroKid upload <FaExternalLinkAlt className="text-[10px]" />
        </a>
        <button
          type="button"
          className="px-4 py-2 rounded-full border border-zinc-600 text-sm text-zinc-200"
          onClick={() => void navigator.clipboard.writeText(data.packet.worksheet)}
        >
          Copy worksheet
        </button>
        <a
          href={`/api/studio/releases/${encodeURIComponent(releaseId)}/distrokid?format=csv`}
          className="px-4 py-2 rounded-full border border-zinc-600 text-sm text-zinc-200"
        >
          Download CSV
        </a>
        {!submitted && (
          <button
            type="button"
            disabled={busy || revelator}
            onClick={() => void act('mark_submitted')}
            className="px-4 py-2 rounded-full border border-emerald-700 text-sm text-emerald-200 disabled:opacity-40"
          >
            {busy ? 'Saving…' : 'Mark submitted'}
          </button>
        )}
        {data.record?.status === 'submitted' && data.distributorStatus !== 'live' && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void act('mark_live')}
            className="px-4 py-2 rounded-full border border-zinc-600 text-sm text-zinc-200 disabled:opacity-40"
          >
            Mark live after stores connect
          </button>
        )}
        {data.record && data.distributorStatus !== 'live' && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void act('clear')}
            className="px-4 py-2 rounded-full text-sm text-zinc-500"
          >
            Clear stamp
          </button>
        )}
      </div>
    </div>
  )
}
