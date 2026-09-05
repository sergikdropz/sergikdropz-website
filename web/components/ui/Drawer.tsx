'use client'

import type { ReactNode } from 'react'
import { IconButton } from './IconButton'

export function Drawer({
  open,
  title,
  children,
  onClose,
  side = 'left',
}: {
  open: boolean
  title: string
  children: ReactNode
  onClose: () => void
  side?: 'left' | 'right'
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" className="absolute inset-0 bg-black/60" aria-label="Close drawer" onClick={onClose} />
      <aside
        className={[
          'absolute inset-y-0 flex w-72 max-w-[85vw] flex-col border-line bg-surface-overlay',
          side === 'left' ? 'left-0 border-r' : 'right-0 border-l',
        ].join(' ')}
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          <IconButton label="Close" onClick={onClose}>
            <span aria-hidden>×</span>
          </IconButton>
        </div>
        <div className="flex-1 overflow-y-auto p-3">{children}</div>
      </aside>
    </div>
  )
}
