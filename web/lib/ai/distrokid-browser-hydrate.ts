import {
  DISTROKID_MY_MUSIC_URL,
  DISTROKID_NEW_RELEASE_URL,
} from '@/lib/studio/distrokid-delivery'

export type DistroKidBrowserHydrateTarget = 'upload' | 'my_music'

export type DistroKidBrowserHydrateDetail = {
  kind: 'distrokid'
  releaseId: string
  releaseTitle?: string | null
  target: DistroKidBrowserHydrateTarget
  deskLabel: 'DistroKid'
  url: string
  worksheet: string
  uploadBy: string | null
  streetDate: string | null
  windowLabel: string
  blockers: string[]
  /** Worksheet is never auto-typed — dock waits for user Paste. */
  pasteOnDemand: true
}

export function buildDistroKidBrowserHydrate(input: {
  releaseId: string
  releaseTitle?: string | null
  target?: DistroKidBrowserHydrateTarget
  worksheet: string
  uploadBy?: string | null
  streetDate?: string | null
  windowLabel?: string | null
  blockers?: string[]
  uploadUrl?: string | null
  myMusicUrl?: string | null
}): DistroKidBrowserHydrateDetail {
  const target = input.target === 'my_music' ? 'my_music' : 'upload'
  const url =
    target === 'my_music'
      ? String(input.myMusicUrl || DISTROKID_MY_MUSIC_URL).trim() || DISTROKID_MY_MUSIC_URL
      : String(input.uploadUrl || DISTROKID_NEW_RELEASE_URL).trim() || DISTROKID_NEW_RELEASE_URL

  return {
    kind: 'distrokid',
    releaseId: input.releaseId,
    releaseTitle: input.releaseTitle || null,
    target,
    deskLabel: 'DistroKid',
    url,
    worksheet: String(input.worksheet || '').trim(),
    uploadBy: input.uploadBy || null,
    streetDate: input.streetDate || null,
    windowLabel: String(input.windowLabel || '').trim() || 'DistroKid schedule',
    blockers: Array.isArray(input.blockers) ? input.blockers.filter(Boolean) : [],
    pasteOnDemand: true,
  }
}
