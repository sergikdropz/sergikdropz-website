#!/usr/bin/env node
/**
 * Interactive YouTube subscribe gate setup (macOS AppleScript + Vercel CLI).
 * Opens Google Cloud in Chrome, prompts for secrets, updates .env.local, pushes to Vercel, runs smoke + Playwright.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const webRoot = path.join(__dirname, '..')
const envPath = path.join(webRoot, '.env.local')

function runAppleScript(source) {
  return execFileSync('osascript', ['-e', source], { encoding: 'utf8' }).trim()
}

function escapeAppleScript(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function notify(title, message) {
  try {
    runAppleScript(
      `display notification "${escapeAppleScript(message)}" with title "${escapeAppleScript(title)}"`,
    )
  } catch {
    /* ignore */
  }
}

function promptSecret(title, message) {
  try {
    return runAppleScript(
      `text returned of (display dialog "${escapeAppleScript(message)}" with title "${escapeAppleScript(title)}" default answer "" hidden answer true buttons {"Skip", "OK"} default button "OK")`,
    )
  } catch {
    return ''
  }
}

function readEnvFile() {
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

function upsertEnv(keys) {
  const lines = existsSync(envPath) ? readFileSync(envPath, 'utf8').split(/\n/) : []
  const map = readEnvFile()
  Object.assign(map, keys)
  const keyOrder = [
    'YOUTUBE_API_KEY',
    'YOUTUBE_CHANNEL_ID',
    'YOUTUBE_OAUTH_CLIENT_ID',
    'YOUTUBE_OAUTH_CLIENT_SECRET',
    'NEXT_PUBLIC_GOOGLE_CLIENT_ID',
    'YT_SUB_GATE_SECRET',
  ]
  const out = []
  const written = new Set()
  for (const line of lines) {
    const t = line.trim()
    if (!t || t.startsWith('#')) {
      out.push(line)
      continue
    }
    const i = t.indexOf('=')
    if (i < 0) {
      out.push(line)
      continue
    }
    const k = t.slice(0, i).trim()
    if (keyOrder.includes(k)) {
      if (map[k]) {
        out.push(`${k}=${map[k]}`)
        written.add(k)
      }
      continue
    }
    out.push(line)
  }
  if (!out.some((l) => l.includes('YouTube subscribe gate'))) {
    out.push('')
    out.push('# YouTube subscribe gate (@sergikdropz release visualizers)')
  }
  for (const k of keyOrder) {
    if (map[k] && !written.has(k)) out.push(`${k}=${map[k]}`)
  }
  writeFileSync(envPath, `${out.join('\n').replace(/\n+$/, '')}\n`, 'utf8')
}

function existingOrPrompt(env, key, title, msg) {
  const cur = String(env[key] || '').trim()
  if (cur) return cur
  return promptSecret(title, msg).trim()
}

function main() {
  notify('SERGIK YouTube Gate', 'Chrome opened to Google Cloud. Create API key + OAuth Web client if needed.')

  runAppleScript(`tell application "Google Chrome" to activate`)

  const env = readEnvFile()
  const apiKey = existingOrPrompt(
    env,
    'YOUTUBE_API_KEY',
    'YouTube API key',
    'Paste YOUTUBE_API_KEY from Google Cloud → Credentials → Create credentials → API key.',
  )
  const clientId = existingOrPrompt(
    env,
    'YOUTUBE_OAUTH_CLIENT_ID',
    'OAuth Client ID',
    'Paste OAuth 2.0 Client ID (Web application). Redirect URI must include https://sergikdropz.com/api/youtube/subscribe-gate/callback and http://localhost:3001/api/youtube/subscribe-gate/callback',
  )
  const clientSecret = existingOrPrompt(
    env,
    'YOUTUBE_OAUTH_CLIENT_SECRET',
    'OAuth Client secret',
    'Paste OAuth client secret.',
  )

  if (!apiKey || !clientId || !clientSecret) {
    console.error('[yt-setup] Missing one or more values. Re-run after creating credentials in Chrome.')
    process.exit(1)
  }

  const channelId = (env.YOUTUBE_CHANNEL_ID || '@sergikdropz').trim()
  const gateSecret = (env.YT_SUB_GATE_SECRET || env.FAN_VAULT_UNLOCK_SECRET || '').trim()

  upsertEnv({
    YOUTUBE_API_KEY: apiKey,
    YOUTUBE_CHANNEL_ID: channelId,
    YOUTUBE_OAUTH_CLIENT_ID: clientId,
    YOUTUBE_OAUTH_CLIENT_SECRET: clientSecret,
    NEXT_PUBLIC_GOOGLE_CLIENT_ID: clientId,
    ...(gateSecret ? { YT_SUB_GATE_SECRET: gateSecret } : {}),
  })

  console.log('[yt-setup] Updated web/.env.local (secrets not printed).')

  notify('SERGIK YouTube Gate', 'Pushing env to Vercel…')
  const push = spawnSync('node', ['scripts/push-youtube-subscribe-gate-env.mjs'], {
    cwd: webRoot,
    stdio: 'inherit',
    env: { ...process.env, ...readEnvFile(), YOUTUBE_API_KEY: apiKey, YOUTUBE_OAUTH_CLIENT_ID: clientId, YOUTUBE_OAUTH_CLIENT_SECRET: clientSecret, NEXT_PUBLIC_GOOGLE_CLIENT_ID: clientId, YOUTUBE_CHANNEL_ID: channelId },
  })
  if (push.status !== 0) {
    console.error('[yt-setup] Vercel push failed. Fix link/auth and re-run push script.')
    process.exit(push.status ?? 1)
  }

  console.log('[yt-setup] Redeploy production on Vercel dashboard (or: npx vercel --prod).')
  notify('SERGIK YouTube Gate', 'Env pushed. Redeploy sergikdropz-website, then smoke runs locally.')

  spawnSync('npm', ['run', 'dev:restart'], { cwd: webRoot, stdio: 'inherit' })

  const smokeLocal = spawnSync('npm', ['run', 'smoke:youtube-subscribe-gate'], { cwd: webRoot, stdio: 'inherit' })
  if (smokeLocal.status !== 0) process.exit(smokeLocal.status ?? 1)

  const pw = spawnSync(
    'npx',
    ['playwright', 'test', 'e2e/youtube-subscribe-gate.spec.ts', '--project=chromium-guest'],
    { cwd: webRoot, stdio: 'inherit' },
  )
  if (pw.status !== 0) process.exit(pw.status ?? 1)

  notify('SERGIK YouTube Gate', 'Local smoke + Playwright OK. Redeploy production to go live.')
  console.log('[yt-setup] Done locally. After Vercel redeploy: SMOKE_BASE=https://sergikdropz.com npm run smoke:youtube-subscribe-gate')
}

main()
