#!/usr/bin/env node
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const envPath = path.join(root, '.env')

function b64url(input) {
  return Buffer.from(input).toString('base64url')
}

function signJwt(payload, secret) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = b64url(JSON.stringify(payload))
  const sig = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url')
  return `${header}.${body}.${sig}`
}

function randomSecret(bytes = 40) {
  return crypto.randomBytes(bytes).toString('base64url')
}

const now = Math.floor(Date.now() / 1000)
const exp = now + 60 * 60 * 24 * 365 * 10

const jwtSecret = randomSecret(48)
const postgresPassword = randomSecret(24)
const anonKey = signJwt({ role: 'anon', iss: 'supabase', iat: now, exp }, jwtSecret)
const serviceRoleKey = signJwt({ role: 'service_role', iss: 'supabase', iat: now, exp }, jwtSecret)

const env = `# Generated ${new Date().toISOString()} — do not commit
POSTGRES_PASSWORD=${postgresPassword}
POSTGRES_DB=sergik
POSTGRES_USER=postgres
AUTHENTICATOR_PASSWORD=sergik_home_authenticator
JWT_SECRET=${jwtSecret}
ANON_KEY=${anonKey}
SERVICE_ROLE_KEY=${serviceRoleKey}
SITE_URL=http://localhost:3001
API_EXTERNAL_URL=http://127.0.0.1:8000
ADMIN_EMAIL=admin@sergik.com
ADMIN_PASSWORD=SergikHome2026!
`

fs.writeFileSync(envPath, env)
console.log(`[home-server] Wrote ${envPath}`)
console.log('[home-server] API gateway will be http://127.0.0.1:8000')
console.log('[home-server] Admin seed user: admin@sergik.com')
