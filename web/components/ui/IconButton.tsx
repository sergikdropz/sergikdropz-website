'use client'

import type { ButtonHTMLAttributes, ReactNode } from 'react'

export function IconButton({
  label,
  children,
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={[
        'inline-flex h-10 w-10 items-center justify-center rounded-ui text-ink-muted',
        'hover:bg-surface-muted hover:text-ink focus-visible:outline-none focus-visible:shadow-focus',
        'disabled:opacity-40 touch-target',
        className,
      ].join(' ')}
      {...rest}
    >
      {children}
    </button>
  )
}
