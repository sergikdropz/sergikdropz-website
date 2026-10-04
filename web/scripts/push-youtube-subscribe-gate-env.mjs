#!/usr/bin/env node
/**
 * Push YouTube subscribe gate env vars to Vercel (production + preview).
 *
 * Required in shell environment or web/.env.local:
 *   YOUTUBE_API_KEY
 *   YOUTUBE_CHANNEL_ID=@sergikdropz
 *   YOUTUBE_OAUTH_CLIENT_ID
 *   YOUTUBE_OAUTH_CLIENT_SECRET
 * Optional:
 *   YT_SUB_GATE_SECRET (falls back to FAN_VAULT_UNLOCK_SECRET on server)
 *   NEXT_PUBLIC_GOOGLE_CLIENT_ID (same as OAuth client id for GIS fallback)
 *
 * Usage:
 *   cd web && node scripts/push-youtube-subscribe-gate-env.mjs
 *   cd web && node scripts/push-youtube-subscribe-gate-env.mjs --dry-run
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const webRoot = path.join(__dirname, '..')
const dryRun = process.argv.includes('--dry-run')

function loadEnvFile(name) {
  const envPath = path.join(webRoot, name)
  if (!existsSync(envPath)) return {}
  const env = {}
  for (const line of readFileSync(envPath, 'utf8').split(/\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i < 0) continue
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

const env = { ...loadEnvFile('.env'), ...loadEnvFile('.env.local'), ...process.env }

const required = [
  'YOUTUBE_API_KEY',
  'YOUTUBE_CHANNEL_ID',
  'YOUTUBE_OAUTH_CLIENT_ID',
  'YOUTUBE_OAUTH_CLIENT_SECRET',
]

const missing = required.filter((k) => !String(env[k] || '').trim())
if (missing.length) {
  console.error(
    `[yt-sub-gate-env] Missing: ${missing.join(', ')}\nAdd them to web/.env.local, then re-run.`,
  )
  process.exit(1)
}

const pairs = [
  ['YOUTUBE_API_KEY', env.YOUTUBE_API_KEY.trim()],
  ['YOUTUBE_CHANNEL_ID', (env.YOUTUBE_CHANNEL_ID || '@sergikdropz').trim()],
  ['YOUTUBE_OAUTH_CLIENT_ID', env.YOUTUBE_OAUTH_CLIENT_ID.trim()],
  ['YOUTUBE_OAUTH_CLIENT_SECRET', env.YOUTUBE_OAUTH_CLIENT_SECRET.trim()],
  ['NEXT_PUBLIC_GOOGLE_CLIENT_ID', (env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || env.YOUTUBE_OAUTH_CLIENT_ID).trim()],
]

if (String(env.YT_SUB_GATE_SECRET || '').trim()) {
  pairs.push(['YT_SUB_GATE_SECRET', env.YT_SUB_GATE_SECRET.trim()])
}

const SENSITIVE_KEYS = new Set([
  'YOUTUBE_API_KEY',
  'YOUTUBE_OAUTH_CLIENT_SECRET',
  'YT_SUB_GATE_SECRET',
])

function gitBranch() {
  const res = spawnSync('git', ['-C', path.join(webRoot, '..'), 'branch', '--show-current'], {
    encoding: 'utf8',
  })
  return String(res.stdout || '').trim()
}

function vercelEnvRemove(name, target) {
  spawnSync('npm', ['exec', '--', 'vercel', 'env', 'remove', name, target, '--yes'], {
    cwd: webRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'ignore', 'ignore'],
  })
}

function vercelEnvAdd(name, value, target) {
  if (dryRun) {
    console.log(`[yt-sub-gate-env] dry-run would set ${name} → ${target}`)
    return 0
  }
  const args = ['exec', '--', 'vercel', 'env', 'add', name, target]
  if (target === 'preview') {
    const branch = gitBranch()
    if (!branch) {
      console.error('[yt-sub-gate-env] preview requires a git branch (git branch --show-current).')
      return 1
    }
    args.push(branch)
  }
  args.push('--force', '--yes', '--value', value)
  if (SENSITIVE_KEYS.has(name)) args.push('--sensitive')
  let res = spawnSync('npm', args, {
    cwd: webRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'inherit', 'inherit'],
  })
  if ((res.status ?? 1) === 0) return 0
  if (target === 'production') return res.status ?? 1
  // Preview/development sensitive vars cannot be updated in place; re-add after remove.
  vercelEnvRemove(name, target)
  res = spawnSync('npm', args, {
    cwd: webRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'inherit', 'inherit'],
  })
  return res.status ?? 1
}

console.log(`[yt-sub-gate-env] Pushing ${pairs.length} vars to Vercel (production, preview, development)…`)
for (const target of ['production', 'preview', 'development']) {
  for (const [name, value] of pairs) {
    const code = vercelEnvAdd(name, value, target)
    if (code !== 0) {
      console.error(`[yt-sub-gate-env] Failed on ${name} (${target}). Run \`npx vercel link\` in web/ first.`)
      process.exit(code)
    }
  }
}

console.log('[yt-sub-gate-env] Done. Redeploy production, then:')
console.log('  SMOKE_BASE=https://sergikdropz.com npm run smoke:youtube-subscribe-gate')
