'use client'

import { useEffect } from 'react'

/**
 * Nested open menus share one document lock so closing one doesn't unlock early.
 */
let lockCount = 0
let savedScrollY = 0

function applyDocumentScrollLock() {
  const html = document.documentElement
  const body = document.body
  if (lockCount === 0) {
    savedScrollY = window.scrollY
    html.dataset.scrollLocked = '1'
    body.dataset.scrollLocked = '1'
    html.style.overflow = 'hidden'
    body.style.overflow = 'hidden'
    // iOS / mobile: position fixed freezes the page behind the popup
    body.style.position = 'fixed'
    body.style.top = `-${savedScrollY}px`
    body.style.left = '0'
    body.style.right = '0'
    body.style.width = '100%'
  }
  lockCount += 1
}

function releaseDocumentScrollLock() {
  lockCount = Math.max(0, lockCount - 1)
  if (lockCount > 0) return
  const html = document.documentElement
  const body = document.body
  html.style.overflow = ''
  body.style.overflow = ''
  body.style.position = ''
  body.style.top = ''
  body.style.left = ''
  body.style.right = ''
  body.style.width = ''
  delete html.dataset.scrollLocked
  delete body.dataset.scrollLocked
  window.scrollTo(0, savedScrollY)
}

/**
 * Freeze page (and optional scroll roots) while a popup / dialog is open.
 * Popup panels themselves can still scroll with overflow-y-auto + overscroll-contain.
 */
export function useLockBodyScroll(locked: boolean) {
  useEffect(() => {
    if (!locked || typeof document === 'undefined') return

    applyDocumentScrollLock()

    const roots = Array.from(
      document.querySelectorAll<HTMLElement>('[data-scroll-lock-root]'),
    )
    const prevOverflow = roots.map((el) => el.style.overflow)
    roots.forEach((el) => {
      el.style.overflow = 'hidden'
    })

    // Stop wheel / touch from scrolling anything behind the open UI
    const blockBackgroundScroll = (e: Event) => {
      const target = e.target as HTMLElement | null
      if (!target) return
      if (target.closest('[data-allow-scroll-when-locked]')) return
      e.preventDefault()
    }
    document.addEventListener('wheel', blockBackgroundScroll, { passive: false })
    document.addEventListener('touchmove', blockBackgroundScroll, { passive: false })

    return () => {
      roots.forEach((el, i) => {
        el.style.overflow = prevOverflow[i] ?? ''
      })
      document.removeEventListener('wheel', blockBackgroundScroll)
      document.removeEventListener('touchmove', blockBackgroundScroll)
      releaseDocumentScrollLock()
    }
  }, [locked])
}
