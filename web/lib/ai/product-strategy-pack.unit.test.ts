import { describe, expect, it } from 'vitest'
import {
  normalizeProductStrategyPackPayload,
  parseRefineWithLlmFlag,
  payloadWithoutStrategyPolish,
  readStrategyPackPolish,
  strategyPackPolishCue,
  withStrategyPackPolish,
} from '@/lib/ai/product-strategy-pack'

describe('parseRefineWithLlmFlag', () => {
  it('treats false-like values as off', () => {
    expect(parseRefineWithLlmFlag(false)).toBe(false)
    expect(parseRefineWithLlmFlag('false')).toBe(false)
    expect(parseRefineWithLlmFlag('0')).toBe(false)
    expect(parseRefineWithLlmFlag(0)).toBe(false)
    expect(parseRefineWithLlmFlag(undefined)).toBe(false)
    expect(parseRefineWithLlmFlag('')).toBe(false)
  })

  it('accepts real affirmatives', () => {
    expect(parseRefineWithLlmFlag(true)).toBe(true)
    expect(parseRefineWithLlmFlag('true')).toBe(true)
    expect(parseRefineWithLlmFlag(' YES ')).toBe(true)
    expect(parseRefineWithLlmFlag(1)).toBe(true)
  })
})

describe('withStrategyPackPolish', () => {
  it('lets the switch clear a flag left on an older payload', () => {
    const [step] = withStrategyPackPolish(
      [{ tool: 'draft_product_strategy_pack', payload: { refineWithLlm: true, primaryGoal: 'Launch' } }],
      false,
    )
    expect(step?.payload.refineWithLlm).toBeUndefined()
    expect(step?.payload.primaryGoal).toBe('Launch')
  })

  it('sets the flag when the switch is on', () => {
    const [step] = withStrategyPackPolish(
      [
        {
          tool: 'draft_product_strategy_pack',
          payload: { refine_with_llm: 'false', primaryGoal: 'Launch' } as Record<string, unknown>,
        },
      ],
      true,
    )
    expect(step?.payload.refineWithLlm).toBe(true)
    expect(payloadWithoutStrategyPolish(step!.payload).refineWithLlm).toBeUndefined()
  })

  it('leaves other tools alone', () => {
    const steps = withStrategyPackPolish([{ tool: 'query_ops_snapshot', payload: { focus: 'studio' } }], true)
    expect(steps[0]?.payload).toEqual({ focus: 'studio' })
  })
})

describe('normalizeProductStrategyPackPayload', () => {
  it('does not turn the string false into a polish request', () => {
    expect(normalizeProductStrategyPackPayload({ primaryGoal: 'Launch', refineWithLlm: 'false' }).refineWithLlm).toBe(
      false,
    )
    expect(normalizeProductStrategyPackPayload({ primaryGoal: 'Launch', refine_with_llm: 'on' }).refineWithLlm).toBe(
      true,
    )
  })
})

describe('strategyPackPolishCue', () => {
  it('glows for a strategy pack and stays quiet for a DistroKid code chat', () => {
    expect(strategyPackPolishCue({ agentMode: 'product_strategy' })).toBe(true)
    expect(strategyPackPolishCue({ agentMode: 'auto', texts: ['Active skill stays marketing while we copy ISRCs'] })).toBe(
      false,
    )
    expect(strategyPackPolishCue({ planTools: ['draft_product_strategy_pack'] })).toBe(true)
    expect(strategyPackPolishCue({ texts: ['Draft a strategy pack for the launch'] })).toBe(true)
    expect(
      strategyPackPolishCue({
        texts: ['is distrokid going to set its own upc', 'Launch support for Staying A Vibe'],
        agentMode: 'auto',
      }),
    ).toBe(false)
  })
})

describe('readStrategyPackPolish', () => {
  it('reports a missed brief separately from a finished one', () => {
    expect(readStrategyPackPolish({ refinementStatus: 'failed', refinementNote: 'Timed out.' })).toEqual({
      state: 'failed',
      note: 'Timed out.',
    })
    expect(
      readStrategyPackPolish({
        refinementStatus: 'applied',
        refinementMeta: { provider: 'openai' },
        refinedMarkdown: '## Goals\n\nShip the release.',
      })?.state,
    ).toBe('applied')
    expect(readStrategyPackPolish({ packVersion: '1.0.0' })).toBeNull()
  })
})
