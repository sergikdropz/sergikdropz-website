#!/usr/bin/env node
/**
 * Headed Playwright flow: connect Supabase Pro to Vercel project sergikdropz-website,
 * then emit STATUS for the finish script.
 *
 * Uses a persistent profile so you can stay logged into Vercel once.
 * Billing confirmation may still need one click if Vercel requires it.
 */
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(__dirname, 'out')
const profileDir = path.join(outDir, 'playwright-vercel-profile')
const shotDir = path.join(outDir, 'playwright-shots')
const statusPath = path.join(outDir, 'playwright-vercel-status.json')

fs.mkdirSync(shotDir, { recursive: true })
fs.mkdirSync(profileDir, { recursive: true })

const CHECKOUT =
  'https://vercel.com/jordan-cabogas-projects/~/integrations/checkout/supabase?productSlug=supabase&planId=pro&defaultResourceName=sergik-vault-pro&source=cli&metadata=%7B%22region%22%3A%22sfo1%22%7D&projectSlug=sergikdropz-website'
const STORAGE =
  'https://vercel.com/jordan-cabogas-projects/sergikdropz-website/stores'
const INTEGRATIONS =
  'https://vercel.com/jordan-cabogas-projects/~/integrations'

const timeoutMs = Number(process.env.PW_TIMEOUT_MS || 10 * 60 * 1000)

function writeStatus(payload) {
  const body = { ...payload, updatedAt: new Date().toISOString() }
  fs.writeFileSync(statusPath, JSON.stringify(body, null, 2))
  console.log('[pw]', JSON.stringify(body))
}

async function shot(page, name) {
  const file = path.join(shotDir, `${name}.png`)
  await page.screenshot({ path: file, fullPage: true }).catch(() => {})
  console.log(`[pw] screenshot → ${file}`)
}

async function clickFirst(page, selectors, label) {
  for (const sel of selectors) {
    const loc = page.locator(sel).first()
    if (await loc.isVisible({ timeout: 1500 }).catch(() => false)) {
      console.log(`[pw] click: ${label} (${sel})`)
      await loc.click({ timeout: 10000 })
      return true
    }
  }
  return false
}

async function textIncludes(page, re) {
  const text = await page.locator('body').innerText().catch(() => '')
  return re.test(text)
}

async function main() {
  writeStatus({ phase: 'launch', ok: false })
  console.log('[pw] Launching headed Chromium (persistent Vercel profile)…')
  console.log('[pw] If login is required, complete it in the browser window.')

  // Prefer system Chrome (already on the Mac); fall back to bundled Chromium.
  let context
  try {
    context = await chromium.launchPersistentContext(profileDir, {
      headless: false,
      channel: 'chrome',
      viewport: { width: 1400, height: 900 },
      args: ['--disable-blink-features=AutomationControlled'],
    })
  } catch (chromeErr) {
    console.log('[pw] System Chrome unavailable, trying bundled Chromium…', chromeErr?.message || chromeErr)
    context = await chromium.launchPersistentContext(profileDir, {
      headless: false,
      viewport: { width: 1400, height: 900 },
      args: ['--disable-blink-features=AutomationControlled'],
    })
  }
  const page = context.pages()[0] || (await context.newPage())
  page.setDefaultTimeout(30000)

  try {
    // 1) Check existing stores first
    console.log('[pw] Checking existing Storage resources…')
    await page.goto(STORAGE, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForTimeout(2500)
    await shot(page, '01-stores')

    if (await page.url().includes('/login')) {
      writeStatus({ phase: 'login_required', ok: false, url: page.url() })
      console.log('[pw] Login required — complete Vercel login in the opened window.')
      console.log('[pw] Waiting up to 5 minutes for redirect off /login…')
      await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 5 * 60 * 1000 })
      await page.goto(STORAGE, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(2000)
      await shot(page, '01b-stores-after-login')
    }

    const alreadyHasSupabase =
      (await textIncludes(page, /supabase/i)) &&
      (await textIncludes(page, /sergik-vault|connected|postgres|active/i))

    if (alreadyHasSupabase) {
      writeStatus({ phase: 'already_connected', ok: true, url: page.url() })
      console.log('[pw] Supabase store appears present. Done with browser step.')
      await context.close()
      process.exit(0)
    }

    // 2) Checkout / create
    console.log('[pw] Opening Supabase Pro checkout…')
    await page.goto(CHECKOUT, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForTimeout(3000)
    await shot(page, '02-checkout')

    // Prefer Pro plan if selectable
    await clickFirst(
      page,
      [
        'button:has-text("Pro")',
        '[role="radio"]:has-text("Pro")',
        'label:has-text("Pro")',
        'text=Pro Plan',
      ],
      'select Pro plan',
    )

    // Region sfo1 / San Francisco if shown
    await clickFirst(
      page,
      [
        'button:has-text("San Francisco")',
        'option:has-text("San Francisco")',
        'text=sfo1',
        '[data-value="sfo1"]',
      ],
      'select region',
    )

    // Connect to project
    await clickFirst(
      page,
      [
        'button:has-text("Connect")',
        'button:has-text("Create")',
        'button:has-text("Continue")',
        'button:has-text("Add")',
        'button:has-text("Install")',
        'button:has-text("Confirm")',
        'button:has-text("Subscribe")',
        'button[type="submit"]',
      ],
      'primary CTA',
    )

    await page.waitForTimeout(4000)
    await shot(page, '03-after-cta')

    // Wait for success signals or env vars page
    const deadline = Date.now() + timeoutMs
    let success = false
    while (Date.now() < deadline) {
      const url = page.url()
      const body = await page.locator('body').innerText().catch(() => '')

      if (
        /created successfully|resource created|connected to project|environment variables|sergik-vault-pro/i.test(
          body,
        ) ||
        /\/stores\/|\/storage\//i.test(url)
      ) {
        // Keep clicking through if more CTAs appear
        await clickFirst(
          page,
          [
            'button:has-text("Connect Project")',
            'button:has-text("Connect")',
            'button:has-text("Continue")',
            'button:has-text("Done")',
            'button:has-text("Finish")',
            'button:has-text("Close")',
          ],
          'follow-up CTA',
        )
      }

      if (
        /SUPABASE_URL|NEXT_PUBLIC_SUPABASE_URL|\.supabase\.co/i.test(body) ||
        (/supabase/i.test(body) && /connected|active|ready|provisioned/i.test(body))
      ) {
        success = true
        break
      }

      // Payment wall — leave browser open for user click
      if (/payment method|add a card|billing|subscribe to continue|confirm purchase/i.test(body)) {
        writeStatus({ phase: 'billing_confirmation_needed', ok: false, url })
        console.log('[pw] Billing confirmation needed — complete it in the browser.')
        console.log('[pw] Waiting for success after payment…')
      }

      await page.waitForTimeout(3000)
    }

    await shot(page, '04-final')

    // 3) Verify stores page
    await page.goto(STORAGE, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2500)
    await shot(page, '05-stores-verify')
    const storesText = await page.locator('body').innerText().catch(() => '')
    const connected = /supabase|sergik-vault/i.test(storesText)

    writeStatus({
      phase: success || connected ? 'connected' : 'incomplete',
      ok: Boolean(success || connected),
      url: page.url(),
      hint: connected
        ? 'Supabase visible on Stores — run db:finish-vercel-cloud --wait'
        : 'Browser flow incomplete — check screenshots in deploy/supabase-foundation/out/playwright-shots',
    })

    // Keep browser briefly so user can see result
    await page.waitForTimeout(2000)
    await context.close()
    process.exit(success || connected ? 0 : 2)
  } catch (err) {
    await shot(page, 'error').catch(() => {})
    writeStatus({
      phase: 'error',
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    })
    await context.close().catch(() => {})
    process.exit(1)
  }
}

main()
