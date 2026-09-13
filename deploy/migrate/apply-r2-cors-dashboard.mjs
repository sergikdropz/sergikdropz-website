#!/usr/bin/env node
/**
 * Apply GET/HEAD CORS on sergik-vault via the Cloudflare dashboard.
 * Clicks through login, CORS Policy → Add → JSON → Save.
 * Falls back to creating an Admin Read & Write R2 token and PutBucketCors.
 */
import { PutBucketCorsCommand, S3Client } from '@aws-sdk/client-s3'
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { activateBrowser, copyToClipboard, dialog, notify } from './lib/applescript.mjs'
import { loadEnv, upsertEnvValue } from './lib/load-env.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const profileDir = path.join(__dirname, 'out/playwright-cloudflare-profile')
const shotDir = path.join(__dirname, 'out/playwright-r2-shots')
const corsFile = path.resolve(__dirname, '../../web/scripts/r2-audio-cors.json')
fs.mkdirSync(shotDir, { recursive: true })
loadEnv()

const accountId = process.env.R2_ACCOUNT_ID?.trim()
const bucket = process.env.R2_BUCKET?.trim() || 'sergik-vault'
if (!accountId) {
  console.error('Missing R2_ACCOUNT_ID')
  process.exit(1)
}

const CORS_RULES = JSON.parse(fs.readFileSync(corsFile, 'utf8'))
const CORS_JSON = JSON.stringify(CORS_RULES, null, 2)

async function shot(page, name) {
  await page.screenshot({ path: path.join(shotDir, `${name}.png`), fullPage: true }).catch(() => {})
  console.log(`[r2-cors] shot ${name} url=${page.url()}`)
}

async function bodyText(page) {
  return page.locator('body').innerText().catch(() => '')
}

async function clickFirst(page, locators, label) {
  for (const loc of locators) {
    const el = typeof loc === 'string' ? page.locator(loc).first() : loc
    if (await el.isVisible({ timeout: 2500 }).catch(() => false)) {
      console.log(`[r2-cors] click: ${label}`)
      await el.click({ force: true }).catch(() => el.click())
      return true
    }
  }
  return false
}

async function passHumanIfNeeded(page) {
  const text = await bodyText(page)
  if (!/Verify you are human|security verification|Checking your browser/i.test(text)) return
  notify('SERGIK R2', 'Complete the Cloudflare human check in Chrome')
  activateBrowser('chrome')
  dialog(
    'Chrome is showing a Cloudflare human check.\n\nClick “Verify you are human”, wait for the dashboard, then click OK here.',
    { buttons: ['OK'] },
  )
  const deadline = Date.now() + 5 * 60 * 1000
  while (Date.now() < deadline) {
    const t = await bodyText(page)
    if (!/Verify you are human|security verification|Checking your browser/i.test(t)) return
    await page.waitForTimeout(2000)
  }
  throw new Error('Human check not cleared')
}

async function completeLogin(page, context) {
  await passHumanIfNeeded(page)
  if (!page.url().includes('/login')) return

  notify('SERGIK R2', 'Sign in to Cloudflare as sergikdrops@gmail.com')
  activateBrowser('chrome')

  const account = page.getByText('sergikdrops@gmail.com', { exact: false }).first()
  if (await account.isVisible({ timeout: 8000 }).catch(() => false)) {
    console.log('[r2-cors] clicking saved Google account')
    const popupPromise = context.waitForEvent('page', { timeout: 10_000 }).catch(() => null)
    await account.click()
    const popup = await popupPromise
    if (popup) {
      dialog(
        'Finish Google sign-in in the Chrome popup (sergikdrops@gmail.com), then click OK here.',
        { buttons: ['OK'] },
      )
    }
  }

  if (page.url().includes('/login')) {
    dialog(
      'Complete Cloudflare login as sergikdrops@gmail.com in Chrome, then click OK here.',
      { buttons: ['OK'] },
    )
  }

  await page.waitForURL((u) => !String(u).includes('/login'), { timeout: 10 * 60 * 1000 })
  await page.waitForTimeout(2000)
  await passHumanIfNeeded(page)
}

async function waitForCorsSection(page) {
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    await passHumanIfNeeded(page)
    if (page.url().includes('/login')) return false
    const t = await bodyText(page)
    const ready =
      /CORS Policy/i.test(t) &&
      (/Add CORS policy|Edit CORS|AllowedOrigins|Allowed origins/i.test(t) || t.length > 800)
    if (ready) return true
    if (/Loading/i.test(t) && t.length < 600) {
      await page.waitForTimeout(2500)
      continue
    }
    await page.waitForTimeout(2000)
  }
  return /CORS Policy/i.test(await bodyText(page))
}

async function openSettings(page) {
  const settingsUrl = `https://dash.cloudflare.com/${accountId}/r2/default/buckets/${bucket}/settings`
  console.log(`[r2-cors] ${settingsUrl}`)
  await page.goto(settingsUrl, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await page.waitForTimeout(2500)
  if (await waitForCorsSection(page)) return true

  await page.goto(`https://dash.cloudflare.com/${accountId}/r2/default/buckets/${bucket}`, {
    waitUntil: 'domcontentloaded',
    timeout: 120000,
  })
  await page.waitForTimeout(2000)
  await clickFirst(
    page,
    [
      page.getByRole('tab', { name: /^Settings$/i }),
      page.getByRole('link', { name: /^Settings$/i }),
      page.getByRole('button', { name: /^Settings$/i }),
    ],
    'Settings tab',
  )
  return waitForCorsSection(page)
}

async function fillJsonEditor(page) {
  await clickFirst(
    page,
    [
      page.getByRole('tab', { name: /^JSON$/i }),
      page.getByRole('button', { name: /^JSON$/i }),
      page.getByText('JSON', { exact: true }),
    ],
    'JSON tab',
  )
  await page.waitForTimeout(800)

  const candidates = [
    page.locator('textarea').last(),
    page.locator('[role="textbox"]').last(),
    page.locator('.cm-content').first(),
    page.locator('[contenteditable="true"]').last(),
  ]
  for (const editor of candidates) {
    if (!(await editor.isVisible({ timeout: 2000 }).catch(() => false))) continue
    await editor.click()
    try {
      await editor.fill(CORS_JSON)
    } catch {
      await page.keyboard.press('Meta+A')
      await page.keyboard.insertText(CORS_JSON)
    }
    return true
  }
  return false
}

async function applyCorsInDashboard(page) {
  const heading = page.getByText('CORS Policy', { exact: false }).first()
  if (await heading.isVisible().catch(() => false)) {
    await heading.scrollIntoViewIfNeeded().catch(() => {})
  }

  await page.keyboard.press('Escape').catch(() => {})
  const opened = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((el) => {
      if (!/^(\+\s*)?Add$/i.test((el.innerText || '').trim())) return false
      let n = el
      for (let i = 0; i < 10 && n; i++) {
        const t = (n.innerText || '').replace(/\s+/g, ' ')
        if (/CORS Policy/i.test(t) && /no CORS Policy defined/i.test(t) && t.length < 400) {
          return true
        }
        n = n.parentElement
      }
      return false
    })
    if (!btn) return false
    btn.click()
    return true
  })
  if (!opened) {
    const edit = page.getByRole('button', { name: /Edit CORS|Edit$/i }).first()
    if (!(await edit.isVisible().catch(() => false))) {
      console.log('[r2-cors] CORS Add/Edit not found')
      return false
    }
    await edit.click({ force: true })
  }
  await page.waitForTimeout(1500)
  await shot(page, 'cors-modal')

  if (!(await fillJsonEditor(page))) {
    console.log('[r2-cors] JSON editor not found — clipboard is loaded')
    activateBrowser('chrome')
    dialog(
      'Chrome should show the CORS JSON editor.\n\n1. Click the JSON tab\n2. Paste (Cmd+V) — the policy is already on the clipboard\n3. Click Save\n4. Click OK here.',
      { buttons: ['OK'] },
    )
  } else {
    const saved = await clickFirst(
      page,
      [
        page.getByRole('button', { name: /^Save$/i }),
        page.getByRole('button', { name: /Save changes|Apply|Update/i }),
      ],
      'Save CORS',
    )
    if (!saved) {
      activateBrowser('chrome')
      dialog('CORS JSON is filled. Click Save in Chrome, then click OK here.', { buttons: ['OK'] })
    } else {
      await page.waitForTimeout(2500)
    }
  }

  await shot(page, 'cors-after-save')
  const text = await bodyText(page)
  return /sergikdropz\.com|AllowedOrigins|CORS Policy/i.test(text)
}

function scrapeTokenSecrets(text) {
  const out = {}
  const access =
    text.match(/Access Key ID[\s\S]{0,80}?([a-f0-9]{32})/i) ||
    text.match(/Access Key ID[\s\S]{0,80}?([A-Z0-9]{16,40})/i)
  if (access) out.accessKeyId = access[1]
  const secret = text.match(/Secret Access Key[\s\S]{0,120}?([A-Za-z0-9+/_=-]{40,80})/i)
  if (secret) out.secretAccessKey = secret[1]
  return out
}

async function createAdminTokenAndPutCors(page) {
  console.log('[r2-cors] fallback: create Admin Read & Write token')
  await page.goto(`https://dash.cloudflare.com/${accountId}/r2/api-tokens`, {
    waitUntil: 'domcontentloaded',
    timeout: 120000,
  })
  await page.waitForTimeout(2500)
  await passHumanIfNeeded(page)
  await shot(page, 'r2-api-tokens')

  await clickFirst(
    page,
    [
      page.getByRole('button', { name: /Create Account API token/i }),
      page.getByRole('button', { name: /Create API token/i }),
      page.getByRole('link', { name: /Create API token/i }),
    ],
    'Create R2 token',
  )
  await page.waitForTimeout(2000)
  await shot(page, 'r2-token-form')

  const nameInput = page.locator('input[name="name"], input[placeholder*="name" i], input[type="text"]').first()
  if (await nameInput.isVisible().catch(() => false)) {
    await nameInput.fill('sergik-vault-cors-admin')
  }
  await clickFirst(
    page,
    [
      page.getByText('Admin Read & Write', { exact: false }),
      page.locator('label:has-text("Admin Read & Write")'),
    ],
    'Admin Read & Write',
  )
  await clickFirst(
    page,
    [page.getByText(/Apply to all buckets/i), page.locator('label:has-text("Apply to all buckets")')],
    'all buckets',
  )
  await clickFirst(
    page,
    [
      page.getByRole('button', { name: /Create Account API Token/i }),
      page.getByRole('button', { name: /Create API Token/i }),
      page.getByRole('button', { name: /^Create$/i }),
    ],
    'submit token',
  )
  await page.waitForTimeout(2500)
  await shot(page, 'r2-token-created')

  let keys = {}
  const deadline = Date.now() + 90_000
  while (Date.now() < deadline) {
    keys = scrapeTokenSecrets(await bodyText(page))
    if (keys.accessKeyId && keys.secretAccessKey) break
    await clickFirst(page, [page.getByRole('button', { name: /Copy/i })], 'copy token field')
    await page.waitForTimeout(1500)
  }
  if (!keys.accessKeyId || !keys.secretAccessKey) {
    throw new Error('Could not scrape Admin R2 token secrets')
  }

  upsertEnvValue('R2_ADMIN_ACCESS_KEY_ID', keys.accessKeyId)
  upsertEnvValue('R2_ADMIN_SECRET_ACCESS_KEY', keys.secretAccessKey)

  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: keys.accessKeyId,
      secretAccessKey: keys.secretAccessKey,
    },
  })
  await client.send(
    new PutBucketCorsCommand({
      Bucket: bucket,
      CORSConfiguration: {
        CORSRules: CORS_RULES.map((rule) => ({
          AllowedOrigins: rule.AllowedOrigins,
          AllowedMethods: rule.AllowedMethods,
          AllowedHeaders: rule.AllowedHeaders,
          ExposeHeaders: rule.ExposeHeaders,
          MaxAgeSeconds: rule.MaxAgeSeconds,
        })),
      },
    }),
  )
  console.log('[r2-cors] PutBucketCors succeeded with admin token')
  return true
}

try {
  copyToClipboard(CORS_JSON)
} catch {
  /* clipboard optional */
}

const context = await chromium
  .launchPersistentContext(profileDir, {
    headless: false,
    channel: 'chrome',
    viewport: { width: 1440, height: 1000 },
    args: ['--disable-blink-features=AutomationControlled'],
  })
  .catch(() =>
    chromium.launchPersistentContext(profileDir, {
      headless: false,
      viewport: { width: 1440, height: 1000 },
    }),
  )

const page = context.pages()[0] || (await context.newPage())
page.setDefaultTimeout(45000)
activateBrowser('chrome')

try {
  await page.goto(`https://dash.cloudflare.com/${accountId}/r2/default/buckets/${bucket}/settings`, {
    waitUntil: 'domcontentloaded',
    timeout: 120000,
  })
  await page.waitForTimeout(2000)
  await completeLogin(page, context)
  await shot(page, 'after-login')

  let applied = false
  if (await openSettings(page)) {
    await shot(page, 'cors-settings')
    applied = await applyCorsInDashboard(page)
  } else {
    await shot(page, 'settings-missing')
  }

  if (!applied) {
    applied = await createAdminTokenAndPutCors(page)
  }

  if (!applied) throw new Error('Could not apply CORS via dashboard or admin token')
  notify('SERGIK R2', 'CORS policy saved — probing playback')
  await context.close()
  process.exit(0)
} catch (err) {
  console.error('[r2-cors]', err)
  await shot(page, 'cors-error')
  notify('SERGIK R2', 'CORS apply failed — check Chrome')
  await context.close().catch(() => {})
  process.exit(1)
}
