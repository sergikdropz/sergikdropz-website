'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { resolveImageUrl } from '@/utils/resolveImageUrl'
import { fetchBrowserAuthSession } from '@/lib/auth/browser-session'

const TOP_REVEAL_PX = 24
const SCROLL_DELTA_PX = 8
/** Stone-eye header mark — 128px MP4 loop (~40KB) + WebP poster for reduced motion. */
const HEADER_LOGO_POSTER = '/images/gallery/sergik-stone-eye-logo.webp?v=5'
const HEADER_LOGO_VIDEO = '/images/gallery/sergik-stone-eye-logo.mp4?v=3'

export default function Header() {
  const [isOpen, setIsOpen] = useState(false)
  const [headerHidden, setHeaderHidden] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const headerRef = useRef<HTMLElement>(null)
  const touchStartX = useRef<number | null>(null)
  const lastScrollY = useRef(0)
  const rafScroll = useRef<number | null>(null)

  const navItems = [
    { href: '/', label: 'Home' },
    { href: '/music', label: 'Music' },
    { href: '/shop', label: 'Shop' },
    { href: '/videos', label: 'Videos' },
    { href: '/gallery', label: 'Gallery' },
    { href: '/epk', label: 'EPK' },
    { href: '/contact', label: 'Contact' },
  ]

  const [fanNav, setFanNav] = useState<'loading' | 'guest' | 'fan' | 'admin'>('loading')

  useEffect(() => {
    let cancelled = false
    fetchBrowserAuthSession()
      .then((d) => {
        if (cancelled) return
        if (!d?.authenticated) setFanNav('guest')
        else if (d.isAdmin) setFanNav('admin')
        else setFanNav('fan')
      })
      .catch(() => {
        if (!cancelled) setFanNav('guest')
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Hide on scroll down, reveal on scroll up / near top. Stay visible while mobile menu is open.
  useEffect(() => {
    if (typeof window === 'undefined') return
    lastScrollY.current = window.scrollY || 0

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReducedMotion) {
      setHeaderHidden(false)
      return
    }

    const update = () => {
      rafScroll.current = null
      if (isOpen) {
        setHeaderHidden(false)
        lastScrollY.current = window.scrollY || 0
        return
      }
      const y = window.scrollY || 0
      const delta = y - lastScrollY.current
      lastScrollY.current = y

      if (y <= TOP_REVEAL_PX) {
        setHeaderHidden(false)
        return
      }
      if (delta > SCROLL_DELTA_PX) {
        setHeaderHidden(true)
      } else if (delta < -SCROLL_DELTA_PX) {
        setHeaderHidden(false)
      }
    }

    const onScroll = () => {
      if (rafScroll.current != null) return
      rafScroll.current = window.requestAnimationFrame(update)
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (rafScroll.current != null) window.cancelAnimationFrame(rafScroll.current)
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) {
      const resetTimeoutId = setTimeout(() => {
        document.body.style.overflow = ''
        document.body.style.position = ''
        document.body.style.width = ''
      }, 0)
      return () => clearTimeout(resetTimeoutId)
    }

    const setOverflowTimeoutId = setTimeout(() => {
      document.body.style.overflow = 'hidden'
      document.body.style.position = 'fixed'
      document.body.style.width = '100%'
    }, 0)

    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target as HTMLElement
      if (target?.closest('button[aria-label="Toggle menu"]')) return
      if (menuRef.current && !menuRef.current.contains(target as Node)) {
        setIsOpen(false)
      }
    }

    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside, { passive: true })
      document.addEventListener('touchstart', handleClickOutside, { passive: true })
    }, 500)

    return () => {
      clearTimeout(setOverflowTimeoutId)
      clearTimeout(timeoutId)
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('touchstart', handleClickOutside)
      document.body.style.overflow = ''
      document.body.style.position = ''
      document.body.style.width = ''
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen || !menuRef.current) return

    const menuEl = menuRef.current

    const handleTouchStart = (e: TouchEvent) => {
      touchStartX.current = e.touches[0].clientX
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (touchStartX.current === null) return
      const deltaX = e.touches[0].clientX - touchStartX.current
      if (deltaX > 50 && touchStartX.current < 50) {
        setIsOpen(false)
        touchStartX.current = null
      }
    }

    const handleTouchEnd = () => {
      touchStartX.current = null
    }

    menuEl.addEventListener('touchstart', handleTouchStart, { passive: true })
    menuEl.addEventListener('touchmove', handleTouchMove, { passive: true })
    menuEl.addEventListener('touchend', handleTouchEnd, { passive: true })

    return () => {
      menuEl.removeEventListener('touchstart', handleTouchStart)
      menuEl.removeEventListener('touchmove', handleTouchMove)
      menuEl.removeEventListener('touchend', handleTouchEnd)
    }
  }, [isOpen])

  const slideHidden = headerHidden && !isOpen

  // Drive vault sticky chrome: sit under the header when visible, pin to viewport top when hidden.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const el = headerRef.current
    const root = document.documentElement
    if (!el) return

    const publish = () => {
      const height = Math.round(el.getBoundingClientRect().height)
      root.style.setProperty('--site-header-height', `${height}px`)
      root.style.setProperty(
        '--site-header-offset',
        slideHidden ? 'env(safe-area-inset-top, 0px)' : `${height}px`,
      )
      root.dataset.siteHeaderHidden = slideHidden ? 'true' : 'false'
    }

    publish()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(publish) : null
    ro?.observe(el)
    return () => {
      ro?.disconnect()
    }
  }, [slideHidden, isOpen, fanNav])

  useEffect(() => {
    return () => {
      const root = document.documentElement
      root.style.removeProperty('--site-header-offset')
      root.style.removeProperty('--site-header-height')
      delete root.dataset.siteHeaderHidden
    }
  }, [])

  return (
    <header
      ref={headerRef}
      className={`fixed top-0 w-full z-50 bg-black border-b border-gray-800 safe-area-top transition-transform duration-300 ease-out motion-reduce:transition-none ${
        slideHidden ? '-translate-y-full' : 'translate-y-0'
      }`}
      data-site-header
      data-header-hidden={slideHidden ? 'true' : 'false'}
    >
      <nav className="w-full max-w-none px-4 py-3 md:py-4">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 md:gap-3 group touch-manipulation">
            <div className="relative w-10 h-10 sm:w-12 sm:h-12 md:w-16 md:h-16 bg-black overflow-hidden transition-transform duration-300 group-active:scale-95 flex-shrink-0">
              <video
                className="object-contain w-full h-full bg-black motion-reduce:hidden"
                autoPlay
                loop
                muted
                playsInline
                preload="metadata"
                poster={resolveImageUrl(HEADER_LOGO_POSTER)}
                width={128}
                height={128}
                aria-hidden
              >
                <source src={HEADER_LOGO_VIDEO} type="video/mp4" />
              </video>
              <Image
                src={resolveImageUrl(HEADER_LOGO_POSTER)}
                alt="SERGIK Logo"
                width={64}
                height={64}
                className="object-contain w-full h-full bg-black hidden motion-reduce:block"
                priority
              />
            </div>
            <span className="text-3xl sm:text-4xl md:text-5xl font-six-caps header-logo text-white">
              SERGIK
            </span>
          </Link>

          <div className="hidden md:flex items-center space-x-8">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-gray-200 hover:text-white transition-all duration-300 relative group touch-manipulation"
              >
                {item.label}
                <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-white transition-all duration-300 group-hover:w-full" />
              </Link>
            ))}
            {fanNav === 'admin' && (
              <Link
                href="/admin"
                className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-white bg-white/10 hover:bg-white/20 border border-white/25 rounded-md transition-colors duration-300 touch-manipulation"
              >
                Admin
              </Link>
            )}
            {fanNav === 'fan' && (
              <Link
                href="/fan/account"
                className="text-indigo-300 hover:text-indigo-200 transition-all duration-300 relative group touch-manipulation text-sm font-medium"
              >
                Account
                <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-indigo-300 transition-all duration-300 group-hover:w-full" />
              </Link>
            )}
            {fanNav === 'guest' && (
              <>
                <Link
                  href="/fan"
                  className="text-emerald-400/90 hover:text-emerald-300 transition-all duration-300 relative group touch-manipulation text-sm font-medium"
                >
                  Join free
                  <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-emerald-400 transition-all duration-300 group-hover:w-full" />
                </Link>
                <Link
                  href="/fan/login"
                  className="text-gray-300 hover:text-white transition-all duration-300 relative group touch-manipulation text-sm font-medium"
                >
                  Sign in
                  <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-white transition-all duration-300 group-hover:w-full" />
                </Link>
              </>
            )}
          </div>

          <button
            type="button"
            className="md:hidden p-2 -mr-2 touch-manipulation min-w-[44px] min-h-[44px] flex items-center justify-center relative z-50"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setIsOpen((prev) => !prev)
            }}
            onTouchStart={(e) => e.stopPropagation()}
            aria-label="Toggle menu"
            aria-expanded={isOpen}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>
      </nav>

      {isOpen &&
        typeof window !== 'undefined' &&
        createPortal(
          <>
            <div
              className="md:hidden fixed inset-0 bg-black/20 z-[55]"
              onClick={() => setIsOpen(false)}
              style={{ animation: 'fadeIn 0.2s ease-out' }}
            />
            <div
              ref={menuRef}
              className="md:hidden fixed right-0 bg-gray-950/95 z-[60] shadow-xl rounded-l-lg [contain:layout_paint]"
              style={{
                top: 'var(--site-header-offset, 4.5rem)',
                width: 'min(240px, 80vw)',
                transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
                transition: 'transform 0.3s ease-out',
                display: 'block',
                visibility: 'visible',
                opacity: 1,
                maxHeight: 'calc(var(--vvh, 100dvh) - var(--site-header-offset, 4.5rem))',
                overflowY: 'auto',
              }}
            >
              <nav className="space-y-0.5 p-3 safe-area-inset">
                {navItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="block px-4 py-3 text-base font-medium text-white hover:bg-gray-800/40 active:bg-gray-800/40 rounded-md transition-colors touch-manipulation min-h-[44px] flex items-center"
                    onClick={() => setIsOpen(false)}
                  >
                    {item.label}
                  </Link>
                ))}
                {fanNav === 'admin' && (
                  <Link
                    href="/admin"
                    className="block px-4 py-3 text-base font-medium text-white hover:bg-gray-800/40 rounded-md touch-manipulation min-h-[44px] flex items-center"
                    onClick={() => setIsOpen(false)}
                  >
                    Admin
                  </Link>
                )}
                {fanNav === 'fan' && (
                  <Link
                    href="/fan/account"
                    className="block px-4 py-3 text-base font-medium text-indigo-300 hover:bg-gray-800/40 rounded-md touch-manipulation min-h-[44px] flex items-center"
                    onClick={() => setIsOpen(false)}
                  >
                    Account
                  </Link>
                )}
                {fanNav === 'guest' && (
                  <>
                    <Link
                      href="/fan"
                      className="block px-4 py-3 text-base font-medium text-emerald-400 hover:bg-gray-800/40 rounded-md touch-manipulation min-h-[44px] flex items-center"
                      onClick={() => setIsOpen(false)}
                    >
                      Join free
                    </Link>
                    <Link
                      href="/fan/login"
                      className="block px-4 py-3 text-base font-medium text-gray-200 hover:bg-gray-800/40 rounded-md touch-manipulation min-h-[44px] flex items-center"
                      onClick={() => setIsOpen(false)}
                    >
                      Sign in
                    </Link>
                  </>
                )}
              </nav>
            </div>
          </>,
          document.body,
        )}
    </header>
  )
}
