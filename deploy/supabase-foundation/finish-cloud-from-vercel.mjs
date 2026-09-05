#!/usr/bin/env node
/**
 * After Vercel Supabase integration checkout completes:
 * pull env → save cloud profile → apply schema → bootstrap home → activate cloud.
 *
 * Usage:
 *   node finish-cloud-from-vercel.mjs           # one shot
 *   node finish-cloud-from-vercel.mjs --wait    # poll Vercel until *.supabase.co appears
 *   node finish-cloud-from-vercel.mjs --skip-schema  # schema already applied
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  activateCloudProfile,
  cloudBackupPath,
  parseEnvFile,
  readWebEnv,
  snapshotActiveProfile,
  webEnvPath,
  writeWebEnv,
} from './lib/env-profiles.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const webRoot = path.resolve(__dirname, '../../web')
const schemaPath = path.join(__dirname, 'out/schema-bundle.sql')
const pulledEnv = path.join(webRoot, '.env.vercel-cloud-pull')

const args = process.argv.slice(2)
const waitMode = args.includes('--wait')
const skipSchema = args.includes('--skip-schema')
const waitMs = Number(args.find((a) => a.startsWith('--wait-ms='))?.split('=')[1] || 900000)

function run(cmd, cmdArgs, opts = {}) {
  const r = spawnSync(cmd, cmdArgs, { stdio: 'inherit', ...opts })
  if (r.status !== 0) process.exit(r.status || 1)
}

function pullVercelEnv() {
  run('npx', ['vercel', 'env', 'pull', pulledEnv, '--environment=production', '--yes'], {
    cwd: webRoot,
    stdio: 'pipe',
  })
  return parseEnvFile(pulledEnv)
}

function pickCloudKeys(env) {
  const url = (env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || '').replace(/\/+$/, '')
  const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || ''
  const service = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY || ''
  const postgres = env.POSTGRES_URL_NON_POOLING || env.POSTGRES_URL || ''
  const isCloud = /\.supabase\.co/i.test(url)
  return { url, anon, service, postgres, isCloud }
}

async function reachable(url) {
  try {
    const res = await fetch(`${url}/rest/v1/`, { signal: AbortSignal.timeout(8000) })
    return res.status !== 404 && res.status < 500
  } catch {
    return false
  }
}

function saveCloudProfile({ url, anon, service }) {
  const snap = snapshotActiveProfile(readWebEnv())
  writeWebEnv({
    ...snap,
    SERGIK_CLOUD_SUPABASE_URL: url,
    SERGIK_CLOUD_SUPABASE_ANON_KEY: anon,
    SERGIK_CLOUD_SERVICE_ROLE_KEY: service,
  })
  fs.copyFileSync(webEnvPath, cloudBackupPath)
  console.log('[finish] Saved SERGIK_CLOUD_* profile')
}

function applySchema(postgresUrl) {
  if (!fs.existsSync(schemaPath)) {
    run('node', [path.join(__dirname, 'build-schema-bundle.mjs')], { cwd: __dirname, stdio: 'inherit' })
  }
  if (!postgresUrl) {
    console.log('[finish] No POSTGRES_URL — apply schema manually in Supabase SQL Editor:')
    console.log(`  ${schemaPath}`)
    return false
  }
  console.log('[finish] Applying schema via psql…')
  const r = spawnSync('psql', [postgresUrl, '-v', 'ON_ERROR_STOP=1', '-f', schemaPath], {
    stdio: 'inherit',
  })
  if (r.status !== 0) {
    console.error('[finish] psql schema apply failed. Paste schema-bundle.sql in Supabase SQL Editor.')
    return false
  }
  return true
}

async function main() {
  console.log('[finish] Vercel → cloud Supabase automation\n')

  const deadline = Date.now() + waitMs
  let keys = null

  do {
    console.log('[finish] Pulling Vercel production env…')
    const env = pullVercelEnv()
    keys = pickCloudKeys(env)
    if (keys.isCloud && keys.url && keys.anon && keys.service) {
      if (await reachable(keys.url)) break
      console.log('[finish] Cloud URL found but not reachable yet — retrying…')
    } else {
      console.log('[finish] No live *.supabase.co in Vercel env yet.')
    }
    if (!waitMode) {
      console.error('\n[finish] Complete Vercel Supabase checkout, then re-run with --wait')
      console.error('[finish] Checkout: https://vercel.com/jordan-cabogas-projects/~/integrations/checkout/supabase?productSlug=supabase&planId=pro')
      process.exit(1)
    }
    if (Date.now() >= deadline) {
      console.error('[finish] Timed out waiting for Vercel Supabase env.')
      process.exit(1)
    }
    await new Promise((r) => setTimeout(r, 15000))
  } while (true)

  console.log(`[finish] Cloud project: ${keys.url}`)
  saveCloudProfile(keys)

  if (!skipSchema) {
    applySchema(keys.postgres)
  }

  console.log('[finish] Bootstrapping home → cloud…')
  run('node', [path.join(__dirname, 'bootstrap-cloud.mjs')], { cwd: __dirname })

  activateCloudProfile(readWebEnv())
  console.log('[finish] Switched active target to cloud')

  console.log('[finish] Restarting dev server…')
  run('npm', ['run', 'dev:restart'], { cwd: webRoot })

  console.log('[finish] Verifying…')
  run('npm', ['run', 'db:verify'], { cwd: webRoot })

  console.log('\n[finish] Done. Cloud primary + home backup profiles are configured.')
  console.log('[finish] Weekly safety: cd web && npm run db:backup')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
