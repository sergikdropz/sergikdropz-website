'use client'

import Link from 'next/link'
import { useAdminAuth } from '@/contexts/AdminAuthContext'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import GlobalSearch from './GlobalSearch'
import { adminNavItems, type AdminNavItem } from './admin-nav-items'

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

export default function AdminNav() {
  const { user, logout } = useAdminAuth()
  const pathname = usePathname()
  const [isMobileOpen, setIsMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {}
    adminNavItems.forEach((item) => {
      if (item.type === 'group') {
        const isActive = item.items.some((child) => pathname.startsWith(child.href))
        if (isActive) initial[item.label] = true
      }
    })
    return initial
  })

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

  function isActive(href: string) {
    if (href === '/admin') return pathname === '/admin'
    return pathname.startsWith(href)
  }

  function renderNavItem(item: AdminNavItem) {
    if (item.type === 'group') {
      const groupActive = item.items.some((child) => isActive(child.href))
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
                  className={`block px-3 py-1.5 rounded-md text-sm transition ${
                    isActive(child.href)
                      ? 'text-white bg-purple-600/20 font-medium'
                      : 'text-gray-400 hover:text-white hover:bg-gray-800/40'
                  }`}
                >
                  {child.label}
                </Link>
              ))}
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
          opts.compact ? 'flex flex-col items-center gap-2 px-1 py-3' : 'flex items-center gap-2 p-4'
        }`}
      >
        {opts.showCollapseToggle ? <CollapseToggle /> : null}
        {!opts.compact ? (
          <Link
            href="/admin"
            className="min-w-0 flex-1 truncate text-lg font-bold text-white transition hover:text-purple-400"
          >
            Admin Panel
          </Link>
        ) : null}
      </div>

      {!opts.compact ? (
        <>
          <div className="p-3">
            <GlobalSearch />
          </div>

          <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">{adminNavItems.map(renderNavItem)}</nav>

          <div className="space-y-3 border-t border-gray-800 p-4">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] font-medium uppercase tracking-wider text-gray-500">
              <span className="text-gray-400">TanStack</span>
              <span className="text-gray-600" aria-hidden>
                ·
              </span>
              <span className="text-gray-400">Query</span>
              <ReactQueryDevtools
                initialIsOpen={false}
                buttonPosition="relative"
                position="bottom"
                theme="dark"
              />
            </div>
            {user && <div className="truncate text-xs text-gray-500">{user.email}</div>}
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
