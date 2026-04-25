'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { resolveImageUrl } from '@/utils/resolveImageUrl'

export default function Header() {
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const headerRef = useRef<HTMLElement>(null)
  const touchStartX = useRef<number | null>(null)
  const renderCountRef = useRef(0)
  const isMountedRef = useRef(false)
  
  // #region agent log
  const sanitizeForLogging = (obj: any): any => {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj !== 'object') return obj;
    
    // Check for DOM elements (only in browser)
    if (typeof window !== 'undefined') {
      if (obj instanceof HTMLElement || obj instanceof SVGElement) {
        return {
          tagName: obj.tagName,
          id: obj.id,
          className: obj.className,
          type: 'HTMLElement'
        };
      }
    } else {
      // Server-side: check if it looks like a DOM element
      if (obj.tagName && typeof obj.tagName === 'string') {
        return {
          tagName: obj.tagName,
          id: obj.id || '',
          className: obj.className || '',
          type: 'HTMLElement (server)'
        };
      }
    }
    
    if (Array.isArray(obj)) {
      return obj.map(sanitizeForLogging);
    }
    const sanitized: any = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key) && !key.includes('__react') && !key.includes('Fiber')) {
        try {
          sanitized[key] = sanitizeForLogging(obj[key]);
        } catch (e) {
          sanitized[key] = '[Circular or non-serializable]';
        }
      }
    }
    return sanitized;
  };
  
  const log = (msg: string, data: any, hypothesisId: string) => {
    // Disable debug logging in production and reduce noise in development
    if (process.env.NODE_ENV === 'production') {
      return;
    }
    
    // Only log if explicitly enabled via environment variable
    if (!process.env.NEXT_PUBLIC_ENABLE_DEBUG_LOGGING) {
      return;
    }
    
    const sanitizedData = sanitizeForLogging(data);
    const logEntry = {location:'Header.tsx',message:msg,data:sanitizedData,timestamp:Date.now(),sessionId:'debug-session',runId:'run3',hypothesisId};
    console.log('[DEBUG]', logEntry);
    try {
      fetch('http://127.0.0.1:7243/ingest/a346b04a-1680-490e-a42d-0a05edd129a0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(logEntry)}).catch((err) => {
        // Silently fail - don't spam console
      });
    } catch (err) {
      // Silently fail - don't spam console
    }
  };
  
  // Track renders and mounts
  if (!isMountedRef.current) {
    isMountedRef.current = true
    log('Header mount', {}, 'E');
  }
  renderCountRef.current++
  log('Header render', { renderCount: renderCountRef.current, isOpen, isMounted: isMountedRef.current }, 'E');
  
  // #region agent log
  // Check menu element after render
  useEffect(() => {
    if (isOpen) {
      const checkMenu = () => {
        const menuEl = menuRef.current;
        if (menuEl) {
          const computedStyle = window.getComputedStyle(menuEl);
          const rect = menuEl.getBoundingClientRect();
          const headerEl = menuEl.closest('header');
          const headerStyle = headerEl ? window.getComputedStyle(headerEl) : null;
          
          log('menu element check after render', {
            exists: !!menuEl,
            display: computedStyle.display,
            visibility: computedStyle.visibility,
            opacity: computedStyle.opacity,
            zIndex: computedStyle.zIndex,
            position: computedStyle.position,
            top: computedStyle.top,
            left: computedStyle.left,
            width: computedStyle.width,
            height: computedStyle.height,
            rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
            isInViewport: rect.top >= 0 && rect.left >= 0 && rect.width > 0 && rect.height > 0,
            parentElement: menuEl.parentElement?.tagName,
            parentZIndex: menuEl.parentElement ? window.getComputedStyle(menuEl.parentElement).zIndex : null,
            headerZIndex: headerStyle?.zIndex,
            headerPosition: headerStyle?.position,
            bodyOverflow: document.body.style.overflow,
            bodyPosition: document.body.style.position,
            windowWidth: window.innerWidth,
            windowHeight: window.innerHeight,
            isMobile: window.innerWidth < 768,
            time: performance.now()
          }, 'F');
        } else {
          log('menu element not found in DOM', { isOpen, time: performance.now() }, 'F');
        }
      };
      // Check immediately and after a short delay
      checkMenu();
      const timeoutId = setTimeout(checkMenu, 100);
      return () => clearTimeout(timeoutId);
    }
  }, [isOpen]);
  // #endregion

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
    fetch('/api/auth/session', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return
        if (!d.authenticated) setFanNav('guest')
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

  // Close menu when clicking outside and manage body scroll
  useEffect(() => {
    // #region agent log
    log('useEffect clickOutside - entry', { isOpen, time: performance.now(), renderCount: renderCountRef.current }, 'A');
    // #endregion
    
    if (!isOpen) {
      // #region agent log
      log('useEffect - menu closed, resetting overflow', { time: performance.now() }, 'B');
      // #endregion
      // Use setTimeout with 0 delay instead of RAF to avoid potential RAF queue blocking
      const resetTimeoutId = setTimeout(() => {
        // #region agent log
        log('useEffect - resetting overflow in timeout', { time: performance.now() }, 'B');
        // #endregion
        document.body.style.overflow = ''
        document.body.style.position = ''
        document.body.style.width = ''
      }, 0)
      return () => {
        clearTimeout(resetTimeoutId)
      }
    }

    // Prevent body scroll when menu is open on mobile
    // Use setTimeout instead of RAF to avoid blocking
    const setOverflowTimeoutId = setTimeout(() => {
      // #region agent log
      log('useEffect - setting overflow hidden', { 
        bodyOverflowBefore: document.body.style.overflow,
        time: performance.now()
      }, 'B');
      // #endregion
      document.body.style.overflow = 'hidden'
      // Also prevent position issues on iOS
      document.body.style.position = 'fixed'
      document.body.style.width = '100%'
      // #region agent log
      log('useEffect - after setting overflow', { 
        bodyOverflowAfter: document.body.style.overflow,
        time: performance.now()
      }, 'B');
      // #endregion
    }, 0)

    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target as HTMLElement
      
      // #region agent log
      log('handleClickOutside - entry', { 
        hasMenuRef: !!menuRef.current,
        target: target?.tagName,
        isButton: target?.closest('button[aria-label="Toggle menu"]') !== null,
        contains: menuRef.current?.contains(target as Node)
      }, 'A');
      // #endregion
      
      // Don't close if clicking the menu button itself
      if (target?.closest('button[aria-label="Toggle menu"]')) {
        // #region agent log
        log('handleClickOutside - ignoring button click', {}, 'A');
        // #endregion
        return
      }
      
      if (menuRef.current && !menuRef.current.contains(target as Node)) {
        // #region agent log
        log('handleClickOutside - closing menu', {}, 'A');
        // #endregion
        setIsOpen(false)
      }
    }

    // Use both mouse and touch events for better mobile support
    // Add a longer delay to prevent immediate firing on button click
    // Use a longer delay to ensure menu is fully rendered and visible
    const timeoutId = setTimeout(() => {
      // #region agent log
      log('useEffect - adding listeners after delay', {}, 'A');
      // #endregion
      document.addEventListener('mousedown', handleClickOutside, { passive: true })
      document.addEventListener('touchstart', handleClickOutside, { passive: true })
    }, 500) // Increased delay to ensure menu is fully rendered and user can interact

    return () => {
      // #region agent log
      log('useEffect clickOutside - cleanup', { isOpen, time: performance.now() }, 'A');
      // #endregion
      clearTimeout(setOverflowTimeoutId)
      clearTimeout(timeoutId)
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('touchstart', handleClickOutside)
      // Reset body styles immediately in cleanup
      document.body.style.overflow = ''
      document.body.style.position = ''
      document.body.style.width = ''
    }
  }, [isOpen])

  // Swipe to close menu
  useEffect(() => {
    // #region agent log
    log('useEffect swipe - entry', { isOpen, hasMenuRef: !!menuRef.current }, 'D');
    // #endregion
    
    if (!isOpen || !menuRef.current) {
      // #region agent log
      log('useEffect swipe - early return', { isOpen, hasMenuRef: !!menuRef.current }, 'D');
      // #endregion
      return
    }

    const handleTouchStart = (e: TouchEvent) => {
      // #region agent log
      log('handleTouchStart', { clientX: e.touches[0].clientX }, 'D');
      // #endregion
      touchStartX.current = e.touches[0].clientX
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (touchStartX.current === null) return
      const touchX = e.touches[0].clientX
      const deltaX = touchX - touchStartX.current

      // Swipe right to close (if swiping from left edge)
      if (deltaX > 50 && touchStartX.current < 50) {
        // #region agent log
        log('handleTouchMove - closing menu', { deltaX, touchStartX: touchStartX.current }, 'D');
        // #endregion
        setIsOpen(false)
        touchStartX.current = null
      }
    }

    const handleTouchEnd = () => {
      // #region agent log
      log('handleTouchEnd', {}, 'D');
      // #endregion
      touchStartX.current = null
    }

    // #region agent log
    log('useEffect swipe - adding listeners', {}, 'D');
    // #endregion
    menuRef.current.addEventListener('touchstart', handleTouchStart, { passive: true })
    menuRef.current.addEventListener('touchmove', handleTouchMove, { passive: true })
    menuRef.current.addEventListener('touchend', handleTouchEnd, { passive: true })

    return () => {
      // #region agent log
      log('useEffect swipe - cleanup', {}, 'D');
      // #endregion
      if (menuRef.current) {
        menuRef.current.removeEventListener('touchstart', handleTouchStart)
        menuRef.current.removeEventListener('touchmove', handleTouchMove)
        menuRef.current.removeEventListener('touchend', handleTouchEnd)
      }
    }
  }, [isOpen])

  // #region agent log
  useEffect(() => {
    if (headerRef.current) {
      const headerStyle = window.getComputedStyle(headerRef.current);
      log('header styles check', {
        zIndex: headerStyle.zIndex,
        position: headerStyle.position,
        display: headerStyle.display,
        isOpen,
        time: performance.now()
      }, 'F');
    }
  }, [isOpen]);
  // #endregion

  return (
    <header 
      ref={headerRef}
      className="fixed top-0 w-full z-50 bg-black/80 backdrop-blur-sm border-b border-gray-800 safe-area-top"
    >
      <nav className="container mx-auto px-4 py-3 md:py-4">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 md:gap-3 group touch-manipulation">
            <div className="relative w-10 h-10 sm:w-12 sm:h-12 md:w-16 md:h-16 transition-transform duration-300 group-active:scale-95 flex-shrink-0">
              <Image
                src={resolveImageUrl("/images/gallery/logo.png")}
                alt="SERGIK Logo"
                width={64}
                height={64}
                className="object-contain w-full h-full"
                priority
              />
            </div>
            <span className="text-3xl sm:text-4xl md:text-5xl font-bold font-six-caps header-logo">
              SERGIK
            </span>
          </Link>
          
          {/* Desktop Menu */}
          <div className="hidden md:flex items-center space-x-8">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="hover:text-white transition-all duration-300 relative group touch-manipulation"
              >
                {item.label}
                <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-white transition-all duration-300 group-hover:w-full"></span>
              </Link>
            ))}
            {fanNav === 'fan' && (
              <Link
                href="/fan/account"
                className="text-indigo-300 hover:text-indigo-200 transition-all duration-300 relative group touch-manipulation text-sm font-medium"
              >
                Account
                <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-indigo-300 transition-all duration-300 group-hover:w-full"></span>
              </Link>
            )}
            {fanNav === 'guest' && (
              <>
                <Link
                  href="/fan"
                  className="text-emerald-400/90 hover:text-emerald-300 transition-all duration-300 relative group touch-manipulation text-sm font-medium"
                >
                  Join free
                  <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-emerald-400 transition-all duration-300 group-hover:w-full"></span>
                </Link>
                <Link
                  href="/fan/login"
                  className="text-gray-300 hover:text-white transition-all duration-300 relative group touch-manipulation text-sm font-medium"
                >
                  Sign in
                  <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-white transition-all duration-300 group-hover:w-full"></span>
                </Link>
              </>
            )}
          </div>

          {/* Mobile Menu Button */}
          <button
            type="button"
            className="md:hidden p-2 -mr-2 touch-manipulation min-w-[44px] min-h-[44px] flex items-center justify-center relative z-50"
            onClick={(e) => {
              // #region agent log
              const targetInfo = e.target instanceof HTMLElement ? {
                tagName: e.target.tagName,
                id: e.target.id,
                className: e.target.className
              } : 'unknown';
              const currentTargetInfo = e.currentTarget instanceof HTMLElement ? {
                tagName: e.currentTarget.tagName,
                id: e.currentTarget.id,
                className: e.currentTarget.className
              } : 'unknown';
              
              console.log('[BUTTON CLICK]', { 
                currentIsOpen: isOpen,
                target: targetInfo,
                currentTarget: currentTargetInfo,
                time: performance.now(),
                renderCount: renderCountRef.current
              });
              log('button onClick - entry', { 
                currentIsOpen: isOpen,
                target: targetInfo,
                currentTarget: currentTargetInfo,
                time: performance.now(),
                renderCount: renderCountRef.current
              }, 'A');
              // #endregion
              
              // Prevent default and stop propagation immediately
              e.preventDefault();
              e.stopPropagation();
              
              // Use functional update to avoid stale closure issues
              const newValue = !isOpen;
              // #region agent log
              console.log('[BUTTON CLICK] before setIsOpen', { newValue, time: performance.now() });
              log('button onClick - before setIsOpen', { newValue, time: performance.now() }, 'A');
              // #endregion
              
              // Update state immediately - don't use RAF as it may be causing delays
              setIsOpen(prev => {
                // #region agent log
                console.log('[BUTTON CLICK] in setIsOpen callback', { prev, newValue: !prev, time: performance.now() });
                log('button onClick - in setIsOpen callback', { prev, newValue: !prev, time: performance.now() }, 'A');
                // #endregion
                return !prev;
              });
              // #region agent log
              console.log('[BUTTON CLICK] after setIsOpen', { newValue, time: performance.now() });
              log('button onClick - after setIsOpen', { newValue, time: performance.now() }, 'A');
              // #endregion
            }}
            onTouchStart={(e) => {
              // #region agent log
              console.log('[BUTTON TOUCH]', { time: performance.now() });
              log('button onTouchStart', { time: performance.now() }, 'A');
              // #endregion
              // Prevent touch from bubbling but don't prevent default (allows click to fire)
              e.stopPropagation();
            }}
            aria-label="Toggle menu"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>
      </nav>

      {/* Mobile Menu - Minimal slide-in from right */}
      {isOpen && typeof window !== 'undefined' && createPortal(
        <>
          {/* Subtle backdrop - only closes on click, very transparent */}
          <div
            className="md:hidden fixed inset-0 bg-black/20 z-[55]"
            onClick={() => setIsOpen(false)}
            style={{
              animation: 'fadeIn 0.2s ease-out',
            }}
          />
          {/* Minimal menu panel - just the items, slides in from right */}
          <div 
            ref={(el) => {
              (menuRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
              // #region agent log
              if (el && typeof window !== 'undefined') {
                try {
                  const computedStyle = window.getComputedStyle(el);
                  const rect = el.getBoundingClientRect();
                  log('menu ref attached (portal)', {
                    exists: !!el,
                    display: computedStyle.display,
                    visibility: computedStyle.visibility,
                    opacity: computedStyle.opacity,
                    zIndex: computedStyle.zIndex,
                    position: computedStyle.position,
                    width: computedStyle.width,
                    height: computedStyle.height,
                    rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
                    time: performance.now()
                  }, 'F');
                } catch (err) {
                  log('menu ref attached - error getting styles', { error: String(err) }, 'F');
                }
              }
              // #endregion
            }}
            className="md:hidden fixed top-[73px] right-0 bg-gray-900/40 backdrop-blur-sm z-[60] shadow-xl rounded-l-lg"
            style={{
              width: '240px',
              maxWidth: '80vw',
              transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
              transition: 'transform 0.3s ease-out',
              display: 'block',
              visibility: 'visible',
              opacity: 1,
              maxHeight: 'calc(100vh - 73px)',
              overflowY: 'auto',
            }}
          >
          <nav className="space-y-0.5 p-3 safe-area-inset">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block px-4 py-3 text-base font-medium text-white hover:bg-gray-800/40 active:bg-gray-800/40 rounded-md transition-colors touch-manipulation min-h-[44px] flex items-center"
              onClick={() => {
                // #region agent log
                log('nav link clicked', { href: item.href }, 'A');
                // #endregion
                setIsOpen(false)
              }}
            >
              {item.label}
            </Link>
            ))}
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
        document.body
      )}
    </header>
  )
}

