import type { SupabaseClient } from '@supabase/supabase-js'
import {
  assembleSmartLinkLanding,
  type SmartLinkLanding,
  type SmartLinkStoreRow,
} from '@/lib/smartlinks/landing'

function elevatorFromCopy(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const value = (raw as { elevator_pitch?: unknown }).elevator_pitch
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function vaultFolderId(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const vault = (raw as { _vault?: { folderId?: unknown } })._vault
  const id = vault?.folderId
  if (id == null) return null
  const text = String(id).trim()
  return text || null
}

export async function loadSmartLinkLanding(
  supabase: SupabaseClient,
  slug: string,
): Promise<SmartLinkLanding | null> {
  const safe = decodeURIComponent(slug || '').trim()
  if (!safe) return null

  const { data: link, error } = await supabase
    .from('smartlinks')
    .select('slug, title, description, destination_url, release_id')
    .eq('slug', safe)
    .maybeSingle()

  if (error || !link) return null

  const releaseId = String(link.release_id || '').trim()
  let release: {
    id: string
    title: string | null
    artist: string | null
    artworkUrl: string | null
    releaseDate: string | null
    elevator: string | null
    description: string | null
  } | null = null
  let stores: SmartLinkStoreRow[] = []
  let shareToken: string | null = null

  if (releaseId) {
    const [{ data: row }, { data: storeRows }] = await Promise.all([
      supabase
        .from('distribution_releases')
        .select('id, title, album_artist, artwork_url, release_date, description, marketing_copy')
        .eq('id', releaseId)
        .maybeSingle(),
      supabase
        .from('distribution_store_links')
        .select('store, url, verification_status')
        .eq('release_id', releaseId),
    ])

    if (row) {
      release = {
        id: String(row.id),
        title: (row.title as string | null) || null,
        artist: (row.album_artist as string | null) || null,
        artworkUrl: (row.artwork_url as string | null) || null,
        releaseDate: row.release_date ? String(row.release_date).slice(0, 10) : null,
        elevator: elevatorFromCopy(row.marketing_copy),
        description: (row.description as string | null) || null,
      }
      const folderId = vaultFolderId(row.marketing_copy)
      if (folderId) {
        const { data: share } = await supabase
          .from('music_share_links')
          .select('token, visibility, revoked_at')
          .eq('kind', 'folder')
          .eq('target_id', folderId)
          .is('revoked_at', null)
          .neq('visibility', 'disabled')
          .limit(1)
          .maybeSingle()
        const token = String(share?.token || '').trim()
        if (token) shareToken = token
      }
    }

    stores = (storeRows || [])
      .map((row) => ({
        store: String(row.store || ''),
        url: String(row.url || ''),
      }))
      .filter((row) => row.store && row.url)
  }

  return assembleSmartLinkLanding({
    slug: String(link.slug || safe),
    title: String(link.title || ''),
    description: (link.description as string | null) || null,
    destinationUrl: (link.destination_url as string | null) || null,
    release,
    stores,
    shareToken,
  })
}
