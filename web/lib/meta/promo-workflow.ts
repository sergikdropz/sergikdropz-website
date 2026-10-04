import { canAutoPublishImage } from '@/lib/meta/publish-eligibility'
import type { SocialPromoPlan, SocialPromoPost } from '@/lib/studio/social-promo'

export const META_PROMO_ACTIONS = ['status', 'generate', 'arm', 'publish', 'advance'] as const
export type MetaPromoAction = (typeof META_PROMO_ACTIONS)[number]

export function isMetaPromoAction(value: string): value is MetaPromoAction {
  return (META_PROMO_ACTIONS as readonly string[]).includes(value)
}

/** Messages that should run the Meta promo tool instead of a generic strategy pack. */
export function isMetaPromoIntent(message: string): boolean {
  const text = message.toLowerCase()
  if (
    text.includes('run_meta_promo_pipeline') ||
    text.includes('meta promo') ||
    text.includes('social promo') ||
    text.includes('promo schedule') ||
    text.includes('promo pipeline') ||
    text.includes('publish due') ||
    text.includes('post to meta') ||
    text.includes('connect meta')
  ) {
    return true
  }
  const channel = text.includes('instagram') || text.includes('facebook')
  const action = text.includes('publish') || text.includes('promo slot') || text.includes('story still')
  return channel && action
}

export function inferMetaPromoAction(message: string): MetaPromoAction {
  const text = message.toLowerCase()
  if (/\bpublish\b|post to meta|publish due|send to (instagram|facebook|meta)/.test(text)) return 'publish'
  if (/\barm\b|assets ready|mark ready/.test(text)) return 'arm'
  if (/generat|regenerat|build (the )?schedule|create (the )?schedule/.test(text)) return 'generate'
  if (/pipeline|workflow|automate/.test(text)) return 'advance'
  return 'status'
}

export function imageSlotsToArm(posts: SocialPromoPost[]): string[] {
  return posts.filter((post) => post.status === 'planned' && canAutoPublishImage(post)).map((post) => post.id)
}

export function armImageSlots(plan: SocialPromoPlan): SocialPromoPlan {
  const ids = new Set(imageSlotsToArm(plan.posts))
  if (!ids.size) return plan
  return {
    ...plan,
    posts: plan.posts.map((post) => (ids.has(post.id) ? { ...post, status: 'ready' as const } : post)),
  }
}
