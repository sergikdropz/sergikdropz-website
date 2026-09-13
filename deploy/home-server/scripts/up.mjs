#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const homeRoot = path.join(__dirname, '..')

function run(command, args, opts = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', cwd: homeRoot, ...opts })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

if (!fs.existsSync(path.join(homeRoot, '.env'))) {
  run('node', ['scripts/generate-keys.mjs'])
}

run('docker', ['compose', 'up', '-d'])
run('node', ['scripts/seed.mjs'])
run('node', ['scripts/switch-web-env.mjs'])
console.log('[home-server] Stack is up. Restart Next: cd web && npm run dev:stop && npm run dev:ensure')
