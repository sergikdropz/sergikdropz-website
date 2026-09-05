import { supabaseIsReachable } from '@/lib/supabaseReachability'
import { createSupabaseServerClient } from '@/lib/supabase'

export type PublicLiveRelease = {
  id: string
  title: string
  type: string
  release_date: string | null
  artwork_url: string | null
}

/** Server-side live releases for marketing /music (ISR-friendly). */
export async function getPublicLiveReleases(): Promise<PublicLiveRelease[]> {
  try {
    if (!(await supabaseIsReachable())) return []

    const supabase = createSupabaseServerClient()
    const { data, error } = await supabase
      .from('distribution_releases')
      .select('id, title, type, release_date, artwork_url')
      .eq('distributor_status', 'live')
      .order('release_date', { ascending: false })

    if (error) {
      if (error.code === 'PGRST205' || error.message?.includes('Could not find')) {
        return []
      }
      console.error('[getPublicLiveReleases]', error.message)
      return []
    }

    return (data || []) as PublicLiveRelease[]
  } catch (err) {
    console.error('[getPublicLiveReleases]', err)
    return []
  }
}
