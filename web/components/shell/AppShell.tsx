'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/Badge'

function breadcrumbSegments(pathname: string): Array<{ label: string; href: string }> {
  const parts = pathname.split('/').filter(Boolean)
  const crumbs: Array<{ label: string; href: string }> = []
  let href = ''
  for (const part of parts) {
    href += `/${part}`
    crumbs.push({
      href,
      label: part
        .replace(/\[|\]/g, '')
        .split('-')
        .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
        .join(' '),
    })
  }
  return crumbs
}

/** Mount target for AdminAiAssistant FAB (leftmost in the shell header). */
export const ADMIN_AI_FAB_ANCHOR_ID = 'admin-ai-fab-anchor'

/** Center of the shell header. Pages portal a title here. */
export const APP_SHELL_TITLE_SLOT_ID = 'app-shell-title-slot'

export const SHELL_TITLE_TYPE = 'truncate font-six-caps text-5xl font-bold tracking-[0.12em] sm:text-6xl'

function ShellHeaderTitle({
  children,
  className = 'text-white',
}: {
  children: string
  className?: string
}) {
  return (
    <h1 className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-16 text-center sm:px-24">
      <span className={`${SHELL_TITLE_TYPE} ${className}`}>{children}</span>
    </h1>
  )
}

export function AppShell({
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
  const pathname = usePathname() || '/'
  const crumbs = breadcrumbSegments(pathname)
  const showAdminDashboardTitle = surface === 'admin' && pathname === '/admin'
  const showMusicVaultTitle = surface === 'admin' && pathname.startsWith('/admin/music-vault')
  const showMerchDesignerTitle = surface === 'admin' && pathname.startsWith('/admin/merch')
  const envLabel =
    process.env.NEXT_PUBLIC_VERCEL_ENV ||
    process.env.NODE_ENV ||
    'development'

  return (
    <div className="min-h-screen bg-surface text-ink">
      <div className="sticky top-[var(--shell-header-sticky-top)] z-30 border-b border-line bg-surface-raised/95 pt-[var(--shell-header-safe-top)] backdrop-blur-sm">
        <div
          id={APP_SHELL_TITLE_SLOT_ID}
          className="pointer-events-none absolute inset-x-0 bottom-0 top-[var(--shell-header-safe-top)] z-10 flex items-center justify-center px-16 text-center sm:px-24"
        />
        <div className="relative flex min-h-[4.75rem] items-center sm:min-h-[5.5rem]">
          {surface === 'studio' ? (
            <ShellHeaderTitle className="text-violet-400/90">Release Studio</ShellHeaderTitle>
          ) : showAdminDashboardTitle ? (
            <ShellHeaderTitle>Admin Dashboard</ShellHeaderTitle>
          ) : showMusicVaultTitle ? (
            <ShellHeaderTitle className="rounded border border-yellow-400 px-2 text-yellow-400 sm:px-3">
              SERGIK Music Vault
            </ShellHeaderTitle>
          ) : showMerchDesignerTitle ? (
            <ShellHeaderTitle>MERCH DESIGNER STUDIO</ShellHeaderTitle>
          ) : null}
          <div
            id={ADMIN_AI_FAB_ANCHOR_ID}
            className="ml-3 inline-flex h-11 w-11 shrink-0 items-center justify-center sm:ml-4"
          />
          <div className="relative flex min-w-0 flex-1 items-center justify-between gap-2 px-3 py-2 sm:gap-3 sm:px-6 sm:py-3 lg:px-8">
            {surface !== 'admin' ? (
              <div className="flex min-w-0 flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href="/"
                    className="inline-flex items-center rounded-full border border-line bg-surface px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-ink-muted transition-colors hover:border-ink-muted hover:text-ink"
                  >
                    Home
                  </Link>
                  <Badge tone={surface === 'studio' ? 'brand' : 'neutral'}>
                    {surface === 'studio' ? 'Release Studio' : 'Admin'}
                  </Badge>
                </div>
                {showBreadcrumbs && !showAdminDashboardTitle && !showMusicVaultTitle && crumbs.length > 0 ? (
                  <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-xs text-ink-subtle">
                    {crumbs.map((crumb, index) => (
                      <span key={crumb.href} className="inline-flex items-center gap-1">
                        {index > 0 ? <span aria-hidden>/</span> : null}
                        {index === crumbs.length - 1 ? (
                          <span className="text-ink-muted">{crumb.label}</span>
                        ) : (
                          <Link href={crumb.href} className="hover:text-ink">
                            {crumb.label}
                          </Link>
                        )}
                      </span>
                    ))}
                  </nav>
                ) : null}
                {title ? <h1 className="text-xl font-bold tracking-tight text-ink">{title}</h1> : null}
                {subtitle ? <p className="text-sm text-ink-subtle">{subtitle}</p> : null}
              </div>
            ) : (
              <div className="min-w-0 flex-1" aria-hidden />
            )}
            <div className="flex shrink-0 flex-col items-end gap-1">
              {surface !== 'admin' ? <Badge tone="info">{envLabel}</Badge> : null}
              {headerAction}
            </div>
          </div>
        </div>
      </div>
      {children}
    </div>
  )
}
