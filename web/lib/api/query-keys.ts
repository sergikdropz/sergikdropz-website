export const queryKeys = {
  studio: {
    releases: (filter?: string | null) =>
      ['studio', 'releases', filter ?? 'all'] as const,
    release: (id: string) => ['studio', 'release', id] as const,
    pipeline: () => ['studio', 'pipeline'] as const,
  },
  admin: {
    dashboard: () => ['admin', 'dashboard'] as const,
    aiRuns: () => ['admin', 'ai', 'runs'] as const,
  },
} as const
