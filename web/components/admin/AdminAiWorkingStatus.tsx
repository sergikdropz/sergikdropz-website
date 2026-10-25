'use client'

import { useEffect, useRef, useState } from 'react'
import {
  isGenericWorkingNote,
  pickWorkingLine,
  workingCueKey,
} from '@/lib/ai/admin-ai-working-lines'

const ROTATE_MS = 2800

export function AdminAiWorkingStatus({
  note,
  context,
}: {
  note?: string | null
  context?: string | null
}) {
  const contextRef = useRef({ note, context })
  contextRef.current = { note, context }
  const cueKey = workingCueKey(note, context)
  const [line, setLine] = useState(() => pickWorkingLine({ note, context }))
  const failed = Boolean(note?.trim().startsWith('Unfinished:'))
  const generic = isGenericWorkingNote(note)

  useEffect(() => {
    if (failed) return
    const pick = () =>
      setLine((current) =>
        pickWorkingLine({
          previous: current,
          note: contextRef.current.note,
          context: contextRef.current.context,
        }),
      )
    pick()
    const timer = window.setInterval(pick, ROTATE_MS)
    return () => window.clearInterval(timer)
  }, [failed, cueKey])

  if (failed) {
    return <p className="text-[13px] leading-snug text-amber-200/95">{note}</p>
  }

  return (
    <div data-testid="admin-ai-working-status">
      <p className="text-[13px] leading-snug text-amber-100">
        <span className="sr-only">Assistant is working. </span>
        <span key={line} className="admin-ai-working-phrase" aria-hidden>
          {line}
        </span>
        <span className="admin-ai-working-caret" aria-hidden />
      </p>
      {generic ? null : (
        <p className="mt-1 text-[12px] leading-snug text-amber-200/80">{note}</p>
      )}
    </div>
  )
}
