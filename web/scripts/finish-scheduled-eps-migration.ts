#!/usr/bin/env node
/**
 * Finish migration: import missing Inspire EP + restore street dates from legacy schedule.
 * Usage: cd web && npx tsx scripts/finish-scheduled-eps-migration.ts
 */
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { importVaultFolderToStudio } from '../lib/studio/vault-import-server'
import {
  distributionToScheduleShape,
  readReleaseSchedule,
  writeReleaseSchedule,
} from '../lib/studio/schedule-bridge'

config({ path: '.env.local' })

const DATE_FIXES: Array<{ id: string; release_date: string; presave: string | null }> = [
  {
    id: 'release-collection-unreleased-eps-sergik---vice--mu5pzg68',
    release_date: '2026-09-23',
    presave: '2026-09-14',
  },
  {
    id: 'release-collection-unreleased-eps-sergik---stayi-mu5pzoor',
    release_date: '2026-10-30',
    presave: '2026-10-23',
  },
]

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error('Missing Supabase credentials')

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const inspire = await importVaultFolderToStudio(supabase, {
    folderId: 'collection-unreleased-eps-sergik---inspire-',
  })
  console.log(
    `inspire ${inspire.created ? 'created' : 'linked'} ${inspire.release.id} tracks=${inspire.tracks.length}`,
  )

  for (const fix of DATE_FIXES) {
    const { error } = await supabase
      .from('distribution_releases')
      .update({ release_date: fix.release_date })
      .eq('id', fix.id)
    if (error) throw new Error(`${fix.id}: ${error.message}`)
    console.log(`date ${fix.id} → ${fix.release_date}`)
  }

  const { data: releases, error } = await supabase
    .from('distribution_releases')
    .select('id,title,type,release_date,artwork_url,genre,description,distributor_status')
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)

  const previous = new Map(readReleaseSchedule().schedule.map((r) => [r.id, r]))
  const next = (releases || []).map((r) => {
    const mapped = distributionToScheduleShape(r)
    const prev = previous.get(r.id)
    const dateFix = DATE_FIXES.find((f) => f.id === r.id)
    return {
      ...mapped,
      status: r.distributor_status === 'live' ? 'released' : 'pending',
      release_date: dateFix?.release_date || mapped.release_date || prev?.release_date || '',
      presave_date: dateFix ? dateFix.presave : prev?.presave_date ?? null,
      source: 'distribution' as const,
      distributor_status: r.distributor_status || 'draft',
    }
  })

  next.sort((a, b) => {
    const da = a.release_date ? new Date(a.release_date).getTime() : Number.MAX_SAFE_INTEGER
    const db = b.release_date ? new Date(b.release_date).getTime() : Number.MAX_SAFE_INTEGER
    return da - db
  })

  writeReleaseSchedule({ schedule: next })
  for (const row of next) {
    console.log(`${row.status.padEnd(10)} ${(row.release_date || 'TBD').padEnd(12)} ${row.title}`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
