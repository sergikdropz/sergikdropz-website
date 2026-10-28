'use client'

import { useEffect, useState, type ReactNode } from 'react'
import CommandPalette from '@/components/CommandPalette'
import { AppShell } from '@/components/shell/AppShell'

/**
 * Wraps AppShell with ⌘K / Ctrl+K command palette for Admin and Studio.
 */
export function AppShellWithCommands({
  surface,
  title,
  subtitle,
  headerAction,
  children,
  showBreadcrumbs = true,
}: {
  surface: 'admin' | 'studio'
  title?: string
  subtitle?: string
  headerAction?: ReactNode
  children: ReactNode
  showBreadcrumbs?: boolean
}) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setOpen((prev) => !prev)
      }
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <>
      <AppShell
        surface={surface}
        title={title}
        subtitle={subtitle}
        showBreadcrumbs={showBreadcrumbs}
        headerAction={
          <div className="flex flex-wrap items-center gap-3">
            {headerAction}
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="shrink-0 rounded-md border border-line bg-surface-overlay px-2.5 py-1.5 text-xs text-ink-muted hover:text-ink"
              aria-keyshortcuts="Meta+K Control+K"
              aria-label="Open command search"
            >
              <span className="sm:hidden">Search</span>
              <span className="hidden sm:inline">Command ⌘K</span>
            </button>
          </div>
        }
      >
        {children}
      </AppShell>
      {open ? (
        <CommandPalette
          onClose={() => setOpen(false)}
          onAction={(action) => {
            setOpen(false)
            action()
          }}
        />
      ) : null}
    </>
  )
}
