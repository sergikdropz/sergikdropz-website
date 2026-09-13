export const queryKeys = {
  studio: {
    releases: (filter?: string | null) =>
      ['studio', 'releases', filter ?? 'all'] as const,
    release: (id: string) => ['studio', 'release', id] as const,
    pipeline: () => ['studio', 'pipeline'] as const,
  },
  admin: {
    dashboard: () => ['admin', 'dashboard'] as const,
    stats: () => ['admin', 'stats'] as const,
    pendingTasks: () => ['admin', 'pending-tasks'] as const,
    recentActivity: (limit = 10) => ['admin', 'recent-activity', limit] as const,
    health: () => ['admin', 'health'] as const,
    shopRollup: () => ['admin', 'shop-rollup'] as const,
    aiRuns: () => ['admin', 'ai', 'runs'] as const,
  },
  /** Prefetch targets for nav hover — keep this list small. */
  adminPrefetch: {
    paths: () =>
      [
        '/admin',
        '/admin/music',
        '/studio',
        '/admin/releases',
        '/admin/sonic-dna',
      ] as const,
  },
} as const
