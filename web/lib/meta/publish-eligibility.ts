import type { SocialPromoPlan, SocialPromoPost } from '@/lib/studio/social-promo'

/** Facebook scheduled_publish_time window: 10 minutes to 6 months. */
const FB_SCHEDULE_MIN_MS = 10 * 60 * 1000
const FB_SCHEDULE_MAX_MS = 180 * 24 * 60 * 60 * 1000

export type MetaPublishAction = 'ig_feed' | 'ig_story' | 'fb_feed'

export type MetaPublishDecision = {
  post: SocialPromoPost
  action: MetaPublishAction | 'skip'
  /** Unix seconds for a Facebook scheduled post. */
  scheduledUnix: number | null
  reason: string | null
  /** Expected wait or non-error skip. Callers should not toast these as failures. */
  quiet: boolean
}

export function publicHttpsImageUrl(
  raw: string | null | undefined,
  siteOrigin?: string | null
): string | null {
  const value = String(raw || '').trim()
  if (!value) return null
  let absolute = value
  if (value.startsWith('/')) {
    const origin = String(siteOrigin || '').replace(/\/$/, '')
    if (!origin.startsWith('https://')) return null
    absolute = `${origin}${value}`
  }
  try {
    const url = new URL(absolute)
    if (url.protocol !== 'https:') return null
    const host = url.hostname.toLowerCase()
    if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local')) return null
    return url.toString()
  } catch {
    return null
  }
}

function actionFor(post: SocialPromoPost): MetaPublishAction | 'video' | 'unsupported' {
  if (post.asset === 'story_video' || post.channel === 'instagram_reel') return 'video'
  if (post.asset === 'caption_only') return 'unsupported'
  if (post.channel === 'instagram_feed') return 'ig_feed'
  if (post.channel === 'instagram_story' && post.asset === 'story_static') return 'ig_story'
  if (post.channel === 'facebook_post') return 'fb_feed'
  if (post.channel === 'facebook_story') return 'unsupported'
  return 'unsupported'
}

/**
 * Which promo slots Studio may send to the official Meta Graph API.
 * Video slots stay manual: Meta needs a public video file, and the vinyl render is local.
 * Due mode waits for the slot time on Instagram and schedules future Facebook Page posts.
 */
export function selectPostsToPublish(
  plan: SocialPromoPlan | null | undefined,
  options: {
    mode: 'due' | 'now'
    postId?: string | null
    now?: Date
    imageUrl: string | null
  }
): MetaPublishDecision[] {
  const now = options.now || new Date()
  const nowMs = now.getTime()
  const posts = plan?.posts || []
  const chosen = options.postId ? posts.filter((post) => post.id === options.postId) : posts

  return chosen.flatMap((post) => {
    const skip = (reason: string, quiet = false): MetaPublishDecision => ({
      post,
      action: 'skip',
      scheduledUnix: null,
      reason,
      quiet,
    })

    if (options.mode === 'due' && (post.status !== 'ready' || post.meta_id)) return []
    if (post.meta_id) return [skip('Already published to Meta.', true)]
    if (post.status === 'posted' || post.status === 'skipped') {
      return [skip(post.status === 'posted' ? 'Already marked posted.' : 'Skipped.', true)]
    }

    const kind = actionFor(post)
    if (kind === 'video') {
      return [
        skip(
          'Reels and vinyl videos stay a manual upload — Meta needs a public video file.',
          options.mode === 'due'
        ),
      ]
    }
    if (kind === 'unsupported') {
      return [skip('This format is posted from Meta Business Suite.', options.mode === 'due')]
    }
    if (!options.imageUrl) {
      return [skip('Release artwork must be a public https URL Meta can fetch.')]
    }

    const when = post.scheduled_at ? Date.parse(post.scheduled_at) : NaN
    const future = Number.isFinite(when) && when > nowMs + 60_000

    if (kind === 'fb_feed' && future && options.mode === 'due') {
      const delta = when - nowMs
      if (delta < FB_SCHEDULE_MIN_MS) {
        return [{ post, action: 'fb_feed', scheduledUnix: null, reason: null, quiet: false }]
      }
      if (delta > FB_SCHEDULE_MAX_MS) {
        return [skip('Facebook only schedules posts inside the next 6 months.')]
      }
      return [
        {
          post,
          action: 'fb_feed',
          scheduledUnix: Math.floor(when / 1000),
          reason: null,
          quiet: false,
        },
      ]
    }

    if (future && options.mode === 'due') {
      return [skip('Waits until the scheduled time, then the Meta cron publishes it.', true)]
    }

    return [{ post, action: kind, scheduledUnix: null, reason: null, quiet: false }]
  })
}

/** Feed, story stills, and Facebook Page photos. Reels and vinyl videos stay manual. */
export function canAutoPublishImage(post: SocialPromoPost): boolean {
  const kind = actionFor(post)
  return kind === 'ig_feed' || kind === 'ig_story' || kind === 'fb_feed'
}
