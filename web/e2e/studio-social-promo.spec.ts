import { test, expect } from '@playwright/test'

test.describe('studio marketing social promo', () => {
  test('pipeline marketing tab loads and social-promo API generate/persist', async ({
    page,
    request,
  }) => {
    // Pre-grant consent so the banner can't block Studio clicks.
    await page.addInitScript(() => {
      window.localStorage.setItem('analytics_consent', 'granted')
    })

    await page.goto('/studio/pipeline?tab=marketing', { waitUntil: 'domcontentloaded' })
    await expect(page).not.toHaveURL(/\/admin\/login/)
    await expect(page.getByRole('heading', { name: 'Pipeline' })).toBeVisible({ timeout: 60_000 })
    await expect(page.getByRole('tab', { name: 'Marketing' })).toBeVisible()

    // Wait for marketing board (alerts or empty state).
    await expect(
      page.getByText(/Needs launch|No releases in the marketing pipeline|Date TBD/i).first()
    ).toBeVisible({ timeout: 60_000 })

    const board = await request.get('/api/studio/release-pipeline')
    expect(board.status()).toBe(200)
    const boardJson = await board.json()
    const releases = boardJson.releases || []
    expect(releases.length).toBeGreaterThan(0)
    expect(releases[0]).toHaveProperty('social_promo')

    const target =
      releases.find((r: { release_date?: string | null }) => r.release_date) || releases[0]
    const id = target.id as string

    const get = await request.get(`/api/studio/releases/${encodeURIComponent(id)}/social-promo`)
    expect(get.status()).toBe(200)
    const getJson = await get.json()
    expect(getJson.column_missing).not.toBe(true)

    const put = await request.put(`/api/studio/releases/${encodeURIComponent(id)}/social-promo`, {
      data: { generate: true },
    })
    expect(put.status()).toBe(200)
    const putJson = await put.json()
    expect((putJson.plan?.posts || []).length).toBeGreaterThanOrEqual(8)

    const firstId = putJson.plan.posts[0].id as string
    const patch = await request.put(`/api/studio/releases/${encodeURIComponent(id)}/social-promo`, {
      data: { post: { id: firstId, status: 'ready' } },
    })
    expect(patch.status()).toBe(200)
    const patchJson = await patch.json()
    const updated = (patchJson.plan?.posts || []).find(
      (p: { id: string }) => p.id === firstId
    )
    expect(updated?.status).toBe('ready')

    // UI: expand Social promo on first card if present.
    const socialBtn = page.getByRole('button', { name: /Social promo/i }).first()
    if (await socialBtn.isVisible().catch(() => false)) {
      const accept = page.getByRole('button', { name: /^Accept$/i })
      if (await accept.isVisible().catch(() => false)) {
        await accept.click()
      }
      await socialBtn.click()
      await expect(page.getByText(/Social \/ Meta promo schedule/i)).toBeVisible({
        timeout: 30_000,
      })
      await expect(
        page.getByRole('button', { name: /Generate schedule|Regenerate schedule/i })
      ).toBeVisible()
      await expect(page.getByTestId('social-download-kit')).toBeVisible()
      await expect(page.getByRole('button', { name: /Vinyl story/i })).toBeVisible()
      await expect(page.getByRole('button', { name: /Vinyl reel/i })).toBeVisible()
      await expect(page.getByTestId('social-spotify-canvas')).toBeVisible()
    }
  })
})
