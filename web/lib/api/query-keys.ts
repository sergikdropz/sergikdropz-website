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
  /**
   * Leaf catalog reads only — not the bootstrap/hydration tree.
   * Include publishVersion in keys so a bump never serves a stale RQ entry.
   * Full library snapshot stays in musicLibraryApi (memory + localStorage) until cutover.
   */
  musicLibrary: {
    root: () => ['musicLibrary'] as const,
    browse: (
      publishVersion: number,
      view: string,
      opts: {
        sort?: string
        dir?: string
        genre?: string | null
        artist?: string | null
        search?: string
        limit?: number
        offset?: number
      } = {},
    ) =>
      [
        'musicLibrary',
        'browse',
        publishVersion,
        view,
        opts.sort ?? '',
        opts.dir ?? '',
        opts.genre ?? '',
        opts.artist ?? '',
        opts.search ?? '',
        opts.limit ?? 0,
        opts.offset ?? 0,
      ] as const,
    browseSongsAll: (
      publishVersion: number,
      opts: {
        sort?: string
        dir?: string
        genre?: string | null
        artist?: string | null
        search?: string
      } = {},
    ) =>
      [
        'musicLibrary',
        'browse-songs-all',
        publishVersion,
        opts.sort ?? '',
        opts.dir ?? '',
        opts.genre ?? '',
        opts.artist ?? '',
        opts.search ?? '',
      ] as const,
    playlists: (publishVersion: number, includeHidden: boolean, includeArchived = false) =>
      ['musicLibrary', 'playlists', publishVersion, includeHidden, includeArchived] as const,
    smartPlaylists: (publishVersion: number) =>
      ['musicLibrary', 'smart-playlists', publishVersion] as const,
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
