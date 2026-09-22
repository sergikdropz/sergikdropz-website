import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { ALL_DSP_STORE_IDS } from '@/lib/studio/constants'
import {
  matchLookupStoreName,
  resolveRevelatorTargetStores,
  revelatorStoreMappings,
  mapRevelatorStoreIdToDsp,
} from '@/lib/studio/revelator-store-map'
import {
  RevelatorClient,
  createRevelatorClient,
  getAggregatorHealth,
  readRevelatorEnv,
} from '@/lib/studio/distributor'

describe('revelator-store-map', () => {
  it('covers every DSP_STORES id exactly once', () => {
    const rows = revelatorStoreMappings()
    expect(rows).toHaveLength(ALL_DSP_STORE_IDS.length)
    expect(rows.map((r) => r.store).sort()).toEqual([...ALL_DSP_STORE_IDS].sort())
  })

  it('marks document-backed IDs as supported', () => {
    const byStore = Object.fromEntries(revelatorStoreMappings().map((r) => [r.store, r]))
    expect(byStore.spotify.distributorStoreId).toBe(9)
    expect(byStore.apple_music.distributorStoreId).toBe(1)
    expect(byStore.youtube_music.distributorStoreId).toBe(13)
    expect(byStore.youtube.distributorStoreId).toBe(307)
    expect(byStore.instagram.distributorStoreId).toBe(310)
    expect(byStore.tiktok.distributorStoreId).toBe(319)
    expect(byStore.spotify.supported).toBe(true)
    expect(byStore.bandcamp.supported).toBe(false)
  })

  it('queues curated stores and lists unsupported separately', () => {
    const result = resolveRevelatorTargetStores([
      'spotify',
      'apple_music',
      'youtube',
      'bandcamp',
      'beatport',
    ])
    expect(result.storeIds).toEqual([1, 9, 13, 307])
    expect(result.implied).toContain(13)
    expect(result.queued).toContain('youtube_music')
    expect(result.unsupported.map((u) => u.store).sort()).toEqual(['bandcamp', 'beatport'])
  })

  it('matches lookup names onto studio stores', () => {
    expect(matchLookupStoreName('Spotify')).toBe('spotify')
    expect(matchLookupStoreName('iTunes / Apple Music')).toBe('apple_music')
    expect(matchLookupStoreName('YouTube Content ID')).toBe('youtube')
    expect(mapRevelatorStoreIdToDsp(9)).toBe('spotify')
  })
})

describe('RevelatorClient dry-run', () => {
  const prev = { ...process.env }

  beforeEach(() => {
    delete process.env.REVELATOR_API_KEY
    delete process.env.REVELATOR_PARTNER_USER_ID
    delete process.env.REVELATOR_API_SECRET
    delete process.env.REVELATOR_DRY_RUN
    delete process.env.REVELATOR_REQUIRE_LIVE
  })

  afterEach(() => {
    process.env = { ...prev }
  })

  it('reports dry_run health when keys are missing', () => {
    const health = getAggregatorHealth()
    expect(health.available).toBe(true)
    expect(health.dryRun).toBe(true)
    expect(health.label).toBe('dry_run')
  })

  it('createRevelatorClient returns a dry-run client without keys', () => {
    const client = createRevelatorClient()
    expect(client).not.toBeNull()
    expect(client!.dryRun).toBe(true)
  })

  it('submitRelease dry-run returns dryrun-{id} and curated queue', async () => {
    const client = createRevelatorClient({ forceDryRun: true })!
    const result = await client.submitRelease({
      releaseId: 'release-ftp',
      title: 'FTP',
      type: 'ep',
      releaseDate: '2024-01-01',
      targetStores: ['spotify', 'apple_music', 'tiktok', 'bandcamp'],
      tracks: [
        {
          title: 'FTP',
          isrc: 'QZTAS2424269',
          wavUrl: 'https://example.com/ftp.wav',
          explicit: false,
        },
      ],
    })
    expect(result.dryRun).toBe(true)
    expect(result.releaseId).toBe('dryrun-release-ftp')
    expect(result.queuedStoreIds).toEqual([1, 9, 319])
    expect(result.unsupported.some((u) => u.store === 'bandcamp')).toBe(true)
  })

  it('getStatus dry-run never claims live DSP delivery', async () => {
    const client = createRevelatorClient({ forceDryRun: true })!
    const status = await client.getStatus('dryrun-release-ftp', {
      targetStores: ['spotify', 'apple_music'],
    })
    expect(status.dryRun).toBe(true)
    expect(status.status).toBe('pending')
    expect(status.stores.length).toBeGreaterThan(0)
    expect(status.stores.every((s) => s.status === 'pending')).toBe(true)
  })

  it('buildLoginBody uses partnerApiKey + partnerUserId', () => {
    const client = new RevelatorClient({
      apiKey: 'key-1',
      partnerUserId: 'user-1',
      baseUrl: 'https://api.revelator.com',
      platformUrl: 'https://platform.revelator.com',
      dryRun: true,
    })
    expect(client.buildLoginBody()).toEqual({
      partnerApiKey: 'key-1',
      partnerUserId: 'user-1',
    })
  })

  it('live submit uses login + save + addtoqueue when not dry-run', async () => {
    const calls: Array<{ url: string; method?: string; body?: unknown }> = []
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method || 'GET'
      const body = init?.body ? JSON.parse(String(init.body)) : undefined
      calls.push({ url, method, body })
      if (url.includes('/partner/account/login')) {
        return new Response(JSON.stringify({ accessToken: 'tok', expiresIn: 3600 }), {
          status: 200,
        })
      }
      if (url.includes('/content/release/save')) {
        return new Response(JSON.stringify({ releaseId: 540168 }), { status: 200 })
      }
      if (url.includes('/distribution/release/addtoqueue')) {
        return new Response(JSON.stringify({ ok: true }), { status: 200 })
      }
      return new Response('not found', { status: 404 })
    }) as unknown as typeof fetch

    const client = new RevelatorClient({
      apiKey: 'key',
      partnerUserId: 'user',
      baseUrl: 'https://api.revelator.com',
      platformUrl: 'https://platform.revelator.com',
      dryRun: false,
      fetchImpl,
    })

    const result = await client.submitRelease({
      releaseId: 'rel-1',
      title: 'FTP',
      type: 'ep',
      releaseDate: '2024-01-01',
      targetStores: ['spotify', 'apple_music'],
      tracks: [
        { title: 'FTP', isrc: 'QZTAS2424269', wavUrl: 'https://cdn/x.wav', explicit: false },
      ],
    })

    expect(result.dryRun).toBe(false)
    expect(result.releaseId).toBe('540168')
    expect(calls.some((c) => c.url.includes('/partner/account/login'))).toBe(true)
    expect(calls.some((c) => c.url.includes('/content/release/save'))).toBe(true)
    expect(calls.some((c) => c.url.includes('/distribution/release/addtoqueue'))).toBe(true)
    const queueCall = calls.find((c) => c.url.includes('addtoqueue'))
    expect(queueCall?.body).toEqual([1, 9])
  })

  it('readRevelatorEnv treats API_SECRET as partner user id alias', () => {
    process.env.REVELATOR_API_KEY = 'k'
    process.env.REVELATOR_API_SECRET = 'secret-user'
    const env = readRevelatorEnv()
    expect(env.partnerUserId).toBe('secret-user')
  })
})
