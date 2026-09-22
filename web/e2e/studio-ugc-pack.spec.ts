import { test, expect } from '@playwright/test'

test.describe('studio UGC pack', () => {
  test('copyright API enrolls SERGIK UGC pack with platforms + notes', async ({ page, request }) => {
    test.setTimeout(120_000)

    await page.addInitScript(() => {
      window.localStorage.setItem('analytics_consent', 'granted')
    })

    const board = await request.get('/api/studio/release-pipeline')
    expect(board.status()).toBe(200)
    const boardJson = await board.json()
    const releases = boardJson.releases || []
    expect(releases.length).toBeGreaterThan(0)
    const id = String(releases[0].id)

    const get = await request.get(`/api/studio/releases/${encodeURIComponent(id)}/copyright`)
    expect(get.status()).toBe(200)
    const before = await get.json()
    expect(before.readiness?.ugc_pack?.partner || 'sergik').toBe('sergik')

    const put = await request.put(`/api/studio/releases/${encodeURIComponent(id)}/copyright`, {
      data: {
        ugc_pack: {
          opted_in: true,
          status: 'submitted',
          youtube: true,
          tiktok: true,
          meta: false,
          notes: 'e2e: queued for Content ID + TikTok Music ID',
        },
      },
      timeout: 60_000,
    })
    expect(put.status()).toBe(200)
    const after = await put.json()
    expect(after.readiness?.ugc_pack).toMatchObject({
      opted_in: true,
      partner: 'sergik',
      status: 'submitted',
      youtube: true,
      tiktok: true,
      meta: false,
      notes: 'e2e: queued for Content ID + TikTok Music ID',
    })
    expect(after.readiness?.ugc_pack?.enrolled_at).toBeTruthy()
    expect(after.readiness?.ugc?.warnings).toBeDefined()

    await page.goto(`/studio/releases/${encodeURIComponent(id)}?step=rights`, {
      waitUntil: 'domcontentloaded',
    })
    await expect(page).not.toHaveURL(/\/admin\/login/)

    const ugcDetails = page.locator('details').filter({ hasText: /UGC pack/i }).first()
    await expect(ugcDetails).toBeVisible({ timeout: 60_000 })
    await ugcDetails.evaluate((el) => {
      ;(el as HTMLDetailsElement).open = true
    })

    await expect(page.getByTestId('ugc-pack-section')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText(/SERGIK UGC fingerprints/i)).toBeVisible()
    await expect(page.getByTestId('ugc-platform-youtube')).toContainText(/Content ID/i)
    await expect(page.getByTestId('ugc-platform-tiktok')).toContainText(/Music ID/i)
    await expect(page.getByTestId('ugc-platform-meta')).toContainText(/Rights Manager/i)
    await expect(page.getByTestId('ugc-next-action')).toBeVisible()
    await expect(page.getByTestId('ugc-timestamps')).toContainText(/Enrolled/i)
  })
})
