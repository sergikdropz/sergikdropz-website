import type { createSupabaseServerClient } from '@/lib/supabase'

export const VAULT_UNLOCK_SOURCE = 'vault_unlock'
export const VAULT_UNLOCK_TAG = 'vault'
/** Google account sign-in on the vault gate. Also written as the subscriber source. */
export const GOOGLE_VAULT_SOURCE = 'google'
/** Site mailing-list tag written when Google sign-in unlocks the vault. */
export const SITE_SUBSCRIBER_TAG = 'subscriber'
export const YOUTUBE_UNLOCK_SOURCE = 'youtube_unlock'
export const YOUTUBE_UNLOCK_TAG = 'youtube'

export type VaultUnlockFanInput = {
  email: string
  displayName: string | null
  source: string | null
  campaign: string | null
}

export type FanLeadRow = {
  email: string
  display_name?: string | null
  source?: string | null
  campaign?: string | null
  first_unlock_at?: string | null
  last_unlock_at?: string | null
  created_at?: string | null
}

export type AdminFanRow = {
  id: string
  email: string
  name: string
  phone: string | null
  source: string
  tags: string[]
  is_superfan: boolean
  created_at: string
  last_engaged_at: string | null
  subscribed_at: string
  unsubscribed_at: string | null
}

type SupabaseLike = ReturnType<typeof createSupabaseServerClient>

export function normalizeFanTags(tags: unknown): string[] {
  if (Array.isArray(tags)) {
    return Array.from(
      new Set(tags.filter((t): t is string => typeof t === 'string' && t.trim().length > 0).map((t) => t.trim())),
    )
  }
  if (typeof tags === 'string' && tags.trim()) {
    try {
      return normalizeFanTags(JSON.parse(tags))
    } catch {
      return [tags.trim()]
    }
  }
  return []
}

const SYNTHETIC_FAN_EMAILS = new Set([
  'vault-probe-test@example.com',
  'probe2-vault@example.com',
  'fan-fallback-test@example.com',
])

/** Playwright, browser-agent, and audit unlocks must not enter the Fans CRM. */
export function isSyntheticFanEmail(email: string | null | undefined): boolean {
  if (!email || typeof email !== 'string') return true
  const e = email.trim().toLowerCase()
  if (!e.includes('@') || e.length > 320) return true
  if (e.endsWith('@sergik.local')) return true
  if (SYNTHETIC_FAN_EMAILS.has(e)) return true
  const local = e.split('@')[0]
  if (/(^|[.+_-])(autodj|auto-dj|auto_dj)([.+_-]|$)/.test(local)) return true
  const reservedExample = e.endsWith('@example.com') || e.endsWith('@example.org') || e.endsWith('@example.net')
  if (
    reservedExample &&
    /^(agent|audit|e2e|verify|test|qa-fan|vault-crm-verify|vault-probe|probe\d+)[-_.]/.test(local)
  ) {
    return true
  }
  // Timestamped mailboxes from test runs (Date.now() is 13 digits; shorter probes still qualify).
  if (reservedExample && /\d{10,}/.test(local)) return true
  return false
}

export function vaultUnlockSource(source: string | null | undefined): string {
  const trimmed = typeof source === 'string' ? source.trim() : ''
  return trimmed || VAULT_UNLOCK_SOURCE
}

export function tagsForVaultUnlock(source: string | null | undefined): string[] {
  const tags = [VAULT_UNLOCK_TAG]
  if (vaultUnlockSource(source) === GOOGLE_VAULT_SOURCE) tags.push(SITE_SUBSCRIBER_TAG)
  return tags
}

export function fanInsertFromVaultUnlock(input: VaultUnlockFanInput, now: string) {
  const metadata: Record<string, unknown> = { vault_unlocked: true }
  if (input.campaign) metadata.campaign = input.campaign

  return {
    email: input.email,
    name: input.displayName || '',
    phone: null,
    tags: tagsForVaultUnlock(input.source),
    source: vaultUnlockSource(input.source),
    consent_email: true,
    consent_sms: false,
    last_engaged_at: now,
    metadata,
  }
}

export function fanPatchFromVaultUnlock(
  existing: { name?: string | null; source?: string | null; tags?: unknown; metadata?: unknown },
  input: VaultUnlockFanInput,
  now: string,
) {
  const tags = normalizeFanTags(existing.tags)
  for (const tag of tagsForVaultUnlock(input.source)) {
    if (!tags.includes(tag)) tags.push(tag)
  }

  const metadata =
    existing.metadata && typeof existing.metadata === 'object' && !Array.isArray(existing.metadata)
      ? { ...(existing.metadata as Record<string, unknown>) }
      : {}
  metadata.vault_unlocked = true
  if (input.campaign) metadata.campaign = input.campaign

  return {
    name: (existing.name && existing.name.trim()) || input.displayName || existing.name || '',
    source: existing.source || vaultUnlockSource(input.source),
    tags,
    last_engaged_at: now,
    updated_at: now,
    metadata,
    ...(vaultUnlockSource(input.source) === GOOGLE_VAULT_SOURCE ? { consent_email: true as const } : {}),
  }
}

export function adminFanFromLead(lead: FanLeadRow, fallbackId?: string): AdminFanRow {
  const created = lead.first_unlock_at || lead.created_at || new Date().toISOString()
  return {
    id: fallbackId || `lead:${lead.email.toLowerCase()}`,
    email: lead.email,
    name: lead.display_name || '',
    phone: null,
    source: vaultUnlockSource(lead.source),
    tags: [VAULT_UNLOCK_TAG],
    is_superfan: false,
    created_at: created,
    last_engaged_at: lead.last_unlock_at || created,
    subscribed_at: created,
    unsubscribed_at: null,
  }
}

export function mergeFansWithVaultLeads<T extends { email: string }>(
  fans: T[],
  leads: FanLeadRow[],
): Array<T | AdminFanRow> {
  const realFans = fans.filter((fan) => !isSyntheticFanEmail(fan.email))
  const seen = new Set(realFans.map((fan) => fan.email.toLowerCase()))
  const extras = leads
    .filter((lead) => lead.email && !isSyntheticFanEmail(lead.email) && !seen.has(lead.email.toLowerCase()))
    .map((lead) => adminFanFromLead(lead))
  return [...realFans, ...extras].sort((a, b) => {
    const aCreated = 'created_at' in a && typeof a.created_at === 'string' ? a.created_at : ''
    const bCreated = 'created_at' in b && typeof b.created_at === 'string' ? b.created_at : ''
    return bCreated.localeCompare(aCreated)
  })
}

async function persistFanLead(supabase: SupabaseLike, input: VaultUnlockFanInput, now: string): Promise<void> {
  const patch: Record<string, string | null> = {
    last_unlock_at: now,
    updated_at: now,
  }
  if (input.displayName !== null) patch.display_name = input.displayName
  patch.source = vaultUnlockSource(input.source)
  if (input.campaign !== null) patch.campaign = input.campaign

  const { data: existing, error: selErr } = await supabase
    .from('fan_leads')
    .select('id')
    .eq('email', input.email)
    .maybeSingle()

  if (selErr) {
    console.warn('fan_leads select skipped:', selErr.code, selErr.message)
    return
  }

  if (existing?.id) {
    const { error: updErr } = await supabase.from('fan_leads').update(patch).eq('id', existing.id)
    if (updErr) console.warn('fan_leads update skipped:', updErr.code, updErr.message)
    return
  }

  const { error: insErr } = await supabase.from('fan_leads').insert({
    email: input.email,
    display_name: input.displayName,
    source: vaultUnlockSource(input.source),
    campaign: input.campaign,
    first_unlock_at: now,
    last_unlock_at: now,
    created_at: now,
    updated_at: now,
  })
  if (!insErr) return
  if (insErr.code === '23505') {
    const { error: raceUpdErr } = await supabase.from('fan_leads').update(patch).eq('email', input.email)
    if (raceUpdErr) console.warn('fan_leads update after duplicate skipped:', raceUpdErr.code, raceUpdErr.message)
    return
  }
  console.warn('fan_leads insert skipped:', insErr.code, insErr.message)
}

async function persistFanRecord(supabase: SupabaseLike, input: VaultUnlockFanInput, now: string): Promise<void> {
  const { data: existing, error: selErr } = await supabase
    .from('fans')
    .select('id, name, source, tags, metadata')
    .eq('email', input.email)
    .maybeSingle()

  if (selErr) {
    console.warn('fans select skipped:', selErr.code, selErr.message)
    return
  }

  if (existing?.id) {
    const { error: updErr } = await supabase
      .from('fans')
      .update(fanPatchFromVaultUnlock(existing, input, now))
      .eq('id', existing.id)
    if (updErr) console.warn('fans unlock update skipped:', updErr.code, updErr.message)
    return
  }

  const { error: insErr } = await supabase.from('fans').insert(fanInsertFromVaultUnlock(input, now))
  if (!insErr) {
    try {
      await supabase.from('analytics_events').insert([
        {
          event_type: 'fan_signup',
          event_data: {
            email: input.email,
            source: vaultUnlockSource(input.source),
          },
        },
      ])
    } catch (e) {
      console.warn('Could not log vault unlock fan signup:', e)
    }
    return
  }
  if (insErr.code === '23505') {
    const { error: raceUpdErr } = await supabase
      .from('fans')
      .update(fanPatchFromVaultUnlock({}, input, now))
      .eq('email', input.email)
    if (raceUpdErr) console.warn('fans unlock update after duplicate skipped:', raceUpdErr.code, raceUpdErr.message)
    return
  }
  console.warn('fans unlock insert skipped:', insErr.code, insErr.message)
}

/** Write a vault unlock into both `fans` (admin CRM) and `fan_leads` (unlock timestamps). */
export async function persistVaultUnlockAsFan(
  supabase: SupabaseLike,
  input: VaultUnlockFanInput,
): Promise<void> {
  if (isSyntheticFanEmail(input.email)) return
  const now = new Date().toISOString()
  await persistFanRecord(supabase, input, now)
  await persistFanLead(supabase, input, now)
  await ensureEmailSubscriber(supabase, {
    email: input.email,
    name: input.displayName,
    source: vaultUnlockSource(input.source),
  })
}

export type PromoContactInput = {
  email: string
  name?: string | null
  source: string
  tags: string[]
  platforms: string[]
}

/** Insert a promo subscriber without replacing the source already on file. */
export async function ensureEmailSubscriber(
  supabase: SupabaseLike,
  input: { email: string; name?: string | null; source: string },
): Promise<void> {
  const email = input.email.toLowerCase().trim()
  if (isSyntheticFanEmail(email)) return
  const { data: existing, error: selErr } = await supabase
    .from('email_subscribers')
    .select('id, name, is_active')
    .eq('email', email)
    .maybeSingle()
  if (selErr) {
    console.warn('email_subscribers select skipped:', selErr.code, selErr.message)
    return
  }
  if (existing?.id) {
    const patch: Record<string, unknown> = { is_active: true, updated_at: new Date().toISOString() }
    if (!existing.name && input.name) patch.name = input.name
    const { error: updErr } = await supabase.from('email_subscribers').update(patch).eq('id', existing.id)
    if (updErr) console.warn('email_subscribers update skipped:', updErr.code, updErr.message)
    return
  }
  const { error: insErr } = await supabase.from('email_subscribers').insert({
    email,
    name: input.name || null,
    source: input.source,
    is_active: true,
  })
  if (insErr && insErr.code !== '23505') {
    console.warn('email_subscribers insert skipped:', insErr.code, insErr.message)
  }
}

/** Video-unlock and other opt-in contacts join both the subscriber list and Fans CRM. */
export async function persistPromoContact(supabase: SupabaseLike, input: PromoContactInput): Promise<void> {
  const email = input.email.toLowerCase().trim()
  if (isSyntheticFanEmail(email)) return
  const now = new Date().toISOString()
  await ensureEmailSubscriber(supabase, { email, name: input.name || null, source: input.source })

  const { data: existing, error: selErr } = await supabase
    .from('fans')
    .select('id, name, source, tags, metadata')
    .eq('email', email)
    .maybeSingle()
  if (selErr) {
    console.warn('fans promo select skipped:', selErr.code, selErr.message)
    return
  }

  const tags = normalizeFanTags(existing?.tags)
  for (const tag of input.tags) {
    if (tag && !tags.includes(tag)) tags.push(tag)
  }
  const metadata =
    existing?.metadata && typeof existing.metadata === 'object' && !Array.isArray(existing.metadata)
      ? { ...(existing.metadata as Record<string, unknown>) }
      : {}
  const platforms = new Set(
    [
      ...(Array.isArray(metadata.platforms) ? metadata.platforms : []),
      ...input.platforms,
    ].filter((p): p is string => typeof p === 'string' && p.trim().length > 0),
  )
  metadata.platforms = Array.from(platforms)

  if (existing?.id) {
    const { error: updErr } = await supabase
      .from('fans')
      .update({
        name: (existing.name && String(existing.name).trim()) || input.name || existing.name || '',
        tags,
        metadata,
        consent_email: true,
        last_engaged_at: now,
        updated_at: now,
      })
      .eq('id', existing.id)
    if (updErr) console.warn('fans promo update skipped:', updErr.code, updErr.message)
    return
  }

  const { error: insErr } = await supabase.from('fans').insert({
    email,
    name: input.name || '',
    phone: null,
    tags,
    source: input.source,
    consent_email: true,
    consent_sms: false,
    last_engaged_at: now,
    metadata,
  })
  if (insErr && insErr.code !== '23505') {
    console.warn('fans promo insert skipped:', insErr.code, insErr.message)
  }
}

async function knownFanEmails(supabase: SupabaseLike): Promise<Set<string> | null> {
  const { data: existing, error: fanErr } = await supabase.from('fans').select('email')
  if (fanErr) {
    console.warn('fans backfill select skipped:', fanErr.code, fanErr.message)
    return null
  }
  return new Set((existing || []).map((row) => String(row.email || '').toLowerCase()).filter(Boolean))
}

/**
 * Remove a fan from the CRM and from the tables that the list backfill copies from.
 * Deleting `fans` alone lets the next page load recreate the row from `fan_leads`.
 */
export async function deleteFanContact(
  supabase: SupabaseLike,
  id: string,
): Promise<{ email: string }> {
  const rawId = decodeURIComponent(id).trim()
  let email: string | null = null

  if (rawId.startsWith('lead:')) {
    email = rawId.slice('lead:'.length).trim().toLowerCase()
  } else {
    const { data, error } = await supabase.from('fans').select('email').eq('id', rawId).maybeSingle()
    if (error) throw new Error(error.message || 'Failed to look up fan')
    email = data?.email ? String(data.email).trim() : null
  }

  if (!email || !email.includes('@')) {
    const missing = new Error('Fan not found')
    ;(missing as Error & { status?: number }).status = 404
    throw missing
  }

  const emails = Array.from(new Set([email, email.toLowerCase()]))

  const { error: leadErr } = await supabase.from('fan_leads').delete().in('email', emails)
  if (leadErr && leadErr.code !== 'PGRST205' && leadErr.code !== '42P01') {
    throw new Error(leadErr.message || 'Failed to delete vault unlock')
  }

  const { error: subErr } = await supabase.from('email_subscribers').delete().in('email', emails)
  if (subErr && subErr.code !== 'PGRST205' && subErr.code !== '42P01') {
    throw new Error(subErr.message || 'Failed to delete subscriber')
  }

  const { data: deleted, error: fanErr } = await supabase.from('fans').delete().in('email', emails).select('id')
  if (fanErr) throw new Error(fanErr.message || 'Failed to delete fan')
  if (!rawId.startsWith('lead:') && (!deleted || deleted.length === 0)) {
    const missing = new Error('Fan not found')
    ;(missing as Error & { status?: number }).status = 404
    throw missing
  }

  return { email }
}

/** Copy missing vault unlocks and newsletter subscribers into `fans`. */
export async function backfillEmailsIntoFans(supabase: SupabaseLike): Promise<{ imported: number }> {
  const known = await knownFanEmails(supabase)
  if (!known) return { imported: 0 }
  let imported = 0

  const { data: leads, error: leadErr } = await supabase
    .from('fan_leads')
    .select('email, display_name, source, campaign, first_unlock_at, last_unlock_at, created_at')

  if (leadErr) {
    console.warn('fan_leads backfill select skipped:', leadErr.code, leadErr.message)
  } else {
    const missing = (leads as FanLeadRow[]).filter(
      (lead) => lead.email && !isSyntheticFanEmail(lead.email) && !known.has(lead.email.toLowerCase()),
    )
    if (missing.length) {
      const rows = missing.map((lead) => {
        const created = lead.first_unlock_at || lead.created_at || new Date().toISOString()
        known.add(lead.email.toLowerCase())
        return {
          ...fanInsertFromVaultUnlock(
            {
              email: lead.email.toLowerCase(),
              displayName: lead.display_name || null,
              source: lead.source || VAULT_UNLOCK_SOURCE,
              campaign: lead.campaign || null,
            },
            lead.last_unlock_at || created,
          ),
          created_at: created,
          subscribed_at: created,
        }
      })
      const { error: insErr } = await supabase.from('fans').insert(rows)
      if (insErr) console.warn('fans lead backfill insert skipped:', insErr.code, insErr.message)
      else imported += rows.length
    }
  }

  const { data: subscribers, error: subErr } = await supabase
    .from('email_subscribers')
    .select('email, name, source, created_at, is_active')

  if (subErr) {
    console.warn('email_subscribers backfill select skipped:', subErr.code, subErr.message)
  } else {
    const missing = (subscribers || []).filter(
      (row) =>
        row.email &&
        !isSyntheticFanEmail(String(row.email)) &&
        !known.has(String(row.email).toLowerCase()),
    )
    if (missing.length) {
      const rows = missing.map((row) => {
        const email = String(row.email).toLowerCase()
        const created = row.created_at || new Date().toISOString()
        known.add(email)
        return {
          email,
          name: row.name || '',
          phone: null,
          tags: ['email_subscriber'],
          source: row.source || 'email_subscriber',
          consent_email: row.is_active !== false,
          consent_sms: false,
          last_engaged_at: created,
          created_at: created,
          subscribed_at: created,
          metadata: { restored_from: 'email_subscribers' },
        }
      })
      const { error: insErr } = await supabase.from('fans').insert(rows)
      if (insErr) console.warn('fans subscriber backfill insert skipped:', insErr.code, insErr.message)
      else imported += rows.length
    }
  }

  return { imported }
}

/** @deprecated use backfillEmailsIntoFans */
export const backfillVaultUnlocksIntoFans = backfillEmailsIntoFans
