#!/usr/bin/env node
/**
 * Stops a stuck listener on the dev port, drops a corrupted `.next-dev-*` tree, then runs `next dev`.
 * Use when the browser gets 404 on `/`, missing `main-app.js`, or chunk load failures after EMFILE / cache deletes.
 */
import { execSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const webRoot = path.join(__dirname, '..')
const port = Number(process.env.DEV_PORT || 3001)
const distDir = process.env.NEXT_DIST_DIR || '.next-dev-3001'
const distAbs = path.join(webRoot, distDir)

function killListenersOnPort(p) {
  try {
    const out = execSync(`lsof -nP -tiTCP:${p} -sTCP:LISTEN`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
    if (!out) return
    const pids = [...new Set(out.split(/\n/).filter(Boolean))]
    for (const pid of pids) {
      try {
        execSync(`kill ${pid}`, { stdio: 'ignore' })
      } catch {
        /* ignore */
      }
    }
    console.log(`[dev:recover] Sent SIGTERM to listener(s) on port ${p}: ${pids.join(', ')}`)
    const until = Date.now() + 1000
    while (Date.now() < until) {
      /* wait for OS to release the port */
    }
  } catch {
    /* no listener */
  }
}

const stopDaemon = spawnSync(process.execPath, [path.join(__dirname, 'dev-stop.mjs')], {
  cwd: webRoot,
  stdio: 'inherit',
})
if (stopDaemon.status !== 0) process.exit(stopDaemon.status ?? 1)

killListenersOnPort(port)

const defaultNext = path.join(webRoot, '.next')
const wipeTargets = new Set([distAbs, defaultNext])
for (const target of wipeTargets) {
  if (!fs.existsSync(target)) continue
  fs.rmSync(target, { recursive: true, force: true })
  console.log(`[dev:recover] Removed cache: ${target}`)
}

const ensure = spawnSync(process.execPath, [path.join(__dirname, 'ensure-port-free.mjs'), String(port)], {
  cwd: webRoot,
  stdio: 'inherit',
})
if (ensure.status !== 0) process.exit(ensure.status ?? 1)

const nextCli = path.join(webRoot, 'node_modules/next/dist/bin/next')
if (!fs.existsSync(nextCli)) {
  console.error('[dev:recover] Next.js CLI not found. Run npm install in web/.')
  process.exit(1)
}

const r = spawnSync(process.execPath, [nextCli, 'dev', '-p', String(port)], {
  cwd: webRoot,
  stdio: 'inherit',
  env: {
    ...process.env,
    NEXT_DIST_DIR: distDir,
    WATCHPACK_POLLING: 'true',
    NEXT_WEBPACK_POLL: '1',
  },
})
process.exit(r.status ?? 1)
