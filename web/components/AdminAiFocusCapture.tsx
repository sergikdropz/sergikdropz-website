'use client'

import { useEffect } from 'react'
import { extractFocusFromElement } from '@/lib/ai/admin-ai-focus-context'
import { useAdminAiPageContextOptional } from '@/contexts/AdminAiPageContext'

/** Tracks focused inputs across admin + studio and feeds Admin AI page context. */
export default function AdminAiFocusCapture({ enabled }: { enabled: boolean }) {
  const ctx = useAdminAiPageContextOptional()

  useEffect(() => {
    if (!ctx || !enabled) return
    const { setPageFocus } = ctx

    function onFocusIn(event: FocusEvent) {
      const focus = extractFocusFromElement(event.target)
      if (focus) setPageFocus(focus)
    }

    document.addEventListener('focusin', onFocusIn, true)
    return () => document.removeEventListener('focusin', onFocusIn, true)
  }, [ctx, enabled])

  return null
}
