'use client'

import type { ReactNode } from 'react'
import { IconButton } from './IconButton'

export function Dialog({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean
  title: string
  children: ReactNode
  onClose: () => void
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title}>
      <button
        type="button"
        className="absolute inset-0 bg-black/70"
        aria-label="Close dialog"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-lg rounded-panel border border-line bg-surface-overlay p-4 shadow-none">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          <IconButton label="Close" onClick={onClose}>
            <span aria-hidden>×</span>
          </IconButton>
        </div>
        {children}
      </div>
    </div>
  )
}
