'use client'

import { useEffect } from 'react'

export function Toast({
  open,
  message,
  tone = 'info',
  onClose,
  durationMs = 4000,
}: {
  open: boolean
  message: string
  tone?: 'info' | 'success' | 'warning' | 'danger'
  onClose: () => void
  durationMs?: number
}) {
  useEffect(() => {
    if (!open) return
    const timer = window.setTimeout(onClose, durationMs)
    return () => window.clearTimeout(timer)
  }, [open, durationMs, onClose])

  if (!open) return null

  const toneClass =
    tone === 'success'
      ? 'border-status-success/40 text-status-success'
      : tone === 'warning'
        ? 'border-status-warning/40 text-status-warning'
        : tone === 'danger'
          ? 'border-status-danger/40 text-status-danger'
          : 'border-status-info/40 text-status-info'

  return (
    <div
      className={[
        'fixed bottom-4 left-1/2 z-[90] -translate-x-1/2 rounded-ui border bg-surface-overlay px-4 py-2 text-sm shadow-none',
        toneClass,
      ].join(' ')}
      role="status"
    >
      {message}
    </div>
  )
}
