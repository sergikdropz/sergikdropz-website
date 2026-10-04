import type { MarketingCopy } from '@/lib/studio/constants'
import { COPY_TEMPLATES } from '@/lib/studio/constants'
import {
  buildContinuousTimestampCues,
  catalogTimestampFacts,
  formatCatalogTimestampRange,
  type CatalogTimestampTrack,
} from '@/lib/studio/catalog-timestamps'
import {
  copyIntelHasSignal,
  type CopyIntelCard,
} from '@/lib/studio/copy-intelligence'
import type { ReleaseStudioSnapshot } from '@/lib/studio/release-snapshot'

export type MarketingCopyFieldStatus = {
  field: keyof MarketingCopy
  label: string
  status: 'empty' | 'partial' | 'filled'
  chars: number
}

export type ReleaseSnapshotAdminAiBrief = {
  marketingCopyFields: MarketingCopyFieldStatus[]
  emptyMarketingFields: Array<keyof MarketingCopy>
  partialMarketingFields: Array<keyof MarketingCopy>
  copyIntelTracks: Array<{
    title: string
    unified: boolean
    hasSignal: boolean
    groove: string
    intention: string
  }>
  youtubeTimestampTimeline: Array<{
    index: number
    title: string
    range: string
    durationSec: number | null
    complete: boolean
  }>
  timestampFacts: {
    complete: boolean
    runtimeSec: number | null
    missingTitles: string[]
  }
  copyDesk: {
    recommendedNextFields: Array<keyof MarketingCopy>
    note: string
  }
  sonicDnaUnified: {
    trackCount: number
    unifiedIntelligenceTracks: number
    copyIntelSignalTracks: number
  }
}

const MARKETING_FIELDS = Object.keys(COPY_TEMPLATES) as Array<keyof MarketingCopy>

function fieldStatus(value: unknown): MarketingCopyFieldStatus['status'] {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text) return 'empty'
  const soft = 40
  if (text.length < soft) return 'partial'
  return 'filled'
}

function pickCopyIntel(card: CopyIntelCard | null | undefined) {
  if (!card) {
    return { unified: false, hasSignal: false, groove: '', intention: '' }
  }
  return {
    unified: card.unified,
    hasSignal: copyIntelHasSignal(card),
    groove: card.groove || '',
    intention: card.intention || '',
  }
}

function trackTitle(track: Record<string, unknown>): string {
  return String(track.title || 'Untitled').trim() || 'Untitled'
}

/** Compact, model-friendly summary layered on top of raw snapshot JSON. */
export function buildReleaseSnapshotAdminAiBrief(
  snapshot: ReleaseStudioSnapshot,
): ReleaseSnapshotAdminAiBrief {
  const marketing =
    snapshot.release.marketing_copy && typeof snapshot.release.marketing_copy === 'object'
      ? (snapshot.release.marketing_copy as MarketingCopy)
      : {}

  const marketingCopyFields: MarketingCopyFieldStatus[] = MARKETING_FIELDS.map((field) => {
    const status = fieldStatus(marketing[field])
    const chars = typeof marketing[field] === 'string' ? marketing[field]!.trim().length : 0
    return {
      field,
      label: COPY_TEMPLATES[field].label,
      status,
      chars,
    }
  })

  const emptyMarketingFields = marketingCopyFields
    .filter((row) => row.status === 'empty')
    .map((row) => row.field)
  const partialMarketingFields = marketingCopyFields
    .filter((row) => row.status === 'partial')
    .map((row) => row.field)

  const copyIntelTracks = snapshot.tracks.map((track) => {
    const intel =
      track.copy_intel && typeof track.copy_intel === 'object'
        ? (track.copy_intel as CopyIntelCard)
        : null
    const picked = pickCopyIntel(intel)
    return {
      title: trackTitle(track),
      ...picked,
    }
  })

  const timestampInputs: CatalogTimestampTrack[] = snapshot.tracks.map((track) => ({
    title: trackTitle(track),
    billed: typeof track.billed_title === 'string' ? track.billed_title : '',
    durationSec: typeof track.duration === 'number' ? track.duration : null,
    source: 'catalog',
  }))
  const cues = buildContinuousTimestampCues(timestampInputs)
  const timestampFacts = catalogTimestampFacts(cues)
  const youtubeTimestampTimeline = cues.map((cue) => ({
    index: cue.index,
    title: cue.title,
    range: formatCatalogTimestampRange(cue),
    durationSec: cue.durationSec,
    complete: cue.durationSec != null && cue.endSec != null,
  }))

  const recommendedNextFields = [...emptyMarketingFields, ...partialMarketingFields].slice(0, 4)
  const intelReady = copyIntelTracks.filter((t) => t.hasSignal).length
  const unifiedIntelligenceTracks = copyIntelTracks.filter((t) => t.unified).length
  const note = [
    'Use adminAiBrief before drafting — never invent guests, cities, charts, or durations.',
    emptyMarketingFields.length
      ? `Empty copy fields: ${emptyMarketingFields.join(', ')}.`
      : 'All marketing copy fields have content (review for quality).',
    intelReady
      ? `${intelReady}/${copyIntelTracks.length} track(s) have unified Sonic DNA intel for polymath copy.`
      : 'Sonic DNA intel is thin — ground copy in catalog press notes and contributor credits only.',
    timestampFacts.complete
      ? `YouTube visualizer timeline is complete (${timestampFacts.runtimeSec ?? '?'}s runtime).`
      : timestampFacts.missingTitles.length
        ? `YouTube timestamps blocked — missing duration for: ${timestampFacts.missingTitles.join(', ')}.`
        : 'Add tracks before building a visualizer timeline.',
    'Preview writes: /exec patch_release_marketing_copy with merge:true and dryRun:true first.',
  ].join(' ')

  return {
    marketingCopyFields,
    emptyMarketingFields,
    partialMarketingFields,
    copyIntelTracks,
    youtubeTimestampTimeline,
    timestampFacts,
    copyDesk: {
      recommendedNextFields,
      note,
    },
    sonicDnaUnified: {
      trackCount: copyIntelTracks.length,
      unifiedIntelligenceTracks,
      copyIntelSignalTracks: intelReady,
    },
  }
}
