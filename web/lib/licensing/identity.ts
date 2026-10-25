/**
 * Names on a client license. One licensor signs and is paid.
 * The other names are credits, not extra parties who must sign.
 */

export const LICENSING_LICENSOR = {
  legalName: 'Nexus Studios AZ LLC',
  tradeName: 'SERGIKdropz',
  artistName: 'SERGIK',
  publisherName: 'SERGIK Music',
  songwriterName: 'Jordan Caboga',
  governingLaw: 'the laws of the State of Arizona, USA, without regard to conflict-of-law rules',
  forum: 'state or federal courts located in Maricopa County, Arizona',
} as const

export function licensorSignatureBlock(): string {
  const row = LICENSING_LICENSOR
  return [
    `Licensor: ${row.legalName}, doing business as ${row.tradeName}`,
    `Recording artist: ${row.artistName}`,
    `Publisher name: ${row.publisherName}`,
    `Songwriter: ${row.songwriterName}`,
    `Governing law: ${row.governingLaw}`,
    `Forum: ${row.forum}`,
  ].join('\n')
}
