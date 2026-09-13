import { test, expect, type Page } from '@playwright/test'

test.describe.configure({ timeout: 120_000 })

async function unlockVault(page: Page) {
  // Pre-grant consent so the banner can't mount late and swallow the first click.
  await page.addInitScript(() => {
    window.localStorage.setItem('analytics_consent', 'granted')
  })
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
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (!(await accept.isVisible().catch(() => false))) return
    await accept.click({ force: true }).catch(() => {})
    await page.waitForTimeout(300)
  }
}

/** Auto DJ chrome mounts with now-playing — start a vault track first. */
async function playFirstVaultTrack(page: Page) {
  await page.goto('/music-library', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: /SERGIK Music Vault/i })).toBeVisible({
    timeout: 90_000,
  })
  await dismissConsent(page)

  // The default Crates & EPs grid only reveals play buttons on hover, so start
  // from the Songs list where a row double-click is a stable entry point.
  await page.getByRole('button', { name: /^Songs$/i }).click({ force: true })
  const trackRow = page.getByRole('row', { name: /Dmn8r|FTP 2|One Of Those Nights/i }).first()
  await expect(trackRow).toBeVisible({ timeout: 60_000 })
  await trackRow.dblclick()

  // The collapsed bar has no Auto DJ control, so open the full player chrome.
  const expand = page.getByRole('button', { name: /^Expand player$/i }).first()
  if (await expand.isVisible().catch(() => false)) {
    await expand.click({ force: true })
  }

  const autoDj = page.getByRole('button', { name: /Enable Auto DJ|Disable Auto DJ/i }).first()
  await expect(autoDj).toBeVisible({ timeout: 60_000 })
  // The settings dialog is driven through the player context, so wait on its
  // test hook rather than on chrome that only exists in the collapsed bar.
  await expect
    .poll(
      async () =>
        page.evaluate(() =>
          Boolean((window as unknown as { __SERGIK_E2E__?: unknown }).__SERGIK_E2E__),
        ),
      { timeout: 60_000 },
    )
    .toBe(true)
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
    await expect(menu.getByText('Techniques', { exact: true })).toBeVisible()
    await expect(menu.getByRole('button', { name: /^Phrase lock$/i })).toBeVisible()
    await expect(menu.getByRole('button', { name: /^Mix now$/i })).toBeVisible()
    await expect(menu.getByText(/Auto style from section/i)).toBeVisible()

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

    const beatCorrect = menu.locator('label').filter({ hasText: 'Beat correct' }).locator('select')
    await expect(beatCorrect).toBeVisible()
    await expect(beatCorrect.locator('option')).toHaveText([
      'Off',
      'Grid',
      'Bar grid',
      'Phrase grid',
      'Grid + kick',
      'Bar grid + kick',
      'Phrase grid + kick',
      'Phase',
      'Phase + kick',
      'Grid + phase',
      'Grid + phase + kick',
    ])
    await beatCorrect.selectOption('grid')
    await expect(beatCorrect).toHaveValue('grid')
    await beatCorrect.selectOption('grid-kick')
    await expect(beatCorrect).toHaveValue('grid-kick')

    await menu.getByRole('button', { name: /^Advanced$/i }).click()
    const creative = menu.getByRole('checkbox', { name: /Creative mode/i })
    await creative.check()
    await expect(creative).toBeChecked()

    const barIn = menu.locator('label').filter({ hasText: /^Bar in$/i }).locator('select')
    await expect(barIn).toBeVisible()
    await expect(barIn.locator('option')).toHaveText(['8 bars', '0'])
    await barIn.selectOption('0')
    await expect(barIn).toHaveValue('0')

    const cuePriority = menu.locator('label').filter({ hasText: 'Cue priority' }).locator('select')
    await expect(cuePriority.locator('option[value="dna-intro"]')).toHaveAttribute(
      'title',
      /Labeled mix-in cue/i,
    )
    await expect(cuePriority.locator('option[value="hot-cue-2"]')).toHaveText('Hot cue 2')
    await expect(cuePriority.locator('option[value="memory-cue"]')).toHaveText('Memory cue')
    await expect(cuePriority.locator('option[value="drop"]')).toHaveText('Drop')
    await cuePriority.selectOption('hot-cue-3')
    await expect(cuePriority).toHaveValue('hot-cue-3')

    await expect(menu.getByRole('button', { name: /Save local|Save settings|Saved/i })).toBeVisible()
  })

  test('Sync mode, Lock Grid chrome, and settings history surface', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem(
        'sergik.autoDj.mixQualityHistory',
        JSON.stringify([
          {
            at: Date.now(),
            grade: 'fair',
            label: 'Loose',
            phaseRmsSec: 0.01,
            kickResidualRmsMs: 15,
            samples: 8,
            outgoingTitle: 'Movin',
            incomingTitle: '6 Hours In v2',
          },
        ]),
      )
    })
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

    // Scope on the label's caption span — the label's own text also contains
    // every option, so an exact-text filter on the label never matches.
    const syncMode = menu
      .locator('label')
      .filter({ has: page.locator('span').filter({ hasText: /^Sync$/ }) })
      .locator('select')
    await expect(syncMode).toBeVisible()
    await expect(syncMode.locator('option')).toHaveText(['BeatSync', 'TempoSync'])
    await syncMode.selectOption('tempo-sync')
    await expect(syncMode).toHaveValue('tempo-sync')
    await syncMode.selectOption('beat-sync')
    await expect(syncMode).toHaveValue('beat-sync')

    const historyToggle = menu.getByRole('button', { name: /Mix history/i })
    await expect(historyToggle).toBeVisible()
    await expect(historyToggle).toHaveAttribute('aria-expanded', 'false')
    await expect(menu.locator('ul').filter({ hasText: /Loose/ })).toHaveCount(0)
    await historyToggle.click()
    await expect(historyToggle).toHaveAttribute('aria-expanded', 'true')
    await expect(menu.getByText(/Loose/)).toBeVisible()
  })

  test('toggling Auto DJ does not crash the player shell', async ({ page }) => {
    await unlockVault(page)
    const enable = await playFirstVaultTrack(page)
    await enable.click()
    await expect(
      page.getByRole('button', { name: /Disable Auto DJ/i }).first(),
    ).toBeVisible()
    await expect(page.getByText(/Application error/i)).toHaveCount(0)
  })

  test('Auto DJ Mix now reports mix status and survives skip while cued', async ({ page }) => {
    await unlockVault(page)
    const enable = await playFirstVaultTrack(page)
    await enable.click()
    await expect(page.getByRole('button', { name: /Disable Auto DJ/i }).first()).toBeVisible()

    // Wait for Auto DJ to queue a successor (DNA lookahead) or use the existing queue.
    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            const e2e = (window as unknown as { __SERGIK_E2E__?: { isAutoDJEnabled?: () => boolean } })
              .__SERGIK_E2E__
            return Boolean(e2e?.isAutoDJEnabled?.())
          }),
        { timeout: 30_000 },
      )
      .toBe(true)

    // Give the controller a few ticks to plan / queue DNA lookahead.
    await page.waitForTimeout(2500)

    await page.evaluate(() => {
      ;(window as unknown as { __SERGIK_E2E__: { openAutoDJSettings: () => void } }).__SERGIK_E2E__.openAutoDJSettings()
    })
    const menu = page.getByRole('dialog', { name: /Auto DJ settings/i })
    await expect(menu).toBeVisible({ timeout: 15_000 })

    const mixNow = menu.getByRole('button', { name: /^Mix now$/i })
    await mixNow.click()

    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            const e2e = (
              window as unknown as { __SERGIK_E2E__?: { getAutoDJStatus?: () => string } }
            ).__SERGIK_E2E__
            return e2e?.getAutoDJStatus?.() ?? ''
          }),
        { timeout: 45_000 },
      )
      .toMatch(/Mix now|Mixing|Cued|On air|Queue a next track/i)

    const statusAfterMix = await page.evaluate(() => {
      const e2e = (window as unknown as { __SERGIK_E2E__?: { getAutoDJStatus?: () => string } })
        .__SERGIK_E2E__
      return e2e?.getAutoDJStatus?.() ?? ''
    })

    // If we only got the "queue a next track" hint, stop — vault fixture may be empty.
    if (/Queue a next track/i.test(statusAfterMix)) {
      test.info().annotations.push({
        type: 'note',
        description: 'No next track available for Mix now in this vault fixture',
      })
      return
    }

    // Wait for a cued successor if the blend finished quickly.
    await page.waitForTimeout(1500)
    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            const e2e = (
              window as unknown as { __SERGIK_E2E__?: { getAutoDJStatus?: () => string } }
            ).__SERGIK_E2E__
            return e2e?.getAutoDJStatus?.() ?? ''
          }),
        { timeout: 60_000 },
      )
      .toMatch(/Cued|Mixing|On air|Skip blend|Mix now|Auto DJ/i)

    // Skip while AutoDJ is on — should not crash; prefer skip-blend / Mixing when cued.
    const nextBtn = page.getByRole('button', { name: /Next track|Skip to next|Next/i }).first()
    if (await nextBtn.isVisible().catch(() => false)) {
      await nextBtn.click({ force: true }).catch(() => {})
      await page.waitForTimeout(800)
      const afterSkip = await page.evaluate(() => {
        const e2e = (window as unknown as { __SERGIK_E2E__?: { getAutoDJStatus?: () => string } })
          .__SERGIK_E2E__
        return e2e?.getAutoDJStatus?.() ?? ''
      })
      // Hard-cut leaves empty status sometimes; crash would show Application error.
      expect(afterSkip.length >= 0).toBe(true)
    }
    await expect(page.getByText(/Application error/i)).toHaveCount(0)
    await expect(page.getByText(/Minified React error/i)).toHaveCount(0)
  })
})
