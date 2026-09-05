import { describe, expect, it } from 'vitest'
import { computeAdminChatRunFingerprint } from '@/lib/ai/admin-chat-run-fingerprint'

describe('computeAdminChatRunFingerprint', () => {
  it('is stable for same logical input', () => {
    const a = computeAdminChatRunFingerprint({
      messageLen: 12,
      continuationOnly: false,
      stickyPersonaApplied: false,
      stickyDroppedStale: false,
      inferredSkillId: 'admin_intel',
      modelId: 'gpt-4o-mini',
      provider: 'openai',
      promptTruncated: false,
      honestyMode: 'strict',
      energyPreset: 'default',
    })
    const b = computeAdminChatRunFingerprint({
      messageLen: 12,
      continuationOnly: false,
      stickyPersonaApplied: false,
      stickyDroppedStale: false,
      inferredSkillId: 'admin_intel',
      modelId: 'gpt-4o-mini',
      provider: 'openai',
      promptTruncated: false,
      honestyMode: 'strict',
      energyPreset: 'default',
    })
    expect(a).toBe(b)
    expect(a.startsWith('fp_')).toBe(true)
  })

  it('changes when a field changes', () => {
    const base = {
      messageLen: 5,
      continuationOnly: true,
      stickyPersonaApplied: true,
      stickyDroppedStale: false,
      inferredSkillId: 'admin_intel',
      modelId: '',
      provider: '',
      promptTruncated: false,
      honestyMode: '',
      energyPreset: '',
    }
    const a = computeAdminChatRunFingerprint(base)
    const b = computeAdminChatRunFingerprint({ ...base, messageLen: 6 })
    expect(a).not.toBe(b)
  })
})
