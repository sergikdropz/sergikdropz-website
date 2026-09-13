import { createSupabaseServerClient } from '@/lib/supabase'

export async function markFanPasswordCredential(userId: string): Promise<void> {
  const supabase = createSupabaseServerClient()
  const ts = new Date().toISOString()
  const { error } = await supabase.from('fan_profiles').upsert(
    {
      id: userId,
      password_credential_at: ts,
      updated_at: ts,
    },
    { onConflict: 'id' }
  )
  if (error) {
    console.error('markFanPasswordCredential:', error)
  }
}

export async function fanHasPasswordCredential(userId: string): Promise<boolean> {
  const supabase = createSupabaseServerClient()

  const { data: rpcData, error: rpcError } = await supabase.rpc('fan_auth_has_password', {
    uid: userId,
  })
  if (!rpcError && rpcData === true) return true
  if (rpcError) {
    console.warn('fan_auth_has_password (fallback to fan_profiles):', rpcError.message)
  }

  const { data, error } = await supabase
    .from('fan_profiles')
    .select('password_credential_at')
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    console.error('fanHasPasswordCredential:', error)
    return false
  }
  return Boolean(data?.password_credential_at)
}
