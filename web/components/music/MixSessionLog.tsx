'use client'

import { useState } from 'react'
import type { MixQualityHistoryEntry } from '@/lib/audio/mix-engine/mix-quality-history'

const GRADE_DOT: Record<string, string> = {
  excellent: 'bg-emerald-400',
  good: 'bg-sky-400',
  fair: 'bg-amber-400',
  poor: 'bg-rose-400',
  unknown: 'bg-gray-500',
}

export default function MixSessionLog({
  entries,
  liveStatus,
}: {
  entries: MixQualityHistoryEntry[]
  liveStatus?: string | null
}) {
  const [open, setOpen] = useState(false)
  if (!entries.length && !liveStatus) return null

  return (
    <div className="mt-2 rounded-lg border border-gray-800 bg-gray-950/60">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-2.5 py-1.5 text-left text-[10px] text-gray-400 hover:text-gray-200 touch-manipulation"
        aria-expanded={open}
      >
        <span className="uppercase tracking-wide">Mix session</span>
        <span className="tabular-nums text-gray-500">
          {entries.length} blend{entries.length === 1 ? '' : 's'}
          {open ? ' ▾' : ' ▸'}
        </span>
      </button>
      {open && (
        <div className="max-h-36 overflow-y-auto overscroll-y-contain border-t border-gray-800 px-2.5 py-1.5">
          {liveStatus && (
            <p className="mb-1.5 text-[10px] leading-snug text-emerald-300/90">{liveStatus}</p>
          )}
          <ul className="space-y-1">
            {entries.slice(0, 12).map((e) => (
              <li
                key={e.at}
                className="flex items-start gap-2 text-[10px] leading-snug text-gray-400"
              >
                <span
                  className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${GRADE_DOT[e.grade] ?? GRADE_DOT.unknown}`}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="text-gray-300">{e.outgoingTitle ?? '?'}</span>
                  <span className="text-gray-600"> → </span>
                  <span className="text-gray-300">{e.incomingTitle ?? '?'}</span>
                  <span className="ml-1 text-gray-500">
                    · {e.label} · {(e.phaseRmsSec * 1000).toFixed(0)}ms
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
