#!/usr/bin/env node
/**
 * Migrate legacy release-schedule.json "scheduled" stubs into pending
 * distribution releases (vault import + schedule rewrite).
 *
 * Usage: cd web && npx tsx scripts/migrate-scheduled-eps-to-studio.ts
 */
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { migrateLegacyScheduledEpsToPending } from '../lib/studio/migrate-scheduled-eps'

config({ path: '.env.local' })

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const summary = await migrateLegacyScheduledEpsToPending(supabase)
  for (const row of summary.results) {
    console.log(
      `${row.action.padEnd(8)} ${row.title} → ${row.releaseId || '(none)'} tracks=${row.trackCount ?? 0}${
        row.message ? ` (${row.message})` : ''
      }`,
    )
  }
  console.log(`Schedule rewritten: ${summary.scheduleCount} distribution-backed row(s)`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
