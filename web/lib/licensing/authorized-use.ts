export type LicenseReach = 'organic' | 'paid' | 'unknown'

export type AuthorizedUseRecord = {
  licenseId: string
  permitted: true
  usageType: string
  channels: string[]
  term: string
  territory: string
  exclusivity: 'exclusive' | 'non-exclusive'
  reach: LicenseReach
  paidAdvertising: boolean
  needsStems: boolean
  mediaBudget: string
  activatedAt: string
  note: string
}

export function licenseReach(value: unknown): LicenseReach {
  return value === 'paid' || value === 'organic' ? value : 'unknown'
}

/** Granted use after activation. A music-picker listing is not this record. */
export function buildAuthorizedUse(input: {
  licenseId: string
  rights: Record<string, unknown>
  activatedAt: string
  note: string
}): AuthorizedUseRecord {
  const usageType = String(input.rights.usageType || '')
  const reach = licenseReach(input.rights.reach)
  const channels = Array.isArray(input.rights.channels)
    ? input.rights.channels.map((item) => String(item)).filter(Boolean).slice(0, 20)
    : []
  return {
    licenseId: input.licenseId,
    permitted: true,
    usageType,
    channels,
    term: String(input.rights.term || ''),
    territory: String(input.rights.territory || ''),
    exclusivity: input.rights.exclusivity === 'exclusive' ? 'exclusive' : 'non-exclusive',
    reach,
    paidAdvertising: reach === 'paid' || usageType === 'Advertising',
    needsStems: input.rights.needsStems === true,
    mediaBudget: String(input.rights.mediaBudget || ''),
    activatedAt: input.activatedAt,
    note: input.note,
  }
}
