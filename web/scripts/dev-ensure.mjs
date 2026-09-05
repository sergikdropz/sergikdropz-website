#!/usr/bin/env node
/**
 * Idempotent: if localhost:3001 is healthy, exit 0. Otherwise start the dev daemon detached and wait.
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const webRoot = path.join(__dirname, '..')
const daemonPidFile = path.join(webRoot, '.dev', 'daemon.pid')
const daemonScript = path.join(__dirname, 'dev-daemon.mjs')
const verifyScript = path.join(__dirname, 'verify-dev-server.mjs')

const waitMs = Number(process.env.DEV_ENSURE_WAIT_MS ?? 90000)
const pollMs = Number(process.env.DEV_ENSURE_POLL_MS ?? 2000)

function pidAlive(pid) {
  if (!pid || !Number.isFinite(pid)) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function runVerify() {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [verifyScript], {
      cwd: webRoot,
      stdio: 'inherit',
      env: process.env,
    })
    child.on('exit', (code) => resolve(code === 0))
  })
}

function startDaemonDetached() {
  const logPath = path.join(webRoot, '.dev', 'daemon.log')
  fs.mkdirSync(path.dirname(logPath), { recursive: true })

  const out = fs.openSync(logPath, 'a')
  const child = spawn(process.execPath, [daemonScript], {
    cwd: webRoot,
    detached: true,
    stdio: ['ignore', out, out],
    env: { ...process.env, DEV_DAEMON_FOREGROUND: '0' },
  })
  child.unref()
  console.log(`[dev:ensure] Started dev daemon (pid ${child.pid}). Log: web/.dev/daemon.log`)
}

function runKnowledgeBuild() {
  return new Promise((resolve) => {
    const script = path.join(__dirname, 'build-site-knowledge.mjs')
    const child = spawn(process.execPath, [script], {
      cwd: webRoot,
      stdio: 'inherit',
      env: process.env,
    })
    child.on('exit', (code) => resolve(code === 0))
  })
}

async function main() {
  // Keep Admin AI inventory current even when the server is already healthy.
  await runKnowledgeBuild()

  if (await runVerify()) {
    console.log('[dev:ensure] Dev server already healthy.')
    process.exit(0)
  }

  const existingPid = fs.existsSync(daemonPidFile)
    ? Number(fs.readFileSync(daemonPidFile, 'utf8').trim())
    : 0

  if (!pidAlive(existingPid)) {
    startDaemonDetached()
  } else {
    console.log(`[dev:ensure] Waiting for daemon (pid ${existingPid})…`)
  }

  const deadline = Date.now() + waitMs
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, pollMs))
    if (await runVerify()) {
      console.log('[dev:ensure] Dev server is ready.')
      process.exit(0)
    }
  }

  console.error('[dev:ensure] Timed out waiting for dev server.')
  console.error('[dev:ensure] Check web/.dev/daemon.log then try: npm run dev:recover')
  process.exit(1)
}

main()
