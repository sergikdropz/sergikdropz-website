import { describe, expect, it } from 'vitest'
import { shallowPayloadDiffLines } from '@/lib/admin-ai-exec-preview-diff'

describe('shallowPayloadDiffLines', () => {
  it('explains when there is no prior payload', () => {
    const lines = shallowPayloadDiffLines(null, { a: 1 })
    expect(lines.length).toBeGreaterThan(0)
    expect(lines[0]).toContain('no prior preview')
  })

  it('detects added, removed, and changed top-level keys', () => {
    const prev = { keep: 1, drop: 2, change: 'old' }
    const next = { keep: 1, change: 'new', add: true }
    const lines = shallowPayloadDiffLines(prev, next)
    expect(lines.some((l) => l.startsWith('+ add:'))).toBe(true)
    expect(lines.some((l) => l.startsWith('− drop:'))).toBe(true)
    expect(lines.some((l) => l.startsWith('~ change:'))).toBe(true)
  })

  it('reports no changes when objects match at top level', () => {
    const o = { x: 1, nested: { a: 1 } }
    const lines = shallowPayloadDiffLines(o, { ...o })
    expect(lines).toEqual(['(no top-level JSON key changes detected)'])
  })
})
