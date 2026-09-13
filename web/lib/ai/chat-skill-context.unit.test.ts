import { describe, expect, it } from 'vitest'
import { isContinuationOnlyUserMessage } from '@/lib/ai/chat-skill-context'

describe('isContinuationOnlyUserMessage', () => {
  it('matches common acknowledgments', () => {
    expect(isContinuationOnlyUserMessage('proceed')).toBe(true)
    expect(isContinuationOnlyUserMessage('Yes.')).toBe(true)
    expect(isContinuationOnlyUserMessage('OK please')).toBe(true)
    expect(isContinuationOnlyUserMessage('👍')).toBe(true)
  })

  it('matches extended continuation phrases', () => {
    expect(isContinuationOnlyUserMessage('same thing')).toBe(true)
    expect(isContinuationOnlyUserMessage('Continue with that!')).toBe(true)
    expect(isContinuationOnlyUserMessage('as before')).toBe(true)
    expect(isContinuationOnlyUserMessage('stick with that')).toBe(true)
    expect(isContinuationOnlyUserMessage('carry on')).toBe(true)
  })

  it('rejects substantive or long messages', () => {
    expect(isContinuationOnlyUserMessage('')).toBe(false)
    expect(isContinuationOnlyUserMessage('yes but also audit the funnel')).toBe(false)
    expect(isContinuationOnlyUserMessage('a'.repeat(141))).toBe(false)
    expect(isContinuationOnlyUserMessage('release calendar for Q4')).toBe(false)
  })
})
