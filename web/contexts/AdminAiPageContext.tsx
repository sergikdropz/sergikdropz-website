'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { usePathname } from 'next/navigation'
import AdminAiFocusCapture from '@/components/AdminAiFocusCapture'
import type { AdminAiFocusContext } from '@/lib/ai/admin-ai-focus-context'
import type { AdminAiPageContext, AdminAiStudioReleaseContext } from '@/lib/ai/admin-ai-page-context'

const FOCUS_COPILOT_STORAGE_KEY = 'admin-ai-focus-copilot-v1'

function readFocusCopilotEnabled(): boolean {
  if (typeof window === 'undefined') return true
  try {
    const raw = localStorage.getItem(FOCUS_COPILOT_STORAGE_KEY)
    if (raw === '0' || raw === 'false') return false
    return true
  } catch {
    return true
  }
}

type AdminAiPageContextValue = {
  pageContext: AdminAiPageContext
  setStudioRelease: (release: AdminAiStudioReleaseContext | null) => void
  pageFocus: AdminAiFocusContext | null
  setPageFocus: (focus: AdminAiFocusContext | null) => void
  focusCopilotEnabled: boolean
  setFocusCopilotEnabled: (enabled: boolean) => void
}

const Ctx = createContext<AdminAiPageContextValue | null>(null)

export function AdminAiPageProvider({
  surface,
  children,
}: {
  surface: 'admin' | 'studio'
  children: ReactNode
}) {
  const pathname = usePathname() || '/'
  const [studioRelease, setStudioReleaseState] = useState<AdminAiStudioReleaseContext | null>(null)
  const [pageFocus, setPageFocusState] = useState<AdminAiFocusContext | null>(null)
  const pageFocusRef = useRef<AdminAiFocusContext | null>(null)
  const [focusCopilotEnabled, setFocusCopilotEnabledState] = useState(true)
  const focusCopilotHydrated = useRef(false)

  useEffect(() => {
    setFocusCopilotEnabledState(readFocusCopilotEnabled())
    focusCopilotHydrated.current = true
  }, [])

  const setStudioRelease = useCallback((release: AdminAiStudioReleaseContext | null) => {
    setStudioReleaseState(release)
  }, [])

  const setPageFocus = useCallback((focus: AdminAiFocusContext | null) => {
    pageFocusRef.current = focus
    setPageFocusState(focus)
  }, [])

  const setFocusCopilotEnabled = useCallback((enabled: boolean) => {
    setFocusCopilotEnabledState(enabled)
    if (focusCopilotHydrated.current) {
      try {
        localStorage.setItem(FOCUS_COPILOT_STORAGE_KEY, enabled ? '1' : '0')
      } catch {
        /* ignore */
      }
    }
    if (!enabled) {
      pageFocusRef.current = null
      setPageFocusState(null)
    }
  }, [])

  const pageContext = useMemo<AdminAiPageContext>(
    () => ({
      surface,
      pathname,
      studio: studioRelease,
      focusCopilotEnabled,
      focus: focusCopilotEnabled ? pageFocus : null,
    }),
    [surface, pathname, studioRelease, pageFocus, focusCopilotEnabled]
  )

  const value = useMemo(
    () => ({
      pageContext,
      setStudioRelease,
      pageFocus,
      setPageFocus,
      focusCopilotEnabled,
      setFocusCopilotEnabled,
    }),
    [pageContext, setStudioRelease, pageFocus, setPageFocus, focusCopilotEnabled, setFocusCopilotEnabled]
  )

  return (
    <Ctx.Provider value={value}>
      <AdminAiFocusCapture enabled={focusCopilotEnabled} />
      {children}
    </Ctx.Provider>
  )
}

export function useAdminAiPageContext() {
  const ctx = useContext(Ctx)
  if (!ctx) {
    throw new Error('useAdminAiPageContext must be used within AdminAiPageProvider')
  }
  return ctx
}

/** Optional hook for pages that may render outside the provider. */
export function useAdminAiPageContextOptional() {
  return useContext(Ctx)
}
