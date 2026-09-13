#!/usr/bin/env node
/**
 * Copy production Stripe + fan-vault secrets from the Vercel dashboard
 * into web/.env.local. Values are never logged.
 */
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const profileDir = path.join(__dirname, 'out/playwright-vercel-profile')
const webEnv = path.resolve(__dirname, '../../web/.env.local')
const ENV_URL =
  'https://vercel.com/jordan-cabogas-projects/sergikdropz-website/settings/environment-variables'

const WANTED = [
  'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'FAN_VAULT_UNLOCK_SECRET',
]

function parseEnv(text) {
  const env = {}
  for (const line of text.split(/\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#') || !t.includes('=')) continue
    const i = t.indexOf('=')
    let v = t.slice(i + 1).trim()
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1)
    }
    env[t.slice(0, i).trim()] = v
  }
  return env
}

function upsertEnv(file, updates) {
  let text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
  if (text && !text.endsWith('\n')) text += '\n'
  const done = []
  for (const [k, val] of Object.entries(updates)) {
    if (!val) continue
    if (new RegExp(`^${k}=`, 'm').test(text)) {
      text = text.replace(new RegExp(`^${k}=.*$`, 'm'), `${k}=${val}`)
      done.push(`updated ${k}`)
    } else {
      text += `${k}=${val}\n`
      done.push(`added ${k}`)
    }
  }
  fs.writeFileSync(file, text)
  return done
}

async function revealFromUi(page) {
  const found = {}
  const body = await page.locator('body').innerText()
  for (const key of WANTED) {
    if (!body.includes(key)) {
      console.log(`[pw] row missing: ${key}`)
      continue
    }
  }

  for (const key of WANTED) {
    const row = page.locator('tr, [data-testid], li, div').filter({ hasText: key }).first()
    if (!(await row.count())) {
      console.log(`[pw] no locator: ${key}`)
      continue
    }
    const reveal = row.getByRole('button', { name: /reveal|show|view value/i }).first()
    if (await reveal.isVisible().catch(() => false)) {
      await reveal.click()
      await page.waitForTimeout(400)
    }
    const menu = row.getByRole('button', { name: /menu|more|actions/i }).first()
    if (await menu.isVisible().catch(() => false)) {
      await menu.click()
      const revealItem = page.getByRole('menuitem', { name: /reveal|show/i }).first()
      if (await revealItem.isVisible().catch(() => false)) {
        await revealItem.click()
        await page.waitForTimeout(400)
      }
    }
    const input = row.locator('input, textarea').first()
    let value = ''
    if (await input.count()) {
      value = (await input.inputValue().catch(() => '')) || ''
    }
    if (!value) {
      const text = (await row.innerText().catch(() => '')) || ''
      const m = text.match(/(pk_live_[A-Za-z0-9]+|sk_live_[A-Za-z0-9]+|whsec_[A-Za-z0-9]+)/)
      if (m) value = m[1]
    }
    if (value && value.length > 8 && !/\*{4,}|•{4,}/.test(value)) {
      found[key] = value
      console.log(`[pw] got ${key} len=${value.length}`)
    } else {
      console.log(`[pw] empty ${key}`)
    }
  }
  return found
}

async function main() {
  fs.mkdirSync(profileDir, { recursive: true })
  let context
  try {
    context = await chromium.launchPersistentContext(profileDir, {
      headless: false,
      channel: 'chrome',
      viewport: { width: 1400, height: 900 },
      args: ['--disable-blink-features=AutomationControlled'],
    })
  } catch {
    context = await chromium.launchPersistentContext(profileDir, {
      headless: false,
      viewport: { width: 1400, height: 900 },
    })
  }
  const page = context.pages()[0] || (await context.newPage())
  page.setDefaultTimeout(30000)

  console.log('[pw] Opening Vercel env settings…')
  await page.goto(ENV_URL, { waitUntil: 'domcontentloaded', timeout: 60000 })
  if (page.url().includes('/login')) {
    console.log('[pw] Login required — complete it in the browser window.')
    await page.waitForURL((u) => !u.pathname.includes('/login'), {
      timeout: 5 * 60 * 1000,
    })
    await page.goto(ENV_URL, { waitUntil: 'domcontentloaded' })
  }
  await page.waitForTimeout(4000)
  console.log('[pw] url', page.url())
  const snippet = ((await page.locator('body').innerText().catch(() => '')) || '')
    .replace(/\n+/g, ' ')
    .slice(0, 400)
  console.log('[pw] text', snippet)

  const found = await revealFromUi(page)
  const have = WANTED.filter((k) => found[k])
  console.log(`[pw] revealed ${have.length}/${WANTED.length}`)
  if (have.length) {
    const done = upsertEnv(webEnv, found)
    console.log('[pw] .env.local', done.join(', '))
  }

  await context.close()
  process.exit(have.length === WANTED.length ? 0 : 2)
}

main().catch((err) => {
  console.error('[pw]', err instanceof Error ? err.message : err)
  process.exit(1)
})
