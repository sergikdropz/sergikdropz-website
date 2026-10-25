'use client'

import { useEffect, useRef, useState } from 'react'
import {
  ADMIN_AI_SESSIONS_CHANGED_EVENT,
  openAttachedChatThread,
  threadsForRelease,
  type StoredChatThread,
} from '@/lib/ai/admin-ai-chat-threads'

export default function ReleaseAiChatThreadsButton({
  releaseId,
  releaseTitle,
}: {
  releaseId: string
  releaseTitle: string
}) {
  const [open, setOpen] = useState(false)
  const [threads, setThreads] = useState<StoredChatThread[]>([])
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const refresh = () => setThreads(threadsForRelease(releaseId))
    refresh()
    window.addEventListener(ADMIN_AI_SESSIONS_CHANGED_EVENT, refresh)
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener(ADMIN_AI_SESSIONS_CHANGED_EVENT, refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [releaseId])

  useEffect(() => {
    if (!open) return
    setThreads(threadsForRelease(releaseId))
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return
      setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, releaseId])

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        title={`AI chats attached to ${releaseTitle}`}
        onClick={() => setOpen((current) => !current)}
        className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm"
      >
        AI chats{threads.length ? ` · ${threads.length}` : ''}
      </button>
      {open ? (
        <div
          role="menu"
          aria-label={`AI chats for ${releaseTitle}`}
          className="absolute left-full top-0 z-30 ml-2 w-64 overflow-hidden rounded-lg border border-zinc-700 bg-zinc-950 shadow-2xl"
        >
          <p className="border-b border-zinc-800 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            Chats on this release
          </p>
          {threads.length ? (
            <ul className="max-h-64 overflow-y-auto py-1">
              {threads.map((thread) => (
                <li key={thread.id}>
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full flex-col items-start px-3 py-2 text-left hover:bg-zinc-800"
                    onClick={() => {
                      setOpen(false)
                      openAttachedChatThread(thread.id)
                    }}
                  >
                    <span className="w-full truncate text-sm text-zinc-100">{thread.title}</span>
                    <span className="text-[10px] text-zinc-500">
                      {thread.updatedAt
                        ? new Date(thread.updatedAt).toLocaleString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : 'Attached chat'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-3 py-3 text-[12px] leading-snug text-zinc-400">
              No chats yet. Right-click a chat tab and choose Attach to this release.
            </p>
          )}
        </div>
      ) : null}
    </div>
  )
}
