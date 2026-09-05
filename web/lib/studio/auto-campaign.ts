import { SupabaseClient } from '@supabase/supabase-js'

type ReleaseData = {
  id: string
  title: string
  release_date?: string | null
  [key: string]: unknown
}

/**
 * Builds a pre-save email body template for a scheduled release.
 */
function buildCampaignBody(title: string, releaseDate: string | null | undefined): string {
  const dateStr = releaseDate
    ? new Date(releaseDate).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : 'coming soon'

  return [
    `Hi {{first_name}},`,
    ``,
    `Big news — "${title}" is dropping on ${dateStr}!`,
    ``,
    `Pre-save it on Spotify now so it lands straight in your library the moment it's live:`,
    `{{spotify_presave_url}}`,
    ``,
    `Stay tuned for more updates.`,
    ``,
    `— SERGIK`,
  ].join('\n')
}

/**
 * Auto-creates a draft campaign whenever a release transitions to "scheduled".
 *
 * Never throws — logs a warning and returns null on failure so the
 * parent request is never blocked.
 *
 * @returns The new campaign's UUID, or null if creation failed.
 */
export async function autoCreateReleaseCampaign(
  supabase: SupabaseClient,
  release: ReleaseData
): Promise<string | null> {
  try {
    const title = release.title ?? 'Untitled Release'
    const releaseDate = release.release_date ?? null

    const subject = `${title} is coming — pre-save now!`
    const body = buildCampaignBody(title, releaseDate)

    // Encode subject + body together so they're recoverable from a single
    // `description` column (campaigns schema has no separate subject/body fields).
    const description = JSON.stringify({ subject, body })

    const { data, error } = await supabase
      .from('campaigns')
      .insert({
        name: `Release: ${title}`,
        description,
        release_id: release.id,
        fan_segment_filter: {},
        status: 'draft',
        scheduled_send_at: releaseDate ? new Date(releaseDate).toISOString() : null,
      })
      .select('id')
      .single()

    if (error) {
      console.warn(
        '[auto-campaign] Failed to create draft campaign for release',
        release.id,
        error.message
      )
      return null
    }

    return (data as { id: string }).id
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.warn(
      '[auto-campaign] Unexpected error creating campaign for release',
      release.id,
      message
    )
    return null
  }
}
