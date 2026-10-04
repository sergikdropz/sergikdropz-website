import { loadMetaPublishCredentials } from '@/lib/meta/connection'
import { publishPromoPlan, type MetaPublishResult } from '@/lib/meta/publish-promo'
import { publicHttpsImageUrl } from '@/lib/meta/publish-eligibility'
import { createSupabaseServerClient } from '@/lib/supabase'
import { parseSocialPromoPlan, summarizeSocialPromo, type SocialPromoPlan } from '@/lib/studio/social-promo'

function siteOrigin(): string | null {
  const site = (process.env.NEXT_PUBLIC_SITE_URL || '').trim().replace(/\/$/, '')
  return site.startsWith('https://') ? site : null
}

export async function publishReleaseToMeta(input: {
  releaseId: string
  mode: 'due' | 'now'
  postId?: string | null
  now?: Date
}): Promise<
  | {
      ok: true
      plan: SocialPromoPlan
      summary: ReturnType<typeof summarizeSocialPromo>
      results: MetaPublishResult[]
    }
  | { ok: false; status: number; error: string }
> {
  const credentials = await loadMetaPublishCredentials()
  if (!credentials) {
    return { ok: false, status: 409, error: 'Connect Meta before publishing this schedule.' }
  }

  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase
    .from('distribution_releases')
    .select('id, artwork_url, social_promo')
    .eq('id', input.releaseId)
    .maybeSingle()

  if (error) {
    if (/social_promo/i.test(error.message)) {
      return { ok: false, status: 503, error: 'Apply add_social_promo_to_releases.sql before publishing.' }
    }
    return { ok: false, status: 500, error: error.message }
  }
  if (!data) return { ok: false, status: 404, error: 'Release not found' }

  const plan = parseSocialPromoPlan(data.social_promo)
  if (!plan.posts.length) {
    return { ok: false, status: 400, error: 'Generate a promo schedule first.' }
  }

  const imageUrl = publicHttpsImageUrl(
    typeof data.artwork_url === 'string' ? data.artwork_url : null,
    siteOrigin()
  )

  const published = await publishPromoPlan({
    plan,
    credentials,
    imageUrl,
    mode: input.mode,
    postId: input.postId,
    now: input.now,
  })

  const changed = published.results.some((row) => row.ok || (row.reason && !row.quiet))
  if (changed) {
    const saved = await supabase
      .from('distribution_releases')
      .update({ social_promo: published.plan, updated_at: new Date().toISOString() })
      .eq('id', input.releaseId)
    if (saved.error) return { ok: false, status: 500, error: saved.error.message }
  }

  return {
    ok: true,
    plan: published.plan,
    summary: summarizeSocialPromo(published.plan),
    results: published.results,
  }
}
