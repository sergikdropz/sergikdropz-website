import { describe, expect, it, vi } from 'vitest'
import { scheduleLoadPhases } from '@/hooks/useLoadTasks'
import { mapAdminStatsPayload, EMPTY_ADMIN_STATS } from '@/lib/api/admin-dashboard'
import { queryKeys } from '@/lib/api/query-keys'

describe('scheduleLoadPhases', () => {
  it('runs secondary then idle and cancels cleanly', () => {
    const onSecondary = vi.fn()
    const onIdle = vi.fn()
    const timers: Array<{ id: number; fn: () => void; ms: number }> = []
    let nextId = 1

    const cancel = scheduleLoadPhases({
      onSecondary,
      onIdle,
      idleTimeoutMs: 100,
      setTimeoutFn: ((fn: () => void, ms: number) => {
        const id = nextId++
        timers.push({ id, fn, ms })
        return id
      }) as typeof setTimeout,
      clearTimeoutFn: ((id: number) => {
        const idx = timers.findIndex((t) => t.id === id)
        if (idx >= 0) timers.splice(idx, 1)
      }) as typeof clearTimeout,
    })

    // Fire secondary (ms=0)
    timers.find((t) => t.ms === 0)?.fn()
    expect(onSecondary).toHaveBeenCalledTimes(1)

    cancel()
    // Idle fallback should be cleared
    expect(timers.some((t) => t.ms === 600)).toBe(false)
    expect(onIdle).not.toHaveBeenCalled()
  })
})

describe('mapAdminStatsPayload', () => {
  it('maps nested API shape without inventing shop fields', () => {
    const mapped = mapAdminStatsPayload({
      timestamp: '2026-01-01T00:00:00.000Z',
      stats: {
        audioFiles: { total: 10, purchasable: 2, analyzed: 5, sonicDNACompleted: 4, pending: 1, processing: 0 },
        purchases: { total: 3, totalRevenue: 12.5 },
        musicLibrary: {
          folders: { total: 2, visible: 2, hidden: 0 },
          tracks: 8,
          totalEntries: 9,
          tracksWithSonicDna: 4,
          tracksWithBpm: 7,
          tracksWithKey: 6,
          tracksWithWaveform: 5,
          uniqueArtists: 1,
        },
        analytics: { totalEvents: 100, eventsToday: 2, trackPlays: 50 },
        activityLogs: { total: 20, today: 1 },
        tips: { total: 0, totalRevenue: 0 },
        licenses: { total: 0, totalRevenue: 0 },
        sonicDnaCoverage: { percent: 50 },
      },
    })
    expect(mapped.totalTracks).toBe(10)
    expect(mapped.libraryTracks).toBe(8)
    expect(mapped.sonicDnaCoverage).toBe(50)
    expect(mapped.activeMembers).toBe(EMPTY_ADMIN_STATS.activeMembers)
    expect(mapped.lastUpdated).toBe('2026-01-01T00:00:00.000Z')
  })
})

describe('queryKeys.admin', () => {
  it('keeps stable key shapes for cache identity', () => {
    expect(queryKeys.admin.stats()).toEqual(['admin', 'stats'])
    expect(queryKeys.admin.recentActivity(10)).toEqual(['admin', 'recent-activity', 10])
    expect(queryKeys.adminPrefetch.paths().length).toBeLessThanOrEqual(5)
  })
})
