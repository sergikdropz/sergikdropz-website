'use client'

import { ErrorState } from '@/components/ui/ErrorState'

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <ErrorState
        title="Admin page failed to load"
        description={error.message || 'Unexpected error'}
        onRetry={reset}
      />
    </div>
  )
}
