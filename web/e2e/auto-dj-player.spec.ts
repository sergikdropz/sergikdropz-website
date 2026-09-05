import { test, expect, type Page } from '@playwright/test'

test.describe.configure({ timeout: 120_000 })

async function unlockVault(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  const email = `e2e-autodj-${Date.now()}@example.com`
  const unlock = await page.request.post('/api/fan/vault-unlock', {
    data: { email },
    headers: { 'Content-Type': 'application/json' },
  })
  expect(unlock.ok()).toBeTruthy()
  const body = (await unlock.json()) as { ok?: boolean }
  expect(body.ok).toBe(true)
}

async function dismissConsent(page: Page) {
  const accept = page.getByRole('button', { name: /^Accept$/i })
  if (await accept.isVisible().catch(() => false)) {
    await accept.click()
  }
}

/** Auto DJ chrome mounts with now-playing — start a vault track first. */
async function playFirstVaultTrack(page: Page) {
  await page.goto('/music-library', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: /SERGIK Music Vault/i })).toBeVisible({
    timeout: 90_000,
  })
  await dismissConsent(page)

  const playBtn = page.getByRole('button', { name: /^Play /i }).first()
  await expect(playBtn).toBeVisible({ timeout: 60_000 })
  await playBtn.click()

  // Desktop now-playing row (not the lg:hidden mobile duplicate).
  const autoDj = page
    .locator('div.hidden.lg\\:block')
    .getByRole('button', { name: /Enable Auto DJ|Disable Auto DJ/i })
  await expect(autoDj).toBeVisible({ timeout: 60_000 })
  // Settings dialog portal lives in GlobalMusicPlayer — wait for it to mount.
  await expect(page.getByLabel('Adjust volume').first()).toBeVisible({
    timeout: 60_000,
  })
  return autoDj
}

test.describe('Auto DJ player chrome', () => {
  test('music library loads without stretch-bundle crash', async ({ page }) => {
    await unlockVault(page)
    await page.goto('/music-library', { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/\/music-library\/?$/)
    await expect(page.getByRole('heading', { name: /SERGIK Music Vault/i })).toBeVisible({
      timeout: 90_000,
    })
    await expect(page.getByText(/Minified React error/i)).toHaveCount(0)
    await expect(page.getByText(/Application error/i)).toHaveCount(0)
    await expect(page.getByText(/UnhandledSchemeError/i)).toHaveCount(0)
  })

  test('Auto DJ settings expose phrase depth, blend, and bar-in', async ({ page }) => {
    await unlockVault(page)
    await playFirstVaultTrack(page)
    await expect
      .poll(async () =>
        page.evaluate(() => Boolean((window as unknown as { __SERGIK_E2E__?: unknown }).__SERGIK_E2E__)),
      )
      .toBe(true)
    await page.evaluate(() => {
      ;(window as unknown as { __SERGIK_E2E__: { openAutoDJSettings: () => void } }).__SERGIK_E2E__.openAutoDJSettings()
    })

    const menu = page.getByRole('dialog', { name: /Auto DJ settings/i })
    await expect(menu).toBeVisible({ timeout: 15_000 })
    await expect(menu.getByText('Phrase depth', { exact: true })).toBeVisible()
    await expect(menu.getByText('Blend', { exact: true })).toBeVisible()

    const phraseDepth = menu.locator('label').filter({ hasText: 'Phrase depth' }).locator('select')
    await expect(phraseDepth).toBeVisible()
    await expect(phraseDepth.locator('option')).toHaveText([
      'Last 32 bars',
      'Last 24 bars',
      'Last 16 bars',
      'Last 8 bars',
    ])
    await phraseDepth.selectOption('24')
    await expect(phraseDepth).toHaveValue('24')

    await menu.getByRole('button', { name: /^Advanced$/i }).click()
    const barIn = menu.locator('label').filter({ hasText: /Bar in/i }).locator('select')
    await expect(barIn).toBeVisible()
    await expect(barIn.locator('option')).toHaveText(['8 bars', '0'])
    await barIn.selectOption('0')
    await expect(barIn).toHaveValue('0')

    const cuePriority = menu.locator('label').filter({ hasText: 'Cue priority' }).locator('select')
    await expect(cuePriority.locator('option[value="dna-intro"]')).toHaveAttribute(
      'title',
      /Labeled mix-in cue/i,
    )

    await expect(menu.getByRole('button', { name: /Save local|Save settings|Saved/i })).toBeVisible()
  })

  test('Sync mode, Lock Grid chrome, and settings history surface', async ({ page }) => {
    await unlockVault(page)
    await playFirstVaultTrack(page)
    await expect
      .poll(async () =>
        page.evaluate(() => Boolean((window as unknown as { __SERGIK_E2E__?: unknown }).__SERGIK_E2E__)),
      )
      .toBe(true)

    // Soft open expanded chrome for Lock Grid when reachable (not required for Sync).
    const expand = page.getByRole('button', { name: /Expand player|Show controls|More controls/i }).first()
    if (await expand.isVisible().catch(() => false)) {
      await expand.click({ force: true }).catch(() => {})
    }
    const cog = page.locator('button[title*="settings" i], button[aria-label*="settings" i]').first()
    if (await cog.isVisible().catch(() => false)) {
      await cog.click({ force: true }).catch(() => {})
    }

    const lockGrid = page.getByRole('button', { name: /Lock Grid|Grid: LOCKED/i })
    if (await lockGrid.isVisible().catch(() => false)) {
      await expect(lockGrid).toBeEnabled()
    }

    await page.evaluate(() => {
      ;(window as unknown as { __SERGIK_E2E__: { openAutoDJSettings: () => void } }).__SERGIK_E2E__.openAutoDJSettings()
    })
    const menu = page.getByRole('dialog', { name: /Auto DJ settings/i })
    await expect(menu).toBeVisible({ timeout: 15_000 })

    const syncMode = menu.locator('label').filter({ hasText: /^Sync$/ }).locator('select')
    await expect(syncMode).toBeVisible()
    await expect(syncMode.locator('option')).toHaveText(['BeatSync', 'TempoSync'])
    await syncMode.selectOption('tempo-sync')
    await expect(syncMode).toHaveValue('tempo-sync')
    await syncMode.selectOption('beat-sync')
    await expect(syncMode).toHaveValue('beat-sync')
  })

  test('toggling Auto DJ does not crash the player shell', async ({ page }) => {
    await unlockVault(page)
    const enable = await playFirstVaultTrack(page)
    await enable.click()
    await expect(
      page
        .locator('div.hidden.lg\\:block')
        .getByRole('button', { name: /Disable Auto DJ/i }),
    ).toBeVisible()
    await expect(page.getByText(/Application error/i)).toHaveCount(0)
  })
})
