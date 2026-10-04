import {
  publishFacebookPhoto,
  publishInstagramImage,
  type MetaGraphError,
} from '@/lib/meta/graph'
import { selectPostsToPublish } from '@/lib/meta/publish-eligibility'
import type { MetaPublishCredentials } from '@/lib/meta/connection'
import { mergeSocialPromoPlan, type SocialPromoPlan } from '@/lib/studio/social-promo'

export type MetaPublishResult = {
  id: string
  label: string
  ok: boolean
  action: string
  permalink: string | null
  reason: string | null
  quiet: boolean
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message
  return 'Meta publish failed'
}

export async function publishPromoPlan(input: {
  plan: SocialPromoPlan
  credentials: MetaPublishCredentials
  imageUrl: string | null
  mode: 'due' | 'now'
  postId?: string | null
  now?: Date
}): Promise<{ plan: SocialPromoPlan; results: MetaPublishResult[] }> {
  const decisions = selectPostsToPublish(input.plan, {
    mode: input.mode,
    postId: input.postId,
    now: input.now,
    imageUrl: input.imageUrl,
  })
  let plan = input.plan
  const results: MetaPublishResult[] = []

  for (const decision of decisions) {
    if (decision.action === 'skip') {
      results.push({
        id: decision.post.id,
        label: decision.post.label,
        ok: false,
        action: 'skip',
        permalink: null,
        reason: decision.reason,
        quiet: decision.quiet,
      })
      if (input.mode === 'now' && decision.reason && !decision.post.meta_id) {
        plan = mergeSocialPromoPlan(plan, {
          posts: [{ id: decision.post.id, meta_error: decision.reason }],
        })
      }
      continue
    }

    if (decision.action !== 'fb_feed' && !input.credentials.igUserId) {
      const reason = 'Instagram is not linked on the connected Facebook Page.'
      results.push({
        id: decision.post.id,
        label: decision.post.label,
        ok: false,
        action: decision.action,
        permalink: null,
        reason,
        quiet: false,
      })
      plan = mergeSocialPromoPlan(plan, { posts: [{ id: decision.post.id, meta_error: reason }] })
      continue
    }

    try {
      const published =
        decision.action === 'fb_feed'
          ? await publishFacebookPhoto({
              pageId: input.credentials.pageId,
              pageAccessToken: input.credentials.pageAccessToken,
              imageUrl: input.imageUrl!,
              caption: decision.post.caption,
              scheduledUnix: decision.scheduledUnix,
            })
          : await publishInstagramImage({
              igUserId: input.credentials.igUserId!,
              pageAccessToken: input.credentials.pageAccessToken,
              imageUrl: input.imageUrl!,
              caption: decision.post.caption,
              story: decision.action === 'ig_story',
            })
      const scheduled = Boolean(decision.scheduledUnix)
      plan = mergeSocialPromoPlan(plan, {
        posts: [
          {
            id: decision.post.id,
            status: 'posted',
            meta_id: published.id,
            meta_url: published.permalink,
            meta_error: null,
            notes: scheduled
              ? 'Scheduled on the Facebook Page.'
              : decision.post.notes,
          },
        ],
      })
      results.push({
        id: decision.post.id,
        label: decision.post.label,
        ok: true,
        action: scheduled ? 'fb_scheduled' : decision.action,
        permalink: published.permalink,
        reason: scheduled ? 'Scheduled on the Facebook Page.' : null,
        quiet: false,
      })
    } catch (error: unknown) {
      const reason = messageOf(error as MetaGraphError)
      plan = mergeSocialPromoPlan(plan, {
        posts: [{ id: decision.post.id, meta_error: reason }],
      })
      results.push({
        id: decision.post.id,
        label: decision.post.label,
        ok: false,
        action: decision.action,
        permalink: null,
        reason,
        quiet: false,
      })
    }
  }

  return { plan, results }
}
