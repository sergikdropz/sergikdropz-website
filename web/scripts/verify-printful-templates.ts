#!/usr/bin/env -S npx tsx
/**
 * End-to-end check that every Printful placement resolves to its OWN
 * positioning template + print file for a representative spread of products.
 *
 * This runs the real `fetchCatalogProductDetail` path (the same code the
 * admin fitting room calls), so a green run here means the designer, the
 * preview card, the design canvas and publish all see calibrated drop zones.
 *
 *   npm run merch:printful-templates            # default product spread
 *   npm run merch:printful-templates -- 71 146  # specific catalog ids
 *
 * Never prints the API key; only whether it is set.
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const webRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

function loadEnvFile(filePath: string) {
  if (!existsSync(filePath)) return
  for (const line of readFileSync(filePath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = value
  }
}

loadEnvFile(path.join(webRoot, '.env.local'))

if (!process.env.PRINTFUL_API_KEY?.trim()) {
  console.error('[templates:verify] PRINTFUL_API_KEY not set — see web/docs/admin/PRINTFUL_API_SETUP.md')
  process.exit(1)
}

// tee, hoodie, dad hat, sweatpants, mug, poster — plus any ids from the CLI.
const DEFAULT_IDS = [71, 146, 206, 403, 19, 1]

async function main() {
  // Loaded after env so `@/lib/printful` picks up the key.
  const { fetchCatalogProductDetail } = await import('@/lib/merch/printful-catalog')
  const { auditPlacementTemplates } = await import('@/lib/merch/placement-audit')

  const cliIds = process.argv
    .slice(2)
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0)
  const productIds = cliIds.length > 0 ? cliIds : DEFAULT_IDS

  console.log(`[templates:verify] key set · store ${process.env.PRINTFUL_STORE_ID?.trim() || '(none)'}`)
  console.log(`[templates:verify] checking products: ${productIds.join(', ')}\n`)

  let failures = 0
  for (const id of productIds) {
    let detail
    try {
      detail = await fetchCatalogProductDetail(id)
    } catch (error) {
      console.log(`✗ ${id}  (fetch failed) — ${error instanceof Error ? error.message : String(error)}`)
      failures += 1
      continue
    }
    if (!detail) {
      console.log(`✗ ${id}  not found in Printful catalog`)
      failures += 1
      continue
    }

    const audit = auditPlacementTemplates(detail)
    const ok = audit.problems.length === 0
    if (!ok) failures += 1
    console.log(`${ok ? '✓' : '✗'} ${id}  ${detail.product.title}`)
    for (const row of audit.rows) {
      const stage = row.stage
        ? `x=${row.stage.x.toFixed(3)} y=${row.stage.y.toFixed(3)} w=${row.stage.w.toFixed(3)} h=${row.stage.h.toFixed(3)}`
        : 'no drop zone'
      const print =
        row.printWidth && row.printHeight ? `${row.printWidth}×${row.printHeight}@${row.dpi ?? '?'}` : 'no printfile'
      console.log(
        `   ${row.type.padEnd(22)} tpl ${String(row.templateId ?? '—').padEnd(7)} ${stage.padEnd(44)} ${print}`
      )
    }
    for (const warning of audit.warnings) console.log(`   ~ ${warning}`)
    for (const problem of audit.problems) console.log(`   ! ${problem}`)
  }

  console.log('')
  if (failures > 0) {
    console.error(`[templates:verify] ${failures} product(s) with placement wiring problems. See above.`)
    process.exit(1)
  }
  console.log('[templates:verify] OK — every placement has its own template, drop zone and print file.')
}

main().catch((error) => {
  console.error('[templates:verify] crashed:', error instanceof Error ? error.message : error)
  process.exit(1)
})
