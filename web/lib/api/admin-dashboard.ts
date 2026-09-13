import { apiClient } from '@/lib/api/client'

/** Short client stale window — admin aggregates change often; never trust long. */
export const ADMIN_STATS_STALE_MS = 45_000
export const ADMIN_OPS_STALE_MS = 30_000
export const ADMIN_HEALTH_STALE_MS = 60_000
export const ADMIN_SHOP_STALE_MS = 60_000

export type AdminPendingTasks = {
  tracksNeedingAnalysis: number
  releasesPendingDistribution: number
  failedUploads: number
}

export type AdminHealthStatus = {
  database: string
  storage: string
  apis: string
}

export type AdminActivityItem = {
  id?: string
  action?: string
  resource_type?: string
  created_at?: string
  details?: unknown
  [key: string]: unknown
}

export type AdminDashboardStats = {
  totalTracks: number
  purchasableTracks: number
  analyzedTracks: number
  sonicDNATracks: number
  pendingAnalysis: number
  processingAnalysis: number
  totalPurchases: number
  totalRevenue: number
  instagramPosts: number
  instagramActive: number
  instagramImages: number
  instagramVideos: number
  libraryFolders: number
  libraryFoldersVisible: number
  libraryFoldersHidden: number
  libraryTracks: number
  libraryTracksEntries: number
  galleryImages: number
  analyticsTotal: number
  analyticsToday: number
  activityLogsTotal: number
  activityLogsToday: number
  activeMembers: number
  monthlyRecurringRevenue: number
  totalSubscribers: number
  activeSubscribers: number
  merchOrders: number
  merchRevenue: number
  totalTips: number
  tipRevenue: number
  totalLicenses: number
  licenseRevenue: number
  totalEvents: number
  lastUpdated: string | null
  sonicDnaCoverage: number
  tracksWithSonicDna: number
  tracksWithBpm: number
  tracksWithKey: number
  tracksWithWaveform: number
  uniqueArtists: number
  trackPlays: number
}

export type AdminShopRollup = {
  activeMembers: number
  monthlyRecurringRevenue: number
  totalSubscribers: number
  activeSubscribers: number
  merchOrders: number
  merchRevenue: number
}

export const EMPTY_ADMIN_STATS: AdminDashboardStats = {
  totalTracks: 0,
  purchasableTracks: 0,
  analyzedTracks: 0,
  sonicDNATracks: 0,
  pendingAnalysis: 0,
  processingAnalysis: 0,
  totalPurchases: 0,
  totalRevenue: 0,
  instagramPosts: 0,
  instagramActive: 0,
  instagramImages: 0,
  instagramVideos: 0,
  libraryFolders: 0,
  libraryFoldersVisible: 0,
  libraryFoldersHidden: 0,
  libraryTracks: 0,
  libraryTracksEntries: 0,
  galleryImages: 0,
  analyticsTotal: 0,
  analyticsToday: 0,
  activityLogsTotal: 0,
  activityLogsToday: 0,
  activeMembers: 0,
  monthlyRecurringRevenue: 0,
  totalSubscribers: 0,
  activeSubscribers: 0,
  merchOrders: 0,
  merchRevenue: 0,
  totalTips: 0,
  tipRevenue: 0,
  totalLicenses: 0,
  licenseRevenue: 0,
  totalEvents: 0,
  lastUpdated: null,
  sonicDnaCoverage: 0,
  tracksWithSonicDna: 0,
  tracksWithBpm: 0,
  tracksWithKey: 0,
  tracksWithWaveform: 0,
  uniqueArtists: 0,
  trackPlays: 0,
}

export function mapAdminStatsPayload(payload: {
  stats?: Record<string, any>
  timestamp?: string
}): AdminDashboardStats {
  const s = payload.stats || {}
  return {
    ...EMPTY_ADMIN_STATS,
    totalTracks: s.audioFiles?.total || 0,
    purchasableTracks: s.audioFiles?.purchasable || 0,
    analyzedTracks: s.audioFiles?.analyzed || 0,
    sonicDNATracks: s.audioFiles?.sonicDNACompleted || 0,
    pendingAnalysis: s.audioFiles?.pending || 0,
    processingAnalysis: s.audioFiles?.processing || 0,
    totalPurchases: s.purchases?.total || 0,
    totalRevenue: s.purchases?.totalRevenue || 0,
    instagramPosts: s.instagram?.total || 0,
    instagramActive: s.instagram?.active || 0,
    instagramImages: s.instagram?.images || 0,
    instagramVideos: s.instagram?.videos || 0,
    libraryFolders: s.musicLibrary?.folders?.total || 0,
    libraryFoldersVisible: s.musicLibrary?.folders?.visible || 0,
    libraryFoldersHidden: s.musicLibrary?.folders?.hidden || 0,
    libraryTracks: s.musicLibrary?.tracks || 0,
    libraryTracksEntries: s.musicLibrary?.totalEntries || s.musicLibrary?.tracks || 0,
    analyticsTotal: s.analytics?.totalEvents || 0,
    analyticsToday: s.analytics?.eventsToday || 0,
    activityLogsTotal: s.activityLogs?.total || 0,
    activityLogsToday: s.activityLogs?.today || 0,
    totalEvents: s.analytics?.totalEvents || 0,
    lastUpdated: payload.timestamp || new Date().toISOString(),
    sonicDnaCoverage: s.sonicDnaCoverage?.percent || 0,
    tracksWithSonicDna: s.musicLibrary?.tracksWithSonicDna || 0,
    tracksWithBpm: s.musicLibrary?.tracksWithBpm || 0,
    tracksWithKey: s.musicLibrary?.tracksWithKey || 0,
    tracksWithWaveform: s.musicLibrary?.tracksWithWaveform || 0,
    uniqueArtists: s.musicLibrary?.uniqueArtists || 0,
    trackPlays: s.analytics?.trackPlays || 0,
    totalTips: s.tips?.total || 0,
    tipRevenue: s.tips?.totalRevenue || 0,
    totalLicenses: s.licenses?.total || 0,
    licenseRevenue: s.licenses?.totalRevenue || 0,
  }
}

export async function fetchAdminStats(
  opts?: { refresh?: boolean; signal?: AbortSignal }
): Promise<AdminDashboardStats> {
  const q = opts?.refresh ? '?refresh=1' : ''
  const payload = await apiClient<{ stats?: Record<string, any>; timestamp?: string }>(
    `/api/admin/stats${q}`,
    { signal: opts?.signal }
  )
  return mapAdminStatsPayload(payload)
}

export async function fetchAdminPendingTasks(
  signal?: AbortSignal
): Promise<AdminPendingTasks> {
  return apiClient<AdminPendingTasks>('/api/admin/pending-tasks', { signal })
}

export async function fetchAdminHealth(signal?: AbortSignal): Promise<AdminHealthStatus> {
  return apiClient<AdminHealthStatus>('/api/admin/health', { signal })
}

export async function fetchAdminRecentActivity(
  limit = 10,
  signal?: AbortSignal
): Promise<AdminActivityItem[]> {
  const data = await apiClient<{ activities?: AdminActivityItem[] }>(
    `/api/admin/recent-activity?limit=${limit}`,
    { signal }
  )
  return data.activities || []
}

export async function fetchAdminShopRollup(
  signal?: AbortSignal
): Promise<AdminShopRollup> {
  const [membershipsRes, subscribersRes, merchRes] = await Promise.allSettled([
    apiClient<{ memberships?: Array<{ status?: string; plan_id?: string }> }>(
      '/api/admin/memberships',
      { signal }
    ),
    apiClient<{ subscribers?: Array<{ is_active?: boolean }> }>(
      '/api/admin/subscribers',
      { signal }
    ),
    apiClient<{ orders?: Array<{ total?: number }> }>('/api/admin/merch/orders', {
      signal,
    }),
  ])

  const rollup: AdminShopRollup = {
    activeMembers: 0,
    monthlyRecurringRevenue: 0,
    totalSubscribers: 0,
    activeSubscribers: 0,
    merchOrders: 0,
    merchRevenue: 0,
  }

  if (membershipsRes.status === 'fulfilled') {
    const memberships = membershipsRes.value.memberships || []
    const active = memberships.filter((m) => m.status === 'active')
    const planPrices: Record<string, number> = { supporter: 499, 'inner-circle': 1499 }
    const mrr = active.reduce((sum, m) => sum + (planPrices[m.plan_id || ''] || 0), 0)
    rollup.activeMembers = active.length
    rollup.monthlyRecurringRevenue = mrr / 100
  }

  if (subscribersRes.status === 'fulfilled') {
    const subs = subscribersRes.value.subscribers || []
    rollup.totalSubscribers = subs.length
    rollup.activeSubscribers = subs.filter((s) => s.is_active).length
  }

  if (merchRes.status === 'fulfilled') {
    const orders = merchRes.value.orders || []
    rollup.merchOrders = orders.length
    rollup.merchRevenue = orders.reduce((s, o) => s + (o.total || 0), 0) / 100
  }

  return rollup
}
