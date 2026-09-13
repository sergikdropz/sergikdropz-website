#!/usr/bin/env node
/**
 * Enable Public Development URL (r2.dev) on sergik-vault via Playwright.
 * Pauses for Cloudflare "Verify you are human" if shown.
 */
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { activateBrowser, dialog, notify } from './lib/applescript.mjs'
import { loadEnv, requiredEnv, upsertEnvValue } from './lib/load-env.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const profileDir = path.join(__dirname, 'out/playwright-cloudflare-profile')
const shotDir = path.join(__dirname, 'out/playwright-r2-shots')
fs.mkdirSync(shotDir, { recursive: true })
loadEnv({ required: true })

const accountId = requiredEnv('R2_ACCOUNT_ID')
const bucket = requiredEnv('R2_BUCKET')

async function shot(page, name) {
  await page.screenshot({ path: path.join(shotDir, `${name}.png`), fullPage: true }).catch(() => {})
  console.log(`[r2-public] shot ${name}`)
}

function findPublicBase(text) {
  const m = text.match(/(https:\/\/pub-[a-f0-9]+\.r2\.dev)/i) || text.match(/\b(pub-[a-f0-9]+\.r2\.dev)\b/i)
  if (!m) return null
  return m[1].startsWith('http') ? m[1] : `https://${m[1]}`
}

async function passBotCheck(page) {
  const body = await page.locator('body').innerText().catch(() => '')
  if (!/Verify you are human|security verification|Checking your browser/i.test(body)) return
  notify('SERGIK R2', 'Click “Verify you are human” in Chrome')
  activateBrowser('chrome')
  dialog('Cloudflare needs a human check.\n\nIn Chrome: click “Verify you are human”, wait for Settings to load, then click OK here.', {
    buttons: ['OK'],
  })
  const deadline = Date.now() + 5 * 60 * 1000
  while (Date.now() < deadline) {
    const t = await page.locator('body').innerText().catch(() => '')
    if (!/Verify you are human|security verification|Checking your browser/i.test(t)) return
    await page.waitForTimeout(2000)
  }
  throw new Error('Bot check not cleared')
}

const context = await chromium.launchPersistentContext(profileDir, {
  headless: false,
  channel: 'chrome',
  viewport: { width: 1440, height: 1000 },
}).catch(() =>
  chromium.launchPersistentContext(profileDir, { headless: false, viewport: { width: 1440, height: 1000 } }),
)

const page = context.pages()[0] || (await context.newPage())
page.setDefaultTimeout(45000)
activateBrowser('chrome')

try {
  const url = `https://dash.cloudflare.com/${accountId}/r2/default/buckets/${bucket}/settings`
  console.log(`[r2-public] ${url}`)
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await page.waitForTimeout(3000)
  await passBotCheck(page)
  await page.waitForTimeout(2000)
  await shot(page, 'public-a-settings')

  // If already enabled, grab URL and exit
  let base = findPublicBase(await page.locator('body').innerText())
  if (base) {
    upsertEnvValue('R2_PUBLIC_BASE_URL', base.replace(/\/+$/, ''))
    console.log(`[r2-public] already enabled → ${base}`)
    await context.close()
    process.exit(0)
  }

  notify('SERGIK R2', 'Enable Public Development URL in Chrome, then OK')
  activateBrowser('chrome')
  dialog(
    'In Chrome bucket Settings:\n1. Find “Public Development URL”\n2. Click Enable / Allow Access\n3. Confirm the modal\n4. Copy appears as pub-….r2.dev\n\nClick OK here when the public URL is visible.',
    { buttons: ['OK'] },
  )

  // Also try automated click after user may have scrolled
  const heading = page.getByText('Public Development URL', { exact: false }).first()
  if (await heading.isVisible({ timeout: 5000 }).catch(() => false)) {
    await heading.scrollIntoViewIfNeeded().catch(() => {})
  }
  const enableBtn = page
    .locator('div, section')
    .filter({ hasText: /Public Development URL/i })
    .getByRole('button', { name: /enable|allow access/i })
    .first()
  if (await enableBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await enableBtn.click({ force: true }).catch(() => {})
    await page.waitForTimeout(1000)
    const confirm = page.getByRole('button', { name: /allow access|enable|confirm/i }).last()
    if (await confirm.isVisible({ timeout: 3000 }).catch(() => false)) {
      await confirm.click({ force: true }).catch(() => {})
    }
  }

  const deadline = Date.now() + 5 * 60 * 1000
  while (Date.now() < deadline) {
    base = findPublicBase(await page.locator('body').innerText())
    if (!base) {
      const link = page.locator('a[href*="r2.dev"]').first()
      if (await link.isVisible().catch(() => false)) base = await link.getAttribute('href')
    }
    if (base) break
    await page.waitForTimeout(2000)
  }

  await shot(page, 'public-c-after')
  if (!base) {
    console.error('[r2-public] Public URL not found — enable it in Settings and re-run npm run r2:production:finish')
    await context.close()
    process.exit(2)
  }

  upsertEnvValue('R2_PUBLIC_BASE_URL', base.replace(/\/+$/, ''))
  console.log(`[r2-public] R2_PUBLIC_BASE_URL=${base}`)
  notify('SERGIK R2', 'Public URL saved — finishing cutover')
  await context.close()
  process.exit(0)
} catch (err) {
  console.error(err)
  await shot(page, 'public-error2').catch(() => {})
  await context.close().catch(() => {})
  process.exit(1)
}
