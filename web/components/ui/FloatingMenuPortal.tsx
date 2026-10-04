'use client'

import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'

/**
 * Site-wide layer for floating menus and dialogs.
 * Mounts on document.body above album cards, the player, and the admin dock
 * so page content cannot paint over an open popup.
 */
const OVERLAY_Z_INDEX = 50000

export function FloatingMenuPortal({ children }: { children: ReactNode }) {
  if (typeof document === 'undefined') return null
  return createPortal(
    <div className="pointer-events-none fixed inset-0" style={{ zIndex: OVERLAY_Z_INDEX }}>
      <div className="pointer-events-auto contents">{children}</div>
    </div>,
    document.body,
  )
}
