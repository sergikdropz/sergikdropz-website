import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import {
  US_ISRC_REGISTRANT,
  currentIsrcYear,
  formatISRC,
  formatISRCDisplay,
  resolveIsrcPrefix,
} from '@/lib/studio/isrc-format'

export async function GET() {
  const session = await getServerSession()
  if (!session?.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const prefix = resolveIsrcPrefix()
  const year = currentIsrcYear()
  const example = formatISRC(prefix, year, 1)

  return NextResponse.json({
    prefix,
    year,
    registrant: US_ISRC_REGISTRANT.name,
    recordingArtist: US_ISRC_REGISTRANT.recordingArtist,
    allocatedAt: US_ISRC_REGISTRANT.allocatedAt,
    agency: US_ISRC_REGISTRANT.agency,
    soundExchangeRegistrantId: US_ISRC_REGISTRANT.soundExchangeRegistrantId,
    membership: US_ISRC_REGISTRANT.membership,
    example,
    exampleDisplay: formatISRCDisplay(example),
  })
}
