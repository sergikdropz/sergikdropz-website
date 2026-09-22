import { normalizeSplitRows } from '@/lib/studio/import-parse'
import {
  displayArtistLine,
  namesForRole,
  parseContributors,
} from '@/lib/studio/track-credits'
import { knownLegalName, seedWriterLegalRows } from '@/lib/studio/songwriter'
import { summarizeSplits, type RightsTrackLike } from '@/lib/studio/rights-ops'

export type RightsPacketKind = 'split_sheet' | 'producer_agreement' | 'collab_agreement'

export type RightsPacket = {
  kind: RightsPacketKind
  label: string
  statusField: 'split_sheet_status' | 'producer_agreement_status' | null
  ready: boolean
  needed: boolean
  parties: string[]
  missing: string[]
  text: string
  summary: string
}

export type RightsPacketInput = {
  releaseTitle?: string
  albumArtist?: string | null
  publisherName?: string | null
  tracks: RightsTrackLike[]
  generatedAt?: string
}

function clean(value: unknown): string {
  return value == null ? '' : String(value).trim()
}

function todayIso(value?: string): string {
  if (value && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10)
  return new Date().toISOString().slice(0, 10)
}

function uniqueNames(values: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of values) {
    const name = clean(raw)
    if (!name) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(name)
  }
  return out
}

function partyLine(stage: string, legal?: string | null): string {
  const stageName = clean(stage)
  const legalName = clean(legal) || knownLegalName(stageName) || ''
  return legalName ? `${stageName} (${legalName})` : stageName
}

function trackBilled(track: RightsTrackLike): string {
  return displayArtistLine(parseContributors(track.contributors), 'SERGIK')
}

function producerNames(tracks: RightsTrackLike[]): string[] {
  return uniqueNames(
    tracks.flatMap((track) => namesForRole(parseContributors(track.contributors), 'producer')),
  )
}

function collabTracks(tracks: RightsTrackLike[]): RightsTrackLike[] {
  return tracks.filter((track) => {
    const contributors = parseContributors(track.contributors)
    const primary = namesForRole(contributors, 'primary')
    const featured = namesForRole(contributors, 'featured')
    return primary.length > 1 || featured.length > 0
  })
}

/** Split sheet: ownership % + legal names from Catalog. */
export function buildSplitSheetPacket(input: RightsPacketInput): RightsPacket {
  const title = clean(input.releaseTitle) || 'Untitled'
  const artist = clean(input.albumArtist) || 'SERGIK'
  const publisher = clean(input.publisherName) || 'SERGIK Music'
  const date = todayIso(input.generatedAt)
  const missing: string[] = []
  const parties: string[] = []

  if (!input.tracks.length) missing.push('Add tracks in Catalog')

  const body: string[] = []
  for (const track of input.tracks) {
    const summary = summarizeSplits(track.splits)
    const rows = normalizeSplitRows(track.splits)
    const writers = seedWriterLegalRows(track.contributors, track.writer_legal_names)
    if (!summary.ok) missing.push(`Splits incomplete on ${track.title || 'Untitled'}`)
    for (const row of rows) {
      if (row.name) parties.push(partyLine(row.name, row.legal_name))
    }
    body.push(
      [
        `Track: ${track.title || 'Untitled'}`,
        `Billed: ${trackBilled(track)}`,
        `ISRC: ${track.isrc_full || '—'}`,
        'Ownership:',
        ...(rows.length
          ? rows.map((row) => {
              const legal = row.legal_name ? ` · legal ${row.legal_name}` : ''
              const role = row.role ? ` · ${row.role}` : ''
              const pub = row.publisher ? ` · pub ${row.publisher}` : ''
              return `  - ${row.name || '—'}: ${row.percentage}%${role}${legal}${pub}`
            })
          : ['  - (no split rows)']),
        `Writers: ${
          writers.map((row) => partyLine(row.stage, row.legal)).join(', ') || '—'
        }`,
      ].join('\n'),
    )
  }

  const ready = missing.length === 0 && input.tracks.length > 0
  const text = [
    'SERGIK SPLIT SHEET',
    `Release: ${title}`,
    `Album artist: ${artist}`,
    `Publisher: ${publisher}`,
    `Generated: ${date}`,
    '',
    'This first-party split sheet records master ownership for the tracks below.',
    'Each party confirms the percentages total 100% and match Catalog credits.',
    'It is not a DistroKid product — SERGIK Studio package paperwork only.',
    '',
    body.join('\n\n'),
    '',
    'Signatures / acknowledgment',
    ...uniqueNames(parties).map((party) => `${party}: ______________________  Date: __________`),
    artist === 'SERGIK' ? '' : `Album artist (${artist}): ______________________  Date: __________`,
  ]
    .filter((line, index, arr) => !(line === '' && arr[index - 1] === ''))
    .join('\n')

  return {
    kind: 'split_sheet',
    label: 'Split sheet',
    statusField: 'split_sheet_status',
    ready,
    needed: input.tracks.length > 0,
    parties: uniqueNames(parties),
    missing,
    text,
    summary: ready
      ? `${input.tracks.length} track${input.tracks.length === 1 ? '' : 's'} · ${uniqueNames(parties).length} part${uniqueNames(parties).length === 1 ? 'y' : 'ies'}`
      : missing[0] || 'Not ready',
  }
}

/** Producer agreement for credited producers (SERGIK self-produce when none listed). */
export function buildProducerAgreementPacket(input: RightsPacketInput): RightsPacket {
  const title = clean(input.releaseTitle) || 'Untitled'
  const artist = clean(input.albumArtist) || 'SERGIK'
  const publisher = clean(input.publisherName) || 'SERGIK Music'
  const date = todayIso(input.generatedAt)
  const producers = producerNames(input.tracks)
  const parties = producers.length ? producers : [artist]
  const missing: string[] = []

  if (!input.tracks.length) missing.push('Add tracks in Catalog')

  const byProducer = new Map<string, string[]>()
  for (const track of input.tracks) {
    const credited = namesForRole(parseContributors(track.contributors), 'producer')
    const names = credited.length ? credited : [artist]
    for (const name of names) {
      const list = byProducer.get(name) || []
      list.push(track.title || 'Untitled')
      byProducer.set(name, list)
    }
  }

  const ready = missing.length === 0 && input.tracks.length > 0
  const text = [
    'SERGIK PRODUCER AGREEMENT',
    `Release: ${title}`,
    `Album artist / label: ${artist}`,
    `Publisher: ${publisher}`,
    `Generated: ${date}`,
    '',
    'First-party producer paperwork for this release package.',
    'Producer confirms creative contribution to the master(s) listed and that SERGIK may distribute, promote, and monetize them worldwide.',
    'No DistroKid add-on — this lives in SERGIK Studio Rights.',
    '',
    'Producers & tracks:',
    ...Array.from(byProducer.entries()).map(
      ([name, titles]) =>
        `- ${partyLine(name, knownLegalName(name))}: ${titles.join(', ')}`,
    ),
    '',
    'Terms (summary)',
    '1. Producer warrants they have authority to grant these rights for their contribution.',
    '2. Ownership percentages remain as stated on the SERGIK split sheet.',
    '3. SERGIK / album artist may register ISRCs, deliver to DSPs, and collect neighboring rights via SoundExchange where applicable.',
    '4. Moral rights waived to the extent permitted for distribution and promotion of the masters.',
    '',
    'Signatures',
    ...parties.map(
      (party) => `${partyLine(party, knownLegalName(party))}: ______________________  Date: __________`,
    ),
    `For ${artist}: ______________________  Date: __________`,
  ].join('\n')

  return {
    kind: 'producer_agreement',
    label: 'Producer agreement',
    statusField: 'producer_agreement_status',
    ready,
    needed: input.tracks.length > 0,
    parties: uniqueNames(parties.map((name) => partyLine(name, knownLegalName(name)))),
    missing,
    text,
    summary: ready
      ? `${parties.length} producer${parties.length === 1 ? '' : 's'} · ${input.tracks.length} track${input.tracks.length === 1 ? '' : 's'}`
      : missing[0] || 'Not ready',
  }
}

/** Collab / featured agreement when billed x or feat. artists appear. */
export function buildCollabAgreementPacket(input: RightsPacketInput): RightsPacket {
  const title = clean(input.releaseTitle) || 'Untitled'
  const artist = clean(input.albumArtist) || 'SERGIK'
  const publisher = clean(input.publisherName) || 'SERGIK Music'
  const date = todayIso(input.generatedAt)
  const rows = collabTracks(input.tracks)
  const parties: string[] = []
  const missing: string[] = []

  if (!rows.length) {
    return {
      kind: 'collab_agreement',
      label: 'Collab agreement',
      statusField: 'producer_agreement_status',
      ready: true,
      needed: false,
      parties: [],
      missing: [],
      text: '',
      summary: 'No collab / featured artists — not required',
    }
  }

  const body: string[] = []
  for (const track of rows) {
    const contributors = parseContributors(track.contributors)
    const primary = namesForRole(contributors, 'primary')
    const featured = namesForRole(contributors, 'featured')
    const writers = seedWriterLegalRows(track.contributors, track.writer_legal_names)
    for (const name of [...primary, ...featured]) parties.push(partyLine(name, knownLegalName(name)))
    for (const writer of writers) {
      if (!writer.legal && !knownLegalName(writer.stage) && writer.stage.toLowerCase() !== 'sergik') {
        missing.push(`Legal name missing for ${writer.stage} on ${track.title || 'Untitled'}`)
      }
    }
    body.push(
      [
        `Track: ${track.title || 'Untitled'}`,
        `Billed: ${trackBilled(track)}`,
        `Primary: ${primary.join(' x ') || '—'}`,
        `Featured: ${featured.join(', ') || '—'}`,
        `ISRC: ${track.isrc_full || '—'}`,
        `Splits: ${summarizeSplits(track.splits).label}`,
        `Writers: ${writers.map((row) => partyLine(row.stage, row.legal)).join(', ') || '—'}`,
      ].join('\n'),
    )
  }

  const ready = missing.length === 0
  const text = [
    'SERGIK COLLABORATION AGREEMENT',
    `Release: ${title}`,
    `Album artist: ${artist}`,
    `Publisher: ${publisher}`,
    `Generated: ${date}`,
    '',
    'First-party collab / featured artist agreement for masters on this release.',
    'Each billed or featured collaborator confirms consent to appear on the release, use of their name/likeness in credits and artwork, and distribution of the master under the split sheet.',
    'SERGIK Studio package paperwork — not a DistroKid add-on.',
    '',
    body.join('\n\n'),
    '',
    'Terms (summary)',
    '1. Collaborators grant SERGIK / album artist a non-exclusive license to distribute and promote the master worldwide.',
    '2. Credit will appear as billed on Catalog (x for co-primary, feat. for featured).',
    '3. Ownership and publishing shares follow the split sheet and songwriter legal names on file.',
    '4. No party will enroll this master in a competing UGC/Content ID pack without written agreement.',
    '',
    'Signatures',
    ...uniqueNames(parties).map((party) => `${party}: ______________________  Date: __________`),
    `For ${artist}: ______________________  Date: __________`,
  ].join('\n')

  return {
    kind: 'collab_agreement',
    label: 'Collab agreement',
    statusField: 'producer_agreement_status',
    ready,
    needed: true,
    parties: uniqueNames(parties),
    missing,
    text,
    summary: ready
      ? `${rows.length} collab track${rows.length === 1 ? '' : 's'} · ${uniqueNames(parties).length} part${uniqueNames(parties).length === 1 ? 'y' : 'ies'}`
      : missing[0] || 'Not ready',
  }
}

export function buildRightsPackets(input: RightsPacketInput): RightsPacket[] {
  return [
    buildSplitSheetPacket(input),
    buildProducerAgreementPacket(input),
    buildCollabAgreementPacket(input),
  ]
}

/** Overlay saved packet drafts onto generated packets (manual / AI edits). */
export function applyRightsPacketDrafts(
  packets: RightsPacket[],
  drafts: Partial<Record<RightsPacketKind, { text?: string | null }>> | null | undefined,
): RightsPacket[] {
  if (!drafts) return packets
  return packets.map((packet) => {
    const text = String(drafts[packet.kind]?.text || '').trim()
    if (!text) return packet
    return {
      ...packet,
      text,
      summary: packet.summary.includes('edited') ? packet.summary : `${packet.summary} · edited`,
    }
  })
}

export function rightsPacketApprovePatch(packet: RightsPacket): Record<string, string> | null {
  if (!packet.statusField || !packet.ready || (packet.kind === 'collab_agreement' && !packet.needed)) {
    return null
  }
  return { [packet.statusField]: 'approved' }
}

export function rightsPacketPendingPatch(packet: RightsPacket): Record<string, string> | null {
  if (!packet.statusField || (packet.kind === 'collab_agreement' && !packet.needed)) return null
  return { [packet.statusField]: 'pending' }
}
