#!/usr/bin/env node
import net from 'node:net'
import { spawnSync } from 'node:child_process'

const port = Number(process.argv[2])
if (!Number.isInteger(port) || port <= 0) {
  console.error('[dev-guard] Usage: node scripts/ensure-port-free.mjs <port>')
  process.exit(1)
}

if (process.env.ALLOW_DEV_PORT_IN_USE === '1') {
  process.exit(0)
}

const tester = net.createServer()

tester.once('error', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    console.error(`[dev-guard] Port ${port} is already in use.`)
    console.error('[dev-guard] Stop the existing dev server first, or run with ALLOW_DEV_PORT_IN_USE=1 to bypass.')

    const lsof = spawnSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN'], {
      encoding: 'utf8',
    })

    if (lsof.status === 0 && lsof.stdout.trim()) {
      console.error('\n[dev-guard] Listener details:')
      console.error(lsof.stdout.trim())
    }

    process.exit(1)
  }

  console.error('[dev-guard] Failed to check port:', err?.message || err)
  process.exit(1)
})

tester.once('listening', () => {
  tester.close(() => process.exit(0))
})

tester.listen(port, '0.0.0.0')
