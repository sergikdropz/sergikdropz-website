import { isSyntheticFanEmail } from '@/lib/fan-crm'
import {
  ADMIN_MAIL_ROUTES,
  audienceAccountForContact,
  mergeAudienceContact,
  type AudienceContact,
} from '@/lib/email/department-desk'

type QueryResult = { data: unknown[] | null; error: { message?: string } | null }

/** Structural slice of the Supabase client; routes cast the real client to keep tsc shallow. */
export type AudienceClient = {
  from: (table: string) => {
    select: (columns: string) => {
      limit: (count: number) => PromiseLike<QueryResult>
      eq: (column: string, value: boolean) => { limit: (count: number) => PromiseLike<QueryResult> }
    }
  }
}

export type DeskAudience = {
  accountId: string
  label: string
  handles: string
  count: number
  sample: { email: string; name: string }[]
}

function asTags(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((tag) => String(tag))
  return []
}

function remember(map: Map<string, AudienceContact>, contact: AudienceContact) {
  const email = contact.email.trim().toLowerCase()
  if (!email || isSyntheticFanEmail(email)) return
  map.set(email, mergeAudienceContact(map.get(email), { ...contact, email }))
}

async function collectAudience(supabase: AudienceClient): Promise<Map<string, AudienceContact>> {
  const map = new Map<string, AudienceContact>()

  const active = await supabase.from('email_subscribers').select('email, name, source, is_active').eq('is_active', true).limit(500)
  const subscribers = active.error
    ? await supabase.from('email_subscribers').select('email, name, source, is_active').limit(500)
    : active
  if (!subscribers.error && Array.isArray(subscribers.data)) {
    for (const row of subscribers.data as { email?: string; name?: string; source?: string; is_active?: boolean }[]) {
      if (row.is_active === false) continue
      remember(map, {
        email: String(row.email || ''),
        name: String(row.name || ''),
        source: String(row.source || 'website'),
        tags: [],
      })
    }
  }

  const fans = await supabase.from('fans').select('email, name, source, tags, consent_email').limit(500)
  if (!fans.error && Array.isArray(fans.data)) {
    for (const row of fans.data as { email?: string; name?: string; source?: string; tags?: unknown; consent_email?: boolean }[]) {
      if (row.consent_email === false) continue
      remember(map, {
        email: String(row.email || ''),
        name: String(row.name || ''),
        source: String(row.source || ''),
        tags: asTags(row.tags),
      })
    }
  }

  return map
}

export async function loadDepartmentDirectory(supabase: AudienceClient): Promise<{
  audiences: DeskAudience[]
  contacts: { email: string; name: string }[]
}> {
  const map = await collectAudience(supabase)
  const counts = new Map<string, AudienceContact[]>()
  for (const contact of map.values()) {
    const accountId = audienceAccountForContact(contact)
    const list = counts.get(accountId) || []
    list.push(contact)
    counts.set(accountId, list)
  }

  const audiences = ADMIN_MAIL_ROUTES.map((route) => {
    const people = counts.get(route.accountId) || []
    return {
      accountId: route.accountId,
      label: route.label,
      handles: route.handles,
      count: people.length,
      sample: people.slice(0, 8).map((person) => ({ email: person.email, name: person.name })),
    }
  })
  const contacts = [...map.values()]
    .map((person) => ({ email: person.email, name: person.name.trim() }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.email.localeCompare(b.email))
  return { audiences, contacts }
}

export async function loadDepartmentAudience(supabase: AudienceClient): Promise<DeskAudience[]> {
  const directory = await loadDepartmentDirectory(supabase)
  return directory.audiences
}

export async function loadAudienceRecipients(
  supabase: AudienceClient,
  accountId: string,
): Promise<AudienceContact[]> {
  const map = await collectAudience(supabase)
  return [...map.values()].filter((contact) => audienceAccountForContact(contact) === accountId)
}
