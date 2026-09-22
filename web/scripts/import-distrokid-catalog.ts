#!/usr/bin/env node
/**
 * Import DistroKid My Music catalog JSON into Release Studio.
 *
 * Usage:
 *   cd web && npx tsx scripts/import-distrokid-catalog.ts --dry-run
 *   cd web && npx tsx scripts/import-distrokid-catalog.ts
 *   cd web && npx tsx scripts/import-distrokid-catalog.ts --overwrite
 */
import { config } from 'dotenv'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'
import { importDistroKidCatalogToStudio } from '../lib/studio/distrokid-import-server'
import { upsertScheduleFromDistribution } from '../lib/studio/schedule-bridge'

config({ path: '.env.local' })

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const overwrite = process.argv.includes('--overwrite')
  const fileArg = process.argv.find((a) => a.startsWith('--file='))
  const filePath = resolve(
    process.cwd(),
    fileArg?.slice('--file='.length) || 'data/distrokid-catalog-export.json',
  )

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  const catalog = JSON.parse(readFileSync(filePath, 'utf-8'))
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const result = await importDistroKidCatalogToStudio(supabase, {
    catalog,
    dryRun,
    fillEmptyOnly: !overwrite,
    matchVault: true,
  })

  for (const row of result.releases) {
    const vaultHits = row.tracks.filter((t) => t.vault_match).length
    console.log(
      `${row.status.padEnd(14)} ${row.title} upc=${row.upc || '—'} tracks=${row.tracks.length} vault=${vaultHits}${
        row.message ? ` (${row.message})` : ''
      }`,
    )
    if (row.title === 'Soul Candy') {
      const isrcs = row.tracks.map((t) => t.isrc_full).join(',')
      console.log(`  Soul Candy ISRCs: ${isrcs}`)
      console.log(`  store_links: ${row.store_links.map((s) => `${s.store}:${s.status}`).join(', ')}`)
    }
  }

  if (!dryRun) {
    for (const row of result.releases) {
      if (!row.release_id || row.status === 'error') continue
      const { data: release } = await supabase
        .from('distribution_releases')
        .select('id, title, type, release_date, artwork_url, genre, description, distributor_status')
        .eq('id', row.release_id)
        .maybeSingle()
      if (release) upsertScheduleFromDistribution(release)
    }
  }

  console.log(
    `${dryRun ? 'Dry run' : 'Import'} complete: ${result.created} create, ${result.updated} update${
      overwrite ? ' (overwrite)' : ' (fill empty only)'
    }`,
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
