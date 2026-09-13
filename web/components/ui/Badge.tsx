import type { ReactNode } from 'react'

type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info'

const tones: Record<Tone, string> = {
  neutral: 'border-line bg-surface-muted text-ink-muted',
  brand: 'border-brand/40 bg-brand/15 text-ink',
  success: 'border-status-success/40 bg-status-success/15 text-status-success',
  warning: 'border-status-warning/40 bg-status-warning/15 text-status-warning',
  danger: 'border-status-danger/40 bg-status-danger/15 text-status-danger',
  info: 'border-status-info/40 bg-status-info/15 text-status-info',
}

export function Badge({
  children,
  tone = 'neutral',
  className = '',
}: {
  children: ReactNode
  tone?: Tone
  className?: string
}) {
  return (
    <span
      className={[
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide',
        tones[tone],
        className,
      ].join(' ')}
    >
      {children}
    </span>
  )
}
