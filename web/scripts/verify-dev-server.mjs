#!/usr/bin/env node
/**
 * Gate for agents/CI: confirms dev server is up and serving pages after edits.
 * Does not start the server — use `npm run dev` in a persistent terminal.
 */
import { execSync } from 'node:child_process'

const port = Number(process.env.DEV_PORT || 3001)
const baseUrl = (process.env.DEV_BASE_URL || `http://localhost:${port}`).replace(/\/$/, '')
const maxAttempts = Number(process.env.DEV_VERIFY_ATTEMPTS ?? 8)
const delayMs = Number(process.env.DEV_VERIFY_DELAY_MS ?? 1500)

function hasListener() {
  try {
    const out = execSync(`lsof -nP -tiTCP:${port} -sTCP:LISTEN`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
    return Boolean(out)
  } catch {
    return false
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function fetchCheck(path) {
  const url = `${baseUrl}${path}`
  const res = await fetch(url, {
    redirect: 'manual',
    signal: AbortSignal.timeout(12000),
    headers: { Accept: 'text/html,application/json' },
  })
  return { url, status: res.status, ok: res.status >= 200 && res.status < 400 }
}

let lastErr = null

for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
  if (!hasListener()) {
    lastErr = `No process listening on port ${port}`
    console.error(`[dev:verify] Attempt ${attempt}/${maxAttempts}: ${lastErr}`)
    if (attempt < maxAttempts) await sleep(delayMs)
    continue
  }

  try {
    const home = await fetchCheck('/')
    const health = await fetchCheck('/api/health/deps')
    const homeReady = home.ok
    // 503 = degraded deps/env but Next is compiling and serving
    const healthReachable = health.status >= 200 && health.status < 600

    if (homeReady && healthReachable) {
      console.log(`[dev:verify] OK — ${baseUrl} (home ${home.status}, health ${health.status})`)
      process.exit(0)
    }

    lastErr = `home=${home.status} health=${health.status}`
    console.error(`[dev:verify] Attempt ${attempt}/${maxAttempts}: HTTP not ready (${lastErr})`)
  } catch (err) {
    lastErr = err instanceof Error ? err.message : String(err)
    console.error(`[dev:verify] Attempt ${attempt}/${maxAttempts}: ${lastErr}`)
  }

  if (attempt < maxAttempts) await sleep(delayMs)
}

console.error('[dev:verify] FAILED — dev server is not healthy.')
console.error(`[dev:verify] Last error: ${lastErr}`)
console.error('')
console.error('Start or fix the dev server:')
console.error('  cd web && npm run dev:ensure')
console.error('')
console.error('If stuck or chunk/404 errors:')
console.error('  cd web && npm run dev:recover')
process.exit(1)
