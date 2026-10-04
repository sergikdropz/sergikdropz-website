'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  browserImageContentRect,
  browserSurfaceFromPoint,
  browserSurfaceMetrics,
  browserSurfaceRatio,
  elementPickHoverLabel,
  elementUnderPointer,
  formatDomElementPick,
  isElementPickerChrome,
  mapBrowserElementRect,
} from '@/lib/ai/admin-ai-element-pick'

type RemotePick = {
  text: string
  label: string
  top: number
  left: number
  width: number
  height: number
  viewportWidth: number
  viewportHeight: number
}

async function inspectBrowserPoint(x: number, y: number): Promise<{ pick?: RemotePick; error?: string }> {
  try {
    const response = await fetch('/api/admin/ai/browser', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'inspect', actor: 'user', x, y }),
    })
    const data = (await response.json().catch(() => ({}))) as { elementPick?: RemotePick; error?: string }
    if (!response.ok || !data.elementPick?.text) {
      return { error: data.error || 'Could not read an element in the browser.' }
    }
    return { pick: data.elementPick }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Could not read an element in the browser.' }
  }
}

type HoverBox = {
  top: number
  left: number
  width: number
  height: number
  label: string
}

const PICK_STYLE = `
html.admin-ai-element-picking,
html.admin-ai-element-picking * {
  cursor: crosshair !important;
  user-select: none !important;
}
html.admin-ai-element-picking [data-admin-ai-element-picker],
html.admin-ai-element-picking [data-admin-ai-element-picker] * {
  cursor: pointer !important;
  user-select: auto !important;
}
`

function IconCursor() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden>
      <path d="M4.1 2.4l.4 14.1 3.3-3.3 2.3 5.1 2.2-1-2.3-5.2 5.1-.6L4.1 2.4z" />
    </svg>
  )
}

export type ElementPickInsert = { label: string; text: string }

export default function AdminAiElementPickerButton({
  disabled,
  onPick,
}: {
  disabled?: boolean
  onPick: (pick: ElementPickInsert) => void
}) {
  const [armed, setArmed] = useState(false)
  const [hover, setHover] = useState<HoverBox | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const onPickRef = useRef(onPick)
  onPickRef.current = onPick

  useEffect(() => {
    if (disabled) setArmed(false)
  }, [disabled])

  useEffect(() => {
    if (!armed) {
      setHover(null)
      setNotice(null)
      return
    }

    let frame = 0
    let point = { x: 0, y: 0 }
    let down: { x: number; y: number } | null = null
    let hoverGen = 0
    let inspectTimer = 0
    let committing = false
    const hoverEl = { current: null as Element | null }

    const applyRemotePick = (surface: HTMLElement, pick: RemotePick) => {
      const metrics = browserSurfaceMetrics(surface)
      const viewportWidth = pick.viewportWidth || metrics.viewportWidth
      const viewportHeight = pick.viewportHeight || metrics.viewportHeight
      const content = browserImageContentRect(metrics.surface, viewportWidth, viewportHeight)
      const mapped = mapBrowserElementRect(
        { top: pick.top, left: pick.left, width: pick.width, height: pick.height },
        content,
        viewportWidth,
        viewportHeight,
      )
      setNotice(null)
      setHover({ ...mapped, label: pick.label })
    }

    const scheduleBrowserInspect = (surface: HTMLElement, clientX: number, clientY: number) => {
      if (committing) return
      window.clearTimeout(inspectTimer)
      inspectTimer = window.setTimeout(() => {
        if (committing) return
        const metrics = browserSurfaceMetrics(surface)
        const ratio = browserSurfaceRatio(clientX, clientY, metrics.content)
        if (!ratio) {
          setHover(null)
          return
        }
        const gen = ++hoverGen
        void inspectBrowserPoint(ratio.x, ratio.y).then((result) => {
          if (gen !== hoverGen || committing) return
          if (!result.pick) {
            setNotice(result.error || null)
            return
          }
          applyRemotePick(surface, result.pick)
        })
      }, 90)
    }

    const paint = () => {
      frame = 0
      const surface = browserSurfaceFromPoint(point.x, point.y)
      if (surface) {
        if (hoverEl.current !== surface) {
          hoverEl.current = surface
          setHover({
            top: point.y + 16,
            left: point.x + 14,
            width: 0,
            height: 0,
            label: 'Reading browser…',
          })
        }
        scheduleBrowserInspect(surface, point.x, point.y)
        return
      }
      window.clearTimeout(inspectTimer)
      hoverGen += 1
      const el = elementUnderPointer(point.x, point.y)
      if (!el) {
        hoverEl.current = null
        setHover(null)
        return
      }
      const rect = el.getBoundingClientRect()
      const next: HoverBox = {
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
        label: elementPickHoverLabel(el),
      }
      if (el === hoverEl.current) {
        setHover((prev) =>
          prev &&
          prev.top === next.top &&
          prev.left === next.left &&
          prev.width === next.width &&
          prev.height === next.height &&
          prev.label === next.label
            ? prev
            : next,
        )
        return
      }
      hoverEl.current = el
      setHover(next)
    }

    const queue = (x: number, y: number) => {
      point = { x, y }
      if (!frame) frame = window.requestAnimationFrame(paint)
    }

    const onMove = (event: PointerEvent) => queue(event.clientX, event.clientY)
    const onScroll = () => queue(point.x, point.y)
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      setArmed(false)
    }
    const onPointerDown = (event: PointerEvent) => {
      if (isElementPickerChrome(event.target)) return
      down = { x: event.clientX, y: event.clientY }
      event.preventDefault()
      event.stopPropagation()
    }
    const onPointerUp = (event: PointerEvent) => {
      if (isElementPickerChrome(event.target)) return
      event.preventDefault()
      event.stopPropagation()
      const start = down
      down = null
      if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 8) return
      const surface = browserSurfaceFromPoint(event.clientX, event.clientY)
      if (surface) {
        const metrics = browserSurfaceMetrics(surface)
        const ratio = browserSurfaceRatio(event.clientX, event.clientY, metrics.content)
        if (!ratio) return
        committing = true
        hoverGen += 1
        window.clearTimeout(inspectTimer)
        void inspectBrowserPoint(ratio.x, ratio.y).then((result) => {
          committing = false
          if (!result.pick) {
            setNotice(result.error || 'Could not read an element in the browser.')
            return
          }
          onPickRef.current({ label: result.pick.label, text: result.pick.text })
          setArmed(false)
        })
        return
      }
      const el = elementUnderPointer(event.clientX, event.clientY)
      if (!el) return
      onPickRef.current({ label: elementPickHoverLabel(el), text: formatDomElementPick(el) })
      setArmed(false)
    }
    const onClick = (event: MouseEvent) => {
      if (isElementPickerChrome(event.target)) return
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
    }
    const onContext = (event: MouseEvent) => {
      if (isElementPickerChrome(event.target)) return
      event.preventDefault()
      setArmed(false)
    }

    document.documentElement.classList.add('admin-ai-element-picking')
    document.addEventListener('pointermove', onMove, true)
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('pointerup', onPointerUp, true)
    document.addEventListener('click', onClick, true)
    document.addEventListener('keydown', onKey, true)
    document.addEventListener('contextmenu', onContext, true)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      document.documentElement.classList.remove('admin-ai-element-picking')
      document.removeEventListener('pointermove', onMove, true)
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('pointerup', onPointerUp, true)
      document.removeEventListener('click', onClick, true)
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('contextmenu', onContext, true)
      window.removeEventListener('scroll', onScroll, true)
      window.clearTimeout(inspectTimer)
    }
  }, [armed])

  const labelTop = hover ? (hover.top > 36 ? hover.top - 26 : hover.top + hover.height + 6) : 0

  return (
    <>
      <button
        type="button"
        data-admin-ai-element-picker=""
        data-testid="admin-ai-element-picker"
        aria-pressed={armed}
        aria-label={armed ? 'Cancel element select' : 'Select element'}
        title={
          armed
            ? 'Click an element on the page or in the browser. Esc to cancel.'
            : 'Select an element on the page or in the browser'
        }
        disabled={disabled}
        onClick={() => setArmed((on) => !on)}
        className={`inline-flex h-8 w-8 items-center justify-center rounded border disabled:opacity-40 ${
          armed
            ? 'border-sky-400 bg-sky-950/80 text-sky-100'
            : 'border-gray-600 bg-gray-900 text-gray-200 hover:bg-gray-800'
        }`}
      >
        <IconCursor />
      </button>
      {armed
        ? createPortal(
            <>
              <style data-admin-ai-element-picker="">{PICK_STYLE}</style>
              <div
                data-admin-ai-element-picker=""
                className="pointer-events-none fixed left-1/2 top-3 z-[13050] -translate-x-1/2 rounded-full border border-sky-400/80 bg-neutral-950/95 px-3 py-1.5 text-[11px] font-medium text-sky-100 shadow-lg"
              >
                {notice || 'Select an element on the page or in the browser · Esc to cancel'}
              </div>
              <button
                type="button"
                data-admin-ai-element-picker=""
                onClick={() => setArmed(false)}
                className="fixed right-3 top-3 z-[13050] rounded border border-gray-600 bg-gray-950 px-2 py-1 text-[11px] text-gray-200 hover:bg-gray-800"
              >
                Cancel
              </button>
              {hover ? (
                <>
                  {hover.width > 1 && hover.height > 1 ? (
                    <div
                      data-admin-ai-element-picker=""
                      className="pointer-events-none fixed z-[13040] rounded-sm border-2 border-sky-400 bg-sky-400/15"
                      style={{
                        top: hover.top,
                        left: hover.left,
                        width: hover.width,
                        height: hover.height,
                      }}
                    />
                  ) : null}
                  <div
                    data-admin-ai-element-picker=""
                    className="pointer-events-none fixed z-[13050] max-w-[min(24rem,calc(100vw-1rem))] truncate rounded bg-sky-500 px-1.5 py-0.5 text-[10px] font-medium text-neutral-950 shadow"
                    style={{ top: labelTop, left: Math.max(8, hover.left) }}
                  >
                    {hover.label}
                  </div>
                </>
              ) : null}
            </>,
            document.body,
          )
        : null}
    </>
  )
}
