#!/usr/bin/env node
/**
 * Copy SERGIK UGC pack evidence onto monetization_enrollment.sergik_meta_rights_manager.
 * Leaves DistroKid audio-library and Meta creator programs untouched.
 * Status rules match rightsManagerFromUgc in lib/studio/monetization-enrollment.ts.
 *
 * Usage: node scripts/sync-ugc-enrollment.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { join } from 'path'

config({ path: join(process.cwd(), '.env.local') })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in web/.env.local')
  process.exit(1)
}

function recordFromPack(pack, checkedOn) {
  const optedIn = pack?.opted_in === true
  const meta = pack?.meta !== false
  const status = typeof pack?.status === 'string' ? pack.status : 'not_opted'
  let next = 'unknown'
  if (!optedIn || !meta) next = 'not_enrolled'
  else if (status === 'live') next = 'enrolled'
  else if (status === 'ineligible') next = 'rejected'
  else if (status === 'submitted') next = 'pending'
  return {
    status: next,
    sourceUrl: '',
    checkedOn,
    reviewer: 'ugc_pack',
    annualCostCents: null,
    commissionPercent: null,
    notes: 'Copied from SERGIK UGC pack. Not a DistroKid enrollment.',
  }
}

const checkedOn = new Date().toISOString().slice(0, 10)
const supabase = createClient(url, key)
const { data, error } = await supabase
  .from('release_copyright_checklists')
  .select('release_id, ugc_pack, monetization_enrollment')

if (error) {
  console.error(error.message)
  process.exit(1)
}

let updated = 0
for (const row of data || []) {
  const current = row.monetization_enrollment && typeof row.monetization_enrollment === 'object' ? row.monetization_enrollment : {}
  const next = {
    ...current,
    sergik_meta_rights_manager: recordFromPack(row.ugc_pack, checkedOn),
  }
  const { error: writeError } = await supabase
    .from('release_copyright_checklists')
    .update({ monetization_enrollment: next })
    .eq('release_id', row.release_id)
  if (writeError) {
    console.error(row.release_id, writeError.message)
    process.exit(1)
  }
  updated += 1
}

const counts = {}
for (const row of data || []) {
  const status = recordFromPack(row.ugc_pack, checkedOn).status
  counts[status] = (counts[status] || 0) + 1
}
console.log(`[ugc-enrollment] updated ${updated} releases`, counts)
