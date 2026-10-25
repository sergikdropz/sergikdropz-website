import { createHash } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase'
import { sendDepartmentEmail } from '@/lib/email/send-department'
import { OWNER_REMINDER_EMAIL } from '@/lib/studio/owner-release-reminders'
import { renderLicenseDraft } from '@/lib/licensing/agreement'
import { assessRightsGate } from '@/lib/licensing/eligibility'
import { hashLicensingToken, licenseVerifyId, licensingPublicId, newLicensingToken } from '@/lib/licensing/ids'
import { parseLicensingInquiry, type LicensingInquiryInput } from '@/lib/licensing/inquiry-input'
import { licensingInquiryMail, licensingQuoteMail } from '@/lib/licensing/mail'
import { assertAttorneyActionsAllowed } from '@/lib/licensing/operator-facts'
import { licensingPaymentDecision } from '@/lib/licensing/payment-decision'
import { quoteAmountError } from '@/lib/licensing/quote-sheet'
import { assessLicensingRisk } from '@/lib/licensing/risk'
import { assertInquiryTransition, type InquiryStatus } from '@/lib/licensing/states'
import { hydrateRightsPacket } from '@/lib/studio/rights-ops'
import { buildAuthorizedUse } from '@/lib/licensing/authorized-use'

export type LicensingInquiryRow = {
  id: string
  public_id: string
  client_id: string
  kind: string
  status: InquiryStatus
  track_id: string | null
  track_title: string | null
  project: Record<string, unknown>
  rights: Record<string, unknown>
  email_token_expires_at?: string | null
  risk_level: string
  risk_score: number
  risk_reasons: string[]
  rights_cleared: boolean | null
  rights_reasons: string[]
  verification_cleared_at: string | null
  quote_cents: number | null
  quote_currency: string
  quote_note: string | null
  quote_status: string
  agreement_body: string | null
  agreement_production_enabled: boolean
  payment_status: string
  stripe_session_id: string | null
  license_status: string
  license_public_id: string | null
  activation_note: string | null
  created_at: string
  licensing_clients?: {
    full_name: string
    company_name: string
    email: string
    email_verified_at: string | null
    contracting_entity: string | null
    website: string | null
    country: string | null
  } | null
}

function db() {
  return createSupabaseServerClient()
}

function asRow(value: unknown): LicensingInquiryRow {
  return value as LicensingInquiryRow
}

async function recordEvent(
  supabase: SupabaseClient,
  inquiryId: string,
  fromStatus: string | null,
  toStatus: string,
  actor: string,
  note: string,
) {
  await supabase.from('licensing_inquiry_events').insert({
    inquiry_id: inquiryId,
    from_status: fromStatus,
    to_status: toStatus,
    actor,
    note,
  })
}

function siteBase(requestUrl: string): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '')
  const url = new URL(requestUrl)
  return `${url.protocol}//${url.host}`
}

function licensingReplyTo(): string {
  return process.env.LICENSING_NOTIFY_EMAIL?.trim() || OWNER_REMINDER_EMAIL
}

async function notify(input: { to: string; subject: string; html: string; text: string }) {
  try {
    await sendDepartmentEmail({
      department: 'licensing',
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      replyTo: licensingReplyTo(),
    })
  } catch (error) {
    console.warn('[licensing mail]', error instanceof Error ? error.message : error)
  }
}

async function rightsForTrack(trackId: string) {
  if (!trackId) return null
  const supabase = db()
  const { data: track } = await supabase
    .from('distribution_tracks')
    .select('id, title, release_id, splits, isrc_full, sonic_snapshot')
    .eq('music_library_track_id', trackId)
    .limit(1)
    .maybeSingle()
  if (!track) return assessRightsGate({ track: null })
  const hydrated = hydrateRightsPacket(track)
  const { data: checklist } = await supabase
    .from('release_copyright_checklists')
    .select('sample_clearance_status, legal_locked, split_sheet_status')
    .eq('release_id', track.release_id)
    .maybeSingle()
  return assessRightsGate({
    track: {
      title: hydrated.title,
      splits: hydrated.splits,
      contains_samples: hydrated.contains_samples,
      isrc_full: hydrated.isrc_full,
      clearance: hydrated.clearance,
    },
    sampleClearanceStatus: checklist?.sample_clearance_status,
    legalLocked: checklist?.legal_locked,
    splitSheetStatus: checklist?.split_sheet_status,
  })
}

function clientInsert(value: LicensingInquiryInput) {
  return {
    full_name: value.fullName,
    company_name: value.companyName,
    email: value.email,
    phone: value.phone || null,
    website: value.website || null,
    country: value.country || null,
    address: value.address || null,
    contact_role: value.contactRole || null,
    party_kind: value.partyKind,
    contracting_entity: value.contractingEntity,
  }
}

export async function submitLicensingInquiry(body: unknown, request: Request) {
  const parsed = parseLicensingInquiry(body)
  if (!parsed.ok) return { ok: false as const, status: 400, error: parsed.error }
  const value = parsed.value
  const supabase = db()
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data: priorClients } = await supabase.from('licensing_clients').select('id').eq('email', value.email)
  const priorIds = (priorClients || []).map((row) => row.id as string)
  if (priorIds.length) {
    const { count } = await supabase
      .from('licensing_inquiries')
      .select('id', { count: 'exact', head: true })
      .in('client_id', priorIds)
      .gte('created_at', since)
    if ((count || 0) >= 8) {
      return { ok: false as const, status: 429, error: 'Too many inquiries from this email. Try again tomorrow.' }
    }
  }

  const rights = value.kind === 'catalog' && value.trackId ? await rightsForTrack(value.trackId) : null
  const narrative = [value.projectName, value.projectDescription, value.budgetNote, value.companyName].join('\n')
  const risk = assessLicensingRisk({
    email: value.email,
    companyName: value.companyName,
    website: value.website,
    narrative,
    exclusivity: value.exclusivity,
    kind: value.kind,
    rightsCleared: rights ? rights.cleared : null,
  })
  if (rights && !rights.cleared) {
    if (risk.level === 'low') risk.level = 'review'
    risk.reasons = [...risk.reasons, ...rights.reasons]
  }

  const openingStatus: InquiryStatus = 'EMAIL_VERIFICATION_PENDING'

  const { data: existingClient } = await supabase
    .from('licensing_clients')
    .select('id')
    .eq('email', value.email)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let clientId = existingClient?.id as string | undefined
  if (!clientId) {
    const { data: created, error } = await supabase.from('licensing_clients').insert(clientInsert(value)).select('id').single()
    if (error || !created) return { ok: false as const, status: 500, error: error?.message || 'Could not save the client.' }
    clientId = created.id as string
  }

  const token = newLicensingToken()
  const emailToken = newLicensingToken()
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || ''
  const year = new Date().getUTCFullYear()
  const { count: yearCount } = await supabase
    .from('licensing_inquiries')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', `${year}-01-01T00:00:00.000Z`)

  let publicId = ''
  let inquiry: LicensingInquiryRow | null = null
  let lastError = 'Could not save the inquiry.'
  for (let attempt = 0; attempt < 5; attempt += 1) {
    publicId = licensingPublicId(year, (yearCount || 0) + 1 + attempt)
    const { data, error } = await supabase
      .from('licensing_inquiries')
      .insert({
        public_id: publicId,
        client_id: clientId,
        kind: value.kind,
        status: openingStatus,
        track_id: value.trackId || null,
        track_title: value.trackTitle || null,
        project: { name: value.projectName, description: value.projectDescription, budgetNote: value.budgetNote },
        rights: {
          usageType: value.usageType,
          channels: value.channels,
          term: value.term,
          territory: value.territory,
          exclusivity: value.exclusivity,
          reach: value.reach,
          mediaBudget: value.mediaBudget,
          needsStems: value.needsStems,
        },
        client_token_hash: hashLicensingToken(token),
        email_token_hash: hashLicensingToken(emailToken),
        email_token_expires_at: new Date(Date.now() + 1000 * 60 * 60 * 48).toISOString(),
        risk_level: risk.level,
        risk_score: risk.score,
        risk_reasons: risk.reasons,
        rights_cleared: rights ? rights.cleared : null,
        rights_reasons: rights?.reasons || [],
        ip_hash: ip ? createHash('sha256').update(ip).digest('hex') : null,
      })
      .select('*')
      .single()
    if (!error && data) {
      inquiry = asRow(data)
      break
    }
    lastError = error?.message || lastError
  }
  if (!inquiry) return { ok: false as const, status: 500, error: lastError }

  await recordEvent(supabase, inquiry.id, null, openingStatus, 'client', 'Inquiry submitted. This does not grant use of the music.')

  const base = siteBase(request.url)
  const deskPath = `/licensing/desk/${token}`
  const mail = licensingInquiryMail({
    publicId,
    name: value.fullName,
    confirmUrl: `${base}/api/licensing/confirm?token=${encodeURIComponent(emailToken)}`,
  })
  const text = `${mail.text}\n\nYour private desk: ${base}${deskPath}\n`
  const html = `${mail.html}<p>Your private desk: <a href="${base}${deskPath}">${base}${deskPath}</a></p>`
  await notify({ to: value.email, subject: mail.subject, text, html })
  const adminTo = process.env.LICENSING_NOTIFY_EMAIL?.trim() || OWNER_REMINDER_EMAIL
  await notify({
    to: adminTo,
    subject: `Licensing inquiry ${publicId} (${risk.level})`,
    text: `${value.companyName} asked about ${value.trackTitle || value.projectName}. Risk: ${risk.level}. ${risk.reasons.join('; ')}`,
    html: `<p>${publicId} from ${value.companyName}. Risk: ${risk.level}.</p>`,
  })

  return { ok: true as const, publicId, status: openingStatus, deskPath, inquiryId: inquiry.id, emailToken }
}

export async function confirmLicensingEmail(token: string) {
  const supabase = db()
  const { data } = await supabase.from('licensing_inquiries').select('*').eq('email_token_hash', hashLicensingToken(token)).maybeSingle()
  if (!data) return { ok: false as const, error: 'This confirmation link is not valid.' }
  const inquiry = asRow(data)
  if (inquiry.email_token_expires_at && new Date(inquiry.email_token_expires_at).getTime() < Date.now()) {
    return { ok: false as const, error: 'This confirmation link has expired.' }
  }
  await supabase.from('licensing_clients').update({ email_verified_at: new Date().toISOString() }).eq('id', inquiry.client_id)
  if (inquiry.status === 'EMAIL_VERIFICATION_PENDING') {
    const next: InquiryStatus = inquiry.risk_level === 'low' && inquiry.rights_cleared !== false ? 'UNDER_REVIEW' : 'BUSINESS_VERIFICATION_PENDING'
    assertInquiryTransition(inquiry.status, next)
    await supabase
      .from('licensing_inquiries')
      .update({ status: next, email_token_hash: null, email_token_expires_at: null, updated_at: new Date().toISOString() })
      .eq('id', inquiry.id)
    await recordEvent(supabase, inquiry.id, inquiry.status, next, 'email', 'Email confirmed.')
  }
  return { ok: true as const, publicId: inquiry.public_id }
}

export async function getInquiryByClientToken(token: string) {
  const { data } = await db()
    .from('licensing_inquiries')
    .select('*, licensing_clients(full_name, company_name, email, email_verified_at, contracting_entity, website, country)')
    .eq('client_token_hash', hashLicensingToken(token))
    .maybeSingle()
  return data ? asRow(data) : null
}

export function clientInquiryView(row: LicensingInquiryRow) {
  const rights = row.rights || {}
  return {
    publicId: row.public_id,
    kind: row.kind,
    status: row.status,
    trackTitle: row.track_title,
    projectName: String(row.project?.name || ''),
    usageType: String(rights.usageType || ''),
    territory: String(rights.territory || ''),
    term: String(rights.term || ''),
    quoteStatus: row.quote_status,
    quoteCents: row.quote_status === 'none' ? null : row.quote_cents,
    quoteCurrency: row.quote_currency,
    quoteNote: row.quote_note,
    paymentStatus: row.payment_status,
    licenseStatus: row.license_status,
    licensePublicId: row.license_status === 'active' ? row.license_public_id : null,
    hold: row.risk_level === 'high' || row.risk_level === 'blocked' || row.rights_cleared === false,
  }
}

const INQUIRY_SELECT =
  '*, licensing_clients(full_name, company_name, email, email_verified_at, contracting_entity, website, country)'

export async function listLicensingInquiries() {
  const { data, error } = await db().from('licensing_inquiries').select(INQUIRY_SELECT).order('created_at', { ascending: false }).limit(200)
  if (error) throw new Error(error.message)
  return (data || []) as LicensingInquiryRow[]
}

export async function getLicensingInquiry(id: string) {
  const { data, error } = await db().from('licensing_inquiries').select(INQUIRY_SELECT).eq('id', id).maybeSingle()
  if (error) throw new Error(error.message)
  return data ? asRow(data) : null
}

async function move(id: string, from: InquiryStatus, to: InquiryStatus, actor: string, note: string, patch: Record<string, unknown>) {
  assertInquiryTransition(from, to)
  const supabase = db()
  const { error } = await supabase
    .from('licensing_inquiries')
    .update({ ...patch, status: to, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(error.message)
  await recordEvent(supabase, id, from, to, actor, note)
}

export async function clearLicensingVerification(id: string, actor: string) {
  const row = await getLicensingInquiry(id)
  if (!row) throw new Error('Inquiry not found.')
  if (row.status === 'BUSINESS_VERIFICATION_PENDING') {
    await move(id, row.status, 'UNDER_REVIEW', actor, 'Business verification cleared.', { verification_cleared_at: new Date().toISOString() })
    return
  }
  const supabase = db()
  await supabase.from('licensing_inquiries').update({ verification_cleared_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', id)
  await recordEvent(supabase, id, row.status, row.status, actor, 'Business verification cleared.')
}

export async function rejectLicensingInquiry(id: string, actor: string, note: string) {
  const row = await getLicensingInquiry(id)
  if (!row) throw new Error('Inquiry not found.')
  await move(id, row.status, 'REJECTED', actor, note || 'Rejected.', {})
}

export async function sendLicensingQuote(id: string, actor: string, cents: number, note: string) {
  if (!Number.isInteger(cents) || cents < 100) throw new Error('Enter a quote of at least $1.00 in cents.')
  const row = await getLicensingInquiry(id)
  if (!row) throw new Error('Inquiry not found.')
  const quoteError = quoteAmountError({
    kind: row.kind,
    usageType: String(row.rights?.usageType || ''),
    exclusivity: String(row.rights?.exclusivity || ''),
    rightsCleared: row.rights_cleared,
    cents,
  })
  if (quoteError) throw new Error(quoteError)
  if (row.risk_level === 'blocked') throw new Error('Blocked inquiries cannot be quoted.')
  if ((row.risk_level === 'high' || row.risk_level === 'review') && !row.verification_cleared_at) {
    throw new Error('Clear verification before sending a quote.')
  }
  if (row.status !== 'UNDER_REVIEW' && row.status !== 'QUOTE_SENT') throw new Error('Quote from review, after verification.')
  const clientEmail = row.licensing_clients?.email
  if (!clientEmail) throw new Error('Client email is missing.')
  await move(id, row.status, 'QUOTE_SENT', actor, note || 'Quote sent.', {
    quote_cents: cents,
    quote_currency: 'usd',
    quote_note: note || null,
    quote_status: 'sent',
  })
  const mail = licensingQuoteMail({
    publicId: row.public_id,
    feeLabel: `USD ${(cents / 100).toFixed(2)}`,
    deskUrl: 'the private desk link in your first SERGIK licensing email',
    estimate: row.kind === 'custom_production',
  })
  await notify({ to: clientEmail, ...mail })
}

export async function acceptLicensingQuote(token: string) {
  const row = await getInquiryByClientToken(token)
  if (!row) throw new Error('Inquiry not found.')
  if (row.status !== 'QUOTE_SENT' || row.quote_status !== 'sent' || !row.quote_cents) throw new Error('There is no quote to accept.')
  await move(row.id, 'QUOTE_SENT', 'QUOTE_ACCEPTED', 'client', 'Client accepted the quote.', { quote_status: 'accepted' })
}

export async function saveLicenseDraft(id: string, actor: string) {
  const row = await getLicensingInquiry(id)
  if (!row) throw new Error('Inquiry not found.')
  const body = renderLicenseDraft({
    publicId: row.public_id,
    licenseeName: row.licensing_clients?.full_name || '',
    contractingEntity: row.licensing_clients?.contracting_entity || row.licensing_clients?.company_name || '',
    trackTitle: row.track_title || String(row.project?.name || ''),
    usage: String(row.rights?.usageType || ''),
    territory: String(row.rights?.territory || ''),
    term: String(row.rights?.term || ''),
    feeLabel: row.quote_cents ? `USD ${(row.quote_cents / 100).toFixed(2)}` : 'Quoted separately',
    exclusivity: String(row.rights?.exclusivity || 'non-exclusive'),
  })
  const supabase = db()
  await supabase
    .from('licensing_inquiries')
    .update({ agreement_body: body, agreement_production_enabled: false, updated_at: new Date().toISOString() })
    .eq('id', id)
  await recordEvent(supabase, id, row.status, row.status, actor, 'Draft agreement stored. Not enabled for signature.')
  return body
}

export async function markAgreementReviewed(id: string, actor: string, note: string) {
  await assertAttorneyActionsAllowed()
  if (note.trim().length < 12) throw new Error('Record who reviewed the draft and why it may be used.')
  const row = await getLicensingInquiry(id)
  if (!row?.agreement_body) throw new Error('Save a draft first.')
  const supabase = db()
  await supabase.from('licensing_inquiries').update({ agreement_production_enabled: true, updated_at: new Date().toISOString() }).eq('id', id)
  await recordEvent(supabase, id, row.status, row.status, actor, `Attorney review recorded: ${note.trim()}`)
}

export async function prepareLicensingCheckout(token: string) {
  const row = await getInquiryByClientToken(token)
  if (!row) throw new Error('Inquiry not found.')
  if (row.status !== 'QUOTE_ACCEPTED' && row.status !== 'PAYMENT_PENDING') throw new Error('Accept the quote before paying.')
  if (!row.quote_cents) throw new Error('Quote amount is missing.')
  if (row.risk_level === 'blocked' || row.risk_level === 'high') throw new Error('This inquiry is on hold.')
  if (row.payment_status === 'paid') throw new Error('This quote is already paid.')
  return row
}

export async function markCheckoutSession(id: string, sessionId: string) {
  const row = await getLicensingInquiry(id)
  if (!row) throw new Error('Inquiry not found.')
  if (row.status === 'QUOTE_ACCEPTED') {
    await move(id, 'QUOTE_ACCEPTED', 'PAYMENT_PENDING', 'stripe', 'Checkout session created.', { stripe_session_id: sessionId })
    return
  }
  await db().from('licensing_inquiries').update({ stripe_session_id: sessionId, updated_at: new Date().toISOString() }).eq('id', id)
}

export async function applyLicensingStripePayment(input: {
  inquiryId: string
  sessionId: string
  eventId: string
  paymentStatus: string | null
  amountTotal: number | null
  currency: string | null
}) {
  const supabase = db()
  const { data: existing } = await supabase.from('licensing_payments').select('id, status').eq('stripe_session_id', input.sessionId).maybeSingle()
  if (existing?.status === 'paid') return { applied: false, reason: 'duplicate' }

  const row = await getLicensingInquiry(input.inquiryId)
  if (!row) return { applied: false, reason: 'missing inquiry' }
  const decision = licensingPaymentDecision({
    paymentStatus: input.paymentStatus,
    amountTotal: input.amountTotal,
    currency: input.currency,
    quoteCents: row.quote_cents,
    quoteCurrency: row.quote_currency,
    quoteAccepted: row.quote_status === 'accepted' || row.status === 'PAYMENT_PENDING' || row.status === 'QUOTE_ACCEPTED',
  })
  const status = decision.ok ? 'paid' : 'mismatch'
  await supabase.from('licensing_payments').upsert(
    {
      inquiry_id: row.id,
      stripe_session_id: input.sessionId,
      stripe_event_id: input.eventId,
      amount_cents: input.amountTotal,
      currency: input.currency,
      status,
      detail: decision.ok ? 'Paid amount matches the quote.' : decision.reason,
    },
    { onConflict: 'stripe_session_id' },
  )

  if (!decision.ok) {
    await supabase.from('licensing_inquiries').update({ payment_status: 'mismatch', updated_at: new Date().toISOString() }).eq('id', row.id)
    await recordEvent(supabase, row.id, row.status, row.status, 'stripe', decision.reason)
    return { applied: false, reason: decision.reason }
  }

  if (row.status === 'QUOTE_ACCEPTED') {
    await move(row.id, 'QUOTE_ACCEPTED', 'PAYMENT_PENDING', 'stripe', 'Payment recorded.', {
      payment_status: 'paid',
      stripe_session_id: input.sessionId,
    })
    await move(row.id, 'PAYMENT_PENDING', 'AWAITING_ACTIVATION', 'stripe', 'Payment confirmed by Stripe. License waits for activation.', {
      payment_status: 'paid',
      stripe_session_id: input.sessionId,
    })
  } else if (row.status === 'PAYMENT_PENDING') {
    await move(row.id, 'PAYMENT_PENDING', 'AWAITING_ACTIVATION', 'stripe', 'Payment confirmed by Stripe. License waits for activation.', {
      payment_status: 'paid',
      stripe_session_id: input.sessionId,
    })
  } else {
    await supabase
      .from('licensing_inquiries')
      .update({ payment_status: 'paid', stripe_session_id: input.sessionId, updated_at: new Date().toISOString() })
      .eq('id', row.id)
    await recordEvent(supabase, row.id, row.status, row.status, 'stripe', 'Payment confirmed.')
  }
  return { applied: true, reason: 'paid' }
}

export async function activateLicensingInquiry(id: string, actor: string, note: string) {
  await assertAttorneyActionsAllowed()
  if (note.trim().length < 12) throw new Error('Record that a signed agreement is on file.')
  const row = await getLicensingInquiry(id)
  if (!row) throw new Error('Inquiry not found.')
  if (row.payment_status !== 'paid') throw new Error('Activate only after Stripe confirms payment.')
  if (!row.agreement_production_enabled) throw new Error('Record attorney review on the draft before activation.')
  if (row.status !== 'AWAITING_ACTIVATION') throw new Error('Payment must be confirmed before activation.')
  const year = new Date().getUTCFullYear()
  const { count } = await db().from('licensing_inquiries').select('id', { count: 'exact', head: true }).not('license_public_id', 'is', null)
  const licensePublicId = licenseVerifyId(year, (count || 0) + 1)
  const activatedAt = new Date().toISOString()
  const authorizedUse = buildAuthorizedUse({
    licenseId: licensePublicId,
    rights: row.rights,
    activatedAt,
    note: note.trim(),
  })
  await move(id, 'AWAITING_ACTIVATION', 'ACTIVE', actor, note.trim(), {
    license_status: 'active',
    license_public_id: licensePublicId,
    activation_note: note.trim(),
    rights: { ...row.rights, authorizedUse },
  })
  return licensePublicId
}

export async function publicLicenseVerification(publicId: string) {
  const { data } = await db()
    .from('licensing_inquiries')
    .select('license_public_id, license_status, track_title, rights, licensing_clients(company_name)')
    .eq('license_public_id', publicId)
    .maybeSingle()
  if (!data || data.license_status !== 'active') return null
  const rights = (data.rights || {}) as Record<string, unknown>
  const clientRow = data.licensing_clients as { company_name?: string } | { company_name?: string }[] | null
  const company = Array.isArray(clientRow) ? clientRow[0]?.company_name : clientRow?.company_name
  return {
    licenseId: data.license_public_id,
    status: 'active',
    trackTitle: data.track_title,
    licensee: company || '',
    territory: String(rights.territory || ''),
    term: String(rights.term || ''),
    usage: String(rights.usageType || ''),
    reach: String(rights.reach || 'unknown'),
    paidAdvertising: Boolean((rights.authorizedUse as { paidAdvertising?: boolean } | undefined)?.paidAdvertising),
    needsStems: Boolean((rights.authorizedUse as { needsStems?: boolean } | undefined)?.needsStems),
  }
}
