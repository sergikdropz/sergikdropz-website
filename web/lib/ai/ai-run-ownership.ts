import { createSupabaseServerClient } from '@/lib/supabase'

export type OwnedAiRun = {
  id: string
  admin_id: string
  status: string
  response: Record<string, unknown> | null
  request_type: string
  prompt: string
}

/**
 * Load an AI run only if it belongs to the given admin.
 * Prevents cross-admin inspect/approve by run ID alone.
 */
export async function getOwnedAiRun(params: {
  runId: string
  adminId: string
}): Promise<{ run: OwnedAiRun | null; error: string | null }> {
  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase
    .from('ai_runs')
    .select('id, admin_id, status, response, request_type, prompt')
    .eq('id', params.runId)
    .eq('admin_id', params.adminId)
    .maybeSingle()

  if (error) {
    return { run: null, error: error.message }
  }
  return { run: (data as OwnedAiRun | null) ?? null, error: null }
}

export async function listOwnedAiRuns(params: {
  adminId: string
  status?: string | null
  requestType?: string | null
  offset: number
  limit: number
}) {
  const supabase = createSupabaseServerClient()
  let query = supabase
    .from('ai_runs')
    .select(
      `
        id,
        admin_id,
        request_type,
        prompt,
        response,
        status,
        error_message,
        created_at,
        completed_at
      `,
      { count: 'exact' }
    )
    .eq('admin_id', params.adminId)
    .order('created_at', { ascending: false })
    .range(params.offset, params.offset + params.limit - 1)

  if (params.status) query = query.eq('status', params.status)
  if (params.requestType) query = query.eq('request_type', params.requestType)

  return query
}
