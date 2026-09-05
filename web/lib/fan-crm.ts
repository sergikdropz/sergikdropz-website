import type { createSupabaseServerClient } from '@/lib/supabase'

export const VAULT_UNLOCK_SOURCE = 'vault_unlock'
export const VAULT_UNLOCK_TAG = 'vault'

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

/** Playwright / Auto DJ unlocks must not enter the Fans CRM. */
export function isSyntheticFanEmail(email: string | null | undefined): boolean {
  if (!email || typeof email !== 'string') return true
  const e = email.trim().toLowerCase()
  if (!e.includes('@') || e.length > 320) return true
  if (e.endsWith('@sergik.local')) return true
  if (SYNTHETIC_FAN_EMAILS.has(e)) return true
  if (/(^|[.+_-])(autodj|auto-dj|auto_dj)([.+_-]|$)/.test(e.split('@')[0])) return true
  if (/^e2e[-_.]/.test(e) && e.endsWith('@example.com')) return true
  if (/^(qa-fan-|vault-crm-verify-|vault-probe-|probe\d+-)/.test(e) && e.endsWith('@example.com')) return true
  return false
}

export function vaultUnlockSource(source: string | null | undefined): string {
  const trimmed = typeof source === 'string' ? source.trim() : ''
  return trimmed || VAULT_UNLOCK_SOURCE
}

export function fanInsertFromVaultUnlock(input: VaultUnlockFanInput, now: string) {
  const metadata: Record<string, unknown> = { vault_unlocked: true }
  if (input.campaign) metadata.campaign = input.campaign

  return {
    email: input.email,
    name: input.displayName || '',
    phone: null,
    tags: [VAULT_UNLOCK_TAG],
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
  if (!tags.includes(VAULT_UNLOCK_TAG)) tags.push(VAULT_UNLOCK_TAG)

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
}

async function knownFanEmails(supabase: SupabaseLike): Promise<Set<string> | null> {
  const { data: existing, error: fanErr } = await supabase.from('fans').select('email')
  if (fanErr) {
    console.warn('fans backfill select skipped:', fanErr.code, fanErr.message)
    return null
  }
  return new Set((existing || []).map((row) => String(row.email || '').toLowerCase()).filter(Boolean))
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
