/**
 * One internal licensing desk pass. Creates a real inquiry and may email the owner.
 * Stops before checkout and activation.
 *
 *   npx tsx scripts/licensing-desk-check.ts --confirm
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const webRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const envPath = path.join(webRoot, '.env.local')
for (const line of readFileSync(envPath, 'utf8').split(/\n/)) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue
  const index = trimmed.indexOf('=')
  let value = trimmed.slice(index + 1).trim()
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1)
  }
  const key = trimmed.slice(0, index).trim()
  if (!process.env[key]) process.env[key] = value
}

if (!process.argv.includes('--confirm')) {
  console.log('Dry run. Re-run with --confirm to save one internal inquiry and email the owner.')
  process.exit(0)
}

async function main() {
  const { assessRightsGate } = await import('../lib/licensing/eligibility')
  const { createSupabaseServerClient } = await import('../lib/supabase')
  const { hydrateRightsPacket } = await import('../lib/studio/rights-ops')
  const { confirmLicensingEmail, getLicensingInquiry, sendLicensingQuote, submitLicensingInquiry } = await import(
    '../lib/licensing/store'
  )

const supabase = createSupabaseServerClient()
const { data: tracks, error } = await supabase
  .from('distribution_tracks')
  .select('music_library_track_id, title, release_id, splits, sonic_snapshot')
  .not('music_library_track_id', 'is', null)
  .limit(300)
if (error) throw new Error(error.message)

const releaseIds = [...new Set((tracks || []).map((track) => track.release_id).filter(Boolean))]
const checklists = new Map<string, { sample_clearance_status?: string | null; legal_locked?: boolean | null; split_sheet_status?: string | null }>()
if (releaseIds.length) {
  const { data: lists, error: listError } = await supabase
    .from('release_copyright_checklists')
    .select('release_id, sample_clearance_status, legal_locked, split_sheet_status')
    .in('release_id', releaseIds)
  if (listError) throw new Error(listError.message)
  for (const row of lists || []) checklists.set(String(row.release_id), row)
}

const chosen = (tracks || []).find((track) => {
  if (!track.music_library_track_id || !track.title) return false
  const checklist = checklists.get(String(track.release_id))
  const hydrated = hydrateRightsPacket(track)
  return assessRightsGate({
    track: {
      title: track.title,
      splits: track.splits,
      contains_samples: hydrated.contains_samples,
      clearance: hydrated.clearance,
    },
    sampleClearanceStatus: checklist?.sample_clearance_status,
    legalLocked: checklist?.legal_locked,
    splitSheetStatus: checklist?.split_sheet_status,
  }).cleared
})

if (!chosen) {
  console.log('No cleared distribution track. Stopped before creating an inquiry.')
  process.exit(0)
}

const created = await submitLicensingInquiry(
  {
    kind: 'catalog',
    fullName: 'Jordan Caboga',
    companyName: 'Nexus Studios AZ LLC',
    email: 'sergikdrops@gmail.com',
    authorized: true,
    projectName: 'Internal desk check',
    projectDescription: 'Internal check of the licensing desk for one non-exclusive social use. This is not a client request.',
    usageType: 'Creator / Social',
    channels: ['Social'],
    term: '1 year',
    territory: 'United States',
    exclusivity: 'non-exclusive',
    trackId: chosen.music_library_track_id,
    trackTitle: chosen.title,
    partyKind: 'direct',
    contractingEntity: 'Nexus Studios AZ LLC',
  },
  new Request('http://127.0.0.1:3001/api/licensing/inquiries'),
)

if (!created.ok) {
  console.log('submit_failed', created.error)
  process.exit(1)
}

const confirmed = await confirmLicensingEmail(created.emailToken)
const row = await getLicensingInquiry(created.inquiryId)
console.log(
  JSON.stringify({
    publicId: created.publicId,
    track: chosen.title,
    confirmed: confirmed.ok,
    status: row?.status,
    risk: row?.risk_level,
    rightsCleared: row?.rights_cleared,
  }),
)

if (row?.status !== 'UNDER_REVIEW') {
  console.log('Stopped before a quote. The inquiry is not under review.')
  process.exit(0)
}

await sendLicensingQuote(row.id, 'desk-check', 25000, 'Internal desk check. Do not pay.')
const after = await getLicensingInquiry(row.id)
console.log(
  JSON.stringify({
    publicId: created.publicId,
    status: after?.status,
    payment: after?.payment_status,
    license: after?.license_status,
    quoteCents: after?.quote_cents,
  }),
)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
