import { createSupabaseServerClient } from '@/lib/supabase'
import type { CampaignSummary, Paginated, RepositoryResult } from './types'

export async function listCampaigns(params: {
  limit?: number
  offset?: number
}): Promise<RepositoryResult<Paginated<CampaignSummary>>> {
  try {
    const supabase = createSupabaseServerClient()
    const limit = Math.max(1, Math.min(params.limit ?? 80, 200))
    const offset = Math.max(0, params.offset ?? 0)

    const { data, error, count } = await supabase
      .from('campaigns')
      .select('id, name, status, scheduled_send_at, created_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) return { ok: false, error: error.message }
    return {
      ok: true,
      data: {
        items: (data as CampaignSummary[]) ?? [],
        total: count ?? null,
        offset,
        limit,
      },
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export async function countFans(): Promise<RepositoryResult<number>> {
  try {
    const supabase = createSupabaseServerClient()
    const { count, error } = await supabase.from('fans').select('*', { count: 'exact', head: true })
    if (error) return { ok: false, error: error.message }
    return { ok: true, data: count ?? 0 }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}
