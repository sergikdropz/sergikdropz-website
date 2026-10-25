import { clearanceOnFile, summarizeSplits, type RightsTrackLike } from '@/lib/studio/rights-ops'

export type RightsGateInput = {
  track: RightsTrackLike | null
  sampleClearanceStatus?: string | null
  legalLocked?: boolean | null
  splitSheetStatus?: string | null
  collaboratorApprovalRequired?: boolean | null
}

export type RightsGate = {
  cleared: boolean
  reasons: string[]
}

export function assessRightsGate(input: RightsGateInput): RightsGate {
  const reasons: string[] = []
  if (!input.track) {
    return { cleared: false, reasons: ['No distribution track is linked to this vault recording.'] }
  }

  const summary = summarizeSplits(input.track.splits)
  if (!summary.ok) {
    reasons.push('Master and composition shares are missing or do not each total 100%.')
  }

  if (input.splitSheetStatus && input.splitSheetStatus !== 'approved') {
    reasons.push('Split sheet is not approved.')
  }

  if (input.track.contains_samples === true && input.sampleClearanceStatus !== 'approved') {
    reasons.push('Samples are not cleared.')
  } else if (input.sampleClearanceStatus === 'pending') {
    reasons.push('Sample clearance is still pending.')
  }

  const clearance = input.track.clearance
  if (input.track.contains_samples === true) {
    if (!clearanceOnFile(clearance?.sample_master) || !clearanceOnFile(clearance?.sample_composition)) {
      reasons.push('Sample master and composition clearances need a reference on file.')
    }
  }

  if (input.collaboratorApprovalRequired) {
    reasons.push('A collaborator still has to approve this use.')
  }

  if (input.legalLocked === false) {
    reasons.push('Rights intake is not locked.')
  }

  return { cleared: reasons.length === 0, reasons }
}
