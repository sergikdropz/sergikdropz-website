import { createSupabaseServerClient } from '@/lib/supabase'
import { INSTAGRAM_MANUAL_POSTS_KEY } from '@/lib/site-settings-keys'

/**
 * Load manual Instagram post URLs saved from Instagram Helper.
 * Returns `null` if no row exists (caller should fall back to `data/instagram-posts.json`).
 * Returns `{ posts: [] }` when the user explicitly cleared the list.
 */
export async function loadManualPostsFromSettings(): Promise<{
  posts: string[]
  username?: string
} | null> {
  try {
    const supabase = createSupabaseServerClient()
    const { data, error } = await supabase
      .from('settings')
      .select('value')
      .eq('key', INSTAGRAM_MANUAL_POSTS_KEY)
      .maybeSingle()

    if (error || data?.value == null) return null
    const v = data.value as { posts?: unknown; username?: unknown }
    if (!Array.isArray(v.posts)) return null
    return {
      posts: v.posts.filter((p): p is string => typeof p === 'string' && p.trim() !== ''),
      username: typeof v.username === 'string' ? v.username : undefined,
    }
  } catch {
    return null
  }
}
