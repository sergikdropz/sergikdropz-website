import { describe, expect, it } from 'vitest'
import {
  formatSonicDnaReviewMarkdown,
  markdownTablesToLists,
  unwrapSonicDnaReviewReply,
} from './sonic-dna-review-format'

describe('unwrapSonicDnaReviewReply', () => {
  it('extracts answer markdown from a json fence and drops the envelope', () => {
    const raw = [
      '```json',
      '{',
      '  "answer": "## Accuracy Challenge\\n\\n### Findings\\n\\nBPM is supported.",',
      '  "warnings": ["Check hats."],',
      '  "patches": [{"sectionId":"culture","text":"House, not reggae."}]',
      '}',
      '```',
    ].join('\n')
    const result = unwrapSonicDnaReviewReply(raw)
    expect(result.answer).toContain('Accuracy Challenge')
    expect(result.answer).not.toContain('```json')
    expect(result.answer).not.toContain('"patches"')
    expect(result.warnings).toEqual(['Check hats.'])
    expect(result.patches[0]?.sectionId).toBe('culture')
  })

  it('recovers the answer when JSON is truncated', () => {
    const raw = '{"answer": "## Challenge\\n\\nThe groove is house tempo."'
    const result = unwrapSonicDnaReviewReply(raw)
    expect(result.answer).toContain('The groove is house tempo.')
    expect(result.answer).not.toContain('"answer"')
  })
})

describe('markdownTablesToLists', () => {
  it('turns a two-column table into bullets', () => {
    const md = [
      '### Supported',
      '| Claim | Source |',
      '|---|---|',
      '| BPM 123 | `bpm: 123.05` |',
      '| Full-time | timingFeel |',
    ].join('\n')
    const out = markdownTablesToLists(md)
    expect(out).toContain('- **Claim:** BPM 123 — **Source:** `bpm: 123.05`')
    expect(out).not.toContain('|---|')
  })
})

describe('formatSonicDnaReviewMarkdown', () => {
  it('collapses extra heading ranks', () => {
    expect(formatSonicDnaReviewMarkdown('#### Findings')).toBe('### Findings')
  })
})
