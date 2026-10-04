import { describe, expect, it } from 'vitest'
import { buildApprovalRows, payloadSubmits, payloadWithoutDryRun } from '@/lib/ai/approval-rows'

describe('buildApprovalRows', () => {
  it('keeps a read as one preview row', () => {
    const rows = buildApprovalRows([
      {
        id: 'snap',
        tool: 'query_release_studio_snapshot',
        payload: { releaseId: 'release-1' },
        riskTier: 'tier_1_draft',
      },
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0]?.phase).toBe('preview')
    expect(rows[0]?.label).toBe('Release snapshot')
    expect(rows[0]?.detail).toContain('release-1')
    expect(payloadSubmits(rows[0]?.payload)).toBe(true)
  })

  it('splits a write into preview and submit', () => {
    const rows = buildApprovalRows([
      {
        id: 'copy',
        tool: 'patch_release_marketing_copy',
        payload: { releaseId: 'release-1', dryRun: true, merge: true },
        riskTier: 'tier_2_operational',
      },
    ])
    expect(rows.map((row) => row.phase)).toEqual(['preview', 'submit'])
    expect(rows[0]?.payload.dryRun).toBe(true)
    expect(payloadSubmits(rows[0]?.payload)).toBe(false)
    expect(rows[1]?.payload).toEqual({ releaseId: 'release-1', merge: true })
    expect(payloadSubmits(rows[1]?.payload)).toBe(true)
    expect(rows[0]?.sourceStepId).toBe(rows[1]?.sourceStepId)
  })

  it('drops dryRun when storing a submit payload', () => {
    expect(payloadWithoutDryRun({ releaseId: 'a', dryRun: true })).toEqual({ releaseId: 'a' })
  })

  it('keeps step order across mixed reads and writes', () => {
    const rows = buildApprovalRows([
      {
        id: 'a',
        tool: 'query_studio_command_center',
        payload: { dueWithinDays: 7 },
        riskTier: 'tier_1_draft',
      },
      {
        id: 'b',
        tool: 'run_meta_promo_pipeline',
        payload: { releaseId: 'release-9', action: 'publish' },
        riskTier: 'tier_2_operational',
      },
    ])
    expect(rows.map((row) => row.id)).toEqual(['a', 'b:preview', 'b:submit'])
    expect(rows[2]?.detail).toContain('publish')
  })
})