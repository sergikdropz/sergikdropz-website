import { createSupabaseServerClient } from '@/lib/supabase'
import type { DistributionReleaseSummary, Paginated, RepositoryResult } from './types'

export async function listDistributionReleases(params: {
  limit?: number
  offset?: number
}): Promise<RepositoryResult<Paginated<DistributionReleaseSummary>>> {
  try {
    const supabase = createSupabaseServerClient()
    const limit = Math.max(1, Math.min(params.limit ?? 80, 200))
    const offset = Math.max(0, params.offset ?? 0)

    const { data, error, count } = await supabase
      .from('distribution_releases')
      .select('id, title, type, distributor_status, release_date, created_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) return { ok: false, error: error.message }
    return {
      ok: true,
      data: {
        items: (data as DistributionReleaseSummary[]) ?? [],
        total: count ?? null,
        offset,
        limit,
      },
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export async function getDistributionRelease(
  id: string
): Promise<RepositoryResult<DistributionReleaseSummary | null>> {
  try {
    const supabase = createSupabaseServerClient()
    const { data, error } = await supabase
      .from('distribution_releases')
      .select('id, title, type, distributor_status, release_date, created_at')
      .eq('id', id)
      .maybeSingle()
    if (error) return { ok: false, error: error.message }
    return { ok: true, data: (data as DistributionReleaseSummary | null) ?? null }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}
