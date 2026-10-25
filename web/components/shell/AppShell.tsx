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
      <div className="relative border-b border-line bg-surface-raised/80">
        <div
          id={APP_SHELL_TITLE_SLOT_ID}
          className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-4 text-center"
        />
        <div className="relative flex items-center">
          <div
            id={ADMIN_AI_FAB_ANCHOR_ID}
            className="ml-3 inline-flex h-11 w-11 shrink-0 items-center justify-center sm:ml-4"
          />
          <div className="relative flex min-w-0 flex-1 items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
            {surface === 'studio' ? (
              <p className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 text-center text-3xl font-bold uppercase tracking-tight text-violet-400/90 md:text-4xl">
                Release Studio
              </p>
            ) : showAdminDashboardTitle ? (
              <h1 className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 text-center text-4xl font-bold text-ink">
                Admin Dashboard
              </h1>
            ) : showMusicVaultTitle ? (
              <h1 className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded border border-yellow-400 px-3 py-1 text-center font-six-caps text-3xl font-semibold text-yellow-400 sm:text-4xl">
                SERGIK Music Vault
              </h1>
            ) : showMerchDesignerTitle ? (
              <h1 className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-center text-2xl font-bold uppercase tracking-wide text-white">
                MERCH DESIGNER STUDIO
              </h1>
            ) : null}
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
            <div className="flex shrink-0 flex-col items-end gap-1">
              <Badge tone="info">{envLabel}</Badge>
              {headerAction}
            </div>
          </div>
        </div>
      </div>
      {children}
    </div>
  )
}
