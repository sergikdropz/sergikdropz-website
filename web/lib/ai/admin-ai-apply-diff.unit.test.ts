import { describe, expect, it } from 'vitest'
import {
  buildPatchPayloadFromDiff,
  parseAdminAiApplyDiffs,
  stripAdminAiApplyDiffFences,
} from '@/lib/ai/admin-ai-apply-diff'

describe('admin-ai-apply-diff', () => {
  it('parses ai-diff fences into approve payloads', () => {
    const text = [
      'Here is a better pitch:',
      '```ai-diff',
      JSON.stringify({
        tool: 'patch_release_marketing_copy',
        releaseId: 'r1',
        field: 'elevator_pitch',
        before: 'old',
        after: 'new pitch',
        label: 'Elevator pitch',
      }),
      '```',
    ].join('\n')
    const diffs = parseAdminAiApplyDiffs(text)
    expect(diffs).toHaveLength(1)
    expect(diffs[0]?.after).toBe('new pitch')
    expect(buildPatchPayloadFromDiff(diffs[0]!)).toMatchObject({
      releaseId: 'r1',
      dryRun: true,
      marketingCopy: { elevator_pitch: 'new pitch' },
    })
    expect(stripAdminAiApplyDiffFences(text)).not.toContain('ai-diff')
  })
})
