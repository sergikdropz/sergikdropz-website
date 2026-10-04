import { describe, expect, it } from 'vitest'
import { applyKnownPrimaryGoal, goalFromKnownRelease } from '@/lib/ai/known-primary-goal'

describe('applyKnownPrimaryGoal', () => {
  it('uses the open release when a strategy pack omitted primaryGoal', () => {
    const payload = applyKnownPrimaryGoal(
      'draft_product_strategy_pack',
      { brandName: 'SERGIK' },
      { releaseTitle: 'Staying A Vibe', activeStep: 'launch' }
    )
    expect(payload.primaryGoal).toBe('Launch support for "Staying A Vibe"')
  })

  it('keeps an explicit goal', () => {
    const payload = { primaryGoal: 'Presave push' }
    expect(applyKnownPrimaryGoal('run_meta_promo_pipeline', payload, { releaseTitle: 'Staying A Vibe' })).toBe(
      payload
    )
  })

  it('prefers the sticky thread goal over a generated launch line', () => {
    const payload = applyKnownPrimaryGoal(
      'draft_product_strategy_pack',
      {},
      { goal: 'Finish the DistroKid upload', releaseTitle: 'Staying A Vibe', activeStep: 'launch' }
    )
    expect(payload.primaryGoal).toBe('Finish the DistroKid upload')
  })

  it('does not invent a goal for a browser probe', () => {
    const payload = { action: 'probe_fields' }
    expect(
      applyKnownPrimaryGoal('admin_browser', payload, { releaseTitle: 'Staying A Vibe', activeStep: 'launch' })
    ).toBe(payload)
  })

  it('names meta promo from the release title', () => {
    expect(applyKnownPrimaryGoal('run_meta_promo_pipeline', { action: 'status' }, { releaseTitle: 'Staying A Vibe' }).primaryGoal).toBe(
      'Meta promo for "Staying A Vibe"'
    )
  })
})

describe('goalFromKnownRelease', () => {
  it('matches the launch handoff wording', () => {
    expect(goalFromKnownRelease('Staying A Vibe', 'launch')).toBe('Launch support for "Staying A Vibe"')
  })
})
