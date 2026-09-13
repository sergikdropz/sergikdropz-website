'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api/client'
import { queryKeys } from '@/lib/api/query-keys'

export type StudioRelease = {
  id: string
  title: string
  type?: string
  release_date?: string | null
  artwork_url?: string | null
  distributor_status?: string | null
  copyright?: {
    readiness_score?: number
    blockers?: string[]
  } | null
}

type ReleasesResponse = { releases: StudioRelease[] }

export function useStudioReleases(filter?: string | null, enabled = true) {
  return useQuery({
    queryKey: queryKeys.studio.releases(filter),
    queryFn: ({ signal }) =>
      apiClient<ReleasesResponse>(
        `/api/studio/releases${filter ? `?filter=${encodeURIComponent(filter)}` : ''}`,
        { signal }
      ),
    select: (data) => data.releases ?? [],
    enabled,
  })
}

export function useCreateStudioRelease() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      body: Record<string, unknown>
      idempotencyKey?: string
    }) =>
      apiClient<{ release: StudioRelease }>('/api/studio/releases', {
        method: 'POST',
        body: input.body,
        idempotencyKey: input.idempotencyKey,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['studio', 'releases'] })
    },
  })
}

export function useLaunchReleasePipeline() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      releaseId: string
      createCampaign?: boolean
      createSmartLink?: boolean
      idempotencyKey?: string
    }) =>
      apiClient<{
        success: boolean
        partial?: boolean
        results: Record<string, unknown>
        errors?: string[]
      }>('/api/studio/release-pipeline/launch', {
        method: 'POST',
        body: {
          release_id: input.releaseId,
          create_campaign: input.createCampaign ?? true,
          create_smart_link: input.createSmartLink ?? true,
        },
        idempotencyKey: input.idempotencyKey,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.studio.pipeline() })
      void queryClient.invalidateQueries({ queryKey: ['studio', 'releases'] })
    },
  })
}
