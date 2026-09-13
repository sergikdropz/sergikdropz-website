#!/usr/bin/env node

const baseUrl = process.argv[2]
const maxAttempts = Number(process.env.HEALTH_PROBE_MAX_ATTEMPTS ?? 5)
const delayMs = Number(process.env.HEALTH_PROBE_DELAY_MS ?? 3000)

if (!baseUrl) {
  console.error('[health-probe] Usage: node scripts/probe-health-deps.mjs <base-url>')
  process.exit(1)
}

const normalized = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
const endpoint = `${normalized}/api/health/deps`

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

let lastError = null
for (let attempt = 1; attempt <= Math.max(1, maxAttempts); attempt += 1) {
  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    })

    let payload = null
    try {
      payload = await response.json()
    } catch {
      payload = null
    }

    if (response.ok && payload?.status === 'ok') {
      console.log(`[health-probe] OK: ${endpoint}`)
      process.exit(0)
    }

    lastError = `[health-probe] Attempt ${attempt}/${maxAttempts}: HTTP ${response.status}, payload status=${payload?.status ?? 'unknown'}`
    console.error(lastError)
    if (payload) console.error(JSON.stringify(payload, null, 2))
  } catch (error) {
    lastError = `[health-probe] Attempt ${attempt}/${maxAttempts} request failed: ${error instanceof Error ? error.message : String(error)}`
    console.error(lastError)
  }

  if (attempt < maxAttempts) {
    await sleep(delayMs)
  }
}

console.error(`[health-probe] FAILED after ${maxAttempts} attempts: ${endpoint}`)
if (lastError) console.error(lastError)
process.exit(1)
