/**
 * Diff-first Apply for Studio writes (Cursor Accept analogue).
 */

export type AdminAiApplyDiff = {
  tool: 'patch_release_marketing_copy'
  releaseId: string
  field: string
  before: string
  after: string
  label?: string
}

const DIFF_FENCE_RE = /```ai-diff\s*([\s\S]*?)```/gi

export function parseAdminAiApplyDiffs(text: string): AdminAiApplyDiff[] {
  const out: AdminAiApplyDiff[] = []
  for (const match of text.matchAll(DIFF_FENCE_RE)) {
    const raw = match[1]?.trim()
    if (!raw) continue
    try {
      const json = JSON.parse(raw) as Record<string, unknown>
      const tool = String(json.tool || 'patch_release_marketing_copy')
      if (tool !== 'patch_release_marketing_copy') continue
      const releaseId = String(json.releaseId || '').trim()
      const field = String(json.field || '').trim()
      const after = typeof json.after === 'string' ? json.after : ''
      if (!releaseId || !field || !after) continue
      out.push({
        tool: 'patch_release_marketing_copy',
        releaseId,
        field,
        before: typeof json.before === 'string' ? json.before : '',
        after,
        label: typeof json.label === 'string' ? json.label : field,
      })
    } catch {
      /* ignore */
    }
  }
  return out.slice(0, 8)
}

export function stripAdminAiApplyDiffFences(text: string): string {
  return text.replace(DIFF_FENCE_RE, '').replace(/\n{3,}/g, '\n\n').trim()
}

export function applyDiffPromptHint(): string {
  return [
    'APPLY DIFFS',
    'When proposing a marketing_copy field change, include a fenced block:',
    '```ai-diff',
    '{"tool":"patch_release_marketing_copy","releaseId":"<id>","field":"elevator_pitch","before":"…","after":"…","label":"Elevator pitch"}',
    '```',
    'The UI shows before/after; the user Approves. Do not claim the field was written until approved.',
  ].join('\n')
}

export function buildPatchPayloadFromDiff(diff: AdminAiApplyDiff): Record<string, unknown> {
  return {
    releaseId: diff.releaseId,
    merge: true,
    dryRun: true,
    marketingCopy: { [diff.field]: diff.after },
  }
}
