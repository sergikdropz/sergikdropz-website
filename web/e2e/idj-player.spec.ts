import { test, expect, type Page } from '@playwright/test'

test.describe.configure({ timeout: 180_000 })

async function unlockVault(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem('analytics_consent', 'granted')
  })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  const email = `e2e-idj-${Date.now()}@example.com`
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

async function playFirstVaultTrack(page: Page) {
  await page.goto('/music-library', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: /SERGIK Music Vault/i })).toBeVisible({
    timeout: 90_000,
  })
  await dismissConsent(page)

  await page.getByRole('button', { name: /^Songs$/i }).click({ force: true })
  // Catalog can still be hydrating after a cold dev restart.
  await expect(page.getByText(/Loading tracks/i)).toHaveCount(0, { timeout: 90_000 }).catch(() => {})

  // Scope to the table body so the sortable header row can never be the target.
  const songRows = page.locator('table tbody tr')
  const preferred = songRows.filter({ hasText: /Dmn8r|FTP 2|One Of Those Nights/i }).first()
  const trackRow = (await preferred.isVisible().catch(() => false)) ? preferred : songRows.first()
  await expect(trackRow).toBeVisible({ timeout: 90_000 })
  await trackRow.dblclick()

  const expand = page.getByRole('button', { name: /^Expand player$/i }).first()
  if (await expand.isVisible().catch(() => false)) {
    await expand.click({ force: true })
  }

  await expect
    .poll(
      async () =>
        page.evaluate(() =>
          Boolean((window as unknown as { __SERGIK_E2E__?: unknown }).__SERGIK_E2E__),
        ),
      { timeout: 60_000 },
    )
    .toBe(true)
}

type IdjSnapshot = {
  liveId: string | null
  idleId: string | null
  liveTime: number | null
  liveDuration: number | null
  livePaused: boolean
  liveReadyState: number
  armed: { live: boolean; idle: boolean }
  skipLocked: boolean
  srcSwap: boolean
  loadStarts: number
  waitings: number
  canplays: number
  endeds: number
}

test.describe('iDJ deck play menu', () => {
  test('continuous play lives on each deck play button, not iDJ settings', async ({ page }) => {
    await unlockVault(page)
    await playFirstVaultTrack(page)

    await page.evaluate(() => {
      const e2e = (
        window as unknown as {
          __SERGIK_E2E__: { enableIDJ: () => void; openIDJSettings: () => void }
        }
      ).__SERGIK_E2E__
      e2e.enableIDJ()
    })

    const deckAPlay = page.locator('[data-deck-play="A"]')
    const deckBPlay = page.locator('[data-deck-play="B"]')
    await expect(deckAPlay).toBeVisible({ timeout: 30_000 })
    await expect(deckBPlay).toBeVisible()

    const cueB = page.locator('[data-deck-cue="B"]')
    await expect(cueB).toBeVisible()
    await cueB.click({ button: 'right' })
    const hotCueMenu = page.getByRole('menu', { name: /Deck B hot cues/i })
    await expect(hotCueMenu).toBeVisible()
    await expect(hotCueMenu.getByRole('menuitem', { name: /Memory \/ SET/i })).toBeVisible()
    await expect(hotCueMenu.getByRole('menuitem', { name: /Hot 1/i })).toBeVisible()
    await expect(hotCueMenu.getByRole('menuitem', { name: /Hot 4/i })).toBeVisible()
    await expect(hotCueMenu.getByRole('menuitem', { name: /Hot 8/i })).toBeVisible()
    await expect(hotCueMenu.getByRole('button', { name: /Delete hot cue 1/i })).toHaveCount(0)
    await expect(hotCueMenu.getByRole('button', { name: /Delete memory cue/i })).toHaveCount(0)
    await hotCueMenu.getByRole('menuitem', { name: /Memory \/ SET/i }).click()
    await expect(hotCueMenu).toHaveCount(0)
    await cueB.click({ button: 'right' })
    await expect(hotCueMenu).toBeVisible()
    await expect(hotCueMenu.getByRole('menuitem', { name: /Memory \/ SET/i })).toContainText(/\d+:\d+/)
    await hotCueMenu.getByRole('button', { name: /Delete memory cue/i }).click()
    await expect(hotCueMenu.getByRole('menuitem', { name: /Memory \/ SET/i })).toContainText(/Empty/)
    await hotCueMenu.getByRole('menuitem', { name: /Hot 1/i }).click()
    await expect(hotCueMenu).toHaveCount(0)
    await expect(cueB).toHaveAttribute('data-active-cue', 'hot-1')
    await cueB.click({ button: 'right' })
    await expect(hotCueMenu).toBeVisible()
    await expect(hotCueMenu.getByRole('menuitem', { name: /Hot 1/i })).toContainText(/\d+:\d+/)
    await hotCueMenu.getByRole('button', { name: /Delete hot cue 1/i }).click()
    await expect(hotCueMenu.getByRole('menuitem', { name: /Hot 1/i })).toContainText(/Empty/)
    await expect(hotCueMenu.getByRole('button', { name: /Delete hot cue 1/i })).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(hotCueMenu).toHaveCount(0)

    await deckAPlay.click({ button: 'right' })
    const deckAMenu = page.getByRole('dialog', { name: /Deck A continuous play/i })
    await expect(deckAMenu).toBeVisible()
    await expect(deckAMenu.getByText('Continuous play')).toBeVisible()
    await expect(deckAPlay).toHaveAttribute('data-continuous-play', 'off')

    await deckAMenu.getByRole('checkbox').check()
    await expect(deckAPlay).toHaveAttribute('data-continuous-play', 'on')
    await expect(deckBPlay).toHaveAttribute('data-continuous-play', 'off')

    await page.keyboard.press('Escape')
    await expect(deckAMenu).toHaveCount(0)

    await deckBPlay.click({ button: 'right' })
    const deckBMenu = page.getByRole('dialog', { name: /Deck B continuous play/i })
    await expect(deckBMenu).toBeVisible()
    await deckBMenu.getByRole('checkbox').check()
    await expect(deckBPlay).toHaveAttribute('data-continuous-play', 'on')
    await expect(deckAPlay).toHaveAttribute('data-continuous-play', 'on')
    await page.keyboard.press('Escape')
    await expect(deckBMenu).toHaveCount(0)

    await page.evaluate(() => {
      ;(
        window as unknown as { __SERGIK_E2E__: { openIDJSettings: () => void } }
      ).__SERGIK_E2E__.openIDJSettings()
    })
    const settings = page.getByRole('dialog', { name: /iDJ/i }).first()
    await expect(settings).toBeVisible({ timeout: 15_000 })
    await expect(settings.getByText('Snap pointer to grid')).toBeVisible()
    await expect(settings.getByText('Continuous play')).toBeVisible()
    await expect(settings.getByText('Also on each play button')).toBeVisible()
  })

  test('mini EQ dial taps open, drags trim, double-click resets', async ({ page }) => {
    await unlockVault(page)
    await playFirstVaultTrack(page)

    await page.evaluate(() => {
      ;(
        window as unknown as { __SERGIK_E2E__: { enableIDJ: () => void } }
      ).__SERGIK_E2E__.enableIDJ()
    })

    const dial = page.locator('[data-eq-dials="a"] [data-eq-dial="low"]')
    await expect(dial).toBeVisible({ timeout: 30_000 })
    const popup = page.getByRole('dialog', { name: /Deck A · Low/i })
    const gainOf = async () =>
      Number(
        /(-?[\d.]+|-∞)/.exec((await dial.getAttribute('aria-label')) ?? '')?.[1] ?? Number.NaN,
      )

    // Tap toggles the fader popup.
    await dial.click();
    await expect(popup).toBeVisible()
    await dial.click()
    await expect(popup).toHaveCount(0)

    // Press-and-drag trims live and only shows the popup for the duration of the drag.
    const box = (await dial.boundingBox())!
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2
    await page.mouse.move(cx, cy)
    await page.mouse.down()
    await page.mouse.move(cx, cy + 60, { steps: 8 })
    await expect(popup).toBeVisible()
    await expect.poll(gainOf, { timeout: 5_000 }).toBeLessThan(0)
    await page.mouse.up()
    await expect(popup).toHaveCount(0)
    expect(await gainOf()).toBeLessThan(0)

    // Double-click resets the band without leaving the popup behind.
    await dial.dblclick()
    await expect.poll(gainOf, { timeout: 5_000 }).toBe(0)
    await expect(popup).toHaveCount(0)
  })

  test('same-deck load does not thrash, loop, or stay buffering', async ({ page }) => {
    await unlockVault(page)
    await playFirstVaultTrack(page)

    await page.evaluate(() => {
      ;(
        window as unknown as { __SERGIK_E2E__: { enableIDJ: () => void } }
      ).__SERGIK_E2E__.enableIDJ()
    })

    const deckANext = page.locator('[data-deck-next="A"]')
    const deckBNext = page.locator('[data-deck-next="B"]')
    await expect(deckANext).toBeVisible({ timeout: 30_000 })
    await expect(deckBNext).toBeVisible()

    const snapshot = () =>
      page.evaluate(() => {
        const e2e = (
          window as unknown as {
            __SERGIK_E2E__: { idjSnapshot?: () => IdjSnapshot }
          }
        ).__SERGIK_E2E__
        return e2e.idjSnapshot?.() ?? null
      })

    const resetCounters = () =>
      page.evaluate(() => {
        ;(
          window as unknown as { __SERGIK_E2E__: { resetIdjMediaCounters?: () => void } }
        ).__SERGIK_E2E__.resetIdjMediaCounters?.()
      })

    await expect.poll(async () => Boolean((await snapshot())?.liveId), { timeout: 30_000 }).toBe(true)

    const beforeFake = await snapshot()
    await page.evaluate(() => {
      ;(
        window as unknown as { __SERGIK_E2E__: { fireMediaEnded?: (deck: 'live' | 'idle') => void } }
      ).__SERGIK_E2E__.fireMediaEnded?.('live')
    })
    await page.waitForTimeout(400)
    expect((await snapshot())?.liveId).toBe(beforeFake?.liveId)

    // Live deck next
    await resetCounters()
    const beforeLive = await snapshot()
    await deckANext.click()
    await expect
      .poll(async () => (await snapshot())?.liveId ?? '', { timeout: 15_000 })
      .not.toBe(beforeLive?.liveId ?? '')
    await expect
      .poll(async () => {
        const s = await snapshot()
        return Boolean(s && !s.skipLocked && !s.srcSwap && s.liveReadyState >= 2)
      }, { timeout: 20_000 })
      .toBe(true)
    await page.waitForTimeout(1500)
    const afterLive = await snapshot()
    expect(afterLive!.loadStarts).toBeLessThanOrEqual(2)
    expect(afterLive!.endeds).toBe(0)
    expect(afterLive!.livePaused).toBe(false)
    expect(afterLive!.liveId).toBeTruthy()
    expect(afterLive!.liveId).not.toBe(beforeLive?.liveId)
    expect(afterLive!.idleId).toBe(beforeLive?.idleId)

    // Idle deck next
    await resetCounters()
    const beforeIdle = await snapshot()
    await deckBNext.click()
    await expect
      .poll(async () => (await snapshot())?.idleId ?? '', { timeout: 15_000 })
      .not.toBe(beforeIdle?.idleId ?? '')
    await page.waitForTimeout(1500)
    const afterIdle = await snapshot()
    expect(afterIdle!.idleId).not.toBe(beforeIdle?.idleId)
    expect(afterIdle!.liveId).toBe(afterLive!.liveId)
    expect(afterIdle!.endeds).toBe(0)

    // Rapid live skips should not spiral into loadstart thrash.
    await resetCounters()
    const rapidIds: string[] = []
    for (let i = 0; i < 4; i += 1) {
      const before = (await snapshot())?.liveId ?? ''
      await deckANext.click()
      await expect
        .poll(async () => (await snapshot())?.liveId ?? '', { timeout: 15_000 })
        .not.toBe(before)
      rapidIds.push((await snapshot())!.liveId as string)
      await page.waitForTimeout(250)
    }
    await page.waitForTimeout(1500)
    const afterRapid = await snapshot()
    expect(afterRapid!.loadStarts).toBeLessThanOrEqual(6)
    expect(afterRapid!.endeds).toBe(0)
    expect(new Set(rapidIds).size).toBeGreaterThan(1)
    expect(afterRapid!.liveId).toBe(rapidIds[rapidIds.length - 1])
    expect(afterRapid!.livePaused).toBe(false)
    expect(afterRapid!.idleId).toBe(afterIdle!.idleId)

    const deckAPlay = page.locator('[data-deck-play="A"]')
    await deckAPlay.click({ button: 'right' })
    const deckAMenu = page.getByRole('dialog', { name: /Deck A continuous play/i })
    await expect(deckAMenu).toBeVisible()
    await deckAMenu.getByRole('checkbox').check()
    await expect(deckAPlay).toHaveAttribute('data-continuous-play', 'on')
    await page.keyboard.press('Escape')

    const beforeContFake = await snapshot()
    await page.evaluate(() => {
      ;(
        window as unknown as { __SERGIK_E2E__: { fireMediaEnded?: (deck: 'live' | 'idle') => void } }
      ).__SERGIK_E2E__.fireMediaEnded?.('live')
    })
    await page.waitForTimeout(400)
    expect((await snapshot())?.liveId).toBe(beforeContFake?.liveId)

    await expect
      .poll(async () => {
        const ready = await snapshot()
        return Boolean(
          ready?.liveDuration &&
            ready.liveDuration > 1 &&
            ready.armed.live &&
            !ready.skipLocked &&
            !ready.srcSwap,
        )
      }, { timeout: 20_000 })
      .toBe(true)
    await page.waitForTimeout(1000)

    const beforeRealEnd = await snapshot()
    await page.evaluate(() => {
      const e2e = (
        window as unknown as {
          __SERGIK_E2E__: {
            seekLiveNearEnd?: () => boolean
            fireMediaEnded?: (deck: 'live' | 'idle') => void
          }
        }
      ).__SERGIK_E2E__
      if (!e2e.seekLiveNearEnd?.()) return
      e2e.fireMediaEnded?.('live')
    })
    await expect
      .poll(async () => (await snapshot())?.liveId ?? '', { timeout: 15_000 })
      .not.toBe(beforeRealEnd?.liveId ?? '')
  })
})
