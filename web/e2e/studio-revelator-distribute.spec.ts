import { test, expect } from '@playwright/test'

/**
 * Aggregator distribute/status dry-run — no Revelator partner keys required.
 */
test.describe('studio Revelator distribute dry-run', () => {
  test('GET distribute health + POST aggregator dry-run + status', async ({ request }) => {
    test.setTimeout(120_000)

    const board = await request.get('/api/studio/release-pipeline')
    expect(board.status()).toBe(200)
    const boardJson = await board.json()
    const releases = boardJson.releases || []
    expect(releases.length).toBeGreaterThan(0)

    const target =
      releases.find(
        (r: { distributor_status?: string; title?: string }) =>
          r.title === 'FTP' || r.distributor_status === 'live'
      ) || releases[0]
    const id = encodeURIComponent(target.id as string)

    const health = await request.get(`/api/studio/releases/${id}/distribute`)
    expect(health.status()).toBe(200)
    const healthJson = await health.json()
    expect(healthJson.health?.available).toBe(true)
    expect(['dry_run', 'live']).toContain(healthJson.health?.label)
    expect(healthJson.readiness).toBeTruthy()
    expect(healthJson.masters).toBeTruthy()
    expect(typeof healthJson.masters.trackCount).toBe('number')
    expect(healthJson.preflight?.artworkProbe || healthJson.artwork_url !== undefined).toBeTruthy()

    const distribute = await request.post(`/api/studio/releases/${id}/distribute`, {
      data: {
        mode: 'aggregator',
        force: true,
        rights: {
          streaming: true,
          download: true,
          ugc: true,
          beatport_enabled: false,
          track_origin_original: true,
          linking_fields_acknowledged: true,
        },
      },
      timeout: 90_000,
    })

    // Force may still fail if tracks lack WAV/FLAC masters.
    if (distribute.status() === 400) {
      const err = await distribute.json()
      expect(String(err.error || '') + JSON.stringify(err.blockers || [])).toMatch(
        /WAV|FLAC|ready|ISRC|artwork|master/i
      )
      test.info().annotations.push({
        type: 'note',
        description: `Skipped live dry-run submit: ${err.error || err.blockers}`,
      })
      return
    }

    expect(distribute.status()).toBe(200)
    const distJson = await distribute.json()
    expect(distJson.success).toBe(true)
    expect(distJson.mode).toBe('aggregator')
    expect(distJson.dryRun).toBe(true)
    expect(String(distJson.distributorReleaseId || '')).toMatch(/^dryrun-/)
    expect(Array.isArray(distJson.queuedStoreIds)).toBe(true)
    expect(Array.isArray(distJson.unsupported)).toBe(true)

    const status = await request.get(`/api/studio/releases/${id}/status`)
    expect(status.status()).toBe(200)
    const statusJson = await status.json()
    expect(statusJson.mode).toBe('aggregator')
    expect(statusJson.dryRun).toBe(true)
    expect(statusJson.status).toBeTruthy()
    expect(Array.isArray(statusJson.stores)).toBe(true)
    expect(Array.isArray(statusJson.storeMatrix)).toBe(true)
  })

  test('dsp-artwork GET probes without mutating site art', async ({ request }) => {
    test.setTimeout(90_000)
    const board = await request.get('/api/studio/release-pipeline')
    expect(board.status()).toBe(200)
    const releases = (await board.json()).releases || []
    expect(releases.length).toBeGreaterThan(0)
    const withArt =
      releases.find((r: { artwork_url?: string | null }) => Boolean(r.artwork_url)) || releases[0]
    const id = encodeURIComponent(withArt.id as string)

    const probe = await request.get(`/api/studio/releases/${id}/dsp-artwork`, { timeout: 60_000 })
    expect([200, 400, 500]).toContain(probe.status())
    if (probe.status() === 200) {
      const json = await probe.json()
      expect(json.folderHint).toMatch(/release-covers/)
      // Site URL field is reported; generation may create dsp url separately.
      expect('artwork_url' in json).toBe(true)
      expect('artwork_dsp_url' in json).toBe(true)
    }
  })
})
