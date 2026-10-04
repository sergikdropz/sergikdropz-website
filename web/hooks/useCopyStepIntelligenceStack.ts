'use client'

import { useEffect, useState } from 'react'
import { dispatchAdminAiIntelligenceStack } from '@/lib/admin-ai-client'
import { sameOriginApiUrl } from '@/lib/same-origin-api'

export type CopyStepStackState = {
  loading: boolean
  summary: string | null
  sonicUnified: string | null
  error: string | null
}

const cacheKey = (releaseId: string, query: string) =>
  `sergik:intel-stack:${releaseId}:${query.slice(0, 48)}`

/** Prefetch intelligence stack for Release Studio surfaces (once per release + query per tab session). */
export function useCopyStepIntelligenceStack(
  releaseId: string | undefined,
  enabled: boolean,
  query = 'Sonic DNA unified intelligence Release Studio copy polymath',
) {
  const [state, setState] = useState<CopyStepStackState>({
    loading: false,
    summary: null,
    sonicUnified: null,
    error: null,
  })

  useEffect(() => {
    if (!enabled || !releaseId) return

    const cached = sessionStorage.getItem(cacheKey(releaseId, query))
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as {
          summary?: string
          sonicUnified?: string
        }
        setState({
          loading: false,
          summary: parsed.summary ?? null,
          sonicUnified: parsed.sonicUnified ?? null,
          error: null,
        })
        return
      } catch {
        sessionStorage.removeItem(cacheKey(releaseId, query))
      }
    }

    let cancelled = false
    setState((s) => ({ ...s, loading: true, error: null }))

    fetch(sameOriginApiUrl('/api/admin/ai/intelligence-stack'), {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        releaseId,
        query,
      }),
    })
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as {
          connectivity?: { summary?: string }
          sonicDna?: {
            unifiedIntelligenceTracks?: number
            trackCount?: number
            note?: string
          }
          error?: string
        }
        if (cancelled) return
        if (!res.ok) {
          setState({
            loading: false,
            summary: null,
            sonicUnified: null,
            error: data.error || 'Intelligence stack unavailable',
          })
          return
        }
        const summary = data.connectivity?.summary ?? null
        const sonic = data.sonicDna
        const sonicUnified =
          sonic && sonic.trackCount != null
            ? `${sonic.unifiedIntelligenceTracks ?? 0}/${sonic.trackCount} tracks unified Sonic DNA`
            : null
        sessionStorage.setItem(
          cacheKey(releaseId, query),
          JSON.stringify({ summary, sonicUnified, at: Date.now() }),
        )
        setState({ loading: false, summary, sonicUnified, error: null })
      })
      .catch((err) => {
        if (cancelled) return
        setState({
          loading: false,
          summary: null,
          sonicUnified: null,
          error: err instanceof Error ? err.message : 'Prefetch failed',
        })
      })

    return () => {
      cancelled = true
    }
  }, [releaseId, enabled, query])

  return {
    ...state,
    openInAdminAi: () => {
      if (!releaseId) return
      dispatchAdminAiIntelligenceStack({
        releaseId,
        query,
      })
    },
  }
}
