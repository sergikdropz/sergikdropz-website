'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { studioPipelineHref, studioReleaseHref } from '@/lib/studio/studio-ia'

type QueueRow = {
  id: string
  title: string
  type: string | null
  window: { kind: string; label: string; upload_by: string | null; release_date: string | null }
  packet_ok: boolean
  blocker_count: number
  blockers: string[]
  record: { status: string } | null
}

export default function DistroKidQueuePanel() {
  const [pipeLabel, setPipeLabel] = useState('')
  const [revelatorLive, setRevelatorLive] = useState(false)
  const [queue, setQueue] = useState<QueueRow[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const res = await fetch('/api/studio/distrokid/queue')
      const json = await res.json().catch(() => ({}))
      if (cancelled) return
      if (!res.ok) {
        setError(json.error || 'Could not load the DistroKid queue')
        return
      }
      setPipeLabel(json.pipe?.label || '')
      setRevelatorLive(Boolean(json.pipe?.revelatorLive))
      setQueue(json.queue || [])
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (error) return <p className="text-sm text-amber-300">{error}</p>

  const upcoming = queue.filter((row) => row.window.kind !== 'past_street' && row.window.kind !== 'live')
  const earlier = queue.filter((row) => row.window.kind === 'past_street')

  function rows(items: QueueRow[]) {
    return (
      <ul className="divide-y divide-zinc-800 rounded-xl border border-zinc-800">
        {items.map((row) => (
          <li key={row.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
            <div>
              <Link
                href={studioReleaseHref(row.id, 'launch')}
                className="text-white font-medium hover:text-violet-200"
              >
                {row.title}
              </Link>
              <p className="text-xs text-zinc-500 mt-1 capitalize">
                {row.type || 'release'}
                {row.window.release_date ? ` · street ${row.window.release_date}` : ''}
                {row.window.upload_by ? ` · upload by ${row.window.upload_by}` : ''}
              </p>
              {!row.packet_ok && (
                <p className="text-xs text-amber-300 mt-1">{row.blockers[0] || `${row.blocker_count} blockers`}</p>
              )}
            </div>
            <span className="text-xs px-2.5 py-1 rounded-full bg-zinc-800 text-zinc-200">{row.window.label}</span>
          </li>
        ))}
      </ul>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-400">
        {pipeLabel || 'Loading pipe…'}
        {revelatorLive
          ? ' New releases should go through Revelator. Rows below are the DistroKid slate still in draft or submitted.'
          : ' Each row should be uploaded on DistroKid by the upload-by date, then marked submitted from the release Launch step.'}
      </p>
      {upcoming.length === 0 ? (
        <p className="text-sm text-zinc-500">No upcoming releases are waiting on DistroKid.</p>
      ) : (
        rows(upcoming)
      )}
      {earlier.length > 0 && (
        <details className="text-sm text-zinc-400">
          <summary className="cursor-pointer">Earlier catalog still in draft or submitted ({earlier.length})</summary>
          <div className="mt-3">{rows(earlier)}</div>
        </details>
      )}
      <Link href={studioPipelineHref('calendar')} className="text-xs text-violet-300">
        Open the release calendar
      </Link>
    </div>
  )
}
