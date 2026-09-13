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
  const envLabel =
    process.env.NEXT_PUBLIC_VERCEL_ENV ||
    process.env.NODE_ENV ||
    'development'

  return (
    <div className="min-h-screen bg-surface text-ink">
      {(title || showBreadcrumbs) && (
        <div className="border-b border-line bg-surface-raised/80">
          <div className="flex items-start">
            <div
              id={ADMIN_AI_FAB_ANCHOR_ID}
              className="ml-3 mt-4 inline-flex h-11 w-11 shrink-0 items-center justify-center sm:ml-4"
            />
            <div className="mx-auto flex min-w-0 flex-1 flex-col gap-3 px-4 py-4 sm:px-6 lg:px-8">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={surface === 'studio' ? 'brand' : 'neutral'}>
                    {surface === 'studio' ? 'Release Studio' : 'Admin'}
                  </Badge>
                  <Badge tone="info">{envLabel}</Badge>
                </div>
                {headerAction}
              </div>

              {showBreadcrumbs && crumbs.length > 0 ? (
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

              {title ? (
                <div>
                  <h1 className="text-xl font-bold tracking-tight text-ink">{title}</h1>
                  {subtitle ? <p className="mt-0.5 text-sm text-ink-subtle">{subtitle}</p> : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}
      {children}
    </div>
  )
}
