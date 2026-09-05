#!/usr/bin/env node
/**
 * Resume R2 production pipeline after deploy/migrate/.env exists (skip browser setup).
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadEnv } from './lib/load-env.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function run(script) {
  const r = spawnSync('node', [path.join(__dirname, script)], { stdio: 'inherit' })
  if (r.status !== 0) process.exit(r.status || 1)
}

loadEnv({ required: true })
const envPath = path.join(__dirname, '.env')
if (!fs.existsSync(envPath)) {
  console.error('Missing .env — run: npm run r2:setup:browser')
  process.exit(1)
}

for (const k of ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'CLOUDFLARE_API_TOKEN']) {
  if (!process.env[k]?.trim()) {
    console.error(`Missing ${k} in .env — run: npm run r2:setup:browser`)
    process.exit(1)
  }
}

console.log('[continue-r2] upload → public → verify → cutover')
run('upload-r2-production.mjs')
run('enable-r2-public.mjs')
run('verify-r2-production.mjs')
run('finish-r2-cutover.mjs')
