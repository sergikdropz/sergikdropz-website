'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { MixQualityHistoryEntry } from '@/lib/audio/mix-engine/mix-quality-history'
import { useClampedFixedMenuPosition } from '@/hooks/useClampedFixedMenuPosition'
import PopupMenuDragHeader from '@/components/ui/PopupMenuDragHeader'

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
  headerStatus,
  size = 'header',
  className = '',
}: {
  entries: MixQualityHistoryEntry[]
  liveStatus?: string | null
  headerStatus?: string | null
  /** `compact` fits the mobile transport row; `header` matches Auto DJ / iDJ chrome. */
  size?: 'header' | 'compact'
  className?: string
}) {
  const titleId = useId()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelElRef = useRef<HTMLDivElement | null>(null)
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null)
  const open = Boolean(anchor)
  const hasContent = entries.length > 0 || Boolean(liveStatus) || Boolean(headerStatus)
  const panelClamp = useClampedFixedMenuPosition(
    open,
    anchor,
    { width: 360, height: 280 },
    { externalRef: panelElRef },
  )

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null
      if (!target) return
      if (panelElRef.current?.contains(target) || buttonRef.current?.contains(target)) return
      setAnchor(null)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setAnchor(null)
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  if (!hasContent) return null

  const openFromEl = (el: HTMLElement) => {
    const rect = el.getBoundingClientRect()
    setAnchor({
      x: Math.min(rect.left, window.innerWidth - 368),
      y: Math.max(8, rect.top - 280),
    })
  }

  const close = () => setAnchor(null)

  const blendLabel =
    entries.length > 0
      ? `${entries.length} blend${entries.length === 1 ? '' : 's'}`
      : 'Session'

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={(e) => {
          if (open) {
            close()
            return
          }
          openFromEl(e.currentTarget)
        }}
        className={`relative flex shrink-0 items-center justify-center gap-1.5 rounded-lg transition-colors touch-manipulation ${
          size === 'compact'
            ? 'h-11 min-w-[72px] px-2 py-1'
            : 'min-h-[36px] min-w-[64px] px-2.5 py-2'
        } ${
          open
            ? 'bg-emerald-600/30 text-emerald-200'
            : 'text-gray-400 hover:bg-gray-800 hover:text-white'
        } ${className}`}
        title={headerStatus || liveStatus || 'Mix session'}
        aria-label="Mix session"
        aria-expanded={open}
        aria-controls={open ? titleId : undefined}
        data-mix-session-button=""
      >
        <span className="text-[11px] font-semibold uppercase tracking-wide">Mix</span>
        {entries.length > 0 ? (
          <span className="rounded bg-gray-800/80 px-1 py-0.5 font-mono text-[9px] tabular-nums text-gray-300">
            {entries.length}
          </span>
        ) : liveStatus || headerStatus ? (
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />
        ) : null}
      </button>

      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={panelClamp.ref}
            {...panelClamp.rootProps}
            role="dialog"
            aria-labelledby={titleId}
            data-mix-session-panel=""
            data-allow-scroll-when-locked=""
            className="fixed w-[min(22.5rem,calc(100vw-1rem))] overflow-hidden rounded-lg border border-gray-700 bg-gray-950 shadow-2xl"
            style={panelClamp.style}
            onContextMenu={(e) => e.preventDefault()}
          >
            <PopupMenuDragHeader
              title={<span id={titleId}>Mix session</span>}
              headerProps={panelClamp.headerProps}
              trailing={
                <button
                  type="button"
                  onClick={close}
                  className="rounded px-1.5 py-0.5 text-[10px] text-gray-400 hover:bg-gray-800 hover:text-white"
                  aria-label="Close mix session"
                >
                  ✕
                </button>
              }
            />
            <div className="max-h-[min(50vh,20rem)] overflow-y-auto overscroll-y-contain px-3 py-2">
              {headerStatus ? (
                <p
                  className="mb-2 text-[11px] leading-snug text-emerald-300/90"
                  role="status"
                  aria-live="polite"
                >
                  {headerStatus}
                </p>
              ) : null}
              {liveStatus ? (
                <p className="mb-2 text-[10px] leading-snug text-emerald-300/80">{liveStatus}</p>
              ) : null}
              {entries.length === 0 ? (
                <p className="text-[10px] text-gray-500">No blends logged yet this session.</p>
              ) : (
                <>
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                    {blendLabel}
                  </p>
                  <ul className="space-y-1.5">
                    {entries.slice(0, 16).map((e) => (
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
                </>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
