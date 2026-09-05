#!/usr/bin/env node
/**
 * Enable the managed r2.dev public URL for the production bucket.
 * Requires CLOUDFLARE_API_TOKEN (Account → Cloudflare R2 → Edit) in deploy/migrate/.env
 *
 * Writes R2_PUBLIC_BASE_URL to deploy/migrate/.env on success.
 */
import { loadEnv, requiredEnv, upsertEnvValue } from './lib/load-env.mjs'
import { r2Bucket } from './lib/r2-client.mjs'

loadEnv({ required: true })

const accountId = requiredEnv('R2_ACCOUNT_ID')
const bucket = r2Bucket()
const apiToken = requiredEnv('CLOUDFLARE_API_TOKEN')

async function cfApi(path, init = {}) {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || body.success === false) {
    const msg = body.errors?.map((e) => e.message).join('; ') || res.statusText
    throw new Error(`Cloudflare API ${path}: ${msg}`)
  }
  return body.result
}

console.log(`[enable-r2-public] bucket=${bucket}`)

const managed = await cfApi(`/accounts/${accountId}/r2/buckets/${bucket}/domains/managed`, {
  method: 'PUT',
  body: JSON.stringify({ enabled: true }),
})

const publicHost = managed?.domain
if (!publicHost) {
  console.error('[enable-r2-public] unexpected API response — set R2_PUBLIC_BASE_URL manually in .env')
  console.error(JSON.stringify(managed, null, 2))
  process.exit(1)
}

const baseUrl = publicHost.startsWith('http') ? publicHost.replace(/\/+$/, '') : `https://${publicHost}`
upsertEnvValue('R2_PUBLIC_BASE_URL', baseUrl)
process.env.R2_PUBLIC_BASE_URL = baseUrl

console.log(`[enable-r2-public] public base → ${baseUrl}`)
console.log('[enable-r2-public] sample object URL:')
console.log(`  ${baseUrl}/audio/unreleased/Playlists/Party%20Time/SERGIK%20-%20Can%20You%20Dance%20v2.mp3`)
