import { createSupabaseServerClient } from '@/lib/supabase'
import { getSingleReleaseCopyrightReadiness } from '@/lib/studio/copyright-pipeline'

export type ReleaseStudioSnapshot = {
  release: Record<string, unknown>
  tracks: Array<Record<string, unknown>>
  storeLinks: Array<Record<string, unknown>>
  copyright: Record<string, unknown> | null
}

export async function fetchReleaseStudioSnapshot(releaseId: string): Promise<ReleaseStudioSnapshot> {
  const supabase = createSupabaseServerClient()

  const { data: release, error: releaseError } = await supabase
    .from('distribution_releases')
    .select('*')
    .eq('id', releaseId)
    .single()

  if (releaseError || !release) {
    throw new Error('Release not found')
  }

  const { data: tracks } = await supabase
    .from('distribution_tracks')
    .select('*')
    .eq('release_id', releaseId)
    .order('created_at', { ascending: true })

  const { data: storeLinks } = await supabase
    .from('distribution_store_links')
    .select('*')
    .eq('release_id', releaseId)

  const copyright = await getSingleReleaseCopyrightReadiness(supabase, releaseId)

  return {
    release: release as Record<string, unknown>,
    tracks: (tracks || []) as Array<Record<string, unknown>>,
    storeLinks: (storeLinks || []) as Array<Record<string, unknown>>,
    copyright: copyright as unknown as Record<string, unknown>,
  }
}
