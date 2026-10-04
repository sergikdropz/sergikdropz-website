import { metaConnectionStatus } from '@/lib/meta/connection'
import { publicHttpsImageUrl, selectPostsToPublish } from '@/lib/meta/publish-eligibility'
import { publishReleaseToMeta } from '@/lib/meta/publish-release'
import {
  armImageSlots,
  imageSlotsToArm,
  isMetaPromoAction,
  type MetaPromoAction,
} from '@/lib/meta/promo-workflow'
import { createSupabaseServerClient } from '@/lib/supabase'
import {
  generateSocialPromoPlan,
  parseSocialPromoPlan,
  summarizeSocialPromo,
  type SocialPromoPlan,
} from '@/lib/studio/social-promo'

function siteOrigin(): string | null {
  const site = (process.env.NEXT_PUBLIC_SITE_URL || '').trim().replace(/\/$/, '')
  return site.startsWith('https://') ? site : null
}

function slimPosts(plan: SocialPromoPlan) {
  return plan.posts.map((post) => ({
    id: post.id,
    label: post.label,
    channel: post.channel,
    asset: post.asset,
    status: post.status,
    scheduled_at: post.scheduled_at,
    meta_id: post.meta_id || null,
    caption: post.caption.length > 180 ? `${post.caption.slice(0, 177)}…` : post.caption,
  }))
}

function envelope(input: {
  action: MetaPromoAction
  dryRun: boolean
  releaseId: string
  title: string
  primaryGoal: string
  plan: SocialPromoPlan
  connection: Awaited<ReturnType<typeof metaConnectionStatus>>
  artworkReady: boolean
  notes: string[]
  armedIds: string[]
  publishResults?: unknown
}) {
  const summary = summarizeSocialPromo(input.plan)
  return {
    generatedAt: new Date().toISOString(),
    brandName: 'SERGIK',
    primaryGoal: input.primaryGoal,
    timelineWeeks: 2,
    focusAreas: ['campaign'],
    packVersion: 'meta-promo-1',
    contextReminder: [
      'Image slots publish through the Instagram and Facebook Graph APIs after Connect Meta.',
      'Reels and vinyl videos stay a manual upload.',
      'Instagram cannot message every follower. This pipeline does not send promo DMs.',
      'Preview with dryRun, then approve publish or advance.',
    ],
    action: input.action,
    dryRun: input.dryRun,
    releaseId: input.releaseId,
    title: input.title,
    connection: input.connection,
    artworkReady: input.artworkReady,
    summary,
    armedIds: input.armedIds,
    posts: slimPosts(input.plan),
    notes: input.notes,
    publishResults: input.publishResults ?? null,
    studioUrl: `/studio/releases/${encodeURIComponent(input.releaseId)}?step=launch`,
  }
}

async function loadRelease(releaseId: string) {
  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase
    .from('distribution_releases')
    .select('id, title, album_artist, release_date, artwork_url, marketing_copy, social_promo')
    .eq('id', releaseId)
    .maybeSingle()
  if (error) {
    if (/social_promo/i.test(error.message)) {
      throw new Error('Apply add_social_promo_to_releases.sql before running the Meta promo pipeline.')
    }
    throw new Error(error.message)
  }
  if (!data) throw new Error('Release not found')
  return data
}

async function savePlan(releaseId: string, plan: SocialPromoPlan) {
  const supabase = createSupabaseServerClient()
  const { error } = await supabase
    .from('distribution_releases')
    .update({ social_promo: plan, updated_at: new Date().toISOString() })
    .eq('id', releaseId)
  if (error) throw new Error(error.message)
}

async function buildGeneratedPlan(release: {
  id: string
  title: string | null
  album_artist: string | null
  release_date: string | null
  marketing_copy: unknown
}) {
  const supabase = createSupabaseServerClient()
  const { data: smart } = await supabase
    .from('smartlinks')
    .select('slug')
    .eq('release_id', release.id)
    .maybeSingle()
  const site = (process.env.NEXT_PUBLIC_SITE_URL || 'https://sergikdropz.com').replace(/\/$/, '')
  const marketing =
    release.marketing_copy && typeof release.marketing_copy === 'object'
      ? (release.marketing_copy as { social_caption?: string })
      : {}
  return generateSocialPromoPlan({
    streetDate: release.release_date,
    title: release.title || 'Untitled',
    artist: release.album_artist || 'SERGIK',
    socialCaption: marketing.social_caption || null,
    smartLink: smart?.slug ? `${site}/l/${smart.slug}` : null,
  })
}

export async function runMetaPromoPipeline(input: {
  releaseId: string
  action?: string | null
  dryRun: boolean
  primaryGoal?: string | null
}) {
  const action: MetaPromoAction = isMetaPromoAction(String(input.action || ''))
    ? (input.action as MetaPromoAction)
    : 'status'
  const release = await loadRelease(input.releaseId)
  const title = String(release.title || 'Untitled')
  const primaryGoal = String(input.primaryGoal || `Meta promo pipeline for ${title}`)
  const connection = await metaConnectionStatus()
  const artworkReady = Boolean(
    publicHttpsImageUrl(typeof release.artwork_url === 'string' ? release.artwork_url : null, siteOrigin())
  )
  let plan = parseSocialPromoPlan(release.social_promo)
  const notes: string[] = []
  if (!connection.connected) {
    notes.push('Connect Meta on the Launch step before publish. The redirect URI is on that panel.')
  }
  if (!artworkReady) {
    notes.push('Artwork must be a public https URL before Instagram or Facebook can fetch it.')
  }

  const shouldGenerate = action === 'generate' || (action === 'advance' && plan.posts.length === 0)
  if (shouldGenerate) {
    plan = await buildGeneratedPlan(release)
    notes.push(input.dryRun ? 'Would generate the PT promo schedule.' : 'Generated the PT promo schedule.')
    if (!input.dryRun) await savePlan(input.releaseId, plan)
  }

  const shouldArm = action === 'arm' || action === 'advance'
  const armedIds = imageSlotsToArm(plan.posts)
  if (shouldArm) {
    plan = armImageSlots(plan)
    notes.push(
      armedIds.length
        ? `${input.dryRun ? 'Would mark' : 'Marked'} ${armedIds.length} image slot(s) Assets ready.`
        : 'No planned image slots left to arm. Reels stay manual.'
    )
    if (!input.dryRun && armedIds.length) await savePlan(input.releaseId, plan)
  }

  let publishResults: unknown = null
  const shouldPublish = action === 'publish' || action === 'advance'
  if (shouldPublish) {
    if (input.dryRun) {
      const decisions = selectPostsToPublish(plan, {
        mode: 'due',
        imageUrl: artworkReady ? 'https://cdn.example.com/artwork.jpg' : null,
      })
      publishResults = decisions
        .filter((row) => !row.quiet || row.action !== 'skip')
        .map((row) => ({
          id: row.post.id,
          label: row.post.label,
          action: row.action,
          reason: row.reason,
          quiet: row.quiet,
        }))
      const live = decisions.filter((row) => row.action !== 'skip')
      notes.push(
        live.length
          ? `Would send ${live.length} due slot(s) to Meta after approval.`
          : 'No ready image slots are due to publish.'
      )
    } else {
      const published = await publishReleaseToMeta({ releaseId: input.releaseId, mode: 'due' })
      if (!published.ok) {
        notes.push(published.error)
        publishResults = { error: published.error }
      } else {
        plan = published.plan
        publishResults = published.results
        const ok = published.results.filter((row) => row.ok).length
        notes.push(ok ? `Sent ${ok} slot(s) to Meta.` : 'No due image slots were published.')
      }
    }
  }

  if (action === 'status' && !plan.posts.length) {
    notes.push('No schedule yet. Run action generate, then arm, then publish.')
  }

  return envelope({
    action,
    dryRun: input.dryRun,
    releaseId: input.releaseId,
    title,
    primaryGoal,
    plan,
    connection,
    artworkReady,
    notes,
    armedIds,
    publishResults,
  })
}
