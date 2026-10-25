import { describe, expect, it } from 'vitest'
import { fallbackSessionSummary } from '@/lib/ai/admin-ai-session-summary'

describe('fallbackSessionSummary', () => {
  it('keeps the previous summary and this turn when no model is available', () => {
    const summary = fallbackSessionSummary({
      previousSummary: 'Release abc is in catalog.',
      userText: 'What is the UPC?',
      assistantText: 'The UPC field is empty.',
    })
    expect(summary).toContain('Release abc')
    expect(summary).toContain('UPC field is empty')
  })
})
