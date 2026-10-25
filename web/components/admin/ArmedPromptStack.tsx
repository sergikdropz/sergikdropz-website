'use client'

import { useState } from 'react'
import type { StoredArmedPrompt } from '@/lib/ai/admin-ai-composer-suggestion'

const VISIBLE_ROWS = 4

function ArmedPromptRow({
  prompt,
  onCancel,
  nested,
}: {
  prompt: StoredArmedPrompt
  onCancel: () => void
  nested?: boolean
}) {
  return (
    <div
      className={`flex items-center justify-between gap-2 text-[11px] leading-4 text-amber-100 ${
        nested ? 'border-t border-amber-800/50 px-2 py-1' : 'rounded-md border border-amber-700/50 bg-amber-950/40 px-2 py-1'
      }`}
    >
      <span className="min-w-0 truncate" title={prompt.prompt}>
        Armed for {prompt.whenLabel}. Sends: {prompt.prompt}
      </span>
      <button type="button" className="shrink-0 text-amber-200/80 underline" onClick={onCancel}>
        Cancel
      </button>
    </div>
  )
}

export default function ArmedPromptStack({
  prompts,
  onCancel,
}: {
  prompts: StoredArmedPrompt[]
  onCancel: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const armed = prompts.filter((row) => row.status === 'armed').sort((a, b) => a.runAt - b.runAt)
  if (!armed.length) return null
  const only = armed[0]
  if (armed.length === 1 && only) {
    return <ArmedPromptRow prompt={only} onCancel={() => onCancel(only.id)} />
  }
  const soonest = armed[0]
  return (
    <div className="rounded-md border border-amber-700/50 bg-amber-950/40 text-[11px] leading-4 text-amber-100">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 px-2 py-1 text-left"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="min-w-0 truncate">
          {armed.length} armed{soonest ? ` · next ${soonest.whenLabel}` : ''}
        </span>
        <span aria-hidden>{open ? '▾' : '▸'}</span>
      </button>
      {open ? (
        <div className={armed.length > VISIBLE_ROWS ? 'max-h-28 overflow-y-auto' : undefined}>
          {armed.map((row) => (
            <ArmedPromptRow key={row.id} prompt={row} nested onCancel={() => onCancel(row.id)} />
          ))}
        </div>
      ) : null}
    </div>
  )
}
