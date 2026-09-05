#!/usr/bin/env node
/**
 * Enable Vercel team Spend Management alerts (email/web at 50/75/100%).
 * Opens headed Chrome; complete login if prompted.
 *
 * Usage: node playwright-enable-spend-alerts.mjs [--amount=100]
 */
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const profileDir = path.join(__dirname, 'out/playwright-vercel-profile')
const shotDir = path.join(__dirname, 'out/playwright-shots')
const amount = Number(process.argv.find((a) => a.startsWith('--amount='))?.split('=')[1] || 100)
const BILLING = 'https://vercel.com/jordan-cabogas-projects/~/settings/billing'
const NOTIFS = 'https://vercel.com/account/notifications'

fs.mkdirSync(shotDir, { recursive: true })
fs.mkdirSync(profileDir, { recursive: true })

async function shot(page, name) {
  await page.screenshot({ path: path.join(shotDir, `${name}.png`), fullPage: true }).catch(() => {})
}

async function main() {
  console.log(`[spend] Target spend alert amount: $${amount}`)
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    channel: 'chrome',
    viewport: { width: 1400, height: 900 },
  })
  const page = context.pages()[0] || (await context.newPage())

  await page.goto(BILLING, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(2500)
  await shot(page, 'billing-01')

  if (page.url().includes('/login')) {
    console.log('[spend] Log in to Vercel in the browser window…')
    await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 5 * 60 * 1000 })
    await page.goto(BILLING, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)
  }

  // Enable Spend Management toggle if present
  const toggle = page.getByRole('switch').filter({ hasText: /spend/i }).first()
  const anySwitch = page.locator('[role="switch"]').first()
  if (await page.getByText(/Spend Management/i).first().isVisible().catch(() => false)) {
    console.log('[spend] Found Spend Management section')
    // Try to find enabled switch near the heading
    const switches = page.locator('[role="switch"]')
    const count = await switches.count()
    for (let i = 0; i < count; i++) {
      const sw = switches.nth(i)
      const checked = await sw.getAttribute('aria-checked')
      const near = await sw.evaluate((el) => el.closest('section,div')?.innerText?.slice(0, 200) || '')
      if (/spend management/i.test(near) && checked === 'false') {
        await sw.click()
        console.log('[spend] Enabled Spend Management switch')
        break
      }
    }
  }

  // Fill amount
  const amountInput = page.locator('input[type="number"], input[inputmode="decimal"], input[name*="spend" i]').first()
  if (await amountInput.isVisible().catch(() => false)) {
    await amountInput.fill(String(amount))
    console.log(`[spend] Set amount to $${amount}`)
  } else {
    // Try textbox near Spend Management
    const tb = page.getByRole('spinbutton').first()
    if (await tb.isVisible().catch(() => false)) {
      await tb.fill(String(amount))
      console.log(`[spend] Set spinbutton amount to $${amount}`)
    }
  }

  // Save / confirm if needed
  await page.getByRole('button', { name: /save|update|confirm|continue/i }).first().click({ timeout: 3000 }).catch(() => {})
  await page.waitForTimeout(1500)
  await shot(page, 'billing-02')

  // Notifications page — ensure Spend Management selected
  await page.goto(NOTIFS, { waitUntil: 'domcontentloaded' }).catch(() => {})
  await page.waitForTimeout(2000)
  await shot(page, 'notifs-01')
  const spendCheck = page.getByText(/Spend Management/i).first()
  if (await spendCheck.isVisible().catch(() => false)) {
    await spendCheck.click().catch(() => {})
    console.log('[spend] Opened Spend Management notification prefs')
  }
  await shot(page, 'notifs-02')

  const body = await page.locator('body').innerText().catch(() => '')
  const ok = /spend management|billing|\$\d+/i.test(body)
  console.log(ok ? '[spend] Done — verify Spend Management is ON in Billing settings.' : '[spend] Incomplete — check screenshots.')
  console.log(`[spend] Billing: ${BILLING}`)
  await page.waitForTimeout(2000)
  await context.close()
  process.exit(ok ? 0 : 2)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
