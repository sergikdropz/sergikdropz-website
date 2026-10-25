#!/usr/bin/env node
/**
 * Send owner release reminders that are due in America/Phoenix.
 * Usage: node scripts/send-owner-release-reminders.mjs [--dry-run]
 */
import { register } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

register('./ts-extension-hook.mjs', import.meta.url)

const webRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

function loadEnv(file) {
  if (!existsSync(file)) return
  for (const line of readFileSync(file, 'utf8').split(/\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 0) continue
    const key = trimmed.slice(0, eq).trim()
    if (process.env[key]) continue
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    process.env[key] = value
  }
}

loadEnv(path.join(webRoot, '.env.local'))
loadEnv(path.join(webRoot, '.env'))
process.chdir(webRoot)

if (process.argv.includes('--dry-run')) {
  process.env.OWNER_REMINDER_DRY_RUN = '1'
}

const { deliverDueOwnerReleaseReminders } = await import(
  '../lib/studio/deliver-owner-release-reminders.ts'
)
const reminders = await deliverDueOwnerReleaseReminders()
console.log(
  JSON.stringify({
    ok: true,
    dryRun: process.env.OWNER_REMINDER_DRY_RUN === '1',
    resendConfigured: Boolean(process.env.RESEND_API_KEY?.trim()),
    reminders,
  }),
)
