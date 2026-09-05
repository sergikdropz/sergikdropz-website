#!/usr/bin/env node
/**
 * Supervises `next dev` — restarts on crash. Start via `npm run dev:ensure` (detached).
 * Also keeps the site knowledge snapshot fresh while you add/move routes.
 */
import { execSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const webRoot = path.join(__dirname, '..')
const stateDir = path.join(webRoot, '.dev')
const daemonPidFile = path.join(stateDir, 'daemon.pid')
const nextPidFile = path.join(stateDir, 'next.pid')
const logFile = path.join(stateDir, 'daemon.log')

const port = Number(process.env.DEV_PORT || 3001)
const distDir = process.env.NEXT_DIST_DIR || '.next-dev-3001'
const restartDelayMs = Number(process.env.DEV_DAEMON_RESTART_MS ?? 2000)
const maxRestarts = Number(process.env.DEV_DAEMON_MAX_RESTARTS ?? 50)
/** 0 = disabled. When set (e.g. 14400000 = 4h), restarts only `next dev` to reclaim webpack/HMR memory. */
const nextRotateMs = Number(process.env.DEV_DAEMON_NEXT_ROTATE_MS ?? 0)

let shuttingDown = false
let child = null
let knowledgeWatch = null
let sonicDnaWatch = null
let restartCount = 0
let nextRotateTimer = null

function log(line) {
  const msg = `[${new Date().toISOString()}] ${line}\n`
  fs.mkdirSync(stateDir, { recursive: true })
  fs.appendFileSync(logFile, msg)
  if (process.env.DEV_DAEMON_FOREGROUND === '1') process.stdout.write(msg)
}

function writePid(file, pid) {
  fs.mkdirSync(stateDir, { recursive: true })
  fs.writeFileSync(file, String(pid))
}

function clearPid(file) {
  try {
    fs.unlinkSync(file)
  } catch {
    /* ignore */
  }
}

function pidAlive(pid) {
  if (!pid || !Number.isFinite(pid)) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function killListenersOnPort(p) {
  try {
    const out = execSync(`lsof -nP -tiTCP:${p} -sTCP:LISTEN`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
    if (!out) return
    for (const pid of [...new Set(out.split(/\n/).filter(Boolean))]) {
      const n = Number(pid)
      if (n === process.pid) continue
      try {
        process.kill(n, 'SIGTERM')
      } catch {
        /* ignore */
      }
    }
    log(`Cleared listener(s) on port ${p}`)
  } catch {
    /* no listener */
  }
}

function forwardChildOutput(proc) {
  const forward = (chunk) => {
    fs.appendFileSync(logFile, chunk)
    if (process.env.DEV_DAEMON_FOREGROUND === '1') process.stdout.write(chunk)
  }
  proc.stdout.on('data', forward)
  proc.stderr.on('data', forward)
}

function startKnowledgeWatch() {
  const watchScript = path.join(__dirname, 'watch-site-knowledge.mjs')
  knowledgeWatch = spawn(process.execPath, [watchScript], {
    cwd: webRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  })
  forwardChildOutput(knowledgeWatch)
  knowledgeWatch.on('exit', (code, signal) => {
    knowledgeWatch = null
    if (shuttingDown) return
    log(`knowledge:watch exited (code=${code ?? 'null'}, signal=${signal ?? 'null'})`)
  })
  log(`Started knowledge:watch (pid ${knowledgeWatch.pid})`)
}

function startSonicDnaWatch() {
  if (process.env.SONIC_DNA_WATCH === '0') {
    log('sonic-dna:watch disabled (SONIC_DNA_WATCH=0)')
    return
  }
  const watchScript = path.join(webRoot, '../knowledge/scripts/watch-sonic-dna-analysis.mjs')
  if (!fs.existsSync(watchScript)) {
    log('sonic-dna:watch script missing; skip')
    return
  }
  // Default skip-db: home Docker is often down; full apply of ~390 files on every
  // classifier/encyclopedia edit freezes Next HMR. Set SONIC_DNA_WATCH_SKIP_DB=0 to apply.
  const watchEnv = {
    ...process.env,
    SONIC_DNA_WATCH_SKIP_DB: process.env.SONIC_DNA_WATCH_SKIP_DB ?? '1',
  }
  sonicDnaWatch = spawn(process.execPath, [watchScript], {
    cwd: path.join(webRoot, '..'),
    stdio: ['ignore', 'pipe', 'pipe'],
    env: watchEnv,
  })
  forwardChildOutput(sonicDnaWatch)
  sonicDnaWatch.on('exit', (code, signal) => {
    sonicDnaWatch = null
    if (shuttingDown) return
    log(`sonic-dna:watch exited (code=${code ?? 'null'}, signal=${signal ?? 'null'})`)
  })
  log(`Started sonic-dna:watch (pid ${sonicDnaWatch.pid})`)
}

function clearNextRotateTimer() {
  if (nextRotateTimer) {
    clearTimeout(nextRotateTimer)
    nextRotateTimer = null
  }
}

function scheduleNextRotation() {
  clearNextRotateTimer()
  if (!nextRotateMs || nextRotateMs <= 0 || shuttingDown) return
  nextRotateTimer = setTimeout(() => {
    nextRotateTimer = null
    if (shuttingDown || !child || child.killed) return
    log(
      `Rotating next dev after ${Math.round(nextRotateMs / 60000)}m to reclaim memory (DEV_DAEMON_NEXT_ROTATE_MS=0 to disable)`,
    )
    try {
      child.kill('SIGTERM')
    } catch {
      /* ignore */
    }
  }, nextRotateMs)
}

function startNext() {
  const nextCli = path.join(webRoot, 'node_modules/next/dist/bin/next')
  if (!fs.existsSync(nextCli)) {
    log('ERROR: Next.js CLI missing. Run npm install in web/.')
    process.exit(1)
  }

  child = spawn(process.execPath, [nextCli, 'dev', '-p', String(port)], {
    cwd: webRoot,
    env: {
      ...process.env,
      NEXT_DIST_DIR: distDir,
      WATCHPACK_POLLING: 'true',
      NEXT_WEBPACK_POLL: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  writePid(nextPidFile, child.pid)
  log(`Started next dev (pid ${child.pid}) on :${port}`)
  forwardChildOutput(child)
  scheduleNextRotation()

  child.on('exit', (code, signal) => {
    clearPid(nextPidFile)
    child = null
    if (shuttingDown) return
    log(`next dev exited (code=${code ?? 'null'}, signal=${signal ?? 'null'})`)
    if (restartCount >= maxRestarts) {
      log(`Max restarts (${maxRestarts}) reached.`)
      shutdown(1)
      return
    }
    restartCount += 1
    setTimeout(() => {
      if (!shuttingDown) startNext()
    }, restartDelayMs)
  })
}

function shutdown(code = 0) {
  if (shuttingDown) return
  shuttingDown = true
  clearNextRotateTimer()
  log('Shutting down dev daemon…')
  if (knowledgeWatch && !knowledgeWatch.killed) {
    try {
      knowledgeWatch.kill('SIGTERM')
    } catch {
      /* ignore */
    }
  }
  if (sonicDnaWatch && !sonicDnaWatch.killed) {
    try {
      sonicDnaWatch.kill('SIGTERM')
    } catch {
      /* ignore */
    }
  }
  if (child && !child.killed) {
    try {
      child.kill('SIGTERM')
    } catch {
      /* ignore */
    }
  }
  clearPid(nextPidFile)
  clearPid(daemonPidFile)
  setTimeout(() => process.exit(code), 300)
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

// Re-entry guard
if (fs.existsSync(daemonPidFile)) {
  const existing = Number(fs.readFileSync(daemonPidFile, 'utf8').trim())
  if (pidAlive(existing)) {
    log(`Daemon already running (pid ${existing}). Exiting.`)
    process.exit(0)
  }
  clearPid(daemonPidFile)
}

fs.mkdirSync(stateDir, { recursive: true })
writePid(daemonPidFile, process.pid)
log(`Dev daemon started (pid ${process.pid})`)

killListenersOnPort(port)
startKnowledgeWatch()
startSonicDnaWatch()
startNext()
