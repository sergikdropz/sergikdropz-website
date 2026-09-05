import type { CopyrightReadiness } from '@/lib/studio/copyright-pipeline'
import { generateInternalUpc } from '@/lib/studio/upc'

export type SelfDistributeInput = {
  releaseId: string
  title: string
  upc: string | null
  readiness: CopyrightReadiness | null
  trackCount: number
  tracksWithIsrc: number
  /** Skip strict copyright gate (admin override) */
  force?: boolean
}

export type SelfDistributeValidation = {
  ok: boolean
  blockers: string[]
  suggestedUpc?: string
}

export function validateSelfDistribute(
  input: SelfDistributeInput
): SelfDistributeValidation {
  const blockers: string[] = []

  if (input.trackCount === 0) {
    blockers.push('Add at least one track to this release.')
  }
  if (input.tracksWithIsrc < input.trackCount) {
    blockers.push('Every track needs an ISRC before launch.')
  }

  if (!input.force && input.readiness) {
    if (!input.readiness.checks.tracks_have_audio) {
      blockers.push('Upload WAV audio for every track.')
    }
    if (!input.readiness.checks.metadata_qa_passed && !input.upc) {
      blockers.push('Complete metadata QA or set a UPC.')
    }
    if (!input.readiness.checks.ready_to_distribute) {
      blockers.push(
        'Copyright pipeline not complete — finish rights, legal, and registrations.'
      )
    }
  }

  const suggestedUpc = !input.upc?.trim() ? generateInternalUpc() : undefined

  return {
    ok: blockers.length === 0,
    blockers,
    suggestedUpc,
  }
}
