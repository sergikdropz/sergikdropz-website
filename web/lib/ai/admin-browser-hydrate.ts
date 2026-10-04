import type { DistroKidBrowserHydrateDetail } from '@/lib/ai/distrokid-browser-hydrate'
import type { SocialPromoBrowserHydrateDetail } from '@/lib/ai/social-promo-browser-hydrate'

export type AdminBrowserHydrateDetail =
  | SocialPromoBrowserHydrateDetail
  | DistroKidBrowserHydrateDetail

export const ADMIN_AI_BROWSER_HYDRATE_EVENT = 'admin-ai:browser-hydrate'

/** Cross-window bridge so Studio “Fill DistroKid desk” reaches the Admin AI popout. */
export const ADMIN_AI_BROWSER_HYDRATE_STORAGE_KEY = 'sergik:admin-ai-browser-hydrate'
export const ADMIN_AI_BROWSER_HYDRATE_CHANNEL = 'sergik-admin-ai-browser-hydrate'

export function isAdminBrowserHydrateDetail(value: unknown): value is AdminBrowserHydrateDetail {
  if (!value || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  if (typeof row.url !== 'string' || !row.url.trim()) return false
  if (row.kind === 'distrokid') return typeof row.worksheet === 'string'
  if (row.kind === 'social_promo') return typeof row.postId === 'string'
  // Legacy social payloads (pre-kind) still valid if they carry postId + caption.
  return typeof row.postId === 'string'
}

export function hydratePasteText(detail: AdminBrowserHydrateDetail): string {
  if (detail.kind === 'distrokid') return detail.worksheet
  return detail.caption
}

export function hydrateSourceLabel(detail: AdminBrowserHydrateDetail): string {
  if (detail.kind === 'distrokid') return 'DistroKid schedule'
  return 'Social promo'
}

export function hydrateDeskLabel(detail: AdminBrowserHydrateDetail): string {
  return detail.deskLabel
}
