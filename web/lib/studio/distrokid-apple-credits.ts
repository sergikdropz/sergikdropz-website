import { instrumentCreditsFromContributors, namesForRole, parseContributors } from '@/lib/studio/track-credits'
import { knownLegalName, seedWriterLegalRows } from '@/lib/studio/songwriter'
import type { DistroKidPacketTrackInput } from '@/lib/studio/distrokid-delivery'

export type AppleMusicCreditLine = {
  performer_name: string
  performer_instrument: string
  producer_name: string
}

const DEFAULT_LEGAL = 'Jordan Caboga'
const DEFAULT_INSTRUMENT = 'Drum Machine'

/** Apple Music / iTunes upload form credits (legal performer + instrument + producer). */
export function buildAppleMusicCreditLine(track: DistroKidPacketTrackInput): AppleMusicCreditLine {
  const contributors = parseContributors(track.contributors)
  const legalRows = seedWriterLegalRows(track.contributors, track.writer_legal_names)
  const fromWriters = legalRows.map((row) => row.legal).find(Boolean)
  const fromPrimary = namesForRole(contributors, 'primary')[0]
  const performer =
    fromWriters ||
    knownLegalName(fromPrimary) ||
    knownLegalName('SERGIK') ||
    DEFAULT_LEGAL

  const instruments = instrumentCreditsFromContributors(contributors)
  const drum =
    instruments.find((row) => /drum/i.test(row.instrument)) ||
    instruments.find((row) => /drum/i.test(`${row.instrument} ${row.name}`))
  const performerInstrument = drum?.instrument?.trim() || DEFAULT_INSTRUMENT

  const producers = namesForRole(contributors, 'producer')
  const producer =
    producers.find((name) => !/^sergik$/i.test(name.trim())) ||
    performer

  return {
    performer_name: performer,
    performer_instrument: performerInstrument,
    producer_name: producer,
  }
}

/** Merge Studio catalog contributors so Apple ingest + DistroKid packet stay aligned. */
export function contributorsWithAppleCredits(raw: unknown): ReturnType<typeof parseContributors> {
  const rows = parseContributors(raw)
  const line = buildAppleMusicCreditLine({ contributors: rows })
  const legal = line.performer_name
  const hasDrum = rows.some(
    (row) =>
      row.role === 'instrument' &&
      /drum/i.test(`${row.instrument || ''}`) &&
      row.name.toLowerCase() === legal.toLowerCase(),
  )
  if (!hasDrum) {
    rows.push({ role: 'instrument', name: legal, instrument: line.performer_instrument })
  }
  const hasProducer = rows.some(
    (row) => row.role === 'producer' && row.name.toLowerCase() === line.producer_name.toLowerCase(),
  )
  if (!hasProducer) {
    rows.push({ role: 'producer', name: line.producer_name })
  }
  return rows
}
