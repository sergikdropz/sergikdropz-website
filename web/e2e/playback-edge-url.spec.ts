import { test, expect, type Page } from '@playwright/test'

test.describe.configure({ timeout: 120_000 })

async function unlockVault(page: Page) {
  const email = `e2e-edge-${Date.now()}@example.com`
  const unlock = await page.request.post('/api/fan/vault-unlock', {
    data: { email },
    headers: { 'Content-Type': 'application/json' },
  })
  expect(unlock.ok()).toBeTruthy()
}

async function dismissConsent(page: Page) {
  const dialog = page.getByRole('dialog', { name: /Analytics consent/i })
  const accept = page.getByRole('button', { name: /^Accept$/i })
  try {
    await dialog.waitFor({ state: 'visible', timeout: 4_000 })
    await accept.click({ force: true })
    await dialog.waitFor({ state: 'hidden', timeout: 8_000 })
  } catch {
    if (await accept.isVisible().catch(() => false)) {
      await accept.click({ force: true })
    }
  }
}

test('homepage defers Instagram until the feed is near the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 480 })
  const instagramCalls: string[] = []
  page.on('request', (req) => {
    if (req.url().includes('/api/instagram/media')) instagramCalls.push(req.url())
  })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await dismissConsent(page)
  await page.waitForTimeout(800)
  expect(instagramCalls, 'Instagram API should not fire on first paint').toEqual([])
})

test('vault play uses same-origin media or R2, never a tunnel', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('analytics_consent', 'granted')
  })
  const audioUrls: string[] = []
  const resolveSources: string[] = []
  page.on('request', (req) => {
    const url = req.url()
    const resource = req.resourceType()
    if (url.includes('/api/audio/resolve')) return
    if (resource === 'media' || url.includes('/api/audio/media/') || /r2\.cloudflarestorage\.com/i.test(url)) {
      audioUrls.push(url)
    }
  })
  page.on('response', async (res) => {
    if (!res.url().includes('/api/audio/resolve') || !res.ok()) return
    try {
      const data = await res.json()
      if (data?.source) resolveSources.push(String(data.source))
      if (Array.isArray(data?.results)) {
        for (const item of data.results) {
          if (item?.source) resolveSources.push(String(item.source))
        }
      }
    } catch {
      /* ignore */
    }
  })

  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await unlockVault(page)
  await page.goto('/music-library', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: /SERGIK Music Vault/i })).toBeVisible({
    timeout: 60_000,
  })
  await dismissConsent(page)
  await dismissConsent(page)

  await page.getByRole('button', { name: /^Songs$/i }).click({ force: true })
  const trackRow = page.getByRole('row', { name: /Dmn8r|FTP 2|One Of Those Nights/i }).first()
  await expect(trackRow).toBeVisible({ timeout: 45_000 })
  await trackRow.dblclick()

  await expect
    .poll(() => audioUrls.length + resolveSources.length, { timeout: 45_000 })
    .toBeGreaterThan(0)

  const joined = [...audioUrls, ...resolveSources].join('\n')
  expect(joined, joined).not.toMatch(/trycloudflare|ngrok/i)
  const proxyHit = audioUrls.some((url) => url.includes('/api/audio/media/'))
  const edgeHit = audioUrls.some((url) => /r2\.cloudflarestorage\.com|\.r2\.dev/i.test(url))
  expect(
    proxyHit || edgeHit,
    `expected same-origin media proxy (or R2) playback, saw:\n${joined}`,
  ).toBeTruthy()
})
