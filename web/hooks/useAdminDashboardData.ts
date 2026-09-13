'use client'

import { useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useLoadTasks } from '@/hooks/useLoadTasks'
import {
  EMPTY_ADMIN_STATS,
  fetchAdminStats,
  type AdminDashboardStats,
  type AdminHealthStatus,
  type AdminPendingTasks,
} from '@/lib/api/admin-dashboard'
import {
  invalidateAdminDashboardQueries,
  useAdminHealth,
  useAdminPendingTasks,
  useAdminRecentActivity,
  useAdminShopRollup,
  useAdminStats,
} from '@/lib/api/admin-hooks'
import { queryKeys } from '@/lib/api/query-keys'

const DEFAULT_PENDING: AdminPendingTasks = {
  tracksNeedingAnalysis: 0,
  releasesPendingDistribution: 0,
  failedUploads: 0,
}

const DEFAULT_HEALTH: AdminHealthStatus = {
  database: 'healthy',
  storage: 'healthy',
  apis: 'healthy',
}

/**
 * Task-phased admin dashboard data with React Query caching.
 * Critical/secondary load first; heavy stats + shop stay idle.
 */
export function useAdminDashboardData(isAdmin: boolean) {
  const queryClient = useQueryClient()
  const phases = useLoadTasks({ enabled: isAdmin, idleTimeoutMs: 1200 })

  const pendingQuery = useAdminPendingTasks(phases.critical)
  const activityQuery = useAdminRecentActivity(phases.secondary, 10)
  const healthQuery = useAdminHealth(phases.secondary)
  const statsQuery = useAdminStats(phases.idle)
  const shopQuery = useAdminShopRollup(phases.idle && Boolean(statsQuery.isSuccess))

  const stats: AdminDashboardStats = useMemo(() => {
    const base = statsQuery.data ? { ...statsQuery.data } : { ...EMPTY_ADMIN_STATS }
    if (shopQuery.data) {
      base.activeMembers = shopQuery.data.activeMembers
      base.monthlyRecurringRevenue = shopQuery.data.monthlyRecurringRevenue
      base.totalSubscribers = shopQuery.data.totalSubscribers
      base.activeSubscribers = shopQuery.data.activeSubscribers
      base.merchOrders = shopQuery.data.merchOrders
      base.merchRevenue = shopQuery.data.merchRevenue
    }
    return base
  }, [statsQuery.data, shopQuery.data])

  const loadingStats =
    phases.idle &&
    (statsQuery.isLoading || statsQuery.isFetching || shopQuery.isLoading || shopQuery.isFetching)

  const statsReady = Boolean(statsQuery.data)

  async function refreshStats() {
    // Force server cache bust + client refetch (mutation-safe).
    await queryClient.fetchQuery({
      queryKey: queryKeys.admin.stats(),
      queryFn: ({ signal }) => fetchAdminStats({ refresh: true, signal }),
    })
    await queryClient.invalidateQueries({ queryKey: queryKeys.admin.shopRollup() })
  }

  async function invalidateAll() {
    await invalidateAdminDashboardQueries(queryClient)
  }

  return {
    phases,
    pendingTasks: pendingQuery.data || DEFAULT_PENDING,
    recentActivity: activityQuery.data || [],
    healthStatus: healthQuery.data || DEFAULT_HEALTH,
    stats,
    loadingStats,
    /** True once we have at least one successful stats payload (avoid “fake zeros”). */
    statsReady,
    statsError: statsQuery.isError,
    refreshStats,
    invalidateAll,
  }
}
