import { createSupabaseServerClient } from '@/lib/supabase'
import { attorneyActionBlock, attorneyReviewEnabled, type CopyrightOwnerFact } from '@/lib/licensing/operator-gate'

export type OperatorFacts = {
  copyrightOwner: CopyrightOwnerFact
  stripeAccountName: string | null
  stripeNameMatchesLlc: boolean
  stripeChecked: boolean
}

const EMPTY: OperatorFacts = {
  copyrightOwner: 'unconfirmed',
  stripeAccountName: null,
  stripeNameMatchesLlc: false,
  stripeChecked: false,
}

function missingTable(message: string): boolean {
  return /licensing_operator_facts/i.test(message) && /does not exist|schema cache|could not find/i.test(message)
}

function asOwner(value: unknown): CopyrightOwnerFact {
  if (value === 'llc' || value === 'personal') return value
  return 'unconfirmed'
}

export async function getOperatorFacts(): Promise<OperatorFacts & { storageReady: boolean }> {
  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase.from('licensing_operator_facts').select('*').eq('id', 'default').maybeSingle()
  if (error) {
    if (missingTable(error.message)) return { ...EMPTY, storageReady: false }
    throw new Error(error.message)
  }
  if (!data) return { ...EMPTY, storageReady: true }
  return {
    copyrightOwner: asOwner(data.copyright_owner),
    stripeAccountName: data.stripe_account_name ? String(data.stripe_account_name) : null,
    stripeNameMatchesLlc: data.stripe_name_matches_llc === true,
    stripeChecked: Boolean(data.stripe_checked_at),
    storageReady: true,
  }
}

export async function assertAttorneyActionsAllowed(): Promise<void> {
  const facts = await getOperatorFacts()
  if (!facts.storageReady) {
    throw new Error('Apply web/supabase/migrations/add_licensing_operator_facts.sql before attorney review.')
  }
  const block = attorneyActionBlock({
    reviewEnabled: attorneyReviewEnabled(),
    copyrightOwner: facts.copyrightOwner,
    stripeChecked: facts.stripeChecked,
    stripeNameMatchesLlc: facts.stripeNameMatchesLlc,
  })
  if (block) throw new Error(block)
}

export async function recordCopyrightOwner(owner: CopyrightOwnerFact): Promise<void> {
  if (owner !== 'llc' && owner !== 'personal') throw new Error('Choose the LLC or the songwriter personally.')
  const supabase = createSupabaseServerClient()
  const { error } = await supabase.from('licensing_operator_facts').upsert({
    id: 'default',
    copyright_owner: owner,
    updated_at: new Date().toISOString(),
  })
  if (error) {
    if (missingTable(error.message)) {
      throw new Error('Apply web/supabase/migrations/add_licensing_operator_facts.sql first.')
    }
    throw new Error(error.message)
  }
}

export async function recordStripeAccountCheck(name: string | null, matches: boolean): Promise<void> {
  const supabase = createSupabaseServerClient()
  const { error } = await supabase.from('licensing_operator_facts').upsert({
    id: 'default',
    stripe_account_name: name,
    stripe_name_matches_llc: matches,
    stripe_checked_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  })
  if (error) {
    if (missingTable(error.message)) {
      throw new Error('Apply web/supabase/migrations/add_licensing_operator_facts.sql first.')
    }
    throw new Error(error.message)
  }
}
