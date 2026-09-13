#!/usr/bin/env node
/**
 * Fully automatic Playwright R2 setup (no paste dialogs).
 * Fills Object Read & Write token form, scrapes keys, creates CF API token,
 * writes deploy/migrate/.env.
 *
 * Usage: node playwright-cloudflare-r2.mjs [--bucket=sergik-vault]
 */
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { activateBrowser, notify } from './lib/applescript.mjs'
import { upsertEnvValue, loadEnv } from './lib/load-env.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(__dirname, 'out')
const profileDir = path.join(outDir, 'playwright-cloudflare-profile')
const shotDir = path.join(outDir, 'playwright-r2-shots')
const statusPath = path.join(outDir, 'playwright-r2-status.json')
const envPath = path.join(__dirname, '.env')

const bucketName = process.argv.find((a) => a.startsWith('--bucket='))?.split('=')[1] || 'sergik-vault'

fs.mkdirSync(shotDir, { recursive: true })
fs.mkdirSync(profileDir, { recursive: true })
loadEnv()

function writeStatus(payload) {
  const body = { ...payload, updatedAt: new Date().toISOString() }
  fs.writeFileSync(statusPath, JSON.stringify(body, null, 2))
  console.log('[r2-pw]', JSON.stringify(body))
}

async function shot(page, name) {
  const file = path.join(shotDir, `${name}.png`)
  await page.screenshot({ path: file, fullPage: true }).catch(() => {})
  console.log(`[r2-pw] screenshot → ${file}`)
}

async function clickFirst(page, selectors, label, { force = false } = {}) {
  for (const sel of selectors) {
    const loc = page.locator(sel).first()
    if (await loc.isVisible({ timeout: 2500 }).catch(() => false)) {
      console.log(`[r2-pw] click: ${label} (${sel})`)
      try {
        await loc.click({ timeout: 12000, force })
      } catch {
        await loc.click({ timeout: 12000, force: true })
      }
      return true
    }
  }
  return false
}

function accountIdFromUrl(url) {
  const m = String(url).match(/dash\.cloudflare\.com\/([a-f0-9]{32})\//i)
  return m?.[1] || null
}

function scrapeSecrets(text) {
  const out = {}
  const account = text.match(/(?:Account ID|account_id)[\s:\n]*([a-f0-9]{32})/i)
  if (account) out.R2_ACCOUNT_ID = account[1]

  // Access Key ID is typically 32 hex chars shown near the label
  const access =
    text.match(/Access Key ID[\s\S]{0,80}?([a-f0-9]{32})/i) ||
    text.match(/Access Key ID[\s\S]{0,80}?([A-Z0-9]{16,40})/i)
  if (access) out.R2_ACCESS_KEY_ID = access[1]

  // Secret Access Key is longer base64-ish
  const secret =
    text.match(/Secret Access Key[\s\S]{0,120}?([A-Za-z0-9+/_=-]{32,80})/i) ||
    text.match(/Secret[\s\S]{0,40}?([A-Za-z0-9+/_=-]{40,80})/i)
  if (secret && secret[1] !== out.R2_ACCESS_KEY_ID) out.R2_SECRET_ACCESS_KEY = secret[1]

  // Cloudflare API token (often starts with letter, ~40+ chars)
  const api =
    text.match(/(?:API Token|Token value|Your API Token)[\s\S]{0,80}?([A-Za-z0-9_-]{35,})/i) ||
    text.match(/\b([A-Za-z0-9_-]{40,})\b/)
  if (api && !/^[a-f0-9]{32}$/i.test(api[1])) out.CLOUDFLARE_API_TOKEN = api[1]

  const r2dev = text.match(/(https:\/\/pub-[a-f0-9]+\.r2\.dev)/i) || text.match(/\b(pub-[a-f0-9]+\.r2\.dev)\b/i)
  if (r2dev) out.R2_PUBLIC_BASE_URL = r2dev[1].startsWith('http') ? r2dev[1] : `https://${r2dev[1]}`
  return out
}

async function scrapeFromInputs(page) {
  const out = {}
  const inputs = page.locator('input, textarea, code, pre, [data-testid*="token"], [data-testid*="secret"]')
  const n = await inputs.count().catch(() => 0)
  for (let i = 0; i < n; i++) {
    const el = inputs.nth(i)
    const val =
      (await el.inputValue().catch(() => '')) ||
      (await el.innerText().catch(() => '')) ||
      (await el.getAttribute('value').catch(() => '')) ||
      ''
    const v = String(val).trim()
    if (!v || v.length < 16) continue
    const label = ((await el.getAttribute('aria-label').catch(() => '')) ||
      (await el.getAttribute('name').catch(() => '')) ||
      (await el.evaluate((node) => node.closest('label,div,section')?.innerText?.slice(0, 80) || '').catch(() => '')) ||
      ''
    ).toLowerCase()
    if (/access key id|access.key.id/.test(label) && !out.R2_ACCESS_KEY_ID) out.R2_ACCESS_KEY_ID = v
    else if (/secret/.test(label) && !out.R2_SECRET_ACCESS_KEY) out.R2_SECRET_ACCESS_KEY = v
    else if (/api token|token value/.test(label) && !out.CLOUDFLARE_API_TOKEN) out.CLOUDFLARE_API_TOKEN = v
  }
  return out
}

async function scrapeAll(page, collected) {
  const text = await page.locator('body').innerText().catch(() => '')
  Object.assign(collected, scrapeSecrets(text), await scrapeFromInputs(page))
}

function writeEnv(vars) {
  if (!fs.existsSync(envPath)) fs.copyFileSync(path.join(__dirname, '.env.example'), envPath)
  upsertEnvValue('R2_BUCKET', bucketName)
  for (const k of [
    'R2_ACCOUNT_ID',
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
    'CLOUDFLARE_API_TOKEN',
    'R2_PUBLIC_BASE_URL',
  ]) {
    if (vars[k]) upsertEnvValue(k, vars[k])
  }
  console.log(
    '[r2-pw] wrote keys:',
    Object.keys(vars).filter((k) => vars[k]),
  )
}

async function waitForLogin(page) {
  if (!page.url().includes('/login')) return
  writeStatus({ phase: 'login_required', ok: false })
  notify('SERGIK R2', 'Log in to Cloudflare in Chrome if needed.')
  activateBrowser('chrome')
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 10 * 60 * 1000 })
}

/** Auto-fill R2 Account API Token form: Object Read & Write + all buckets. */
async function autofillR2TokenForm(page) {
  console.log('[r2-pw] auto-filling R2 token form…')

  // Token name
  const nameInput = page.locator('input[name="name"], input[placeholder*="name" i], input[type="text"]').first()
  if (await nameInput.isVisible().catch(() => false)) {
    await nameInput.fill('sergik-vault-rw')
  }

  // Permissions — Object Read & Write (NOT read only)
  const selected =
    (await clickFirst(
      page,
      [
        'label:has-text("Object Read & Write")',
        'text=Object Read & Write',
        '[role="radio"]:has-text("Object Read & Write")',
        'input[value*="object-read-write" i]',
      ],
      'Object Read & Write',
      { force: true },
    )) ||
    (await page.getByText('Object Read & Write', { exact: false }).first().click({ force: true }).then(() => true).catch(() => false))

  if (!selected) console.log('[r2-pw] warn: could not click Object Read & Write — check form')

  // Apply to all buckets
  await clickFirst(
    page,
    [
      'label:has-text("Apply to all buckets")',
      'text=Apply to all buckets in this account',
      'text=Apply to all buckets',
    ],
    'all buckets',
    { force: true },
  )

  await shot(page, '06a-r2-form-filled')

  // Create
  const created = await clickFirst(
    page,
    [
      'button:has-text("Create Account API Token")',
      'button:has-text("Create API Token")',
      'button:has-text("Create token")',
      'button:has-text("Create")',
    ],
    'create token submit',
    { force: true },
  )
  if (!created) throw new Error('Could not submit R2 token form')
  await page.waitForTimeout(2500)
}

async function createCloudflareApiToken(page, collected) {
  console.log('[r2-pw] creating Cloudflare API token (Edit R2)…')
  await page.goto('https://dash.cloudflare.com/profile/api-tokens', {
    waitUntil: 'domcontentloaded',
    timeout: 90000,
  })
  await page.waitForTimeout(2000)
  await shot(page, '07-api-tokens')

  await clickFirst(
    page,
    ['button:has-text("Create Token")', 'a:has-text("Create Token")', 'text=Create Token'],
    'create cf token',
  )
  await page.waitForTimeout(1500)

  // Prefer template
  const usedTemplate = await clickFirst(
    page,
    [
      'button:has-text("Use template"):near(:text("Edit Cloudflare R2"))',
      'text=Edit Cloudflare R2',
      'a:has-text("Edit Cloudflare R2")',
    ],
    'Edit Cloudflare R2 template',
  )

  if (!usedTemplate) {
    // Custom token path
    await clickFirst(page, ['text=Create Custom Token', 'text=Get started', 'button:has-text("Get started")'], 'custom token')
    await page.waitForTimeout(1000)
    // Try to set Account → Cloudflare R2 → Edit via selects if present
    await clickFirst(page, ['text=Cloudflare R2', 'option:has-text("Cloudflare R2")'], 'permission R2')
    await clickFirst(page, ['text=Edit', 'option:has-text("Edit")'], 'permission Edit')
  }

  await page.waitForTimeout(1000)
  await clickFirst(
    page,
    [
      'button:has-text("Continue to summary")',
      'button:has-text("Continue")',
      'button:has-text("Next")',
    ],
    'continue summary',
  )
  await page.waitForTimeout(1000)
  await clickFirst(
    page,
    ['button:has-text("Create Token")', 'button:has-text("Create token")', 'button[type="submit"]'],
    'confirm create token',
    { force: true },
  )
  await page.waitForTimeout(2500)
  await shot(page, '08-cf-token-created')

  const deadline = Date.now() + 90_000
  while (Date.now() < deadline) {
    await scrapeAll(page, collected)
    if (collected.CLOUDFLARE_API_TOKEN) break
    // Click any "Copy" near token
    await clickFirst(page, ['button:has-text("Copy")', '[aria-label*="Copy" i]'], 'copy token').catch(() => false)
    await page.waitForTimeout(1500)
  }
}

async function main() {
  writeStatus({ phase: 'launch', ok: false, bucket: bucketName, mode: 'autofill' })
  notify('SERGIK R2', 'Auto-filling Cloudflare R2 credentials…')
  console.log('[r2-pw] Autofill mode — no paste dialogs')

  let context
  try {
    context = await chromium.launchPersistentContext(profileDir, {
      headless: false,
      channel: 'chrome',
      viewport: { width: 1440, height: 920 },
      args: ['--disable-blink-features=AutomationControlled'],
    })
  } catch {
    context = await chromium.launchPersistentContext(profileDir, {
      headless: false,
      viewport: { width: 1440, height: 920 },
    })
  }

  const page = context.pages()[0] || (await context.newPage())
  page.setDefaultTimeout(45000)
  activateBrowser('chrome')

  // Seed from existing .env (account id already known)
  const collected = {
    R2_BUCKET: bucketName,
    R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID || undefined,
  }

  try {
    await page.goto('https://dash.cloudflare.com/?to=/:account/r2/overview', {
      waitUntil: 'domcontentloaded',
      timeout: 90000,
    })
    await page.waitForTimeout(2500)
    await waitForLogin(page)
    await shot(page, '01-r2-overview')

    collected.R2_ACCOUNT_ID =
      collected.R2_ACCOUNT_ID || accountIdFromUrl(page.url()) || scrapeSecrets(await page.locator('body').innerText()).R2_ACCOUNT_ID
    if (!collected.R2_ACCOUNT_ID) throw new Error('Could not resolve Cloudflare Account ID from URL')

    console.log(`[r2-pw] account=${collected.R2_ACCOUNT_ID.slice(0, 8)}… bucket=${bucketName}`)

    // Ensure public access enabled (best-effort)
    await page.goto(
      `https://dash.cloudflare.com/${collected.R2_ACCOUNT_ID}/r2/default/buckets/${bucketName}/settings`,
      { waitUntil: 'domcontentloaded', timeout: 90000 },
    )
    await page.waitForTimeout(2000)
    await clickFirst(
      page,
      ['button:has-text("Allow Access")', 'button:has-text("Enable")', 'text=Public Development URL'],
      'public access',
      { force: true },
    )
    await clickFirst(
      page,
      ['button:has-text("Allow Access")', 'button:has-text("Confirm")', 'button:has-text("Enable")'],
      'confirm public',
      { force: true },
    )
    await page.waitForTimeout(1500)
    await scrapeAll(page, collected)
    await shot(page, '04-public-access')

    // Create R2 S3 credentials
    if (!collected.R2_ACCESS_KEY_ID || !collected.R2_SECRET_ACCESS_KEY) {
      await page.goto(`https://dash.cloudflare.com/${collected.R2_ACCOUNT_ID}/r2/api-tokens`, {
        waitUntil: 'domcontentloaded',
        timeout: 90000,
      })
      await page.waitForTimeout(2000)
      await shot(page, '05-r2-api-tokens')

      await clickFirst(
        page,
        [
          'button:has-text("Create Account API token")',
          'button:has-text("Create API token")',
          'a:has-text("Create API token")',
          'text=Create API token',
        ],
        'open create r2 token',
      )
      await page.waitForTimeout(2000)
      await shot(page, '06-r2-token-form')

      await autofillR2TokenForm(page)
      await shot(page, '06b-r2-token-created')

      const deadline = Date.now() + 120_000
      while (Date.now() < deadline) {
        await scrapeAll(page, collected)
        if (collected.R2_ACCESS_KEY_ID && collected.R2_SECRET_ACCESS_KEY) break
        await clickFirst(page, ['button:has-text("Copy")', '[aria-label*="Copy" i]'], 'copy secret').catch(() => false)
        await page.waitForTimeout(1500)
      }
    }

    if (!collected.CLOUDFLARE_API_TOKEN) {
      await createCloudflareApiToken(page, collected)
    }

    writeEnv(collected)

    const missing = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'CLOUDFLARE_API_TOKEN'].filter(
      (k) => !collected[k],
    )
    if (missing.length) {
      writeStatus({ phase: 'credentials_incomplete', ok: false, missing })
      notify('SERGIK R2', `Still missing: ${missing.join(', ')}`)
      console.error('[r2-pw] incomplete:', missing.join(', '))
      await context.close()
      process.exit(2)
    }

    writeStatus({ phase: 'ready', ok: true, bucket: bucketName, publicBase: collected.R2_PUBLIC_BASE_URL || null })
    notify('SERGIK R2', 'Credentials auto-filled. Starting upload…')
    console.log('[r2-pw] ready → deploy/migrate/.env')
    await page.waitForTimeout(1000)
    await context.close()
    process.exit(0)
  } catch (err) {
    await shot(page, 'error').catch(() => {})
    writeStatus({ phase: 'error', ok: false, error: err instanceof Error ? err.message : String(err) })
    notify('SERGIK R2', 'Autofill error — check screenshots')
    await context.close().catch(() => {})
    process.exit(1)
  }
}

main()
