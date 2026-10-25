import { createSupabaseServerClient } from '@/lib/supabase'
import {
  deezerAlbumFromSearch,
  hyperfollowLookupUrl,
  PLATFORM_ORDER,
  releaseUrlsFromOdesliMatches,
  releaseUrlsFromStoreHtml,
  sharePlatformEmbeds,
} from '@/lib/shares/platform-embeds'
import type { SharePlatformEmbed, SharePlatformId } from '@/lib/shares/types'

const htmlCache = new Map<string, { at: number; html: string | null }>()
const HTML_TTL_MS = 10 * 60 * 1000

async function fetchText(url: string, accept: string): Promise<string | null> {
  const cached = htmlCache.get(url)
  if (cached && Date.now() - cached.at < HTML_TTL_MS) return cached.html
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(2200),
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: accept },
      redirect: 'follow',
    })
    const html = res.ok ? await res.text() : null
    htmlCache.set(url, { at: Date.now(), html })
    return html
  } catch {
    htmlCache.set(url, { at: Date.now(), html: null })
    return null
  }
}

function fillGaps(
  urls: Partial<Record<SharePlatformId, string>>,
  found: Partial<Record<SharePlatformId, string>>,
) {
  for (const id of PLATFORM_ORDER) {
    if (found[id] && !sharePlatformEmbeds({ [id]: urls[id] }).length) urls[id] = found[id]
  }
}

async function releaseIdForTracks(trackIds: string[], folderId: string | null): Promise<string | null> {
  const supabase = createSupabaseServerClient()
  const ids = [...new Set(trackIds.map((id) => id.trim()).filter(Boolean))]
  if (ids.length) {
    const { data, error } = await supabase
      .from('distribution_tracks')
      .select('release_id, music_library_track_id')
      .in('music_library_track_id', ids)
    if (!error && data?.length) {
      const counts = new Map<string, number>()
      for (const row of data) {
        const releaseId = String(row.release_id || '').trim()
        if (!releaseId) continue
        counts.set(releaseId, (counts.get(releaseId) || 0) + 1)
      }
      const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]
      if (best) return best[0]
    }
  }

  if (!folderId) return null
  const { data, error } = await supabase
    .from('distribution_releases')
    .select('id')
    .filter('marketing_copy->_vault->>folderId', 'eq', folderId)
    .limit(1)
  if (error || !data?.[0]?.id) return null
  return String(data[0].id)
}

export async function loadSharePlatformEmbeds(input: {
  trackIds: string[]
  folderId?: string | null
  title: string
  artist?: string | null
}): Promise<SharePlatformEmbed[]> {
  const urls: Partial<Record<SharePlatformId, string>> = {}
  try {
    const releaseId = await releaseIdForTracks(input.trackIds, input.folderId || null)
    if (releaseId) {
      const supabase = createSupabaseServerClient()
      const { data } = await supabase
        .from('distribution_store_links')
        .select('store, url')
        .eq('release_id', releaseId)
      for (const row of data || []) {
        const store = String(row.store || '').trim() as SharePlatformId
        const url = String(row.url || '').trim()
        if (!PLATFORM_ORDER.includes(store) || !url) continue
        if (!urls[store]) urls[store] = url
      }
    }
  } catch {
    /* store links are optional */
  }

  const missing = () => PLATFORM_ORDER.some((id) => !sharePlatformEmbeds({ [id]: urls[id] }).length)
  if (missing()) {
    const page = hyperfollowLookupUrl(input.artist || 'SERGIK', input.title)
    if (page) {
      const html = await fetchText(page, 'text/html')
      if (html) fillGaps(urls, releaseUrlsFromStoreHtml(html))
    }
  }

  if (missing()) {
    const seed =
      sharePlatformEmbeds({ spotify: urls.spotify })[0]?.url ||
      sharePlatformEmbeds({ apple_music: urls.apple_music })[0]?.url ||
      sharePlatformEmbeds({ deezer: urls.deezer })[0]?.url
    const artist = input.artist || 'SERGIK'
    const [odesli, deezer] = await Promise.all([
      seed
        ? fetchText(
            `https://api.odesli.co/matches?url=${encodeURIComponent(seed)}`,
            'application/json',
          )
        : Promise.resolve(null),
      sharePlatformEmbeds({ deezer: urls.deezer }).length
        ? Promise.resolve(null)
        : fetchText(
            `https://api.deezer.com/search/album?q=${encodeURIComponent(`${artist} ${input.title}`)}`,
            'application/json',
          ),
    ])
    if (odesli) {
      try {
        fillGaps(urls, releaseUrlsFromOdesliMatches(JSON.parse(odesli)))
      } catch {
        /* ignore a bad payload */
      }
    }
    if (deezer) {
      try {
        const album = deezerAlbumFromSearch(JSON.parse(deezer), input.title, artist)
        if (album) fillGaps(urls, { deezer: album })
      } catch {
        /* ignore a bad payload */
      }
    }
  }

  return sharePlatformEmbeds(urls)
}
