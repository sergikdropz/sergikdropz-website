#!/usr/bin/env node
/**
 * Install a launchd job that sends due owner reminders at 9:20 local time.
 * Vercel cron runs the same route at 9:00 America/Phoenix; this Mac job is the backup.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const webRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const label = 'com.sergik.owner-release-reminders'
const plistPath = path.join(os.homedir(), 'Library', 'LaunchAgents', `${label}.plist`)
const logPath = path.join(webRoot, '.dev', 'owner-release-reminders.log')
const scriptPath = path.join(webRoot, 'scripts', 'send-owner-release-reminders.mjs')
const nodeBin = process.execPath

mkdirSync(path.dirname(logPath), { recursive: true })
mkdirSync(path.dirname(plistPath), { recursive: true })

const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${label}</string>
  <key>WorkingDirectory</key>
  <string>${webRoot}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${nodeBin}</string>
    <string>--disable-warning=MODULE_TYPELESS_PACKAGE_JSON</string>
    <string>${scriptPath}</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>9</integer>
    <key>Minute</key>
    <integer>20</integer>
  </dict>
  <key>StandardOutPath</key>
  <string>${logPath}</string>
  <key>StandardErrorPath</key>
  <string>${logPath}</string>
</dict>
</plist>
`

writeFileSync(plistPath, plist)
const domain = `gui/${process.getuid?.() ?? os.userInfo().uid}`
try {
  execFileSync('launchctl', ['bootout', domain, plistPath], { stdio: 'ignore' })
} catch {
  // Not loaded yet.
}
execFileSync('launchctl', ['bootstrap', domain, plistPath], { stdio: 'inherit' })
console.log(`[owner-reminders] Installed ${label}`)
console.log(`[owner-reminders] ${plistPath}`)
console.log('[owner-reminders] Runs every day at 9:20 local. Due notes only: Oct 7 and Oct 8–9, 2026.')
