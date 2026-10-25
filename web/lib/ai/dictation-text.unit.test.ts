import { describe, expect, it } from 'vitest'
import { appendDictationText } from '@/lib/ai/dictation-text'

describe('appendDictationText', () => {
  it('starts a blank composer with the transcript', () => {
    expect(appendDictationText('', '  check the upc  ')).toBe('check the upc')
  })

  it('inserts a space before the next phrase', () => {
    expect(appendDictationText('DistroKid', 'will assign the isrc')).toBe('DistroKid will assign the isrc')
  })

  it('does not double the trailing space', () => {
    expect(appendDictationText('DistroKid ', 'will assign the isrc')).toBe('DistroKid will assign the isrc')
  })
})
