import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase'
import { getSingleReleaseCopyrightReadiness } from '@/lib/studio/copyright-pipeline'
import { mergeUgcPack, parseUgcPack } from '@/lib/studio/ugc-pack'
import { mergePartyContacts, parsePartyContacts } from '@/lib/studio/rights-contract-send'
import { mergeRightsPacketDrafts, parseRightsPacketDrafts } from '@/lib/studio/rights-packet-drafts'
import { applyRightsPacketDrafts, buildRightsPackets } from '@/lib/studio/rights-packets'
import { counselAuditRecord, counselGateForPacket } from '@/lib/studio/music-law/release-gate'
import { parseTrackClearance } from '@/lib/studio/rights-ops'
import { normalizeIpi } from '@/lib/studio/dsp-package'

const ALLOWED_FIELDS = [
  'rights_intake_complete',
  'legal_locked',
  'composition_registered',
  'master_registered',
  'pro_registered',
  'monitoring_enabled',
  'owner_name',
  'role_queue',
  'split_sheet_status',
  'producer_agreement_status',
  'sample_clearance_status',
  'due_date',
  'publisher_name',
  'publisher_ipi',
  'writer_ipi',
  'neighboring_rights_registered',
  'neighboring_rights_society',
] as const

type AllowedField = (typeof ALLOWED_FIELDS)[number]

function pickAllowedFields(body: Record<string, unknown>) {
  const updates: Partial<Record<AllowedField, boolean | string>> & {
    ugc_pack?: ReturnType<typeof parseUgcPack>
    party_contacts?: ReturnType<typeof parsePartyContacts>
    rights_packets?: ReturnType<typeof parseRightsPacketDrafts>
  } = {}
  for (const field of ALLOWED_FIELDS) {
    if (typeof body[field] === 'boolean') {
      updates[field] = body[field] as boolean
    }
    if (
      (field === 'owner_name' ||
        field === 'role_queue' ||
        field === 'split_sheet_status' ||
        field === 'producer_agreement_status' ||
        field === 'sample_clearance_status' ||
        field === 'due_date' ||
        field === 'publisher_name' ||
        field === 'publisher_ipi' ||
        field === 'writer_ipi' ||
        field === 'neighboring_rights_society') &&
      typeof body[field] === 'string'
    ) {
      if (field === 'publisher_ipi' || field === 'writer_ipi') {
        const text = String(body[field])
        updates[field] = normalizeIpi(text) || text.replace(/\D/g, '') || ''
      } else {
        updates[field] = body[field] as string
      }
    }
  }
  if (body.ugc_pack && typeof body.ugc_pack === 'object') {
    updates.ugc_pack = parseUgcPack(body.ugc_pack)
  }
  if (body.party_contacts !== undefined) {
    updates.party_contacts = parsePartyContacts(body.party_contacts)
  }
  if (body.rights_packets !== undefined && typeof body.rights_packets === 'object') {
    // Keep raw patch so merge can clear a kind with null / empty text.
    updates.rights_packets = body.rights_packets as ReturnType<typeof parseRightsPacketDrafts>
  }
  return updates
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createSupabaseServerClient()
    const readiness = await getSingleReleaseCopyrightReadiness(supabase, params.id)

    return NextResponse.json({ readiness })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to fetch copyright readiness' },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const updates = pickAllowedFields(body || {})
    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'No valid checklist fields provided' },
        { status: 400 }
      )
    }

    const supabase = createSupabaseServerClient()
    const current = await getSingleReleaseCopyrightReadiness(supabase, params.id)
    if (updates.legal_locked === true && current && !current.checks.legal_lock_ready && !current.checks.legal_locked) {
      return NextResponse.json(
        {
          error:
            'Finish rights intake, split/producer/sample clearance, and DSP attestations before legal lock.',
        },
        { status: 400 },
      )
    }
    if (updates.rights_intake_complete === true && !('role_queue' in updates)) {
      updates.role_queue = 'legal'
    }
    if (updates.ugc_pack) {
      updates.ugc_pack = mergeUgcPack(current?.ugc_pack, body.ugc_pack)
    }
    if (updates.party_contacts) {
      updates.party_contacts = mergePartyContacts(current?.party_contacts, body.party_contacts)
    }
    if (updates.rights_packets) {
      updates.rights_packets = mergeRightsPacketDrafts(current?.rights_packets, body.rights_packets)
    } else if (body.rights_packets !== undefined) {
      updates.rights_packets = mergeRightsPacketDrafts(current?.rights_packets, body.rights_packets)
    }

    const approvingSplit = updates.split_sheet_status === 'approved'
    const approvingProducer = updates.producer_agreement_status === 'approved'
    if (approvingSplit || approvingProducer) {
      const [{ data: trackRows }, { data: releaseRow }] = await Promise.all([
        supabase
          .from('distribution_tracks')
          .select('id, title, contributors, splits, isrc_full, origin, writer_legal_names, mechanical_licensed, contains_samples, sonic_snapshot')
          .eq('release_id', params.id),
        supabase.from('distribution_releases').select('title, album_artist, label_name').eq('id', params.id).maybeSingle(),
      ])
      const counselTracks = (trackRows || []).map((track) => ({
        ...track,
        clearance: parseTrackClearance(
          track.sonic_snapshot && typeof track.sonic_snapshot === 'object'
            ? (track.sonic_snapshot as { clearance?: unknown }).clearance
            : null,
        ),
      }))
      const packets = applyRightsPacketDrafts(
        buildRightsPackets({
          releaseTitle: releaseRow?.title || 'Untitled',
          albumArtist: releaseRow?.album_artist || releaseRow?.label_name || 'SERGIK',
          publisherName: current?.rights.publisher_name,
          tracks: counselTracks,
        }),
        updates.rights_packets || current?.rights_packets,
      )
      const kinds = [
        approvingSplit ? 'split_sheet' : null,
        approvingProducer ? 'producer_agreement' : null,
        approvingProducer ? 'collab_agreement' : null,
      ].filter(Boolean) as Array<'split_sheet' | 'producer_agreement' | 'collab_agreement'>
      for (const kind of kinds) {
        const packet = packets.find((row) => row.kind === kind)
        if (!packet?.needed || !packet.text) continue
        const gate = counselGateForPacket({ text: packet.text, kind, tracks: counselTracks })
        await supabase
          .from('release_copyright_checklists')
          .upsert({ release_id: params.id, counsel_audit: counselAuditRecord(gate.report) }, { onConflict: 'release_id' })
        if (gate.blockers.length) {
          return NextResponse.json(
            {
              error: `Music Business Counsel blocked approval: ${gate.blockers[0]?.title || 'open blockers'}.`,
              blockers: gate.blockers.map((finding) => ({ title: finding.title, address: finding.address })),
            },
            { status: 409 },
          )
        }
      }
    }

    const { error } = await supabase.from('release_copyright_checklists').upsert(
      {
        release_id: params.id,
        ...updates,
      },
      { onConflict: 'release_id' }
    )

    if (error) {
      const missingPack = /ugc_pack/i.test(error.message || '')
      if (missingPack && updates.ugc_pack) {
        return NextResponse.json(
          {
            error:
              'Run web/supabase/migrations/add_ugc_pack_to_copyright_checklists.sql so SERGIK UGC pack can save.',
          },
          { status: 500 }
        )
      }
      const missingContacts = /party_contacts/i.test(error.message || '')
      if (missingContacts && updates.party_contacts) {
        return NextResponse.json(
          {
            error:
              'Run web/supabase/migrations/add_party_contacts_to_copyright_checklists.sql so collaborator emails can save.',
          },
          { status: 500 }
        )
      }
      const missingPackets = /rights_packets/i.test(error.message || '')
      if (missingPackets && updates.rights_packets) {
        return NextResponse.json(
          {
            error:
              'Run web/supabase/migrations/add_rights_packets_to_copyright_checklists.sql so contract packet edits can save.',
          },
          { status: 500 }
        )
      }
      return NextResponse.json(
        { error: error.message || 'Failed to update copyright checklist' },
        { status: 500 }
      )
    }

    const readiness = await getSingleReleaseCopyrightReadiness(supabase, params.id)
    return NextResponse.json({ readiness })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to update copyright checklist' },
      { status: 500 }
    )
  }
}
