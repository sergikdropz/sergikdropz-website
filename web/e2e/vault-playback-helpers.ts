import { expect, type Page } from '@playwright/test'

export async function unlockVault(page: Page) {
  const unlock = await page.request.post('/api/fan/vault-unlock', {
    data: { email: `e2e-playback-${Date.now()}@example.com` },
    headers: { 'Content-Type': 'application/json' },
  })
  expect(unlock.ok(), 'vault unlock should succeed').toBeTruthy()
}

export async function dismissConsent(page: Page) {
  const accept = page.getByRole('button', { name: /^Accept$/i })
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (!(await accept.isVisible().catch(() => false))) return
    await accept.click({ force: true }).catch(() => {})
    await page.waitForTimeout(400)
  }
}

/** Stable vault prefs for queue / continuous playback tests. */
export async function installVaultPlaybackPrefs(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem('analytics_consent', 'granted')
    window.localStorage.setItem('idjEnabled', '0')
    window.localStorage.setItem('autoDJEnabled', '0')
    try {
      const prev = JSON.parse(localStorage.getItem('musicPlayerSettings') || '{}') as Record<
        string,
        unknown
      >
      localStorage.setItem(
        'musicPlayerSettings',
        JSON.stringify({ ...prev, catalogRandom: false }),
      )
    } catch {
      localStorage.setItem('musicPlayerSettings', JSON.stringify({ catalogRandom: false }))
    }
  })
}

const TRACK_NAME =
  /Dmn8r|FTP 2|One Of Those Nights|It Is What It Is|SERGIK\s*[-–]|Mind Freedom/i

const EP_NAV =
  /Are We Awake\? Are We Awake\?|FTP FTP|Psychoacousnatics Psychoacousnatics|Le Mind Freedom Le Mind Freedom/i

async function waitForTrackTable(page: Page) {
  await expect(page.getByText(/Loading tracks/i)).toHaveCount(0, { timeout: 90_000 }).catch(() => {})
}

async function songsIndexHasTracks(page: Page): Promise<boolean> {
  const label = (await page.getByText(/\d+\s+tracks/i).first().textContent().catch(() => '')) || ''
  if (/^0\s+tracks/i.test(label.trim())) return false
  const rows = await page.locator('table tbody tr').count()
  return rows > 0
}

/**
 * Opens music library and double-clicks a playable row.
 * Falls back from empty Songs index → a known EP folder in the sidebar.
 */
export async function startVaultTrackFromLibrary(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await unlockVault(page)
  await page.goto('/music-library', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: /SERGIK Music Vault/i })).toBeVisible({
    timeout: 90_000,
  })
  await dismissConsent(page)

  await page.getByRole('button', { name: /^Songs$/i }).click({ force: true })
  await waitForTrackTable(page)

  if (!(await songsIndexHasTracks(page))) {
    const ep = page.getByRole('button', { name: EP_NAV }).first()
    await expect(ep).toBeVisible({ timeout: 30_000 })
    await ep.click()
    await waitForTrackTable(page)
  }

  const named = page.getByRole('row', { name: TRACK_NAME }).first()
  const row =
    (await named.isVisible().catch(() => false))
      ? named
      : page.locator('table tbody tr').first()

  await expect(row).toBeVisible({ timeout: 90_000 })
  await row.dblclick()

  // Selection + toolbar Play — dblclick alone often queues without starting audio.
  const play = page.getByRole('button', { name: /^Play$/i, exact: true }).first()
  if (await play.isVisible().catch(() => false)) {
    await play.click({ force: true })
  }
}
