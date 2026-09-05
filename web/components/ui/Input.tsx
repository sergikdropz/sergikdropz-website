'use client'

import type { InputHTMLAttributes } from 'react'

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string
  hint?: string
  error?: string
}

export function Input({ label, hint, error, className = '', id, ...rest }: InputProps) {
  const inputId = id || rest.name || undefined
  return (
    <label className="block space-y-1.5">
      {label ? (
        <span className="block text-xs font-medium uppercase tracking-wide text-ink-subtle">{label}</span>
      ) : null}
      <input
        id={inputId}
        className={[
          'w-full rounded-ui border bg-surface-raised px-3 py-2 text-sm text-ink',
          'placeholder:text-ink-subtle focus-visible:outline-none focus-visible:shadow-focus',
          error ? 'border-status-danger' : 'border-line',
          className,
        ].join(' ')}
        {...rest}
      />
      {error ? <span className="block text-xs text-status-danger">{error}</span> : null}
      {!error && hint ? <span className="block text-xs text-ink-subtle">{hint}</span> : null}
    </label>
  )
}
