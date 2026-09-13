'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/api/query-keys'
import {
  ADMIN_HEALTH_STALE_MS,
  ADMIN_OPS_STALE_MS,
  ADMIN_SHOP_STALE_MS,
  ADMIN_STATS_STALE_MS,
  fetchAdminHealth,
  fetchAdminPendingTasks,
  fetchAdminRecentActivity,
  fetchAdminShopRollup,
  fetchAdminStats,
} from '@/lib/api/admin-dashboard'

/**
 * Invalidate admin dashboard aggregates after sync/publish/go-live.
 * Safe to call from any admin mutation — scoped keys only, never wipes catalog.
 */
export async function invalidateAdminDashboardQueries(
  queryClient: ReturnType<typeof useQueryClient>
) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.admin.stats() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.admin.pendingTasks() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.admin.recentActivity(10) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.admin.health() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.admin.shopRollup() }),
  ])
}

export function useAdminPendingTasks(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.admin.pendingTasks(),
    queryFn: ({ signal }) => fetchAdminPendingTasks(signal),
    enabled,
    staleTime: ADMIN_OPS_STALE_MS,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
  })
}

export function useAdminRecentActivity(enabled: boolean, limit = 10) {
  return useQuery({
    queryKey: queryKeys.admin.recentActivity(limit),
    queryFn: ({ signal }) => fetchAdminRecentActivity(limit, signal),
    enabled,
    staleTime: ADMIN_OPS_STALE_MS,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
  })
}

export function useAdminHealth(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.admin.health(),
    queryFn: ({ signal }) => fetchAdminHealth(signal),
    enabled,
    staleTime: ADMIN_HEALTH_STALE_MS,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
  })
}

/** Idle / on-demand — never block shell. */
export function useAdminStats(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.admin.stats(),
    queryFn: ({ signal }) => fetchAdminStats({ signal }),
    enabled,
    staleTime: ADMIN_STATS_STALE_MS,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
  })
}

/** Idle after stats — shop lists are heavier; keep separate. */
export function useAdminShopRollup(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.admin.shopRollup(),
    queryFn: ({ signal }) => fetchAdminShopRollup(signal),
    enabled,
    staleTime: ADMIN_SHOP_STALE_MS,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
  })
}
