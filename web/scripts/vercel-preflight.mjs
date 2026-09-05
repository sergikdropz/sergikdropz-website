#!/usr/bin/env node
import dotenv from 'dotenv'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const webRoot = resolve(__dirname, '..')
dotenv.config({ path: resolve(webRoot, '.env') })
dotenv.config({ path: resolve(webRoot, '.env.local') })

const isVercel = process.env.VERCEL === '1'

const requiredVercel = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'NEXT_PUBLIC_SITE_URL',
  'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'FAN_VAULT_UNLOCK_SECRET',
]

/** Local `deploy:check`: Supabase + site only; payment/vault required on Vercel. */
const requiredLocal = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'NEXT_PUBLIC_SITE_URL',
]

const required = isVercel ? requiredVercel : requiredLocal

const optionalRecommended = [
  'SENTRY_DSN',
  'NEXT_PUBLIC_SENTRY_DSN',
  'RESEND_API_KEY',
  'CRON_SECRET',
  'INSTAGRAM_ACCESS_TOKEN',
  'INSTAGRAM_USER_ID',
]

if (!isVercel) {
  const notLocal = requiredVercel.filter((k) => !requiredLocal.includes(k))
  const missingRemoteOnly = notLocal.filter(
    (k) => !process.env[k] || String(process.env[k]).trim() === '',
  )
  if (missingRemoteOnly.length) {
    console.log(
      `[vercel-preflight] Not set in .env (required on Vercel): ${missingRemoteOnly.join(', ')}`,
    )
  }
}

const missing = required.filter((k) => !process.env[k] || String(process.env[k]).trim() === '')

const problems = []
if (missing.length) {
  problems.push(`Missing required env vars: ${missing.join(', ')}`)
}

const fanSecret = process.env.FAN_VAULT_UNLOCK_SECRET
if (fanSecret && fanSecret.length < 16) {
  problems.push('FAN_VAULT_UNLOCK_SECRET must be at least 16 characters')
}

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || ''
if (isVercel && siteUrl && !/^https:\/\//.test(siteUrl)) {
  problems.push('NEXT_PUBLIC_SITE_URL should be an https URL on Vercel')
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
if (supabaseUrl && !/^https:\/\/.+\.supabase\.co/.test(supabaseUrl)) {
  problems.push('NEXT_PUBLIC_SUPABASE_URL should look like https://<project>.supabase.co')
}

if (problems.length) {
  console.error('[vercel-preflight] FAILED')
  for (const p of problems) console.error(`- ${p}`)
  process.exit(1)
}

const missingOptional = optionalRecommended.filter((k) => !process.env[k])
console.log('[vercel-preflight] OK')
if (missingOptional.length) {
  console.log(`[vercel-preflight] Optional but recommended env vars not set: ${missingOptional.join(', ')}`)
}
