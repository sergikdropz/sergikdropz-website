import { Button } from './Button'

export function ErrorState({
  title = 'Something went wrong',
  description,
  onRetry,
}: {
  title?: string
  description?: string
  onRetry?: () => void
}) {
  return (
    <div
      className="rounded-panel border border-status-danger/40 bg-status-danger/10 px-4 py-5"
      role="alert"
    >
      <h3 className="text-sm font-semibold text-status-danger">{title}</h3>
      {description ? <p className="mt-1 text-sm text-ink-muted">{description}</p> : null}
      {onRetry ? (
        <Button className="mt-3" size="sm" variant="secondary" onClick={onRetry}>
          Retry
        </Button>
      ) : null}
    </div>
  )
}
