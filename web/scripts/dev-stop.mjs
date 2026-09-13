#!/usr/bin/env node
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const webRoot = path.join(__dirname, '..')
const devPort = Number(process.env.DEV_PORT || 3001)
const stateDir = path.join(webRoot, '.dev')
const daemonPidFile = path.join(stateDir, 'daemon.pid')
const nextPidFile = path.join(stateDir, 'next.pid')
const sonicDnaWatchPidFile = path.join(stateDir, 'sonic-dna-watch.pid')

function killListenersOnPort(port) {
  try {
    const out = execSync(`lsof -nP -tiTCP:${port} -sTCP:LISTEN`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
    if (!out) return
    const pids = [...new Set(out.split(/\n/).filter(Boolean))]
    for (const pid of pids) {
      try {
        execSync(`kill ${pid}`, { stdio: 'ignore' })
        console.log(`[dev:stop] Sent SIGTERM to listener on :${port} (${pid})`)
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* no listener */
  }
}

function killPid(pid, label) {
  if (!pid || !Number.isFinite(pid)) return
  try {
    process.kill(pid, 'SIGTERM')
    console.log(`[dev:stop] Sent SIGTERM to ${label} (${pid})`)
  } catch (err) {
    if (err && err.code !== 'ESRCH') console.error(`[dev:stop] ${label}:`, err.message)
  }
}

function readPid(file) {
  try {
    return Number(fs.readFileSync(file, 'utf8').trim())
  } catch {
    return 0
  }
}

killPid(readPid(nextPidFile), 'next dev')
killPid(readPid(daemonPidFile), 'daemon')
killPid(readPid(sonicDnaWatchPidFile), 'sonic-dna:watch')

for (const file of [nextPidFile, daemonPidFile, sonicDnaWatchPidFile]) {
  try {
    fs.unlinkSync(file)
  } catch {
    /* ignore */
  }
}

killListenersOnPort(devPort)

console.log(`[dev:stop] Done. Port ${devPort} may take a moment to free.`)
