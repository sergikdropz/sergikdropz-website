import { createSupabaseServerClient } from '../supabase'
import {
  isMailDepartmentId,
  listMailDepartments,
  mailAccountIdFromLocalPart,
  mergeMailAccounts,
  normalizeMailAccountFields,
  type MailAccountDraft,
  type MailDepartment,
} from '@/lib/email/departments'

const TABLE = 'mail_accounts'

function mapRow(row: { id: string; name: string; local_part: string; purpose: string | null }): MailAccountDraft {
  return {
    id: String(row.id),
    name: String(row.name),
    localPart: String(row.local_part),
    purpose: row.purpose ? String(row.purpose) : '',
  }
}

export async function listResolvedMailAccounts(): Promise<MailDepartment[]> {
  try {
    const supabase = createSupabaseServerClient()
    const { data, error } = await supabase.from(TABLE).select('id, name, local_part, purpose')
    if (error || !data) return listMailDepartments()
    return mergeMailAccounts(
      data.map((row) =>
        mapRow(row as { id: string; name: string; local_part: string; purpose: string | null }),
      ),
    )
  } catch {
    return listMailDepartments()
  }
}

export async function resolveMailAccount(id: string): Promise<MailDepartment | null> {
  const accounts = await listResolvedMailAccounts()
  return accounts.find((account) => account.id === id) ?? null
}

function localPartTaken(accounts: MailDepartment[], localPart: string, exceptId: string): boolean {
  return accounts.some((account) => account.id !== exceptId && account.localPart === localPart)
}

export async function createMailAccount(input: {
  name: unknown
  localPart: unknown
  purpose: unknown
}): Promise<MailDepartment> {
  const fields = normalizeMailAccountFields(input)
  if (!fields) throw new Error('Name, mailbox, and purpose need a valid mailbox like radio or release.studio.')
  const id = mailAccountIdFromLocalPart(fields.localPart)
  if (!id) throw new Error('That mailbox cannot be used as an account id.')
  const accounts = await listResolvedMailAccounts()
  if (accounts.some((account) => account.id === id)) {
    throw new Error('An account with that mailbox already exists. Edit it instead.')
  }
  if (localPartTaken(accounts, fields.localPart, id)) {
    throw new Error('That mailbox is already in use.')
  }
  const supabase = createSupabaseServerClient()
  const { error } = await supabase.from(TABLE).insert({
    id,
    name: fields.name,
    local_part: fields.localPart,
    purpose: fields.purpose,
    updated_at: new Date().toISOString(),
  })
  if (error) throw new Error(error.message)
  return (await resolveMailAccount(id))!
}

export async function updateMailAccount(
  id: string,
  input: { name: unknown; localPart: unknown; purpose: unknown },
): Promise<MailDepartment> {
  const cleanId = id.trim()
  if (!cleanId) throw new Error('Missing account.')
  const fields = normalizeMailAccountFields(input)
  if (!fields) throw new Error('Name, mailbox, and purpose need a valid mailbox like radio or release.studio.')
  const accounts = await listResolvedMailAccounts()
  const current = accounts.find((account) => account.id === cleanId)
  if (!current) throw new Error('Unknown account.')
  if (localPartTaken(accounts, fields.localPart, cleanId)) {
    throw new Error('That mailbox is already in use.')
  }
  const supabase = createSupabaseServerClient()
  const { error } = await supabase.from(TABLE).upsert(
    {
      id: cleanId,
      name: fields.name,
      local_part: fields.localPart,
      purpose: fields.purpose,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' },
  )
  if (error) throw new Error(error.message)
  return (await resolveMailAccount(cleanId))!
}

export async function deleteMailAccount(id: string): Promise<void> {
  const cleanId = id.trim()
  if (isMailDepartmentId(cleanId)) {
    throw new Error('Built-in accounts stay in the list. Edit the name or mailbox instead.')
  }
  const supabase = createSupabaseServerClient()
  const { error } = await supabase.from(TABLE).delete().eq('id', cleanId)
  if (error) throw new Error(error.message)
}
