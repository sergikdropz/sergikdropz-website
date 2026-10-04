import { describe, expect, it } from 'vitest'
import { collabHubEmailSubject, collabProjectSubjectPrefix } from '@/lib/studio/collab-email-compose'

describe('collab-email-compose', () => {
  it('prefixes subjects for threading', () => {
    expect(collabProjectSubjectPrefix('Night Drive')).toBe('[SERGIK · Night Drive]')
    expect(collabHubEmailSubject('Night Drive', 'Splits approved')).toBe(
      '[SERGIK · Night Drive] Splits approved',
    )
  })
})
