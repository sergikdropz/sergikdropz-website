'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'

const AdminAiAssistant = dynamic(() => import('@/components/AdminAiAssistant'), {
  ssr: false,
  loading: () => null,
})

/**
 * Defer loading the heavy Admin AI bundle until idle (or until the user opens it).
 * Keeps first admin navigation responsive.
 */
export default function DeferredAdminAiAssistant({
  defaultOpen = false,
}: {
  defaultOpen?: boolean
}) {
  const [mount, setMount] = useState(false)
  const [startOpen, setStartOpen] = useState(defaultOpen)

  useEffect(() => {
    let cancelled = false
    const wake = (openNow = false) => {
      if (cancelled) return
      if (openNow) setStartOpen(true)
      setMount(true)
    }

    const onOpen = () => wake(true)
    window.addEventListener('admin-ai:open', onOpen)
    window.addEventListener('admin-ai:toggle', onOpen)
    window.addEventListener('admin-ai:prompt', onOpen)

    const idleId =
      typeof window !== 'undefined' && 'requestIdleCallback' in window
        ? window.requestIdleCallback(() => wake(false), { timeout: 2500 })
        : null
    const timeoutId = window.setTimeout(() => wake(false), idleId == null ? 800 : 4000)

    return () => {
      cancelled = true
      window.removeEventListener('admin-ai:open', onOpen)
      window.removeEventListener('admin-ai:toggle', onOpen)
      window.removeEventListener('admin-ai:prompt', onOpen)
      window.clearTimeout(timeoutId)
      if (idleId != null && 'cancelIdleCallback' in window) {
        window.cancelIdleCallback(idleId)
      }
    }
  }, [])

  if (!mount) return null
  return <AdminAiAssistant defaultOpen={startOpen} />
}
