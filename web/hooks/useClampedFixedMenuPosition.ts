'use client'

import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react'
import {
  allocatePopupMenuZIndex,
  clampFixedMenuStyle,
  type ClampedFixedMenuStyle,
  type FixedMenuSize,
} from '@/lib/ui/clamp-fixed-menu'

type Anchor = { x: number; y: number }

const DRAG_IGNORE_SELECTOR = 'button, a, input, select, textarea, label, [data-no-drag]'

/**
 * Positions a fixed menu at (x, y), re-clamps after layout, brings it to the front
 * when interacted with, and supports dragging from a header handle.
 */
export function useClampedFixedMenuPosition(
  open: boolean,
  anchor: Anchor | null | undefined,
  estimate: FixedMenuSize = { width: 224, height: 360 },
  options?: {
    pad?: number
    /** Merge with an existing ref used for outside-click dismiss, etc. */
    externalRef?: RefObject<HTMLDivElement | null> | MutableRefObject<HTMLDivElement | null>
  },
) {
  const pad = options?.pad ?? 8
  const externalRef = options?.externalRef
  const localRef = useRef<HTMLDivElement | null>(null)
  const draggedRef = useRef(false)
  const draggingRef = useRef(false)
  const styleRef = useRef<ClampedFixedMenuStyle>(
    clampFixedMenuStyle(anchor?.x ?? 0, anchor?.y ?? 0, estimate, pad, allocatePopupMenuZIndex()),
  )
  const [style, setStyle] = useState<ClampedFixedMenuStyle>(styleRef.current)

  const commitStyle = useCallback((next: ClampedFixedMenuStyle) => {
    styleRef.current = next
    setStyle(next)
  }, [])

  const measureSize = useCallback((): FixedMenuSize => {
    const el = localRef.current
    const width = el?.offsetWidth || estimate.width
    const height = el
      ? Math.max(el.scrollHeight, el.getBoundingClientRect().height, estimate.height * 0.25)
      : estimate.height
    return { width, height }
  }, [estimate.height, estimate.width])

  const setRef = useCallback(
    (el: HTMLDivElement | null) => {
      localRef.current = el
      if (externalRef) {
        ;(externalRef as MutableRefObject<HTMLDivElement | null>).current = el
      }
    },
    [externalRef],
  )

  const bringToFront = useCallback(() => {
    const zIndex = allocatePopupMenuZIndex()
    commitStyle({ ...styleRef.current, zIndex })
  }, [commitStyle])

  const reclampAt = useCallback(
    (x: number, y: number, zIndex = styleRef.current.zIndex) => {
      commitStyle(clampFixedMenuStyle(x, y, measureSize(), pad, zIndex))
    },
    [commitStyle, measureSize, pad],
  )

  useLayoutEffect(() => {
    if (!open || !anchor) {
      draggedRef.current = false
      draggingRef.current = false
      return
    }

    draggedRef.current = false
    const zIndex = allocatePopupMenuZIndex()
    commitStyle(clampFixedMenuStyle(anchor.x, anchor.y, measureSize(), pad, zIndex))

    const apply = () => {
      if (draggingRef.current) return
      const { left, top, zIndex: z } = styleRef.current
      if (draggedRef.current) {
        reclampAt(left, top, z)
      } else if (anchor) {
        reclampAt(anchor.x, anchor.y, z)
      }
    }

    const el = localRef.current
    const ro = el ? new ResizeObserver(() => apply()) : null
    if (el && ro) ro.observe(el)
    window.addEventListener('resize', apply)
    // Second pass after paint so scrollHeight is accurate
    const raf = window.requestAnimationFrame(apply)
    return () => {
      ro?.disconnect()
      window.removeEventListener('resize', apply)
      window.cancelAnimationFrame(raf)
    }
  }, [open, anchor?.x, anchor?.y, estimate.width, estimate.height, pad, commitStyle, measureSize, reclampAt])

  const onHeaderPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      if (!open || e.button !== 0) return
      const target = e.target as HTMLElement | null
      if (target?.closest(DRAG_IGNORE_SELECTOR)) return

      e.preventDefault()
      e.stopPropagation()
      bringToFront()

      const startX = e.clientX
      const startY = e.clientY
      const originLeft = styleRef.current.left
      const originTop = styleRef.current.top
      draggingRef.current = true
      draggedRef.current = true

      const handle = e.currentTarget
      handle.setPointerCapture?.(e.pointerId)

      const onMove = (ev: PointerEvent) => {
        reclampAt(originLeft + (ev.clientX - startX), originTop + (ev.clientY - startY))
      }
      const onUp = (ev: PointerEvent) => {
        draggingRef.current = false
        try {
          handle.releasePointerCapture?.(ev.pointerId)
        } catch {
          /* ignore */
        }
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', onUp)
        // Final clamp after release
        reclampAt(styleRef.current.left, styleRef.current.top)
      }

      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onUp)
    },
    [bringToFront, open, reclampAt],
  )

  const rootStyle: CSSProperties = {
    left: style.left,
    top: style.top,
    maxHeight: style.maxHeight,
    zIndex: style.zIndex,
  }

  return {
    ref: setRef,
    style: rootStyle,
    /** Spread on the menu root so any click raises stacking order. */
    rootProps: {
      onPointerDownCapture: () => {
        bringToFront()
      },
    },
    /** Spread on the menu header / title row to enable drag. */
    headerProps: {
      onPointerDown: onHeaderPointerDown,
      className:
        'cursor-grab touch-none select-none active:cursor-grabbing',
      'data-popup-menu-drag-handle': '',
      title: 'Drag to move',
    },
    bringToFront,
  }
}
