'use client'

import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter, usePathname } from 'next/navigation'
import { useState } from 'react'
import GlobalSearch from './GlobalSearch'
import { adminNavItems, type AdminNavItem } from './admin-nav-items'

export default function AdminNav() {
  const { user, logout } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const [isMobileOpen, setIsMobileOpen] = useState(false)
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

  if (pathname === '/admin/login') {
    return null
  }

  async function handleLogout() {
    await logout()
    router.push('/admin/login')
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

  const sidebarContent = (
    <>
      <div className="p-4 border-b border-gray-800">
        <Link
          href="/admin"
          className="text-lg font-bold text-white hover:text-purple-400 transition block"
        >
          Admin Panel
        </Link>
      </div>

      <div className="p-3">
        <GlobalSearch />
      </div>

      <nav className="flex-1 px-3 pb-4 space-y-1 overflow-y-auto">
        {adminNavItems.map(renderNavItem)}
      </nav>

      <div className="border-t border-gray-800 p-4 space-y-3">
        {user && (
          <div className="text-xs text-gray-500 truncate">{user.email}</div>
        )}
        <button
          onClick={handleLogout}
          className="w-full bg-red-600/80 hover:bg-red-600 text-white px-3 py-2 rounded-md text-sm font-medium transition"
        >
          Logout
        </button>
      </div>
    </>
  )

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:flex-col md:fixed md:inset-y-0 md:left-0 md:w-56 bg-gray-900/95 backdrop-blur-sm border-r border-gray-800 z-40">
        {sidebarContent}
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 bg-gray-900/95 backdrop-blur-sm border-b border-gray-800">
        <div className="flex items-center justify-between h-14 px-4">
          <Link href="/admin" className="text-lg font-bold text-white">
            Admin Panel
          </Link>
          <button
            onClick={() => setIsMobileOpen(!isMobileOpen)}
            className="text-gray-300 hover:text-white"
            aria-label="Toggle menu"
            title="Toggle menu"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
            className="md:hidden fixed inset-0 z-50 bg-black/60"
            onClick={() => setIsMobileOpen(false)}
          />
          <aside className="md:hidden fixed inset-y-0 left-0 z-50 w-64 bg-gray-900 flex flex-col">
            {sidebarContent}
          </aside>
        </>
      )}
    </>
  )
}
