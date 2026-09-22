import { test, expect } from '@playwright/test'

const ALL_33 = [
  'spotify',
  'apple_music',
  'youtube_music',
  'youtube',
  'shazam',
  'beatport',
  'traxsource',
  'soundcloud',
  'mixcloud',
  'bandcamp',
  'amazon',
  'tidal',
  'deezer',
  'pandora',
  'iheart',
  'tiktok',
  'instagram',
  'claro_musica',
  'saavn',
  'boomplay',
  'anghami',
  'netease',
  'tencent',
  'qobuz',
  'joox',
  'kuack_media',
  'adaptr',
  'flo',
  'medianet',
  'audiomack',
  'snapchat',
  'massivemusic',
  'roblox',
] as const

test.describe('studio DSP connect', () => {
  test('all 33 DSP targets are catalogued, covered, and selectable e2e', async ({ page, request }) => {
    test.setTimeout(120_000)

    await page.addInitScript(() => {
      window.localStorage.setItem('analytics_consent', 'granted')
    })

    const board = await request.get('/api/studio/release-pipeline')
    expect(board.status()).toBe(200)
    const boardJson = await board.json()
    const releases = boardJson.releases || []
    expect(releases.length).toBeGreaterThan(0)

    const target =
      releases.find(
        (r: { upc?: string | null; store_link_count?: number }) =>
          r.upc || (r.store_link_count || 0) > 0
      ) || releases[0]
    const id = target.id as string

    const status = await request.get(`/api/studio/releases/${encodeURIComponent(id)}/dsp-connect`, {
      timeout: 90_000,
    })
    expect(status.status()).toBe(200)
    const statusJson = await status.json()

    expect(statusJson.completeness?.ok).toBe(true)
    expect(statusJson.catalog?.length).toBe(33)
    expect(statusJson.coverage?.total).toBe(33)
    expect(statusJson.coverage?.rows?.length).toBe(33)
    expect(statusJson.targetStores?.length).toBe(33)
    expect(statusJson.providers).toMatchObject({
      apple: true,
      deezer: true,
      musicbrainz: true,
      odesli: true,
    })

    const catalogIds = (statusJson.catalog || []).map((row: { id: string }) => row.id)
    const coverageIds = (statusJson.coverage.rows || []).map((row: { id: string }) => row.id)
    for (const required of ALL_33) {
      expect(catalogIds).toContain(required)
      expect(coverageIds).toContain(required)
      expect(statusJson.targetStores).toContain(required)
    }
    expect(catalogIds).toHaveLength(33)
    expect(new Set(catalogIds).size).toBe(33)

    const kinds = new Set(
      (statusJson.coverage.rows || []).map((row: { kind: string }) => row.kind)
    )
    for (const kind of kinds) {
      expect(['live', 'linked', 'artist', 'b2b', 'needs_paste', 'failed']).toContain(kind)
    }
    expect(statusJson.coverage.b2b).toBeGreaterThanOrEqual(5)

    const seedUrl = 'https://open.spotify.com/album/2NkWmlDlwoFYpM2foerkHH'
    const connect = await request.post(`/api/studio/releases/${encodeURIComponent(id)}/dsp-connect`, {
      data: { seedUrl, persist: false, updateTargets: false },
      timeout: 90_000,
    })
    expect([200, 422]).toContain(connect.status())
    const connectJson = await connect.json()
    expect(Array.isArray(connectJson.links)).toBe(true)
    expect(connectJson.catalog?.length).toBe(33)
    expect(connectJson.coverage?.total).toBe(33)
    expect(connectJson.coverage?.rows?.length).toBe(33)
    expect(connectJson.targetStores?.length).toBe(33)
    expect(connectJson.coverage.accounted).toBe(
      connectJson.coverage.live +
        connectJson.coverage.linked +
        connectJson.coverage.artist +
        connectJson.coverage.b2b
    )

    if (connect.status() === 200) {
      expect(connectJson.links.some((l: { store: string }) => l.store === 'spotify')).toBe(true)
      expect(connectJson.persisted).toMatchObject({ added: [], updated: [], unchanged: [] })
      expect(connectJson.notes?.[0]).toMatch(/33 targets/)
    }

    await page.goto(`/studio/releases/${encodeURIComponent(id)}`, { waitUntil: 'domcontentloaded' })
    await expect(page).not.toHaveURL(/\/admin\/login/)
    const deliveryTab = page.getByRole('button', { name: /^Delivery$/i }).or(
      page.getByRole('tab', { name: /^Delivery$/i })
    )
    if (await deliveryTab.first().isVisible({ timeout: 15_000 }).catch(() => false)) {
      await deliveryTab.first().click()
      await expect(page.getByRole('button', { name: /Connect stores/i })).toBeVisible({
        timeout: 60_000,
      })
      await expect(page.getByTestId('dsp-target-matrix')).toBeVisible({ timeout: 30_000 })
      await expect(page.getByTestId('dsp-coverage-summary')).toContainText(/33 targets/)
      await expect(page.getByTestId('dsp-select-all-targets')).toContainText(/33/)
      await expect(page.getByTestId('dsp-verify-live')).toBeVisible()

      for (const storeId of ALL_33) {
        await expect(page.getByTestId(`dsp-target-${storeId}`)).toBeVisible()
      }

      await page.getByTestId('dsp-select-all-targets').click()
      // After select-all, every tile should be targeted (aria-pressed or selected styling via button).
      const pressed = page.locator('[data-testid^="dsp-target-"] button[aria-pressed="true"]')
      await expect(pressed).toHaveCount(33, { timeout: 15_000 })
    }

    const verifyTarget =
      releases.find((r: { store_link_count?: number }) => (r.store_link_count || 0) > 0) || target
    const verifyId = verifyTarget.id as string
    const hadLinks = (verifyTarget.store_link_count || 0) > 0

    // Ensure at least one persisted album URL exists for verify (dry-run connect does not write).
    if (!hadLinks) {
      const seed = await request.post(
        `/api/studio/releases/${encodeURIComponent(verifyId)}/store-links`,
        {
          data: {
            store: 'spotify',
            url: 'https://open.spotify.com/album/2NkWmlDlwoFYpM2foerkHH',
          },
          timeout: 60_000,
        }
      )
      expect(seed.status()).toBe(201)
    }

    const verify = await request.post(
      `/api/studio/releases/${encodeURIComponent(verifyId)}/dsp-verify`,
      {
        data: {},
        timeout: 120_000,
      }
    )
    expect(verify.status()).toBe(200)
    const verifyJson = await verify.json()
    expect(Array.isArray(verifyJson.results)).toBe(true)
    expect(verifyJson.results.length).toBeGreaterThan(0)
    for (const row of verifyJson.results as Array<{ status: string }>) {
      expect(['unverified', 'live', 'reachable', 'artist_only', 'b2b', 'failed']).toContain(
        row.status
      )
    }
    expect(typeof verifyJson.live).toBe('number')
    expect(typeof verifyJson.reachable).toBe('number')
    expect(typeof verifyJson.artist_only).toBe('number')
    expect(typeof verifyJson.failed).toBe('number')
  })
})
