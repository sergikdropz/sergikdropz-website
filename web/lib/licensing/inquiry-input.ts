export type LicensingKind = 'catalog' | 'custom_production'

export type LicensingInquiryInput = {
  kind: LicensingKind
  fullName: string
  companyName: string
  email: string
  phone: string
  website: string
  country: string
  address: string
  contactRole: string
  partyKind: 'agency' | 'direct'
  contractingEntity: string
  projectName: string
  projectDescription: string
  usageType: string
  channels: string[]
  term: string
  territory: string
  exclusivity: 'non-exclusive' | 'exclusive'
  reach: 'organic' | 'paid' | 'unknown'
  mediaBudget: string
  needsStems: boolean
  trackId: string
  trackTitle: string
  budgetNote: string
  authorized: boolean
}

const USAGE = [
  'Personal',
  'Creator / Social',
  'Commercial',
  'Advertising',
  'Film',
  'Television',
  'Game',
  'Podcast',
  'Exhibition',
  'Custom',
]

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function text(value: unknown, max: number): string {
  return String(value ?? '').trim().slice(0, max)
}

export function parseLicensingInquiry(body: unknown): { ok: true; value: LicensingInquiryInput } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Missing inquiry.' }
  const raw = body as Record<string, unknown>
  const kind = raw.kind === 'custom_production' ? 'custom_production' : raw.kind === 'catalog' ? 'catalog' : null
  if (!kind) return { ok: false, error: 'Choose catalog licensing or custom production.' }
  const email = text(raw.email, 200).toLowerCase()
  if (!EMAIL.test(email)) return { ok: false, error: 'Enter a valid business email.' }
  const fullName = text(raw.fullName, 200)
  const companyName = text(raw.companyName, 200)
  const projectName = text(raw.projectName, 200)
  const projectDescription = text(raw.projectDescription, 4000)
  if (!fullName || !companyName || !projectName || projectDescription.length < 20) {
    return { ok: false, error: 'Name, company, project name, and a short project description are required.' }
  }
  if (raw.authorized !== true) {
    return { ok: false, error: 'Confirm you are authorized to inquire for the named company.' }
  }
  const usageType = text(raw.usageType, 80)
  if (!USAGE.includes(usageType)) return { ok: false, error: 'Choose a usage type.' }
  const exclusivity = raw.exclusivity === 'exclusive' ? 'exclusive' : 'non-exclusive'
  const trackTitle = text(raw.trackTitle, 300)
  if (kind === 'catalog' && !trackTitle) return { ok: false, error: 'Name the track you want to license.' }
  const channels = Array.isArray(raw.channels) ? raw.channels.map((item) => text(item, 80)).filter(Boolean).slice(0, 20) : []
  return {
    ok: true,
    value: {
      kind,
      fullName,
      companyName,
      email,
      phone: text(raw.phone, 40),
      website: text(raw.website, 300),
      country: text(raw.country, 80),
      address: text(raw.address, 400),
      contactRole: text(raw.contactRole, 120),
      partyKind: raw.partyKind === 'agency' ? 'agency' : 'direct',
      contractingEntity: text(raw.contractingEntity, 200) || companyName,
      projectName,
      projectDescription,
      usageType,
      channels,
      term: text(raw.term, 80) || 'To be quoted',
      territory: text(raw.territory, 80) || 'To be quoted',
      exclusivity,
      reach: raw.reach === 'paid' || raw.reach === 'organic' ? raw.reach : 'unknown',
      mediaBudget: text(raw.mediaBudget, 120),
      needsStems: raw.needsStems === true,
      trackId: text(raw.trackId, 80),
      trackTitle,
      budgetNote: text(raw.budgetNote, 500),
      authorized: true,
    },
  }
}
