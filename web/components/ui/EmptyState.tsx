import type { ReactNode } from 'react'
import { Button } from './Button'

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
  children,
}: {
  title: string
  description?: string
  actionLabel?: string
  onAction?: () => void
  children?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-panel border border-dashed border-line bg-surface/40 px-6 py-12 text-center">
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      {description ? <p className="mt-2 max-w-md text-sm text-ink-subtle">{description}</p> : null}
      {children}
      {actionLabel && onAction ? (
        <Button className="mt-4" variant="secondary" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  )
}
