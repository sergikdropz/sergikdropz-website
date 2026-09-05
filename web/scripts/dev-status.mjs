#!/usr/bin/env node
/**
 * Prints whether the dev server is listening and responds on the configured port.
 */
import { execSync } from 'node:child_process'

const port = Number(process.env.DEV_PORT || 3001)
const baseUrl = process.env.DEV_BASE_URL || `http://localhost:${port}`

function listeners() {
  try {
    const out = execSync(`lsof -nP -tiTCP:${port} -sTCP:LISTEN`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
    return out ? [...new Set(out.split(/\n/).filter(Boolean))] : []
  } catch {
    return []
  }
}

async function probe() {
  const url = `${baseUrl.replace(/\/$/, '')}/api/health/deps`
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    const body = await res.json().catch(() => null)
    return { ok: res.ok, status: res.status, body }
  } catch (err) {
    return { ok: false, status: 0, error: err instanceof Error ? err.message : String(err) }
  }
}

const pids = listeners()
if (pids.length === 0) {
  console.log(`[dev:status] No listener on port ${port}.`)
  console.log('[dev:status] Run: cd web && npm run dev:ensure')
  process.exit(1)
}

console.log(`[dev:status] Listening on port ${port} (pid(s): ${pids.join(', ')})`)

const result = await probe()
if (result.status >= 200 && result.status < 600) {
  const label = result.ok ? 'Health OK' : 'Health reachable (degraded env/deps)'
  console.log(`[dev:status] ${label} — ${baseUrl}`)
  process.exit(0)
}

console.error(`[dev:status] Listener up but app not responding (HTTP ${result.status}).`)
if (result.error) console.error(`[dev:status] ${result.error}`)
if (result.body) console.error(JSON.stringify(result.body, null, 2))
console.error('[dev:status] Try: npm run dev:recover')
process.exit(1)
