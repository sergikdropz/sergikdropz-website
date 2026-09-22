import { test, expect } from '@playwright/test'

test.describe('studio SoundExchange registry', () => {
  test('registry + lookup update submission data', async ({ page, request }) => {
    test.setTimeout(120_000)

    await page.addInitScript(() => {
      window.localStorage.setItem('analytics_consent', 'granted')
    })

    const registry = await request.get('/api/studio/soundexchange/registry', { timeout: 60_000 })
    expect(registry.status()).toBe(200)
    const board = await registry.json()
    expect(board.stats).toBeTruthy()
    expect(Array.isArray(board.catalog)).toBe(true)
    expect(board.isrc?.prefix).toBeTruthy()

    const withIsrc = (board.catalog || []).find((row: { isrc?: string }) => row.isrc)
    expect(withIsrc?.isrc).toBeTruthy()

    const lookup = await request.get(
      `/api/studio/soundexchange/lookup?isrc=${encodeURIComponent(withIsrc.isrc)}`,
    )
    expect(lookup.status()).toBe(200)
    const looked = await lookup.json()
    expect(looked.found).toBe(true)
    expect(looked.track?.isrc).toBe(withIsrc.isrc)

    const pendingIds = (board.pending || []).slice(0, 3).map((row: { trackId: string }) => row.trackId)
    const trackIds = pendingIds.length
      ? pendingIds
      : [withIsrc.trackId].filter(Boolean)

    if (trackIds.length) {
      const submit = await request.post('/api/studio/soundexchange/batch-submit', {
        data: { trackIds },
        timeout: 60_000,
      })
      expect(submit.status()).toBe(200)
      const submitted = await submit.json()
      expect(submitted.successful).toBeGreaterThan(0)
      expect(submitted.persisted).toBe(true)

      const after = await request.get('/api/studio/soundexchange/registry')
      expect(after.status()).toBe(200)
      const afterJson = await after.json()
      expect((afterJson.submissions || []).length).toBeGreaterThan(0)
    }

    await page.goto('/studio/pipeline?tab=isrcs', { waitUntil: 'domcontentloaded' })
    await expect(page).not.toHaveURL(/\/admin\/login/)
    await expect(page.getByTestId('soundexchange-panel')).toBeVisible({ timeout: 60_000 })
    await expect(page.getByTestId('sx-stats')).toBeVisible()
    await expect(page.getByTestId('sx-catalog-table').or(page.getByText(/No pending ISRCs|No ISRCs/i))).toBeVisible({
      timeout: 30_000,
    })

    await page.getByTestId('sx-lookup-input').fill(withIsrc.isrcDisplay || withIsrc.isrc)
    await page.getByTestId('sx-lookup-submit').click()
    await expect(page.getByTestId('sx-lookup-result')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByTestId('sx-lookup-result')).toContainText(/In catalog/i)
    await expect(page.getByTestId('sx-about')).toContainText(/US ISRC Agency/i)
    await expect(page.getByTestId('sx-about')).toContainText(/2181363681|QTA53|Local registry|Remote/i)
    await expect(page.getByTestId('sx-membership')).toContainText(/SX1102Q6ZH/)
    await expect(page.getByTestId('sx-membership')).toContainText(/SX1102Q6ZJ/)

    const history = page.getByTestId('sx-submission-history')
    if (await history.isVisible().catch(() => false)) {
      const firstRow = page.getByTestId('sx-submission-row').first()
      await expect(firstRow).toBeVisible()
      // Enriched rows should show a track title (not only the ISRC).
      await expect(firstRow).not.toContainText(/Track not linked/i)
    }
  })
})
