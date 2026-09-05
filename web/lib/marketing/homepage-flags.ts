import { createSupabaseServerClient } from '@/lib/supabase'
import { HOMEPAGE_INSTAGRAM_FEED_ENABLED_KEY } from '@/lib/site-settings-keys'

function parseDbBoolean(value: unknown): boolean | null {
  if (value === true || value === 'true') return true
  if (value === false || value === 'false') return false
  if (value && typeof value === 'object' && 'enabled' in value) {
    const e = (value as { enabled?: unknown }).enabled
    if (e === true || e === 'true') return true
    if (e === false || e === 'false') return false
  }
  return null
}

/** Resolve homepage Instagram visibility (env → DB → default on). */
export async function getHomepageInstagramFeedEnabled(): Promise<boolean> {
  const env = process.env.NEXT_PUBLIC_SHOW_INSTAGRAM_FEED
  if (env === 'false') return false
  if (env === 'true') return true

  try {
    const supabase = createSupabaseServerClient()
    const { data, error } = await supabase
      .from('settings')
      .select('value')
      .eq('key', HOMEPAGE_INSTAGRAM_FEED_ENABLED_KEY)
      .maybeSingle()

    if (!error && data?.value !== undefined && data?.value !== null) {
      const parsed = parseDbBoolean(data.value)
      if (parsed !== null) return parsed
    }
  } catch (e) {
    console.error('getHomepageInstagramFeedEnabled: settings read failed', e)
  }

  return true
}
