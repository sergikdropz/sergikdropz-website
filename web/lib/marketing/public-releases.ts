import { supabaseIsReachable } from '@/lib/supabaseReachability'
import { createSupabaseServerClient } from '@/lib/supabase'
import {
  seoDescriptionFromCopy,
  storeLinkToPlatform,
  type PublicStoreLink,
} from '@/lib/marketing/music-seo'

export type PublicLiveRelease = {
  id: string
  title: string
  type: string
  release_date: string | null
  artwork_url: string | null
}

export type PublicLiveTrack = {
  title: string
  duration: number | null
  isrc: string | null
}

export type PublicLiveReleaseDetail = PublicLiveRelease & {
  description: string | null
  genre: string | null
  subgenre: string | null
  label_name: string | null
  upc: string | null
  seoDescription: string
  tracks: PublicLiveTrack[]
  storeLinks: PublicStoreLink[]
}

function publicCopyFields(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const copy = raw as Record<string, unknown>
  const out: Record<string, string> = {}
  for (const key of [
    'elevator_pitch',
    'press_blurb',
    'spotify_pitch',
    'store_description',
  ]) {
    const value = copy[key]
    if (typeof value === 'string' && value.trim()) out[key] = value.trim()
  }
  return out
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

export async function getPublicLiveReleaseById(
  id: string,
): Promise<PublicLiveReleaseDetail | null> {
  try {
    if (!(await supabaseIsReachable())) return null

    const supabase = createSupabaseServerClient()
    const { data: release, error } = await supabase
      .from('distribution_releases')
      .select(
        'id, title, type, release_date, artwork_url, description, genre, subgenre, label_name, upc, marketing_copy, distributor_status',
      )
      .eq('id', id)
      .eq('distributor_status', 'live')
      .maybeSingle()

    if (error) {
      if (error.code === 'PGRST205' || error.message?.includes('Could not find')) {
        return null
      }
      console.error('[getPublicLiveReleaseById]', error.message)
      return null
    }
    if (!release) return null

    const [{ data: tracks }, { data: storeRows }] = await Promise.all([
      supabase
        .from('distribution_tracks')
        .select('title, duration, isrc_full')
        .eq('release_id', id)
        .order('created_at', { ascending: true }),
      supabase.from('distribution_store_links').select('store, url').eq('release_id', id),
    ])

    const copy = publicCopyFields(release.marketing_copy)
    const description =
      copy.press_blurb ||
      (typeof release.description === 'string' ? release.description.trim() : '') ||
      copy.store_description ||
      null

    const storeLinks: PublicStoreLink[] = (storeRows || [])
      .map((row) => {
        const url = String(row.url || '').trim()
        const store = String(row.store || '').trim()
        if (!url || !store) return null
        const mapped = storeLinkToPlatform(store)
        return { store, url, label: mapped.label }
      })
      .filter((row): row is PublicStoreLink => Boolean(row))

    return {
      id: String(release.id),
      title: String(release.title || 'Untitled'),
      type: String(release.type || 'single'),
      release_date: release.release_date ? String(release.release_date).slice(0, 10) : null,
      artwork_url: (release.artwork_url as string | null) || null,
      description,
      genre: (release.genre as string | null) || null,
      subgenre: (release.subgenre as string | null) || null,
      label_name: (release.label_name as string | null) || null,
      upc: (release.upc as string | null) || null,
      seoDescription: seoDescriptionFromCopy({
        title: String(release.title || 'Untitled'),
        type: String(release.type || 'single'),
        genre: (release.genre as string | null) || null,
        description,
        elevator: copy.elevator_pitch || null,
      }),
      tracks: (tracks || []).map((t) => ({
        title: String(t.title || 'Untitled'),
        duration: typeof t.duration === 'number' ? t.duration : null,
        isrc: (t.isrc_full as string | null) || null,
      })),
      storeLinks,
    }
  } catch (err) {
    console.error('[getPublicLiveReleaseById]', err)
    return null
  }
}
