#!/usr/bin/env node
/**
 * Keep web/data/printful-catalog.json warm for SERGWEAR (public Printful catalog API).
 * Skips network when cache already has products.
 */
import { readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const webRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const cachePath = path.join(webRoot, 'data', 'printful-catalog.json')

try {
  const raw = await readFile(cachePath, 'utf8')
  const parsed = JSON.parse(raw)
  const count = parsed.productCount ?? parsed.products?.length ?? 0
  if (count >= 100) {
    process.exit(0)
  }
} catch {
  // cold cache
}

const result = spawnSync('npx', ['tsx', 'scripts/sync-printful-catalog.ts'], {
  cwd: webRoot,
  stdio: 'inherit',
  env: process.env,
})

process.exit(result.status === 0 ? 0 : 0)
