/**
 * Checkpoints for approved Admin AI writes — undo last Apply.
 */

export type AdminAiCheckpoint = {
  id: string
  createdAt: number
  tool: string
  label: string
  releaseId?: string
  /** Payload that restores prior state (dryRun:false on approve undo). */
  restorePayload: Record<string, unknown>
  /** What was applied (for display). */
  appliedSummary: string
}

export function createCheckpointId(): string {
  return `cp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

/** Prefer the server preview `before` object over the model’s guessed before text. */
export function previousFieldsFromPreview(
  field: string,
  fallback: string,
  preview: Record<string, unknown> | undefined | null,
): Record<string, string> {
  const before = preview?.before
  if (before && typeof before === 'object' && !Array.isArray(before)) {
    const row = before as Record<string, unknown>
    if (Object.prototype.hasOwnProperty.call(row, field)) {
      const value = row[field]
      return { [field]: typeof value === 'string' ? value : '' }
    }
  }
  return { [field]: fallback }
}

export function checkpointFromMarketingPatch(input: {
  releaseId: string
  fields: Record<string, string>
  previous: Record<string, string>
  summary?: string
}): AdminAiCheckpoint {
  return {
    id: createCheckpointId(),
    createdAt: Date.now(),
    tool: 'patch_release_marketing_copy',
    label: `Marketing copy · ${Object.keys(input.fields).join(', ')}`,
    releaseId: input.releaseId,
    restorePayload: {
      releaseId: input.releaseId,
      merge: true,
      dryRun: false,
      marketingCopy: input.previous,
    },
    appliedSummary:
      input.summary ||
      `Updated ${Object.keys(input.fields).join(', ')} on ${input.releaseId}`,
  }
}

export function formatCheckpointList(checkpoints: AdminAiCheckpoint[]): string {
  if (!checkpoints.length) return 'No checkpoints yet.'
  return checkpoints
    .slice(-5)
    .map((cp) => `- ${cp.label} (${new Date(cp.createdAt).toLocaleTimeString()})`)
    .join('\n')
}

/** Keep the last N checkpoints in session storage shape. */
export function pushCheckpoint(
  list: AdminAiCheckpoint[],
  next: AdminAiCheckpoint,
  max = 12,
): AdminAiCheckpoint[] {
  return [...list, next].slice(-max)
}
