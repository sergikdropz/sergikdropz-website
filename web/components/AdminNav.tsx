'use client'

import Link from 'next/link'
import { useAdminAuth } from '@/contexts/AdminAuthContext'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import GlobalSearch from './GlobalSearch'
import { adminNavItems, type AdminNavItem } from './admin-nav-items'
import { prefetchAdminRoute } from '@/lib/admin-nav-prefetch'
import { Badge } from '@/components/ui/Badge'

const ReactQueryDevtools =
  process.env.NODE_ENV === 'development'
    ? dynamic(
        () =>
          import('@tanstack/react-query-devtools').then((m) => m.ReactQueryDevtools),
        { ssr: false },
      )
    : () => null

const ADMIN_NAV_COLLAPSED_KEY = 'admin-nav-collapsed-v1'
const SHELL_NAV_EXPANDED = '14rem'
const SHELL_NAV_COLLAPSED = '3.25rem'

function navPath(href: string) {
  return href.split('?')[0] || href
}

function groupContainsPath(pathname: string, href: string) {
  const path = navPath(href)
  return pathname === path || pathname.startsWith(`${path}/`)
}

function hrefIsActive(
  pathname: string,
  searchParams: { get: (key: string) => string | null },
  href: string,
  siblingHrefs: string[],
) {
  const path = navPath(href)
  const pathMatches =
    path === '/admin' || path === '/studio'
      ? pathname === path
      : pathname === path || pathname.startsWith(`${path}/`)
  if (!pathMatches) return false

  const query = href.includes('?') ? href.slice(href.indexOf('?') + 1) : ''
  const expected = new URLSearchParams(query)
  if ([...expected.keys()].length === 0) {
    for (const sibling of siblingHrefs) {
      if (sibling === href || navPath(sibling) !== path || !sibling.includes('?')) continue
      const siblingQuery = new URLSearchParams(sibling.slice(sibling.indexOf('?') + 1))
      const matchesSibling = [...siblingQuery.keys()].every((key) => searchParams.get(key) === siblingQuery.get(key))
      if (matchesSibling) return false
    }
    return true
  }

  return [...expected.keys()].every((key) => searchParams.get(key) === expected.get(key))
}

const adminEnvLabel =
  process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV || 'development'

export default function AdminNav() {
  const { user, logout } = useAdminAuth()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()
  const [isMobileOpen, setIsMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {}
    adminNavItems.forEach((item) => {
      if (item.type === 'group') {
        const isActive = item.items.some((child) => groupContainsPath(pathname, child.href))
        if (isActive) initial[item.label] = true
      }
    })
    return initial
  })

  useEffect(() => {
    setExpandedGroups((prev) => {
      const next = { ...prev }
      let changed = false
      adminNavItems.forEach((item) => {
        if (item.type !== 'group') return
        const active = item.items.some((child) => groupContainsPath(pathname, child.href))
        if (active && !next[item.label]) {
          next[item.label] = true
          changed = true
        }
      })
      return changed ? next : prev
    })
  }, [pathname])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      setCollapsed(localStorage.getItem(ADMIN_NAV_COLLAPSED_KEY) === '1')
    } catch {
      /* keep default */
    }
  }, [])

  useEffect(() => {
    if (typeof document === 'undefined') return
    const width = collapsed ? SHELL_NAV_COLLAPSED : SHELL_NAV_EXPANDED
    document.documentElement.style.setProperty('--shell-nav-width', width)
    try {
      localStorage.setItem(ADMIN_NAV_COLLAPSED_KEY, collapsed ? '1' : '0')
    } catch {
      /* quota */
    }
    return () => {
      document.documentElement.style.setProperty('--shell-nav-width', SHELL_NAV_EXPANDED)
    }
  }, [collapsed])

  if (pathname === '/admin/login') {
    return null
  }

  async function handleLogout() {
    await logout()
  }

  function toggleGroup(label: string) {
    setExpandedGroups((prev) => ({ ...prev, [label]: !prev[label] }))
  }

  function isActive(href: string, siblingHrefs: string[] = [href]) {
    return hrefIsActive(pathname, searchParams, href, siblingHrefs)
  }

  function renderNavItem(item: AdminNavItem) {
    if (item.type === 'group') {
      const siblingHrefs = item.items.map((child) => child.href)
      const groupActive = item.items.some((child) => groupContainsPath(pathname, child.href))
      const expanded = expandedGroups[item.label] ?? false

      return (
        <div key={item.label}>
          <button
            onClick={() => toggleGroup(item.label)}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-sm font-medium transition ${
              groupActive
                ? 'text-white bg-gray-800/60'
                : 'text-gray-400 hover:text-white hover:bg-gray-800/40'
            }`}
          >
            <span>{item.label}</span>
            <svg
              className={`w-4 h-4 transition-transform ${expanded ? 'rotate-90' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
          {expanded && (
            <div className="mt-1 ml-3 pl-3 border-l border-gray-700/50 space-y-0.5">
              {item.items.map((child) => (
                <Link
                  key={child.href}
                  href={child.href}
                  onClick={() => setIsMobileOpen(false)}
                  onMouseEnter={() => prefetchAdminRoute(router, child.href)}
                  onFocus={() => prefetchAdminRoute(router, child.href)}
                  className={`block px-3 py-1.5 rounded-md text-sm transition ${
                    isActive(child.href, siblingHrefs)
                      ? 'text-white bg-purple-600/20 font-medium'
                      : 'text-gray-400 hover:text-white hover:bg-gray-800/40'
                  }`}
                >
                  {child.label}
                </Link>
              ))}
              {item.label === 'Settings' && process.env.NODE_ENV === 'development' ? (
                <button
                  type="button"
                  onClick={() => {
                    document
                      .querySelector<HTMLElement>('.admin-sidebar-devtools-anchor .tsqd-open-btn')
                      ?.click()
                  }}
                  className="block w-full rounded-md px-3 py-1.5 text-left text-sm text-gray-400 transition hover:bg-gray-800/40 hover:text-white"
                >
                  TanStack
                </button>
              ) : null}
            </div>
          )}
        </div>
      )
    }

    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={() => setIsMobileOpen(false)}
        onMouseEnter={() => prefetchAdminRoute(router, item.href)}
        onFocus={() => prefetchAdminRoute(router, item.href)}
        className={`block px-3 py-2 rounded-md text-sm font-medium transition ${
          isActive(item.href)
            ? 'text-white bg-purple-600/20'
            : 'text-gray-400 hover:text-white hover:bg-gray-800/40'
        }`}
      >
        {item.label}
      </Link>
    )
  }

  function CollapseToggle({ className = '' }: { className?: string }) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed((prev) => !prev)}
        className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-gray-400 transition hover:bg-gray-800 hover:text-white ${className}`}
        aria-label={collapsed ? 'Expand admin sidebar' : 'Collapse admin sidebar'}
        aria-expanded={!collapsed}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        <svg
          className={`h-4 w-4 transition-transform duration-ui ${collapsed ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
        </svg>
      </button>
    )
  }

  const sidebarContent = (opts: { showCollapseToggle: boolean; compact: boolean }) => (
    <>
      <div
        className={`border-b border-gray-800 ${
          opts.compact ? 'flex flex-col items-center gap-2 px-1 py-3' : 'flex items-start gap-2 p-4'
        }`}
      >
        {opts.showCollapseToggle ? <CollapseToggle /> : null}
        {!opts.compact ? (
          <div className="min-w-0 flex-1">
            <Link
              href="/admin"
              className="block truncate text-lg font-bold text-white transition hover:text-purple-400"
            >
              Admin Panel
            </Link>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Link
                href="/"
                className="inline-flex items-center rounded-full border border-gray-700 bg-gray-900/80 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-400 transition-colors hover:border-gray-500 hover:text-white"
              >
                Home
              </Link>
              <Badge tone="neutral">Admin</Badge>
            </div>
          </div>
        ) : null}
      </div>

      {!opts.compact ? (
        <>
          <div className="p-3">
            <GlobalSearch />
          </div>

          <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">{adminNavItems.map(renderNavItem)}</nav>

          <div className="flex flex-col items-center space-y-3 border-t border-gray-800 p-4 text-center">
            <Badge tone="info">{adminEnvLabel}</Badge>
            {user && (
              <div className="w-full truncate text-center text-xs text-gray-500">{user.email}</div>
            )}
            <button
              onClick={handleLogout}
              className="w-full rounded-md bg-red-600/80 px-3 py-2 text-sm font-medium text-white transition hover:bg-red-600"
            >
              Logout
            </button>
          </div>
        </>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-end gap-3 px-1 pb-4 pt-2">
          <Link
            href="/admin"
            className="sr-only"
            tabIndex={-1}
          >
            Admin Panel
          </Link>
          {user ? (
            <span className="sr-only">{user.email}</span>
          ) : null}
          <button
            onClick={handleLogout}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-red-600/80 text-white transition hover:bg-red-600"
            aria-label="Logout"
            title="Logout"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
              />
            </svg>
          </button>
        </div>
      )}
    </>
  )

  return (
    <>
      {process.env.NODE_ENV === 'development' ? (
        <div className="admin-sidebar-devtools-anchor pointer-events-none fixed left-0 top-0 h-px w-px overflow-hidden opacity-0">
          <ReactQueryDevtools
            initialIsOpen={false}
            buttonPosition="relative"
            position="bottom"
            theme="dark"
          />
        </div>
      ) : null}
      {/* Desktop sidebar */}
      <aside
        className={`admin-sidebar z-40 hidden border-r border-line bg-surface-overlay/95 backdrop-blur-sm transition-[width] duration-ui ease-out md:fixed md:inset-y-0 md:left-0 md:flex md:w-shell-nav md:flex-col ${
          collapsed ? 'admin-sidebar--collapsed' : ''
        }`}
      >
        {sidebarContent({ showCollapseToggle: true, compact: collapsed })}
      </aside>

      {/* Mobile top bar */}
      <div className="fixed left-0 right-0 top-0 z-50 border-b border-line bg-surface-overlay/95 backdrop-blur-sm md:hidden">
        <div className="flex h-shell-top items-center justify-between px-4">
          <Link href="/admin" className="text-lg font-bold text-ink">
            Admin Panel
          </Link>
          <button
            onClick={() => setIsMobileOpen(!isMobileOpen)}
            className="touch-target text-ink-muted hover:text-ink"
            aria-label="Toggle menu"
            title="Toggle menu"
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {isMobileOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile slide-out drawer */}
      {isMobileOpen && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/60 md:hidden"
            onClick={() => setIsMobileOpen(false)}
          />
          <aside className="admin-sidebar fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-surface-overlay md:hidden">
            {sidebarContent({ showCollapseToggle: false, compact: false })}
          </aside>
        </>
      )}
    </>
  )
}
