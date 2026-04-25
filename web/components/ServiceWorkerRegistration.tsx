'use client'

import { useEffect } from 'react'
import { registerServiceWorker } from '@/utils/serviceWorker'

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    // Register service worker on mount
    registerServiceWorker().catch((error) => {
      console.error('Service Worker registration error:', error)
    })
  }, [])

  return null // This component doesn't render anything
}

