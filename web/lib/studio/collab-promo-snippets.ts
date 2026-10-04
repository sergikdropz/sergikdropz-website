import { createSupabaseServerClient } from '@/lib/supabase'
import { studioReleasePublicHref } from '@/lib/studio/studio-ia'

export type CollabPromoSnippet = {
  id: string
  label: string
  text: string
  url?: string
}

function siteBase(siteOrigin?: string): string {
  const base = (siteOrigin || process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/$/, '')
  return base || 'https://sergikdropz.com'
}

export async function loadCollabPromoSnippets(
  releaseId: string,
  siteOrigin?: string,
): Promise<CollabPromoSnippet[]> {
  const supabase = createSupabaseServerClient()
  const base = siteBase(siteOrigin)

  const { data: release } = await supabase
    .from('distribution_releases')
    .select('id, title, marketing_copy, distributor_status')
    .eq('id', releaseId)
    .maybeSingle()

  if (!release) return []

  const { data: smart } = await supabase
    .from('smartlinks')
    .select('slug, title')
    .eq('release_id', releaseId)
    .maybeSingle()

  const { data: tracks } = await supabase
    .from('distribution_tracks')
    .select('id, title, track_number')
    .eq('release_id', releaseId)
    .order('track_number', { ascending: true })

  const snippets: CollabPromoSnippet[] = []
  const title = String(release.title || 'Untitled')

  snippets.push({
    id: 'release-page',
    label: 'Release page',
    text: `Release page — ${title}`,
    url: `${base}${studioReleasePublicHref(releaseId)}`,
  })

  if (smart?.slug) {
    const url = `${base}/api/go/${encodeURIComponent(String(smart.slug))}`
    snippets.push({
      id: 'smart-link',
      label: 'Smart link',
      text: `Listen / presave — ${smart.title || title}`,
      url,
    })
  }

  const mc = release.marketing_copy as Record<string, unknown> | null
  const pitch = mc?.pitch ?? mc?.description ?? mc?.store_description
  if (pitch && String(pitch).trim()) {
    snippets.push({
      id: 'pitch',
      label: 'Pitch copy',
      text: String(pitch).trim().slice(0, 500),
    })
  }

  const trackCount = tracks?.length ?? 0
  if (trackCount === 1 && tracks?.[0]) {
    snippets.push({
      id: 'single',
      label: 'Single',
      text: `Track: ${tracks[0].title || 'Untitled'}`,
    })
  } else if (trackCount > 1) {
    snippets.push({
      id: 'tracklist',
      label: 'Tracklist',
      text: (tracks || [])
        .map((t, i) => `${t.track_number ?? i + 1}. ${t.title || 'Untitled'}`)
        .join('\n'),
    })
  }

  if (release.distributor_status === 'live') {
    snippets.push({
      id: 'live',
      label: 'Status',
      text: 'This release is live on streaming — share the smart link or release page above.',
    })
  }

  return snippets
}

export function formatSnippetForComposer(snippet: CollabPromoSnippet): string {
  if (snippet.url) {
    return `${snippet.text}\n${snippet.url}`
  }
  return snippet.text
}
