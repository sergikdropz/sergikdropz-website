#!/usr/bin/env node
/**
 * Debounced Sonic DNA sync when classifier, encyclopedia, or apply/compile sources change.
 * Does not watch measured/*.json (those are outputs — watching them would loop).
 * Ignores web/lib/audio/data/* mirrors written by sync (otherwise sync → mirror → watch → sync).
 *
 *   node knowledge/scripts/watch-sonic-dna-analysis.mjs
 *   SONIC_DNA_WATCH_SKIP_DB=1 node knowledge/scripts/watch-sonic-dna-analysis.mjs
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.join(__dirname, '../..')
const webRoot = path.join(repoRoot, 'web')
const stateDir = path.join(webRoot, '.dev')
const pidFile = path.join(stateDir, 'sonic-dna-watch.pid')
const syncScript = path.join(__dirname, 'sync-sonic-dna-analysis.mjs')
const debounceMs = Number(process.env.SONIC_DNA_WATCH_DEBOUNCE_MS ?? 2500)
const skipDb = process.env.SONIC_DNA_WATCH_SKIP_DB === '1'

const WATCH_DIRS = [
  path.join(repoRoot, 'knowledge/scripts'),
  path.join(repoRoot, 'knowledge/sonic-dna'),
  path.join(webRoot, 'lib/audio'),
]

const IGNORE = /(?:^|\/)(?:__pycache__|\.venv|node_modules)(?:\/|$)|(?:\.(?:pyc|pyo)$)/
const MATCH = /\.(?:py|mjs|json|ts)$/
/**
 * Sync mirrors encyclopedia → web/lib/audio/data/*.json.
 * fs.watch(recursive) under web/lib/audio reports relative paths like
 * `data/genre-intelligence.json` (not `lib/audio/data/...`) — ignore both shapes
 * or sync → mirror → watch → sync loops forever and Next HMR never settles.
 */
const SYNC_OUTPUT_BASENAMES = new Set(['genre-intelligence.json', 'genre-engine-rules.json'])

let timer = null
let running = false
let pending = false

function log(message) {
  process.stdout.write(`[sonic-dna:watch] ${message}\n`)
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

function shouldSync(filename) {
  const name = String(filename || '').replace(/\\/g, '/')
  if (!name) return false
  if (IGNORE.test(name)) return false
  const base = path.basename(name)
  if (SYNC_OUTPUT_BASENAMES.has(base)) return false
  if (base === 'watch-sonic-dna-analysis.mjs') return false
  if (base === 'sync-sonic-dna-analysis.mjs') return false
  return MATCH.test(name)
}

function runSync() {
  if (running) {
    pending = true
    return
  }
  running = true
  const args = [syncScript]
  if (skipDb) args.push('--skip-db')
  log(`sync starting${skipDb ? ' (catalog only)' : ' (db + catalog)'}`)
  const child = spawn(process.execPath, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    env: process.env,
  })
  child.on('exit', (code) => {
    running = false
    if (code !== 0) log(`sync failed (exit ${code ?? 'null'})`)
    else log('sync complete')
    if (pending) {
      pending = false
      schedule()
    }
  })
}

function schedule() {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    timer = null
    runSync()
  }, debounceMs)
}

function watchDir(dir) {
  if (!fs.existsSync(dir)) {
    log(`skip missing ${path.relative(repoRoot, dir)}`)
    return null
  }
  try {
    const watcher = fs.watch(dir, { recursive: true }, (_event, filename) => {
      if (!shouldSync(filename ? String(filename) : '')) return
      log(`change ${filename}`)
      schedule()
    })
    watcher.on('error', (err) => {
      log(`watcher error: ${err instanceof Error ? err.message : String(err)}`)
    })
    log(`watching ${path.relative(repoRoot, dir)}`)
    return watcher
  } catch (err) {
    log(`could not watch ${dir}: ${err instanceof Error ? err.message : String(err)}`)
    return null
  }
}

function shutdown() {
  try {
    if (fs.existsSync(pidFile) && Number(fs.readFileSync(pidFile, 'utf8').trim()) === process.pid) {
      fs.unlinkSync(pidFile)
    }
  } catch {
    /* ignore */
  }
  process.exit(0)
}

fs.mkdirSync(stateDir, { recursive: true })
if (fs.existsSync(pidFile)) {
  const existing = Number(fs.readFileSync(pidFile, 'utf8').trim())
  if (pidAlive(existing)) {
    log(`already running (pid ${existing})`)
    process.exit(0)
  }
}
fs.writeFileSync(pidFile, String(process.pid))

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

for (const dir of WATCH_DIRS) watchDir(dir)
log(`ready (debounce ${debounceMs}ms). Edit classifier/encyclopedia to refresh.`)
