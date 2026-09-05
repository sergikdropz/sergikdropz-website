#!/usr/bin/env node
/**
 * Watches web/app for page/route changes and regenerates the site knowledge snapshot.
 * Used by the local dev daemon so Admin AI stays current while you build.
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const WEB_ROOT = path.resolve(__dirname, '..')
const APP_DIR = path.join(WEB_ROOT, 'app')
const BUILD_SCRIPT = path.join(__dirname, 'build-site-knowledge.mjs')

const debounceMs = Number(process.env.KNOWLEDGE_WATCH_DEBOUNCE_MS ?? 750)
const PAGE_OR_ROUTE = /(?:^|\/)(page|route)\.(tsx|ts|jsx|js)$/

let timer = null
let building = false
let pending = false

function log(message) {
  process.stdout.write(`[knowledge:watch] ${message}\n`)
}

function shouldRebuild(filename) {
  if (!filename) return true
  const normalized = filename.replace(/\\/g, '/')
  return PAGE_OR_ROUTE.test(normalized)
}

function runBuild() {
  if (building) {
    pending = true
    return
  }
  building = true
  const child = spawn(process.execPath, [BUILD_SCRIPT], {
    cwd: WEB_ROOT,
    stdio: 'inherit',
  })
  child.on('exit', (code) => {
    building = false
    if (code !== 0) {
      log(`Rebuild failed (exit ${code ?? 'null'})`)
    }
    if (pending) {
      pending = false
      scheduleBuild()
    }
  })
}

function scheduleBuild() {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    timer = null
    runBuild()
  }, debounceMs)
}

function watchDir(dir) {
  try {
    const watcher = fs.watch(dir, { recursive: true }, (_event, filename) => {
      if (!shouldRebuild(filename ? String(filename) : '')) return
      scheduleBuild()
    })
    watcher.on('error', (err) => {
      log(`Watcher error: ${err instanceof Error ? err.message : String(err)}`)
    })
    return watcher
  } catch (err) {
    log(`Could not watch ${dir}: ${err instanceof Error ? err.message : String(err)}`)
    return null
  }
}

if (!fs.existsSync(APP_DIR)) {
  log(`Missing app dir: ${APP_DIR}`)
  process.exit(1)
}

log(`Watching ${path.relative(WEB_ROOT, APP_DIR)} for page/route changes`)
runBuild()
watchDir(APP_DIR)

process.on('SIGINT', () => process.exit(0))
process.on('SIGTERM', () => process.exit(0))
